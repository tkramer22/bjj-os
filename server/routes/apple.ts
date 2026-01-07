import { Router, Request, Response } from 'express';
import { db } from '../db';
import { bjjUsers } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

const APPLE_VERIFY_PRODUCTION = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

interface AppleReceiptInfo {
  original_transaction_id: string;
  product_id: string;
  expires_date_ms: string;
  transaction_id: string;
}

interface AppleVerifyResponse {
  status: number;
  latest_receipt_info?: AppleReceiptInfo[];
  latest_receipt?: string;
}

async function verifyWithApple(receiptData: string, url: string): Promise<AppleVerifyResponse> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      'password': process.env.APPLE_SHARED_SECRET,
      'exclude-old-transactions': true
    })
  });
  return response.json();
}

router.post('/api/subscriptions/apple/verify', async (req: Request, res: Response) => {
  try {
    const { receiptData, transactionId } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!receiptData) {
      return res.status(400).json({ error: 'Receipt data required' });
    }

    let verifyUrl = APPLE_VERIFY_PRODUCTION;
    let response = await verifyWithApple(receiptData, verifyUrl);

    if (response.status === 21007) {
      verifyUrl = APPLE_VERIFY_SANDBOX;
      response = await verifyWithApple(receiptData, verifyUrl);
    }

    if (response.status !== 0) {
      console.error('Apple receipt validation failed:', response.status);
      return res.status(400).json({ 
        error: 'Invalid receipt', 
        appleStatus: response.status 
      });
    }

    const latestReceipt = response.latest_receipt_info?.[0];
    
    if (!latestReceipt) {
      return res.status(400).json({ error: 'No subscription found in receipt' });
    }

    const expiresAt = new Date(parseInt(latestReceipt.expires_date_ms));
    const isActive = expiresAt > new Date();
    const environment = verifyUrl.includes('sandbox') ? 'sandbox' : 'production';

    await db
      .update(bjjUsers)
      .set({
        paymentProvider: 'apple',
        subscriptionType: 'monthly',
        subscriptionStatus: isActive ? 'active' : 'expired',
        appleOriginalTransactionId: latestReceipt.original_transaction_id,
        appleProductId: latestReceipt.product_id,
        appleReceipt: receiptData,
        appleExpiresAt: expiresAt,
        appleEnvironment: environment,
        subscriptionEndDate: expiresAt
      })
      .where(eq(bjjUsers.id, userId));

    console.log(`Apple subscription verified for user ${userId}: ${isActive ? 'active' : 'expired'}`);

    res.json({ 
      success: true, 
      isActive,
      expiresAt,
      productId: latestReceipt.product_id
    });

  } catch (error) {
    console.error('Apple verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

export default router;
