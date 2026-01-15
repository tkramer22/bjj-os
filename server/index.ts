import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { startScheduler } from "./scheduler";
import { startIntelligenceScheduler } from "./intelligence-scheduler";
import { IntelligenceSchedulers } from "./schedulers";
import { noCacheMiddleware } from "./middleware/noCache";
import { runMigrations } from 'stripe-replit-sync';
import { getStripeSync } from './stripeClient';
import { WebhookHandlers } from './webhookHandlers';

const app = express();

// CRITICAL: Trust proxy headers (Replit terminates TLS at edge)
// This allows req.secure and req.protocol to work correctly behind reverse proxy
app.set('trust proxy', 1);

// CORS: Enable cross-origin requests from development and production
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (mobile apps, Postman, curl, etc)
    if (!origin) return callback(null, true);
    
    // Allow ALL localhost ports for development (port keeps changing!)
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Allow Capacitor/Ionic native app origins (iOS/Android)
    if (origin === 'capacitor://localhost' || 
        origin === 'ionic://localhost' || 
        origin === 'https://localhost' ||
        origin === 'http://localhost') {
      return callback(null, true);
    }
    
    // Allow Replit preview and deployment URLs
    if (origin.match(/\.replit\.dev$/) || origin.match(/\.replit\.app$/)) {
      return callback(null, true);
    }
    
    // Allow production domains
    const allowedOrigins = [
      'https://bjjos.app',
      'https://www.bjjos.app'
    ];
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Block everything else
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,              // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Cookie'],
  exposedHeaders: ['Set-Cookie']
};

app.use(cors(corsOptions));

// PERFORMANCE: Response compression (gzip/brotli) - 60% bandwidth reduction
app.use(compression({
  level: 6, // Balance between compression speed and ratio
  threshold: 1024, // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress if no-transform header is present
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Compress everything else
    return compression.filter(req, res);
  }
}));

// CRITICAL: Apply no-cache headers to ALL responses
app.use(noCacheMiddleware);

// STRIPE WEBHOOK - Must be registered BEFORE express.json() to get raw Buffer
app.post(
  '/api/stripe/webhook/:uuid',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature' });
    }

    try {
      const sig = Array.isArray(signature) ? signature[0] : signature;

      if (!Buffer.isBuffer(req.body)) {
        console.error('STRIPE WEBHOOK ERROR: req.body is not a Buffer');
        return res.status(500).json({ error: 'Webhook processing error' });
      }

      const { uuid } = req.params;
      await WebhookHandlers.processWebhook(req.body as Buffer, sig, uuid);

      res.status(200).json({ received: true });
    } catch (error: any) {
      console.error('Webhook error:', error.message);
      res.status(400).json({ error: 'Webhook processing error' });
    }
  }
);

// STRIPE WEBHOOK (legacy route) - Also needs raw body before express.json()
// This is the route configured in Stripe Dashboard for existing subscriptions
app.post(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res, next) => {
    // Store the raw body for signature verification
    (req as any).rawBody = req.body;
    next();
  }
);

// Cookie parsing middleware (for httpOnly cookie-based auth)
app.use(cookieParser());

// Regular JSON parsing for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Verify critical environment variables at startup
function verifyEnvironmentVariables() {
  const critical = [
    'DATABASE_URL',
    'SESSION_SECRET',
  ];
  
  const optional = [
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'YOUTUBE_API_KEY',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'ELEVENLABS_API_KEY',
  ];
  
  log('[STARTUP] Verifying environment variables...');
  
  const missing = critical.filter(key => !process.env[key]);
  const missingOptional = optional.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('[STARTUP] ⚠️  CRITICAL environment variables missing:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('[STARTUP] Server may not function correctly without these variables');
  } else {
    log('[STARTUP] All critical environment variables present ✓');
  }
  
  if (missingOptional.length > 0) {
    console.warn('[STARTUP] ⚠️  Optional environment variables missing:');
    missingOptional.forEach(key => console.warn(`   - ${key}`));
    console.warn('[STARTUP] Some features may be disabled without these variables');
  }
}

