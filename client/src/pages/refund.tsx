import { Link } from "wouter";
import { useEffect } from "react";

export default function Refund() {
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Override body styles for legal page
  useEffect(() => {
    const originalFont = document.body.style.fontFamily;
    document.body.style.fontFamily = "'JetBrains Mono', monospace";
    
    return () => {
      document.body.style.fontFamily = originalFont;
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-['JetBrains_Mono']">
      <div className="max-w-[800px] mx-auto py-[60px] px-6">
        <Link href="/" className="text-blue-500 hover:text-blue-400 mb-8 inline-block" data-testid="link-back-home">
          ← Back to BJJ OS
        </Link>

        <h1 className="text-4xl font-bold mb-4">Refund Policy</h1>
        <p className="text-gray-400 mb-12">Last Updated: {currentDate}</p>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Free Tier</h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li>No payment required</li>
            <li>No refunds needed (free forever)</li>
            <li>Upgrade anytime to premium features</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Annual Subscription Refunds</h2>
          
          <h3 className="text-xl font-semibold mb-3 text-blue-400">Within 7 Days of Purchase:</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mb-6">
            <li>Full refund available for annual subscription</li>
            <li>Applies to both Founding Member ($89/year) and Pro ($179/year)</li>
            <li>Contact: <a href="mailto:support@bjjos.app" className="text-blue-500 hover:text-blue-400">support@bjjos.app</a></li>
            <li>Refund processed within 5-7 business days</li>
            <li>Access will be canceled upon refund</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 text-blue-400">After 7 Days:</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mb-6">
            <li>No refunds for partial years</li>
            <li>You can cancel to stop future renewals</li>
            <li>Access continues until end of current annual period</li>
          </ul>

          <h3 className="text-xl font-semibold mb-3 text-blue-400">Annual Renewal:</h3>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li>Subscription renews automatically each year</li>
            <li>7-day refund window applies to renewal charges</li>
            <li>Cancel before renewal to avoid being charged</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">How to Cancel</h2>
          <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4">
            <li>Open BJJ OS app</li>
            <li>Go to Settings</li>
            <li>Tap "Manage Subscription"</li>
            <li>Tap "Cancel Subscription"</li>
            <li>Confirm cancellation</li>
          </ol>
          <p className="text-gray-300 leading-relaxed mt-4">
            Cancellation stops future charges immediately. Your access continues 
            until the end of your current billing period.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Refund Process</h2>
          <p className="text-gray-300 leading-relaxed mb-3">
            To request a refund (within 7 days of charge):
          </p>
          <ol className="list-decimal list-inside text-gray-300 space-y-2 ml-4 mb-4">
            <li>Email: <a href="mailto:support@bjjos.app" className="text-blue-500 hover:text-blue-400">support@bjjos.app</a></li>
            <li>Subject: "Refund Request"</li>
            <li>Include: Phone number and reason (optional)</li>
            <li>We'll process within 2 business days</li>
          </ol>
          <p className="text-gray-300 leading-relaxed">
            Refunds are issued to your original payment method.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Special Circumstances</h2>
          <p className="text-gray-300 leading-relaxed mb-3">
            Refunds outside the 7-day window may be considered for:
          </p>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4 mb-4">
            <li>Technical issues preventing use</li>
            <li>Unauthorized charges</li>
            <li>Duplicate charges</li>
          </ul>
          <p className="text-gray-300 leading-relaxed">
            Contact <a href="mailto:support@bjjos.app" className="text-blue-500 hover:text-blue-400">support@bjjos.app</a> to discuss.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-bold mb-4">Non-Refundable</h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2 ml-4">
            <li>Partial month subscriptions (after 7 days)</li>
            <li>Free months earned via referrals</li>
            <li>Account deletions (data recovery not possible)</li>
          </ul>
        </section>

        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Contact</h2>
          <p className="text-gray-300 leading-relaxed mb-2">
            Refund questions? Email: <a href="mailto:support@bjjos.app" className="text-blue-500 hover:text-blue-400">support@bjjos.app</a>
          </p>
          <p className="text-gray-300 leading-relaxed">
            Response time: Within 24 hours
          </p>
        </section>

        <footer className="border-t border-gray-800 pt-8 text-center">
          <div className="flex justify-center gap-4 mb-4 text-sm">
            <Link href="/terms" className="text-blue-500 hover:text-blue-400" data-testid="link-terms">Terms</Link>
            <span className="text-gray-600">•</span>
            <Link href="/privacy" className="text-blue-500 hover:text-blue-400" data-testid="link-privacy">Privacy</Link>
            <span className="text-gray-600">•</span>
            <Link href="/refund" className="text-blue-500 hover:text-blue-400" data-testid="link-refund">Refund</Link>
          </div>
          <p className="text-gray-600 text-sm">© 2025 BJJ OS</p>
        </footer>
      </div>
    </div>
  );
}
