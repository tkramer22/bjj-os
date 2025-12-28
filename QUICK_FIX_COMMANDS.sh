#!/bin/bash
# BJJ OS - iOS Quick Fix
# Run this in your iOS/Expo project directory

set -e

echo "🥋 BJJ OS - iOS Quick Fix Starting..."
echo ""

# Step 1: Nuclear clean
echo "☢️  Step 1: Nuclear clean (removes ALL corrupted files)..."
rm -rf ios/
rm -rf node_modules/
rm -rf .expo/
rm -rf android/  # Optional: clean Android too
rm -f package-lock.json
rm -f yarn.lock
echo "✅ Cleaned"
echo ""

# Step 2: Reinstall dependencies
echo "📦 Step 2: Fresh dependency install..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 3: Regenerate iOS
echo "🏗️  Step 3: Regenerate iOS project..."
npx expo prebuild --clean --platform ios
echo "✅ iOS project regenerated"
echo ""

# Step 4: Install Pods
echo "☕ Step 4: Installing CocoaPods..."
cd ios
pod install --repo-update
cd ..
echo "✅ Pods installed"
echo ""

# Step 5: Run diagnostics
echo "🔍 Step 5: Running diagnostics..."
npx expo doctor
echo ""

echo "✅ QUICK FIX COMPLETE!"
echo ""
echo "Next step: npx expo run:ios"
echo ""
