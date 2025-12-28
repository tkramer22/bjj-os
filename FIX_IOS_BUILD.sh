#!/bin/bash
# BJJ OS - iOS Build Fix Script
# Run this in your Expo project directory to fix corrupted builds

set -e  # Exit on error

echo "🥋 BJJ OS - iOS Build Fix Script"
echo "================================"
echo ""

# Check if we're in an Expo project
if [ ! -f "app.json" ]; then
    echo "❌ Error: app.json not found. Are you in your Expo project directory?"
    exit 1
fi

echo "✅ Expo project detected"
echo ""

# Step 1: Clean corrupted files
echo "🧹 Step 1: Cleaning corrupted files..."
rm -rf ios/
rm -rf node_modules/
rm -rf .expo/
rm -f package-lock.json
rm -f yarn.lock
echo "✅ Cleaned corrupted files"
echo ""

# Step 2: Reinstall dependencies
echo "📦 Step 2: Reinstalling dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Step 3: Regenerate iOS folder
echo "🏗️  Step 3: Regenerating iOS folder..."
npx expo prebuild --clean --platform ios
echo "✅ iOS folder regenerated"
echo ""

# Step 4: Install CocoaPods
echo "☕ Step 4: Installing CocoaPods..."
cd ios
pod install --repo-update
cd ..
echo "✅ Pods installed"
echo ""

# Step 5: Verify build
echo "🔍 Step 5: Checking for build errors..."
npx expo doctor
echo ""

echo "✅ BUILD FIX COMPLETE!"
echo ""
echo "Next steps:"
echo "1. Test in simulator: npx expo run:ios"
echo "2. Or build for production: eas build --platform ios"
echo ""
echo "Test with phone: (914) 837-3750"
echo "Backend API: https://bjjos.app/api"
echo ""
echo "🥋 Good luck!"
