import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { bjjUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';

const router = Router();

interface AppleTransactionInfo {
  originalTransactionId: string;
  expiresDate: number;
  autoRenewStatus: boolean;
  productId: string;
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function decodeAppleJWS(signedPayload: string): any {
  try {
    const parts = signedPayload.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWS format');
    }
    const payload = base64UrlDecode(parts[1]);
    return JSON.parse(payload);
  } catch (error) {
    console.error('Failed to decode Apple JWS:', error);
    throw error;
  }
}

function verifyAppleWebhookSignature(signedPayload: string): boolean {
  const parts = signedPayload.split('.');
  if (parts.length !== 3) {
    return false;
  }

  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    
    if (header.alg !== 'ES256') {
      console.warn('Apple webhook: Unexpected algorithm:', header.alg);
      return false;
    }

    if (!header.x5c || !Array.isArray(header.x5c) || header.x5c.length === 0) {
      console.warn('Apple webhook: No x5c certificate chain in header');
      return false;
    }

    const leafCertPem = `-----BEGIN CERTIFICATE-----\n${header.x5c[0]}\n-----END CERTIFICATE-----`;
    
    const signatureInput = `${parts[0]}.${parts[1]}`;
    let signature = parts[2].replace(/-/g, '+').replace(/_/g, '/');
    const padding = signature.length % 4;
    if (padding) {
      signature += '='.repeat(4 - padding);
    }
    const signatureBuffer = Buffer.from(signature, 'base64');

    const verify = crypto.createVerify('SHA256');
    verify.update(signatureInput);
    verify.end();

    const isValid = verify.verify(leafCertPem, signatureBuffer);
    
    if (!isValid) {
      console.warn('Apple webhook: Signature verification failed');
    }
    
    return isValid;
  } catch (error) {
    console.error('Apple webhook: Signature verification error:', error);
    return false;
  }
}

router.post('/api/webhooks/apple', async (req: Request, res: Response) => {
  try {
    const { signedPayload } = req.body;

    if (!signedPayload) {
      console.log('Apple webhook: No signed payload');
      return res.status(400).send('Missing payload');
    }

    if (!verifyAppleWebhookSignature(signedPayload)) {
      console.error('Apple webhook: Invalid signature - rejecting');
      return res.status(401).send('Invalid signature');
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
