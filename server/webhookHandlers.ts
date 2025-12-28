import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { db } from './db';
import { bjjUsers } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { sendWelcomeEmail } from './email';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string, uuid: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const sync = await getStripeSync();
    
    const stripe = await getUncachableStripeClient();
    const webhookSecret = await sync.getWebhookSecret(uuid);
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      throw err;
    }
    
    console.log(`📦 [STRIPE WEBHOOK] Received event: ${event.type}`);
    
    switch (event.type) {
      case 'checkout.session.completed':
        await WebhookHandlers.handleCheckoutSessionCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await WebhookHandlers.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await WebhookHandlers.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await WebhookHandlers.handlePaymentFailed(event.data.object);
        break;
    }
    
    await sync.processWebhook(payload, signature, uuid);
  }

  static async handleCheckoutSessionCompleted(session: any): Promise<void> {
    console.log(`✅ [STRIPE] Checkout session completed: ${session.id}`);
    
    const email = session.customer_email || session.customer_details?.email;
    const customerId = session.customer;
    const subscriptionId = session.subscription;
    
    if (!email) {
      console.error('❌ [STRIPE] No email in checkout session');
      return;
    }
    
    const normalizedEmail = email.toLowerCase().trim();
    
    const existingUser = await db.query.bjjUsers.findFirst({
      where: eq(bjjUsers.email, normalizedEmail)
    });
    
    if (existingUser) {
      console.log(`📝 [STRIPE] Updating existing user with subscription: ${existingUser.id}`);
      await db.update(bjjUsers)
        .set({
          stripeCustomerId: customerId,
          stripeSubscriptionId: subscriptionId,
          subscriptionStatus: 'active',
          subscriptionType: 'monthly',
        })
        .where(eq(bjjUsers.id, existingUser.id));
      return;
    }
    
    console.log(`📝 [STRIPE] Creating new user from successful payment: ${normalizedEmail}`);
    
    const [newUser] = await db.insert(bjjUsers).values({
      email: normalizedEmail,
      emailVerified: true,
      onboardingCompleted: false,
      subscriptionType: 'monthly',
      subscriptionStatus: 'active',
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    }).returning();
    
    console.log(`✅ [STRIPE] New user created: ${newUser.id}`);
    
    sendWelcomeEmail(normalizedEmail, null).catch(err => {
      console.error('Failed to send welcome email:', err);
    });
  }

  static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    console.log(`🔄 [STRIPE] Subscription updated: ${subscription.id}`);
    
    const [user] = await db.select()
      .from(bjjUsers)
      .where(eq(bjjUsers.stripeSubscriptionId, subscription.id))
      .limit(1);
    
    if (!user) {
      console.log(`⚠️ [STRIPE] No user found for subscription: ${subscription.id}`);
      return;
    }
    
    let status: 'active' | 'canceled' | 'past_due' | 'trialing' = 'active';
    if (subscription.status === 'canceled' || subscription.status === 'unpaid') {
      status = 'canceled';
    } else if (subscription.status === 'past_due') {
      status = 'past_due';
    } else if (subscription.status === 'trialing') {
      status = 'trialing';
    }
    
    await db.update(bjjUsers)
      .set({ subscriptionStatus: status })
      .where(eq(bjjUsers.id, user.id));
    
    console.log(`✅ [STRIPE] Updated user ${user.id} subscription status to: ${status}`);
  }

  static async handleSubscriptionDeleted(subscription: any): Promise<void> {
    console.log(`❌ [STRIPE] Subscription deleted: ${subscription.id}`);
    
    const [user] = await db.select()
      .from(bjjUsers)
      .where(eq(bjjUsers.stripeSubscriptionId, subscription.id))
      .limit(1);
    
    if (!user) {
      console.log(`⚠️ [STRIPE] No user found for subscription: ${subscription.id}`);
      return;
    }
    
    await db.update(bjjUsers)
      .set({ 
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null 
      })
      .where(eq(bjjUsers.id, user.id));
    
    console.log(`✅ [STRIPE] Canceled subscription for user: ${user.id}`);
  }

  static async handlePaymentFailed(invoice: any): Promise<void> {
    console.log(`⚠️ [STRIPE] Payment failed for invoice: ${invoice.id}`);
    
    const customerId = invoice.customer;
    
    const [user] = await db.select()
      .from(bjjUsers)
      .where(eq(bjjUsers.stripeCustomerId, customerId))
      .limit(1);
    
    if (!user) {
      console.log(`⚠️ [STRIPE] No user found for customer: ${customerId}`);
      return;
    }
    
    await db.update(bjjUsers)
      .set({ subscriptionStatus: 'past_due' })
      .where(eq(bjjUsers.id, user.id));
    
    console.log(`⚠️ [STRIPE] Marked user ${user.id} as past_due`);
  }
}
