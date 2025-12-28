import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  console.log('🏗️ Creating BJJ OS subscription product in Stripe...');
  
  const stripe = await getUncachableStripeClient();
  
  const existingProducts = await stripe.products.search({
    query: "name:'BJJ OS Monthly'"
  });
  
  if (existingProducts.data.length > 0) {
    console.log('✅ BJJ OS product already exists:', existingProducts.data[0].id);
    
    const existingPrices = await stripe.prices.list({
      product: existingProducts.data[0].id,
      active: true,
    });
    
    console.log('📦 Existing prices:', existingPrices.data.map(p => ({
      id: p.id,
      amount: p.unit_amount,
      trial_days: p.recurring?.trial_period_days
    })));
    
    return;
  }
  
  const product = await stripe.products.create({
    name: 'BJJ OS Monthly',
    description: 'AI-powered BJJ coaching with Professor OS. Get personalized technique recommendations, video analysis, and intelligent training guidance.',
    metadata: {
      type: 'subscription',
      tier: 'pro',
    }
  });
  
  console.log('✅ Product created:', product.id);
  
  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 1499,
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
    metadata: {
      plan_type: 'monthly',
      trial_days: '7',
    }
  });
  
  console.log('✅ Monthly price created:', monthlyPrice.id, '($14.99/month with 7-day trial)');
  
  console.log('\n🎉 Stripe products setup complete!');
  console.log('Product ID:', product.id);
  console.log('Price ID:', monthlyPrice.id);
}

seedProducts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Failed to seed products:', err);
    process.exit(1);
  });
