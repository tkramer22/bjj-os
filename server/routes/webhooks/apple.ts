import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { bjjUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

interface AppleTransactionInfo {
  originalTransactionId: string;
  expiresDate: number;
  autoRenewStatus: boolean;
  productId: string;
}

function decodeAppleJWS(signedPayload: string): any {
  try {
    const parts = signedPayload.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWS format');
    }
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (error) {
    console.error('Failed to decode Apple JWS:', error);
    throw error;
  }
}

router.post('/api/webhooks/apple', async (req: Request, res: Response) => {
  try {
    const { signedPayload } = req.body;

    if (!signedPayload) {
      console.log('Apple webhook: No signed payload');
      return res.status(400).send('Missing payload');
    }

    const payload = decodeAppleJWS(signedPayload);
    const { notificationType, subtype, data } = payload;

    console.log('Apple webhook received:', notificationType, subtype);

    const transactionInfo: AppleTransactionInfo = decodeAppleJWS(data.signedTransactionInfo);
    const originalTransactionId = transactionInfo.originalTransactionId;

    const [user] = await db
      .select()
      .from(bjjUsers)
      .where(eq(bjjUsers.appleOriginalTransactionId, originalTransactionId))
      .limit(1);

    if (!user) {
      console.log(`Apple webhook: No user found for transaction ${originalTransactionId}`);
      return res.status(200).send('OK');
    }

    switch (notificationType) {
      case 'SUBSCRIBED':
      case 'DID_RENEW':
        const renewExpiry = new Date(transactionInfo.expiresDate);
        await db
          .update(bjjUsers)
          .set({
            subscriptionStatus: 'active',
            appleExpiresAt: renewExpiry,
            subscriptionEndDate: renewExpiry
          })
          .where(eq(bjjUsers.id, user.id));
        console.log(`Apple: Subscription renewed for user ${user.id}`);
        break;

      case 'DID_FAIL_TO_RENEW':
        await db
          .update(bjjUsers)
          .set({
            subscriptionStatus: 'past_due'
          })
          .where(eq(bjjUsers.id, user.id));
        console.log(`Apple: Renewal failed for user ${user.id}`);
        break;

      case 'EXPIRED':
        await db
          .update(bjjUsers)
          .set({
            subscriptionStatus: 'expired',
            subscriptionType: 'free_trial'
          })
          .where(eq(bjjUsers.id, user.id));
        console.log(`Apple: Subscription expired for user ${user.id}`);
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        console.log(`Apple: Auto-renew ${transactionInfo.autoRenewStatus ? 'enabled' : 'disabled'} for user ${user.id}`);
        break;

      case 'REFUND':
        await db
          .update(bjjUsers)
          .set({
            subscriptionStatus: 'refunded',
            subscriptionType: 'free_trial'
          })
          .where(eq(bjjUsers.id, user.id));
        console.log(`Apple: Subscription refunded for user ${user.id}`);
        break;

      case 'GRACE_PERIOD_EXPIRED':
        await db
          .update(bjjUsers)
          .set({
            subscriptionStatus: 'expired',
            subscriptionType: 'free_trial'
          })
          .where(eq(bjjUsers.id, user.id));
        console.log(`Apple: Grace period expired for user ${user.id}`);
        break;

      default:
        console.log(`Apple webhook: Unhandled notification type: ${notificationType}`);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Apple webhook error:', error);
    res.status(500).send('Error');
  }
});

export default router;
