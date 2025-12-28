# BJJ OS - Targeted Error Fixes

## Error 1: Corrupted Podfile

**Symptom**: `pod install` fails with syntax errors or version conflicts

**Fix**:
```bash
cd ios
rm Podfile Podfile.lock
rm -rf Pods
cd ..

# Regenerate iOS folder
npx expo prebuild --clean --platform ios

# Reinstall pods
cd ios
pod repo update
pod install
cd ..
```

---

## Error 2: Missing @react-native-community/cli

**Symptom**: Build fails with "Cannot find module '@react-native-community/cli'"

**Fix**:
```bash
# This dependency should be installed automatically by React Native
# If it's missing, your node_modules is corrupted

# Delete and reinstall
rm -rf node_modules package-lock.json
npm install

# Verify it's installed
npm list @react-native-community/cli
```

**Expected output**: Should show version matching your React Native version

---

## Error 3: Metro Bundler Connecting to Dev Server

**Symptom**: App tries to connect to localhost:8081 instead of using bundled JS

**Fix**: Configure AppDelegate.mm for bundled JS

**File**: `ios/BJJOS/AppDelegate.mm`

```objc
#import "AppDelegate.h"
#import <React/RCTBundleURLProvider.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions
{
  self.moduleName = @"BJJOS";
  self.initialProps = @{};

  return [super application:application didFinishLaunchingWithOptions:launchOptions];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  // For simulator testing, use bundled JS (not Metro)
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#else
  // Production: always use bundled JS
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

@end
```

**Alternative**: Use EAS Build which handles this automatically:
```bash
eas build --platform ios --profile development
```

---

## Error 4: Storyboard Compilation Failures

**Symptom**: Xcode fails with "Failed to compile LaunchScreen.storyboard"

**Fix Option 1**: Regenerate storyboard
```bash
# Delete corrupted storyboard
rm ios/BJJOS/LaunchScreen.storyboard

# Regenerate iOS folder
npx expo prebuild --clean --platform ios
```

**Fix Option 2**: Use image-based splash (recommended for Expo)

**File**: `app.json`
```json
{
  "expo": {
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0F1419"
    },
    "ios": {
      "splash": {
        "image": "./assets/splash.png",
        "resizeMode": "contain",
        "backgroundColor": "#0F1419"
      }
    }
  }
}
```

Then regenerate:
```bash
npx expo prebuild --clean --platform ios
```

---

## Error 5: Expo SDK Version Mismatch

**Symptom**: "Incompatible version of Expo SDK"

**Fix**: Ensure all packages match Expo SDK 54

**File**: `package.json`
```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "react-native": "0.76.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
```

Then:
```bash
rm -rf node_modules package-lock.json
npm install
npx expo install --fix
```

---

## Error 6: Xcode Build Failed (Generic)

**Symptom**: Build fails in Xcode with various errors

**Fix**: Clean build folder and retry
```bash
# In terminal
cd ios
xcodebuild clean -workspace BJJOS.xcworkspace -scheme BJJOS
cd ..

# Or in Xcode:
# Product → Clean Build Folder (Cmd+Shift+K)
# Product → Build (Cmd+B)
```

If still failing:
```bash
# Nuke derived data
rm -rf ~/Library/Developer/Xcode/DerivedData

# Regenerate iOS
npx expo prebuild --clean --platform ios
cd ios && pod install && cd ..
```

---

## Verification Checklist

After applying fixes, verify:

```bash
# 1. Doctor should pass
npx expo doctor

# 2. Dependencies should be clean
npm list --depth=0 | grep UNMET
# (Should show nothing)

# 3. iOS folder should exist
ls ios/BJJOS.xcworkspace
# (Should show the workspace)

# 4. Pods should be installed
ls ios/Pods
# (Should show installed pods)

# 5. Build should work
npx expo run:ios
# (Should launch simulator)
```

---

## If All Else Fails: Fresh Start

If you've tried everything and it's still broken:

```bash
# 1. Save your source code (App.tsx, screens/, etc.)
mkdir ../bjjos-backup
cp -r src/ ../bjjos-backup/
cp -r screens/ ../bjjos-backup/
cp -r components/ ../bjjos-backup/
cp app.json ../bjjos-backup/

# 2. Create fresh Expo project
cd ..
npx create-expo-app BJJOS-fresh --template expo-template-blank-typescript
cd BJJOS-fresh

# 3. Install dependencies
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install @react-native-async-storage/async-storage
npm install axios @tanstack/react-query date-fns

# 4. Copy your code back
cp -r ../bjjos-backup/src/ ./
cp -r ../bjjos-backup/screens/ ./
cp -r ../bjjos-backup/components/ ./
cp ../bjjos-backup/app.json ./

# 5. Generate iOS
npx expo prebuild --platform ios

# 6. Test
npx expo run:ios
```

---

## Priority: Which Fix to Apply First?

1. **If iOS folder is corrupted**: Run `QUICK_FIX_COMMANDS.sh` (nuclear option)
2. **If specific error known**: Apply targeted fix from above
3. **If nothing works**: Fresh start

**Recommendation**: Start with Quick Fix - it's fastest and most reliable.
