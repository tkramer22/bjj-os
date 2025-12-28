import { createReferralCodeWithCoupon, DiscountType } from './referral-service';

interface LaunchCode {
  code: string;
  codeType: 'influencer' | 'user';
  influencerName?: string;
  commissionRate: number;
  discountType: DiscountType;
  discountValue: number;
}

const LAUNCH_CODES: LaunchCode[] = [
  {
    code: 'JTORRES',
    codeType: 'influencer',
    influencerName: 'JT Torres',
    commissionRate: 20,
    discountType: 'free_month',
    discountValue: 1,
  },
  {
    code: 'ASCENSION',
    codeType: 'influencer',
    influencerName: 'Ascension BJJ',
    commissionRate: 15,
    discountType: 'free_month',
    discountValue: 1,
  },
  {
    code: 'FRIENDS',
    codeType: 'user',
    commissionRate: 0,
    discountType: 'percentage',
    discountValue: 50,
  },
  {
    code: 'BETA',
    codeType: 'user',
    commissionRate: 0,
    discountType: 'free_month',
    discountValue: 1,
  },
  {
    code: 'LIFETIME',
    codeType: 'user',
    commissionRate: 0,
    discountType: 'free_months',
    discountValue: 12,
  },
];

export async function seedLaunchCodes() {
  console.log('🌱 Seeding launch referral codes...\n');
  const results: { code: string; success: boolean; message?: string }[] = [];

  for (const codeConfig of LAUNCH_CODES) {
    const result = await createReferralCodeWithCoupon({
      code: codeConfig.code,
      codeType: codeConfig.codeType,
      influencerName: codeConfig.influencerName,
      commissionRate: codeConfig.commissionRate,
      discountType: codeConfig.discountType,
      discountValue: codeConfig.discountValue,
    });

    if (result.success) {
      console.log(`✅ Created: ${codeConfig.code}`);
      console.log(`   Type: ${codeConfig.codeType}`);
      if (codeConfig.influencerName) console.log(`   Influencer: ${codeConfig.influencerName}`);
      console.log(`   Commission: ${codeConfig.commissionRate}%`);
      console.log(`   Discount: ${codeConfig.discountType} (${codeConfig.discountValue})`);
      console.log('');
    } else {
      console.log(`⚠️ Skipped: ${codeConfig.code} - ${result.message}`);
    }

    results.push({
      code: codeConfig.code,
      success: result.success,
      message: result.message,
    });
  }

  console.log('\n📊 Summary:');
  console.log(`   Created: ${results.filter(r => r.success).length}`);
  console.log(`   Skipped: ${results.filter(r => !r.success).length}`);

  return results;
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedLaunchCodes()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error seeding codes:', error);
      process.exit(1);
    });
}