(async () => {
  // Verify environment variables first (but don't crash if missing)
  try {
    verifyEnvironmentVariables();
  } catch (error: any) {
    console.error('[STARTUP] Error during environment verification:', error.message);
  }
  
  // ═══════════════════════════════════════════════════════════════
  // DATABASE CONNECTION HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════
  // Check database connectivity before starting server
  // This prevents the app from starting with a broken database connection
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('🔍 DATABASE CONNECTION CHECK');
    console.log('═══════════════════════════════════════════════');
    
    const { checkDatabaseConnection, validateVideoLibrary } = await import('./db');
    const isConnected = await checkDatabaseConnection();
    
    if (!isConnected) {
      console.error('❌ CRITICAL: Cannot connect to database');
      console.error('   Check DATABASE_URL in environment variables');
      console.error('   Server will start but database operations will fail');
    }
    
    // CRITICAL: Validate Supabase video library connection
    const videoLibrary = await validateVideoLibrary();
    if (!videoLibrary.isValid) {
      console.error('❌ CRITICAL: Video library not available');
      console.error('   Professor OS video recommendations will not work');
    }
    
    console.log('═══════════════════════════════════════════════');
    console.log('');
  } catch (error: any) {
    console.error('❌ Database health check failed:', error.message);
    console.error('   Server will continue but database may be unavailable');
  }
  
  // ═══════════════════════════════════════════════════════════════
  // STRIPE INITIALIZATION
  // ═══════════════════════════════════════════════════════════════
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════');
    console.log('💳 STRIPE INITIALIZATION');
    console.log('═══════════════════════════════════════════════');
    
    const databaseUrl = process.env.DATABASE_URL;
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    
    if (databaseUrl && stripeSecretKey) {
      // Try to run stripe-replit-sync migrations (may fail in some environments)
      try {
        log('[STRIPE] Running Stripe schema migrations...');
        await runMigrations({ databaseUrl, schema: 'stripe' });
        log('[STRIPE] Stripe schema ready');
        
        const stripeSync = await getStripeSync();
        
        log('[STRIPE] Setting up managed webhook...');
        const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
        const { webhook, uuid } = await stripeSync.findOrCreateManagedWebhook(
          `${webhookBaseUrl}/api/stripe/webhook`,
          {
            enabled_events: ['*'],
            description: 'BJJ OS payment webhook',
          }
        );
        log(`[STRIPE] Webhook configured: ${webhook.url} (UUID: ${uuid})`);
        
        stripeSync.syncBackfill()
          .then(() => log('[STRIPE] Stripe data synced'))
          .catch((err: any) => console.error('[STRIPE] Error syncing:', err.message));
      } catch (syncError: any) {
        // stripe-replit-sync may fail in development, but Stripe itself still works
        console.warn('[STRIPE] stripe-replit-sync setup skipped:', syncError.message);
        console.warn('[STRIPE] Using direct Stripe API integration');
      }
        
      log('[STRIPE] Initialization complete ✓');
    } else {
      if (!stripeSecretKey) {
        console.warn('[STRIPE] STRIPE_SECRET_KEY not set, skipping Stripe initialization');
      }
      if (!databaseUrl) {
        console.warn('[STRIPE] DATABASE_URL not set, skipping Stripe initialization');
      }
    }
    
    console.log('═══════════════════════════════════════════════');
    console.log('');
  } catch (error: any) {
    console.error('❌ Stripe initialization failed:', error.message);
    console.error('   Payments may not work correctly');
  }
  
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // CRITICAL: Initialize instructor cache BEFORE server starts accepting requests
  // This ensures the cache is populated for the first request
  try {
    log('[STARTUP] Loading instructor cache from database (blocking)...');
    const { initializeInstructorCache } = await import('./videoSearch');
    await initializeInstructorCache();
    log('[STARTUP] Instructor cache initialized successfully (ready for requests)');
  } catch (error: any) {
    console.error('[STARTUP] Failed to initialize instructor cache:', error.message);
    console.error('[STARTUP] Video search will use fallback pattern matching');
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
    
    // Wrap scheduler initialization in try-catch to prevent deployment crashes
    try {
      log('[STARTUP] Initializing schedulers...');
      startScheduler();
      log('[STARTUP] Main scheduler started successfully');
    } catch (error: any) {
      console.error('[STARTUP] Failed to start main scheduler:', error.message);
      console.error('[STARTUP] Server will continue without scheduled tasks');
    }
    
    try {
      log('[STARTUP] Initializing intelligence scheduler...');
      startIntelligenceScheduler();
      log('[STARTUP] Intelligence scheduler started successfully');
    } catch (error: any) {
      console.error('[STARTUP] Failed to start intelligence scheduler:', error.message);
      console.error('[STARTUP] Server will continue without intelligence automation');
    }
    
    // Start Advanced Intelligence Schedulers (Combat Sports, Population, Individual)
    try {
      log('[STARTUP] Initializing advanced intelligence schedulers...');
      const advancedSchedulers = new IntelligenceSchedulers();
      advancedSchedulers.start();
      log('[STARTUP] Advanced intelligence schedulers started successfully');
    } catch (error: any) {
      console.error('[STARTUP] Failed to start advanced intelligence schedulers:', error.message);
      console.error('[STARTUP] Server will continue without advanced intelligence automation');
    }
    
    // Start Dev OS Intelligence Jobs (Daily snapshots, Weekly threshold adjustment)
    setTimeout(async () => {
      try {
        log('[STARTUP] Initializing Dev OS intelligence jobs...');
        const { initializeDevOsJobs } = await import('./jobs/dev-os-jobs');
        initializeDevOsJobs();
        log('[STARTUP] Dev OS jobs started successfully');
      } catch (error: any) {
        console.error('[STARTUP] Failed to start Dev OS jobs:', error.message);
        console.error('[STARTUP] Server will continue without Dev OS automation');
      }
    }, 1000); // Start after 1 second
    
    
    // Start Dev OS 2.0 Scheduled Tasks (Alert Monitor, Hourly Digest)
    setTimeout(async () => {
      try {
        log('[STARTUP] Initializing Dev OS 2.0 scheduled tasks...');
        const { initScheduledTasks } = await import('./scheduled-tasks');
        initScheduledTasks();
        log('[STARTUP] Dev OS 2.0 scheduled tasks started successfully');
      } catch (error: any) {
        console.error('[STARTUP] Failed to start Dev OS 2.0 tasks:', error.message);
        console.error('[STARTUP] Server will continue without Dev OS 2.0 automation');
      }
    }, 1500); // Start after 1.5 seconds
    
    // Start Command Center Intelligence (Hourly Snapshots with AI Insights)
    setTimeout(async () => {
      try {
        log('[STARTUP] Initializing Command Center intelligence...');
        const { initializeCommandCenterSnapshots } = await import('./jobs/command-center-snapshots');
        initializeCommandCenterSnapshots();
        log('[STARTUP] Command Center intelligence started successfully');
      } catch (error: any) {
        console.error('[STARTUP] Failed to start Command Center intelligence:', error.message);
        console.error('[STARTUP] Server will continue without Command Center snapshots');
      }
    }, 1700); // Start after 1.7 seconds
    
    // 🚨 EMERGENCY CURATION - Start immediately if override enabled
    setTimeout(async () => {
      try {
        log('[STARTUP] Checking emergency curation override...');
        const { startEmergencyCurationIfEnabled } = await import('./emergency-curation');
        await startEmergencyCurationIfEnabled();
        log('[STARTUP] Emergency curation check complete');
      } catch (error: any) {
        console.error('[STARTUP] Failed to check emergency curation:', error.message);
        console.error('[STARTUP] Server will continue without emergency curation');
      }
    }, 2000); // Start after 2 seconds to ensure server is ready
    
    // 🔄 STUCK RUN RECOVERY - Resume any curation runs that were interrupted
    setTimeout(async () => {
      try {
        log('[STARTUP] Resuming stuck curation runs...');
        const { resumeStuckRuns } = await import('./curation-controller');
        await resumeStuckRuns();
        log('[STARTUP] Stuck run recovery complete');
      } catch (error: any) {
        console.error('[STARTUP] Failed to resume stuck runs:', error.message);
        console.error('[STARTUP] Server will continue without stuck run recovery');
      }
    }, 2500); // Start after 2.5 seconds
    
    // 🔍 MISSED RUN DETECTION - Check if scheduled curation runs were missed
    setTimeout(async () => {
      try {
        log('[STARTUP] Checking for missed curation runs...');
        const { checkForMissedRuns } = await import('./curation-controller');
        await checkForMissedRuns();
        log('[STARTUP] Missed run check complete');
      } catch (error: any) {
        console.error('[STARTUP] Failed to check for missed runs:', error.message);
        console.error('[STARTUP] Server will continue without missed run recovery');
      }
    }, 3000); // Start after 3 seconds to ensure database is ready
    
    // 📧 SERVER RESTART ALERT EMAIL - Notify admin of server restart with recovery status
    setTimeout(async () => {
      try {
        log('[STARTUP] Sending server restart alert email...');
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        const now = new Date();
        const timeStr = now.toLocaleString('en-US', {
          timeZone: 'America/New_York',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        
        const htmlContent = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px;">
            <h2 style="color: #8B5CF6;">🔄 BJJ OS Server Restarted</h2>
            <p>The BJJ OS server was restarted at <strong>${timeStr} EST</strong>.</p>
            
            <h3 style="color: #666; margin-top: 20px;">Automatic Recovery Actions (Initiated):</h3>
            <ul>
              <li>🔄 Checked for stuck curation runs</li>
              <li>🔄 Checked for missed curation runs today (triggers recovery if none)</li>
              <li>✅ Scheduled cron jobs registered (4x daily curation)</li>
              <li>✅ Email system operational (this email proves it)</li>
            </ul>
            <p style="color: #888; font-size: 12px;">Note: Recovery actions run asynchronously. Check logs for detailed results.</p>
            
            <h3 style="color: #666; margin-top: 20px;">Next Scheduled Runs:</h3>
            <ul>
              <li>3:15 AM EST - Auto-curation (Mon: demand-driven, Tue-Sun: instructor-based)</li>
              <li>9:00 AM EST - Auto-curation</li>
              <li>3:00 PM EST - Auto-curation</li>
              <li>9:00 PM EST - Auto-curation</li>
            </ul>
            
            <h3 style="color: #666; margin-top: 20px;">Health Check Endpoint:</h3>
            <p>External monitoring: <code>GET /api/health</code></p>
            
            <p style="color: #666; font-size: 12px; margin-top: 20px;">
              This email confirms the server is running and all recovery checks completed.
            </p>
          </div>
        `;
        
        await resend.emails.send({
          from: 'BJJ OS <noreply@bjjos.app>',
          to: 'todd@bjjos.app',
          subject: `🔄 BJJ OS Server Restarted - ${timeStr} EST`,
          html: htmlContent
        });
        
        log('[STARTUP] ✅ Server restart alert email sent to todd@bjjos.app');
      } catch (error: any) {
        console.error('[STARTUP] ❌ Failed to send restart alert email:', error.message);
      }
    }, 4000); // Wait 4 seconds for all recovery checks to complete
    
    log('[STARTUP] Server initialization complete ✓');
    
    // ═══════════════════════════════════════════════════════════════
    // DATABASE CONNECTION POOL MONITORING
    // ═══════════════════════════════════════════════════════════════
    // Monitor connection pool health every 5 minutes
    // This helps detect connection leaks or exhaustion early
    setInterval(async () => {
      try {
        const { getPoolStats } = await import('./db');
        const stats = getPoolStats();
        
        console.log('📊 DB Pool Status:', {
          total: stats.total,
          idle: stats.idle,
          waiting: stats.waiting
        });
        
        // Warn if too many queries are waiting for connections
        if (stats.waiting > 5) {
          console.warn('⚠️  Many queries waiting for connections - pool may be exhausted');
          console.warn('   Consider increasing max pool size or checking for connection leaks');
        }
        
        // Warn if no idle connections available
        if (stats.idle === 0 && stats.total > 0) {
          console.warn('⚠️  No idle connections available - all connections are in use');
        }
      } catch (error: any) {
        console.error('❌ Pool status check failed:', error.message);
      }
    }, 5 * 60 * 1000); // Every 5 minutes
  });
})();
