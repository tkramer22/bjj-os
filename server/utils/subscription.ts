import { db } from '../db';
import { bjjUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface SubscriptionStatus {
  isPro: boolean;
  provider: 'stripe' | 'apple' | null;
  status: string;
  expiresAt?: Date | null;
  subscriptionType?: string;
}

export async function getSubscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const [user] = await db
    .select({
      paymentProvider: bjjUsers.paymentProvider,
      subscriptionType: bjjUsers.subscriptionType,
      subscriptionStatus: bjjUsers.subscriptionStatus,
      subscriptionEndDate: bjjUsers.subscriptionEndDate,
      appleExpiresAt: bjjUsers.appleExpiresAt,
      trialEndDate: bjjUsers.trialEndDate
    })
    .from(bjjUsers)
    .where(eq(bjjUsers.id, userId))
    .limit(1);

  if (!user) {
    return { isPro: false, provider: null, status: 'none' };
  }

  if (user.subscriptionType === 'lifetime') {
    return { 
      isPro: true, 
      provider: user.paymentProvider as 'stripe' | 'apple' | null, 
      status: 'active',
      subscriptionType: 'lifetime'
    };
  }

  if (user.paymentProvider === 'apple') {
    const isActive = user.subscriptionStatus === 'active' && 
                     user.appleExpiresAt && 
                     new Date(user.appleExpiresAt) > new Date();
    return { 
      isPro: isActive, 
      provider: 'apple', 
      status: user.subscriptionStatus || 'unknown',
      expiresAt: user.appleExpiresAt,
      subscriptionType: user.subscriptionType
    };
  }

  if (user.paymentProvider === 'stripe' || !user.paymentProvider) {
    const isActive = user.subscriptionStatus === 'active' ||
                     (user.subscriptionType === 'free_trial' && user.trialEndDate && new Date(user.trialEndDate) > new Date());
    return { 
      isPro: isActive, 
      provider: 'stripe', 
      status: user.subscriptionStatus || 'unknown',
      expiresAt: user.subscriptionEndDate,
      subscriptionType: user.subscriptionType
    };
  }

  return { isPro: false, provider: null, status: 'unknown' };
}

export async function requirePro(req: any, res: any, next: any) {
  const userId = req.user?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { isPro } = await getSubscriptionStatus(userId);
  
  if (!isPro) {
    return res.status(403).json({ error: 'Pro subscription required' });
  }

  next();
}
