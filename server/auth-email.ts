import { Express, Request, Response } from 'express';
import { db } from './db';
import { bjjUsers, emailVerificationCodes, userSessions } from '../shared/schema';
import { eq, and, gt } from 'drizzle-orm';
import { sendVerificationEmail, sendWelcomeEmail } from './email';
import { 
  generateDeviceFingerprint, 
  generateSessionToken, 
  generateVerificationCode 
} from './device-fingerprint';
import jwt from 'jsonwebtoken';

const ADMIN_BYPASS_CODE = process.env.ADMIN_BYPASS_CODE || '999999';
const ADMIN_EMAIL = 'toddkramer@mac.com';
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;

if (!SESSION_SECRET) {
  throw new Error('SESSION_SECRET or JWT_SECRET must be set in environment variables');
}

/**
 * Create a JWT session token
 * @param userId - User ID to encode in the token
 * @param deviceFingerprint - Device fingerprint for security
 * @param expiresIn - Token expiration (default: '365d' for persistent, '1d' for session-only)
 */
function createJWTToken(userId: string, deviceFingerprint: string, expiresIn: string = '365d'): string {
  return jwt.sign(
    { 
      userId,
      deviceFingerprint 
    },
    SESSION_SECRET,
    { expiresIn }
  );
}

/**
 * Email Authentication Routes
 * Clean, modern email-based auth replacing SMS
 */
export function registerEmailAuthRoutes(app: Express) {
  
  // ============================================================================
  // REQUEST EMAIL VERIFICATION CODE
  // ============================================================================
  app.post('/api/auth/email/request-code', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check for admin bypass
      if (normalizedEmail === ADMIN_EMAIL) {
        console.log(`🔑 [EMAIL-AUTH] Admin email detected: ${ADMIN_EMAIL}`);
        // Admin will use bypass code, just send confirmation
        return res.json({ 
          success: true, 
          message: 'Admin account detected. Use your admin bypass code.',
          isAdmin: true
        });
      }
      
      // Generate 6-digit code
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      // Get IP and user agent for security
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                        req.socket.remoteAddress || 
                        'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Store verification code
      await db.insert(emailVerificationCodes).values({
        email: normalizedEmail,
        code,
        expiresAt,
        ipAddress,
        userAgent,
      });
      
      console.log(`📧 [EMAIL-AUTH] Generated code for ${normalizedEmail}: ${code} (expires in 10 min)`);
      
      // Send verification email
      const emailResult = await sendVerificationEmail(normalizedEmail, code);
      
      if (!emailResult.success) {
        console.error('❌ [EMAIL-AUTH] Failed to send email:', emailResult.error);
        return res.status(500).json({ 
          error: 'Failed to send verification email. Please try again.' 
        });
      }
      
      console.log(`✅ [EMAIL-AUTH] Verification email sent to ${normalizedEmail}`);
      
      res.json({ 
        success: true,
        message: 'Verification code sent to your email',
        email: normalizedEmail
      });
      
    } catch (error: any) {
      console.error('❌ [EMAIL-AUTH] Request code error:', error);
      res.status(500).json({ error: 'Failed to send verification code' });
    }
  });
  
  // ============================================================================
  // VERIFY EMAIL CODE AND LOGIN/SIGNUP
  // ============================================================================
  app.post('/api/auth/email/verify-code', async (req: Request, res: Response) => {
    try {
      const { email, code, username, rememberMe = true } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Session duration: 1 year if rememberMe, session-only if not
      const SESSION_DURATION_1_YEAR = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
      
      // Check for admin bypass
      if (normalizedEmail === ADMIN_EMAIL && code === ADMIN_BYPASS_CODE) {
        console.log(`🔑 [EMAIL-AUTH] Admin bypass successful for ${ADMIN_EMAIL}`);
        
        // Find or create admin user
        let adminUser = await db.query.bjjUsers.findFirst({
          where: eq(bjjUsers.email, normalizedEmail)
        });
        
        if (!adminUser) {
          console.log('📝 [EMAIL-AUTH] Creating admin user for fresh deployment');
          
          // Auto-create admin user on first bypass
          const [newAdmin] = await db.insert(bjjUsers).values({
            email: normalizedEmail,
            username: 'todd',
            emailVerified: true,
            isAdmin: true,
            onboardingCompleted: true,
            subscriptionType: 'lifetime',
            subscriptionStatus: 'active',
            maxDevices: 99,
          }).returning();
          
          adminUser = newAdmin;
          console.log(`✅ [EMAIL-AUTH] Admin user created: ${adminUser.id}`);
        }
        
        // Get device info
        const deviceInfo = generateDeviceFingerprint(req);
        const expiresAt = rememberMe 
          ? new Date(Date.now() + SESSION_DURATION_1_YEAR) 
          : new Date(Date.now() + 24 * 60 * 60 * 1000); // 30 days or 24 hours for session-only
        
        // Check for existing session on this device
        const now = new Date();
        const existingSession = await db.query.userSessions.findFirst({
          where: and(
            eq(userSessions.userId, adminUser.id),
            eq(userSessions.deviceFingerprint, deviceInfo.fingerprint),
            gt(userSessions.expiresAt, now)
          )
        });
        
        if (existingSession) {
          // Create new JWT token with appropriate expiry based on rememberMe
          const tokenExpiry = rememberMe ? '30d' : '1d';
          const jwtToken = createJWTToken(adminUser.id, deviceInfo.fingerprint, tokenExpiry);
          
          // Refresh existing session with new JWT
          const newExpiresAt = rememberMe 
            ? new Date(Date.now() + SESSION_DURATION_1_YEAR)
            : new Date(Date.now() + 24 * 60 * 60 * 1000);
          await db.update(userSessions)
            .set({ 
              token: jwtToken,
              expiresAt: newExpiresAt,
              lastActivity: now 
            })
            .where(eq(userSessions.id, existingSession.id));
          
          console.log(`✅ [EMAIL-AUTH] Admin session refreshed with new JWT (rememberMe: ${rememberMe})`);
          
          // Set httpOnly cookie
          const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
          const cookieOptions: any = {
            httpOnly: true,
            secure: isHttps,
            sameSite: 'lax' as const,
          };
          
          // Only set maxAge if rememberMe is true (otherwise browser session cookie)
          if (rememberMe) {
            cookieOptions.maxAge = SESSION_DURATION_1_YEAR;
          }
          
          res.cookie('sessionToken', jwtToken, cookieOptions);
          
          console.log(`🍪 [EMAIL-AUTH] Admin session cookie set with JWT`);
          
          return res.json({
            success: true,
            token: jwtToken,
            user: {
              id: adminUser.id,
              email: adminUser.email,
              username: adminUser.username,
              isAdmin: true,
              onboardingCompleted: adminUser.onboardingCompleted,
            }
          });
        }
        
        // Create JWT token with appropriate expiry based on rememberMe
        const adminTokenExpiry = rememberMe ? '30d' : '1d';
        const jwtToken = createJWTToken(adminUser.id, deviceInfo.fingerprint, adminTokenExpiry);
        
        // Create new admin session
        await db.insert(userSessions).values({
          userId: adminUser.id,
          token: jwtToken,
          deviceFingerprint: deviceInfo.fingerprint,
          deviceName: deviceInfo.name,
          deviceType: deviceInfo.type,
          expiresAt,
          ipAddress: deviceInfo.ipAddress,
          userAgent: deviceInfo.userAgent,
        });
        
        console.log(`✅ [EMAIL-AUTH] Admin session created (rememberMe: ${rememberMe})`);
        
        // Set httpOnly cookie
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        const adminCookieOptions: any = {
          httpOnly: true,
          secure: isHttps,
          sameSite: 'lax' as const,
        };
        
        if (rememberMe) {
          adminCookieOptions.maxAge = SESSION_DURATION_1_YEAR;
        }
        
        res.cookie('sessionToken', jwtToken, adminCookieOptions);
        
        console.log(`🍪 [EMAIL-AUTH] Admin session cookie set (persistent: ${rememberMe})`);
        
        return res.json({
          success: true,
          token: jwtToken,
          user: {
            id: adminUser.id,
            email: adminUser.email,
            username: adminUser.username,
            isAdmin: true,
            onboardingCompleted: adminUser.onboardingCompleted,
          }
        });
      }
      
      // Find the most recent verification code for this email
      const now = new Date();
      const verificationRecord = await db.query.emailVerificationCodes.findFirst({
        where: and(
          eq(emailVerificationCodes.email, normalizedEmail),
          eq(emailVerificationCodes.used, false),
          gt(emailVerificationCodes.expiresAt, now)
        ),
        orderBy: (table, { desc }) => [desc(table.createdAt)]
      });
      
      if (!verificationRecord) {
        console.log(`❌ [EMAIL-AUTH] No valid verification code found for ${normalizedEmail}`);
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }
      
      // Check if max attempts exceeded (3 attempts max)
      if (verificationRecord.attempts >= 3) {
        console.log(`❌ [EMAIL-AUTH] Max attempts exceeded for ${normalizedEmail}`);
        return res.status(429).json({ error: 'Too many failed attempts. Please request a new code.' });
      }
      
      // Check if code matches
      if (verificationRecord.code !== code) {
        // Increment attempt counter
        await db.update(emailVerificationCodes)
          .set({ attempts: verificationRecord.attempts + 1 })
          .where(eq(emailVerificationCodes.id, verificationRecord.id));
        
        const attemptsLeft = 3 - (verificationRecord.attempts + 1);
        console.log(`❌ [EMAIL-AUTH] Invalid code for ${normalizedEmail}, ${attemptsLeft} attempts left`);
        return res.status(400).json({ 
          error: `Invalid code. ${attemptsLeft} ${attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining.` 
        });
      }
      
      // Mark code as used
      await db.update(emailVerificationCodes)
        .set({ used: true })
        .where(eq(emailVerificationCodes.id, verificationRecord.id));
      
      console.log(`✅ [EMAIL-AUTH] Code verified for ${normalizedEmail}`);
      
      // Check if user exists
      let user = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.email, normalizedEmail)
      });
      
      let isNewUser = false;
      
      // NEW USER: Redirect to Stripe Checkout - DO NOT create account yet
      if (!user) {
        console.log(`🆕 [EMAIL-AUTH] New user detected: ${normalizedEmail} - requires payment`);
        
        // Return response indicating payment is required
        // Frontend will redirect to Stripe Checkout
        return res.json({
          success: true,
          requiresPayment: true,
          email: normalizedEmail,
          message: 'Email verified. Please complete payment to create your account.'
        });
      } else {
        // EXISTING USER: Check subscription status before allowing login
        // Block canceled/past_due users - they need to resubscribe
        const blockedStatuses = ['canceled', 'past_due', 'unpaid'];
        if (user.subscriptionStatus && blockedStatuses.includes(user.subscriptionStatus)) {
          console.log(`⛔ [EMAIL-AUTH] User ${normalizedEmail} has ${user.subscriptionStatus} subscription - blocking login`);
          
          return res.status(403).json({
            success: false,
            error: 'Your subscription has expired or been canceled. Please resubscribe to continue.',
            subscriptionExpired: true,
            subscriptionStatus: user.subscriptionStatus,
            email: normalizedEmail
          });
        }
        
        // Update existing user email verification status
        if (!user.emailVerified) {
          await db.update(bjjUsers)
            .set({ emailVerified: true })
            .where(eq(bjjUsers.id, user.id));
          
          console.log(`✅ [EMAIL-AUTH] Email verified for existing user: ${user.id}`);
        }
      }
      
      // Get device info
      const deviceInfo = generateDeviceFingerprint(req);
      
      // Check device limit (2 devices max, 99 for admin)
      const maxDevices = user.maxDevices || 2;
      const existingSessions = await db.query.userSessions.findMany({
        where: and(
          eq(userSessions.userId, user.id),
          gt(userSessions.expiresAt, now)
        )
      });
      
      // Check if device already has a session
      const existingDeviceSession = existingSessions.find(
        s => s.deviceFingerprint === deviceInfo.fingerprint
      );
      
      if (existingDeviceSession) {
        // Check if first login (before updating lastLogin)
        const isFirstLogin = !user.lastLogin;
        
        // Create new JWT token with appropriate expiry based on rememberMe
        const userTokenExpiry = rememberMe ? '30d' : '1d';
        const jwtToken = createJWTToken(user.id, deviceInfo.fingerprint, userTokenExpiry);
        const newExpiry = rememberMe 
          ? new Date(Date.now() + SESSION_DURATION_1_YEAR)
          : new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        // Update existing session with new JWT
        await db.update(userSessions)
          .set({ 
            token: jwtToken,
            expiresAt: newExpiry,
            lastActivity: now 
          })
          .where(eq(userSessions.id, existingDeviceSession.id));
        
        // Update last login timestamp
        await db.update(bjjUsers)
          .set({ lastLogin: now })
          .where(eq(bjjUsers.id, user.id));
        
        console.log(`✅ [EMAIL-AUTH] Session refreshed for device: ${deviceInfo.name} (rememberMe: ${rememberMe})`);
        
        // Set httpOnly cookie
        const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
        const existingDeviceCookieOptions: any = {
          httpOnly: true,
          secure: isHttps,
          sameSite: 'lax' as const,
        };
        
        if (rememberMe) {
          existingDeviceCookieOptions.maxAge = SESSION_DURATION_1_YEAR;
        }
        
        res.cookie('sessionToken', jwtToken, existingDeviceCookieOptions);
        
        console.log(`🍪 [EMAIL-AUTH] Session cookie set for ${deviceInfo.name} (persistent: ${rememberMe})`);
        
        // Determine redirect for first-time lifetime users
        let redirectUrl = undefined;
        if (isFirstLogin && user.subscriptionType === 'lifetime') {
          redirectUrl = '/welcome/lifetime';
          console.log(`🎉 [EMAIL-AUTH] First-time lifetime user detected, will redirect to welcome page`);
        }
        
        return res.json({
          success: true,
          token: jwtToken,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            isAdmin: user.isAdmin,
            onboardingCompleted: user.onboardingCompleted,
            subscriptionType: user.subscriptionType,
          },
          isNewUser,
          redirect: redirectUrl
        });
      }
      
      // Check device limit
      if (existingSessions.length >= maxDevices) {
        console.log(`⚠️ [EMAIL-AUTH] Device limit reached for user ${user.id}`);
        
        // Sort by last activity and remove oldest
        const sortedSessions = existingSessions.sort((a, b) => 
          new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime()
        );
        
        const oldestSession = sortedSessions[0];
        await db.delete(userSessions)
          .where(eq(userSessions.id, oldestSession.id));
        
        console.log(`🗑️ [EMAIL-AUTH] Removed oldest session: ${oldestSession.deviceName}`);
      }
      
      // Check if first login (before updating lastLogin)
      const isFirstLogin = !user.lastLogin;
      
      // Create JWT token with appropriate expiry based on rememberMe
      const newUserTokenExpiry = rememberMe ? '30d' : '1d';
      const jwtToken = createJWTToken(user.id, deviceInfo.fingerprint, newUserTokenExpiry);
      const sessionExpiresAt = rememberMe 
        ? new Date(Date.now() + SESSION_DURATION_1_YEAR)
        : new Date(Date.now() + 24 * 60 * 60 * 1000); // 30 days or 24 hours
      
      await db.insert(userSessions).values({
        userId: user.id,
        token: jwtToken,
        deviceFingerprint: deviceInfo.fingerprint,
        deviceName: deviceInfo.name,
        deviceType: deviceInfo.type,
        expiresAt: sessionExpiresAt,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
      });
      
      console.log(`✅ [EMAIL-AUTH] New session created for ${deviceInfo.name} (rememberMe: ${rememberMe})`);
      
      // Update login stats
      await db.update(bjjUsers)
        .set({ lastLogin: now })
        .where(eq(bjjUsers.id, user.id));
      
      // Set httpOnly cookie
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      const newSessionCookieOptions: any = {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax' as const,
      };
      
      if (rememberMe) {
        newSessionCookieOptions.maxAge = SESSION_DURATION_1_YEAR;
      }
      
      res.cookie('sessionToken', jwtToken, newSessionCookieOptions);
      
      console.log(`🍪 [EMAIL-AUTH] Session cookie set for ${deviceInfo.name} (persistent: ${rememberMe})`);
      
      // Determine redirect for first-time lifetime users
      let redirectUrl = undefined;
      if (isFirstLogin && user.subscriptionType === 'lifetime') {
        redirectUrl = '/welcome/lifetime';
        console.log(`🎉 [EMAIL-AUTH] First-time lifetime user detected, will redirect to welcome page`);
      }
      
      res.json({
        success: true,
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          isAdmin: user.isAdmin || false,
          onboardingCompleted: user.onboardingCompleted,
          subscriptionType: user.subscriptionType,
        },
        isNewUser,
        redirect: redirectUrl
      });
      
    } catch (error: any) {
      console.error('❌ [EMAIL-AUTH] Verify code error:', error);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  });
  
  // ============================================================================
  // LOGOUT (REVOKE SESSION)
  // ============================================================================
  app.post('/api/auth/email/logout', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      const token = authHeader.substring(7);
      
      // Delete session
      await db.delete(userSessions)
        .where(eq(userSessions.token, token));
      
      console.log(`✅ [EMAIL-AUTH] Session logged out`);
      
      res.json({ success: true });
      
    } catch (error: any) {
      console.error('❌ [EMAIL-AUTH] Logout error:', error);
      res.status(500).json({ error: 'Failed to logout' });
    }
  });
  
  // ============================================================================
  // GET USER SESSIONS (LIST DEVICES)
  // ============================================================================
  app.get('/api/auth/email/sessions', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const token = authHeader.substring(7);
      
      // Find current session
      const currentSession = await db.query.userSessions.findFirst({
        where: eq(userSessions.token, token)
      });
      
      if (!currentSession) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      // Get all sessions for this user
      const now = new Date();
      const sessions = await db.query.userSessions.findMany({
        where: and(
          eq(userSessions.userId, currentSession.userId),
          gt(userSessions.expiresAt, now)
        )
      });
      
      const sessionList = sessions.map(s => ({
        id: s.id,
        deviceName: s.deviceName,
        deviceType: s.deviceType,
        lastActivity: s.lastActivity,
        createdAt: s.createdAt,
        isCurrent: s.token === token
      }));
      
      res.json({ sessions: sessionList });
      
    } catch (error: any) {
      console.error('❌ [EMAIL-AUTH] Get sessions error:', error);
      res.status(500).json({ error: 'Failed to get sessions' });
    }
  });
  
  // ============================================================================
  // REVOKE SESSION (REMOVE DEVICE)
  // ============================================================================
  app.delete('/api/auth/email/sessions/:sessionId', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Not authenticated' });
      }
      
      const token = authHeader.substring(7);
      const { sessionId } = req.params;
      
      // Find current session
      const currentSession = await db.query.userSessions.findFirst({
        where: eq(userSessions.token, token)
      });
      
      if (!currentSession) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      // Delete the specified session (only if it belongs to this user)
      await db.delete(userSessions)
        .where(and(
          eq(userSessions.id, parseInt(sessionId)),
          eq(userSessions.userId, currentSession.userId)
        ));
      
      console.log(`✅ [EMAIL-AUTH] Session ${sessionId} revoked`);
      
      res.json({ success: true });
      
    } catch (error: any) {
      console.error('❌ [EMAIL-AUTH] Revoke session error:', error);
      res.status(500).json({ error: 'Failed to revoke session' });
    }
  });

  // ============================================================================
  // VALIDATE LIFETIME INVITATION TOKEN
  // ============================================================================
  app.get('/api/auth/validate-invite', async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      
      if (!token) {
        return res.status(400).json({ valid: false, error: 'Invite token required' });
      }
      
      const { lifetimeInvitations } = await import('../shared/schema');
      
      const invite = await db.query.lifetimeInvitations.findFirst({
        where: eq(lifetimeInvitations.inviteToken, token as string)
      });
      
      if (!invite) {
        return res.status(404).json({ valid: false, error: 'Invalid invitation' });
      }
      
      if (invite.status === 'completed') {
        return res.status(400).json({ valid: false, error: 'Invitation already used' });
      }
      
      if (new Date(invite.expiresAt) < new Date()) {
        // Mark as expired
        await db.update(lifetimeInvitations)
          .set({ status: 'expired' })
          .where(eq(lifetimeInvitations.id, invite.id));
        
        return res.status(400).json({ valid: false, error: 'Invitation expired' });
      }
      
      res.status(200).json({
        valid: true,
        email: invite.email,
        inviteId: invite.id,
        personalMessage: invite.personalMessage
      });
      
    } catch (error: any) {
      console.error('❌ [INVITE] Error validating invite token:', error);
      res.status(500).json({ valid: false, error: 'Server error' });
    }
  });

  // ============================================================================
  // SIGNUP WITH LIFETIME INVITATION
  // ============================================================================
  app.post('/api/auth/signup-with-invite', async (req: Request, res: Response) => {
    try {
      const { email, username, verificationCode, inviteToken } = req.body;
      
      if (!email || !verificationCode || !inviteToken) {
        return res.status(400).json({ error: 'Email, verification code, and invite token are required' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // 1. Verify the invite token
      const { lifetimeInvitations } = await import('../shared/schema');
      
      const invite = await db.query.lifetimeInvitations.findFirst({
        where: eq(lifetimeInvitations.inviteToken, inviteToken)
      });
      
      if (!invite) {
        return res.status(404).json({ error: 'Invalid invitation' });
      }
      
      if (invite.status === 'completed') {
        return res.status(400).json({ error: 'Invitation already used' });
      }
      
      if (new Date(invite.expiresAt) < new Date()) {
        return res.status(400).json({ error: 'Invitation expired' });
      }
      
      if (invite.email !== normalizedEmail) {
        return res.status(400).json({ error: 'Email does not match invitation' });
      }
      
      // 2. Verify the email verification code
      const validCode = await db.query.emailVerificationCodes.findFirst({
        where: and(
          eq(emailVerificationCodes.email, normalizedEmail),
          eq(emailVerificationCodes.code, verificationCode),
          eq(emailVerificationCodes.used, false),
          gt(emailVerificationCodes.expiresAt, new Date())
        )
      });
      
      if (!validCode) {
        return res.status(400).json({ error: 'Invalid or expired verification code' });
      }
      
      // 3. Check if user already exists
      const existingUser = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.email, normalizedEmail)
      });
      
      if (existingUser) {
        return res.status(400).json({ error: 'Account already exists for this email' });
      }
      
      // 4. Create user account with lifetime access
      const [newUser] = await db.insert(bjjUsers).values({
        email: normalizedEmail,
        username: username || null,
        emailVerified: true,
        subscriptionType: 'lifetime',
        subscriptionStatus: 'active',
        invitedBy: invite.id,
        onboardingStep: 'name',
        onboardingCompleted: false,
      }).returning();
      
      // 5. Mark verification code as used
      await db.update(emailVerificationCodes)
        .set({ used: true })
        .where(eq(emailVerificationCodes.id, validCode.id));
      
      // 6. Mark invitation as completed
      await db.update(lifetimeInvitations)
        .set({ 
          status: 'completed',
          completedAt: new Date(),
          userId: newUser.id
        })
        .where(eq(lifetimeInvitations.id, invite.id));
      
      // 7. Create session for immediate login (30-day persistent login by default)
      const deviceInfo = generateDeviceFingerprint(req);
      const jwtToken = createJWTToken(newUser.id, deviceInfo.fingerprint, '30d');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      
      await db.insert(userSessions).values({
        userId: newUser.id,
        token: jwtToken,
        deviceFingerprint: deviceInfo.fingerprint,
        deviceName: deviceInfo.name,
        deviceType: deviceInfo.type,
        expiresAt,
        ipAddress: deviceInfo.ipAddress,
        userAgent: deviceInfo.userAgent,
      });
      
      console.log(`✅ [INVITE] User created via lifetime invitation: ${normalizedEmail}`);
      
      // Set httpOnly cookie with 30-day expiry
      const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
      res.cookie('sessionToken', jwtToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
      });
      
      console.log(`🍪 [INVITE] Session cookie set with JWT`);
      
      res.status(200).json({
        success: true,
        user: {
          id: newUser.id,
          email: newUser.email,
          username: newUser.username,
          subscriptionType: newUser.subscriptionType,
          onboardingStep: newUser.onboardingStep,
        },
        token: jwtToken,
      });
      
    } catch (error: any) {
      console.error('❌ [INVITE] Signup error:', error);
      res.status(500).json({ error: 'Failed to create account' });
    }
  });

  // ============================================================================
  // FORGOT PASSWORD - REQUEST RESET CODE
  // ============================================================================
  app.post('/api/auth/forgot-password', async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Check if user exists
      const user = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.email, normalizedEmail)
      });
      
      if (!user) {
        // Don't reveal whether email exists - still return success
        console.log(`[FORGOT-PASSWORD] Email not found: ${normalizedEmail}`);
        return res.json({ success: true, message: 'If an account exists, a reset code will be sent' });
      }
      
      // Generate 6-digit code
      const code = generateVerificationCode();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      // Get IP and user agent for security
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                        req.socket.remoteAddress || 
                        'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      
      // Store verification code (reusing email verification table)
      await db.insert(emailVerificationCodes).values({
        email: normalizedEmail,
        code,
        expiresAt,
        ipAddress,
        userAgent,
      });
      
      console.log(`🔑 [FORGOT-PASSWORD] Generated reset code for ${normalizedEmail}: ${code}`);
      
      // Send password reset email
      const { sendPasswordResetEmail } = await import('./email');
      const emailResult = await sendPasswordResetEmail(normalizedEmail, code);
      
      if (!emailResult.success) {
        console.error('❌ [FORGOT-PASSWORD] Failed to send email:', emailResult.error);
        return res.status(500).json({ error: 'Failed to send reset email' });
      }
      
      res.json({ success: true, message: 'Reset code sent' });
      
    } catch (error: any) {
      console.error('❌ [FORGOT-PASSWORD] Error:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  });
  
  // ============================================================================
  // FORGOT PASSWORD - VERIFY RESET CODE
  // ============================================================================
  app.post('/api/auth/verify-reset-code', async (req: Request, res: Response) => {
    try {
      const { email, code } = req.body;
      
      if (!email || !code) {
        return res.status(400).json({ error: 'Email and code are required' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Find valid verification code
      const verificationRecord = await db.query.emailVerificationCodes.findFirst({
        where: and(
          eq(emailVerificationCodes.email, normalizedEmail),
          eq(emailVerificationCodes.code, code),
          eq(emailVerificationCodes.used, false),
          gt(emailVerificationCodes.expiresAt, new Date())
        ),
        orderBy: (table, { desc }) => [desc(table.createdAt)]
      });
      
      if (!verificationRecord) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      
      // Don't mark as used yet - that happens when password is reset
      res.json({ success: true, message: 'Code verified' });
      
    } catch (error: any) {
      console.error('❌ [VERIFY-RESET-CODE] Error:', error);
      res.status(500).json({ error: 'Failed to verify code' });
    }
  });
  
  // ============================================================================
  // FORGOT PASSWORD - RESET PASSWORD
  // ============================================================================
  app.post('/api/auth/reset-password', async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      
      if (!email || !code || !newPassword) {
        return res.status(400).json({ error: 'Email, code, and new password are required' });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      
      // Find valid verification code
      const verificationRecord = await db.query.emailVerificationCodes.findFirst({
        where: and(
          eq(emailVerificationCodes.email, normalizedEmail),
          eq(emailVerificationCodes.code, code),
          eq(emailVerificationCodes.used, false),
          gt(emailVerificationCodes.expiresAt, new Date())
        ),
        orderBy: (table, { desc }) => [desc(table.createdAt)]
      });
      
      if (!verificationRecord) {
        return res.status(400).json({ error: 'Invalid or expired code' });
      }
      
      // Find user
      const user = await db.query.bjjUsers.findFirst({
        where: eq(bjjUsers.email, normalizedEmail)
      });
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Hash new password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Update password
      await db.update(bjjUsers)
        .set({ passwordHash: hashedPassword })
        .where(eq(bjjUsers.id, user.id));
      
      // Mark verification code as used
      await db.update(emailVerificationCodes)
        .set({ used: true })
        .where(eq(emailVerificationCodes.id, verificationRecord.id));
      
      console.log(`✅ [RESET-PASSWORD] Password reset for ${normalizedEmail}`);
      
      res.json({ success: true, message: 'Password reset successfully' });
      
    } catch (error: any) {
      console.error('❌ [RESET-PASSWORD] Error:', error);
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });
  
  // ============================================================================
  // DEV ONLY: GET VERIFICATION CODE FOR TESTING
  // ============================================================================
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/dev/verification-code', async (req: Request, res: Response) => {
      try {
        const { email } = req.query;
        
        if (!email || typeof email !== 'string') {
          return res.status(400).json({ error: 'Email is required' });
        }
        
        const normalizedEmail = email.toLowerCase().trim();
        
        // Get the most recent verification code for this email
        const verificationRecord = await db.query.emailVerificationCodes.findFirst({
          where: and(
            eq(emailVerificationCodes.email, normalizedEmail),
            eq(emailVerificationCodes.used, false),
            gt(emailVerificationCodes.expiresAt, new Date())
          ),
          orderBy: (table, { desc }) => [desc(table.createdAt)]
        });
        
        if (!verificationRecord) {
          return res.status(404).json({ error: 'No valid verification code found' });
        }
        
        console.log(`🔍 [DEV] Retrieved verification code for ${normalizedEmail}: ${verificationRecord.code}`);
        
        res.json({
          success: true,
          email: normalizedEmail,
          code: verificationRecord.code,
          expiresAt: verificationRecord.expiresAt
        });
        
      } catch (error: any) {
        console.error('❌ [DEV] Get verification code error:', error);
        res.status(500).json({ error: 'Failed to retrieve verification code' });
      }
    });
  }
}
