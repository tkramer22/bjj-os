# BJJ OS - iOS Implementation Roadmap
**From Zero to App Store - Step-by-Step**

This guide takes you from broken build → working iOS app → App Store submission.

---

## 🎯 Phase 1: Fix Build (Priority 1)

### Step 1.1: Diagnosis
In your iOS project directory, run:
```bash
# Check current state
npx expo doctor

# List dependencies
npm list --depth=0 | grep -E "expo|react-native|@react-navigation"

# Check iOS folder
ls -la ios/ 2>/dev/null || echo "No iOS folder"
```

**Decision Point**:
- ✅ If `expo doctor` passes → Skip to Step 1.3
- ❌ If `expo doctor` fails → Continue to Step 1.2

### Step 1.2: Nuclear Clean (Recommended)
```bash
# Download QUICK_FIX_COMMANDS.sh from this Replit workspace
# Then in your iOS project:
chmod +x QUICK_FIX_COMMANDS.sh
./QUICK_FIX_COMMANDS.sh
```

This will:
1. Delete iOS, node_modules, .expo
2. Reinstall dependencies
3. Regenerate iOS project
4. Install CocoaPods
5. Run diagnostics

**Expected result**: 
- `npx expo doctor` shows ✅ all checks pass
- iOS folder exists with `.xcworkspace`
- Pods installed in `ios/Pods/`

### Step 1.3: Update package.json
Replace your `package.json` with `EXPO_PACKAGE_JSON_TEMPLATE.json` from this workspace.

Key dependencies:
- Expo SDK 54
- React Native 0.76.5
- React Navigation 6.x
- AsyncStorage, React Query, Axios

```bash
# After updating package.json
npm install
npx expo install --fix
```

### Step 1.4: Configure app.json
```json
{
  "expo": {
    "name": "BJJ OS",
    "slug": "bjjos",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0F1419"
    },
    "ios": {
      "bundleIdentifier": "com.bjjos.app",
      "buildNumber": "1.0.0",
      "supportsTablet": false,
      "infoPlist": {
        "NSMicrophoneUsageDescription": "BJJ OS needs microphone access for voice input to Prof. OS.",
        "UIBackgroundModes": ["audio"]
      }
    },
    "plugins": [],
    "extra": {
      "apiBaseUrl": "https://bjjos.app/api"
    }
  }
}
```

### Step 1.5: Test Build
```bash
# Regenerate iOS with new config
npx expo prebuild --clean --platform ios

# Try to build
npx expo run:ios
```

**Success criteria**:
- ✅ App launches in simulator
- ✅ Shows Expo splash screen or default app
- ✅ No Metro bundler errors
- ✅ No Xcode build failures

**If build fails**: Check `TARGETED_ERROR_FIXES.md` for specific error solutions.

---

## 🔐 Phase 2: Authentication Flow (Priority 2)

### Step 2.1: Create Project Structure
```bash
mkdir -p src/screens
mkdir -p src/components
mkdir -p src/navigation
mkdir -p src/services
mkdir -p src/utils
mkdir -p src/config
mkdir -p src/theme
```

### Step 2.2: Create Core Files

**File**: `src/config/api.ts`
```typescript
import Constants from 'expo-constants';

export const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://bjjos.app/api';

export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
};
```

**File**: `src/utils/auth.ts`
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEYS = {
  USER_ID: 'userId',
  USER_DATA: 'userData',
};

export async function setUserId(userId: string) {
  await AsyncStorage.setItem(AUTH_KEYS.USER_ID, String(userId));
}

export async function getUserId(): Promise<string | null> {
  return await AsyncStorage.getItem(AUTH_KEYS.USER_ID);
}

export async function setUserData(data: any) {
  await AsyncStorage.setItem(AUTH_KEYS.USER_DATA, JSON.stringify(data));
}

export async function getUserData(): Promise<any | null> {
  const data = await AsyncStorage.getItem(AUTH_KEYS.USER_DATA);
  return data ? JSON.parse(data) : null;
}

export async function clearAuth() {
  await AsyncStorage.multiRemove([AUTH_KEYS.USER_ID, AUTH_KEYS.USER_DATA]);
}

export async function isAuthenticated(): Promise<boolean> {
  const userId = await getUserId();
  return userId !== null;
}
```

**File**: `src/services/api.ts`
```typescript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';

const api = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers,
});

// Add cache busting
api.interceptors.request.use((config) => {
  const separator = config.url?.includes('?') ? '&' : '?';
  config.url = `${config.url}${separator}_t=${Date.now()}`;
  return config;
});

// ===== AUTH =====
export async function sendVerificationCode(phoneNumber: string) {
  const response = await api.post('/auth/send-code', {
    phone_number: phoneNumber,
  });
  return response.data;
}

export async function verifyCode(phoneNumber: string, code: string) {
  const response = await api.post('/auth/verify-code', {
    phone_number: phoneNumber,
    code,
  });
  
  if (response.data.userId) {
    await AsyncStorage.setItem('userId', String(response.data.userId));
  }
  
  return response.data;
}

export async function checkUser(phoneNumber: string) {
  const response = await api.post('/auth/check-user', {
    phoneNumber,
  });
  return response.data;
}

// ===== CHAT =====
export async function sendChatMessage(userId: string, message: string) {
  const response = await api.post('/ai/chat/message', {
    userId,
    message,
  });
  return response.data;
}

export async function getChatHistory(userId: string, limit = 50) {
  const response = await api.get(`/ai/chat/history/${userId}?limit=${limit}`);
  return response.data;
}

export default api;
```

**File**: `src/theme/colors.ts`
```typescript
export const COLORS = {
  mobileDarkBg: '#0F1419',
  mobileCardBg: '#1A1F29',
  mobileSurface: '#22272F',
  mobileBorder: '#2E3440',
  mobileTextPrimary: '#F3F4F6',
  mobileTextSecondary: '#9CA3AF',
  mobileTextMuted: '#6B7280',
  mobilePrimaryPurple: '#8B5CF6',
  mobilePrimaryBlue: '#3B82F6',
  mobileSuccessGreen: '#10B981',
  mobileErrorRed: '#EF4444',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const FONTS = {
  regular: 'System',
  medium: 'System',
  semibold: 'System',
  bold: 'System',
};

export const FONT_SIZES = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
};
```

### Step 2.3: Create Auth Screen

**File**: `src/screens/PhoneAuthScreen.tsx`
```typescript
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { sendVerificationCode, verifyCode } from '../services/api';
import { COLORS, SPACING, FONTS, FONT_SIZES } from '../theme/colors';

interface PhoneAuthScreenProps {
  onAuthComplete: () => void;
}

export default function PhoneAuthScreen({ onAuthComplete }: PhoneAuthScreenProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [loading, setLoading] = useState(false);

  const handleSendCode = async () => {
    if (phoneNumber.length < 10) {
      Alert.alert('Error', 'Please enter a valid phone number');
      return;
    }

    setLoading(true);
    try {
      await sendVerificationCode(phoneNumber);
      setStep('code');
      Alert.alert('Success', 'Verification code sent!');
    } catch (error) {
      Alert.alert('Error', 'Failed to send code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) {
      Alert.alert('Error', 'Please enter the 6-digit code');
      return;
    }

    setLoading(true);
    try {
      await verifyCode(phoneNumber, code);
      onAuthComplete();
    } catch (error) {
      Alert.alert('Error', 'Invalid code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>BJJ OS</Text>
        <Text style={styles.subtitle}>Your AI Training Partner</Text>

        {step === 'phone' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor={COLORS.mobileTextMuted}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              autoFocus
            />
            <TouchableOpacity
              onPress={handleSendCode}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Send Code</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.codeHint}>
              Enter the 6-digit code sent to {phoneNumber}
            </Text>
            <TextInput
              style={styles.input}
              placeholder="000000"
              placeholderTextColor={COLORS.mobileTextMuted}
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <TouchableOpacity
              onPress={handleVerifyCode}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('phone')} style={styles.backButton}>
              <Text style={styles.backButtonText}>Change Phone Number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mobileDarkBg,
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZES['3xl'],
    fontFamily: FONTS.bold,
    color: COLORS.mobileTextPrimary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextSecondary,
    textAlign: 'center',
    marginBottom: SPACING.xl,
  },
  input: {
    backgroundColor: COLORS.mobileSurface,
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: FONT_SIZES.lg,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextPrimary,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  button: {
    backgroundColor: COLORS.mobilePrimaryPurple,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: FONT_SIZES.lg,
    fontFamily: FONTS.semibold,
    color: '#FFFFFF',
  },
  codeHint: {
    fontSize: FONT_SIZES.base,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  backButton: {
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: FONT_SIZES.base,
    fontFamily: FONTS.regular,
    color: COLORS.mobilePrimaryPurple,
  },
});
```

### Step 2.4: Update App.tsx

**File**: `App.tsx`
```typescript
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { isAuthenticated } from './src/utils/auth';
import PhoneAuthScreen from './src/screens/PhoneAuthScreen';
import { COLORS } from './src/theme/colors';

const queryClient = new QueryClient();

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const authenticated = await isAuthenticated();
    setIsLoggedIn(authenticated);
    setIsLoading(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.mobilePrimaryPurple} />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="light" />
      {isLoggedIn ? (
        <View style={styles.container}>
          {/* TODO: Add main app navigation here */}
        </View>
      ) : (
        <PhoneAuthScreen onAuthComplete={() => setIsLoggedIn(true)} />
      )}
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mobileDarkBg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.mobileDarkBg,
  },
});
```

### Step 2.5: Test Authentication
```bash
npx expo run:ios
```

**Expected behavior**:
1. App launches showing phone number screen
2. Enter: 9148373750
3. Tap "Send Code"
4. Receive SMS from Twilio
5. Enter 6-digit code
6. Successfully authenticated → blank screen (we'll add chat next)

**Test credentials**: (914) 837-3750

---

## 💬 Phase 3: Chat Interface (Priority 3)

### Step 3.1: Create Coach Screen

**File**: `src/screens/CoachScreen.tsx`

Copy from `EXPO_IOS_SETUP_GUIDE.md` Part 8 - complete CoachScreen implementation with:
- Message input
- Send button
- Chat history
- React Query integration
- Loading states

### Step 3.2: Update App.tsx to show CoachScreen

Replace the TODO comment with:
```typescript
import CoachScreen from './src/screens/CoachScreen';

// Inside the isLoggedIn branch:
<CoachScreen />
```

### Step 3.3: Test Chat
```bash
npx expo run:ios
```

**Expected behavior**:
1. After auth → Shows Coach screen
2. Can type message
3. Tap send → Message appears
4. Prof. OS responds with AI message
5. Chat history loads on restart

---

## 📱 Phase 4: Bottom Navigation (Priority 4)

### Step 4.1: Install Navigation
Already installed from package.json:
- @react-navigation/native
- @react-navigation/bottom-tabs
- react-native-screens
- react-native-safe-area-context

### Step 4.2: Create Placeholder Screens

**Files**:
- `src/screens/SavedScreen.tsx`
- `src/screens/ProgressScreen.tsx`
- `src/screens/SettingsScreen.tsx`

Start with simple placeholders:
```typescript
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, FONTS, FONT_SIZES } from '../theme/colors';

export default function SavedScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Saved Videos</Text>
      <Text style={styles.subtitle}>Coming soon...</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mobileDarkBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FONT_SIZES['2xl'],
    fontFamily: FONTS.bold,
    color: COLORS.mobileTextPrimary,
  },
  subtitle: {
    fontSize: FONT_SIZES.base,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextSecondary,
    marginTop: 8,
  },
});
```

### Step 4.3: Create Navigation

**File**: `App.tsx` (updated)

Copy complete navigation setup from `EXPO_IOS_SETUP_GUIDE.md` Part 4 with bottom tabs.

### Step 4.4: Test Navigation
```bash
npx expo run:ios
```

**Expected behavior**:
- Bottom tabs show: Coach, Saved, Progress, Settings
- Can switch between tabs
- Each tab shows its screen
- Purple highlight on active tab

---

## 🚀 Phase 5: App Store Build (Final)

### Step 5.1: Install EAS CLI
```bash
npm install -g eas-cli
eas login
```

### Step 5.2: Configure EAS

**File**: `eas.json`
```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "ios": {
        "simulator": false,
        "resourceClass": "m-medium"
      }
    }
  }
}
```

### Step 5.3: Build for App Store
```bash
# Build production IPA
eas build --platform ios --profile production

# Wait for build (EAS will email you)
# Download .ipa file from Expo dashboard
```

### Step 5.4: Submit to App Store Connect
1. Create app in App Store Connect
2. Upload .ipa using Transporter or Xcode
3. Fill out app information
4. Add screenshots
5. Set pricing: $14.99/month subscription
6. Submit for review

---

## ✅ Success Checklist

### Phase 1 Complete When:
- [ ] `npx expo doctor` passes
- [ ] iOS folder exists
- [ ] `npx expo run:ios` launches simulator
- [ ] No build errors

### Phase 2 Complete When:
- [ ] Auth screen displays
- [ ] Can enter phone: 9148373750
- [ ] Receives SMS code
- [ ] Code verification works
- [ ] AsyncStorage stores userId

### Phase 3 Complete When:
- [ ] Coach screen displays after auth
- [ ] Can send messages
- [ ] Prof. OS responds
- [ ] Chat history persists
- [ ] Connects to bjjos.app API

### Phase 4 Complete When:
- [ ] Bottom tabs work
- [ ] All 4 screens accessible
- [ ] Navigation smooth
- [ ] Tabs highlight correctly

### Phase 5 Complete When:
- [ ] EAS build succeeds
- [ ] .ipa file downloads
- [ ] App Store submission complete
- [ ] App works without Metro

---

## 🐛 Troubleshooting Quick Reference

| Error | Solution |
|-------|----------|
| Podfile corrupted | Run `QUICK_FIX_COMMANDS.sh` |
| Metro won't connect | Use EAS build instead |
| Missing CLI | Delete node_modules, reinstall |
| Xcode build failed | Clean build folder, regenerate iOS |
| API not connecting | Check app.json extra.apiBaseUrl |
| Auth not working | Verify AsyncStorage imports |

**Full solutions**: See `TARGETED_ERROR_FIXES.md`

---

## 📞 Next Steps for You

1. **Download these files from this Replit**:
   - QUICK_FIX_COMMANDS.sh
   - EXPO_PACKAGE_JSON_TEMPLATE.json
   - TARGETED_ERROR_FIXES.md
   - EXPO_IOS_SETUP_GUIDE.md
   - WEB_TO_EXPO_CONVERSION.md

2. **In your iOS project, run**:
   ```bash
   ./QUICK_FIX_COMMANDS.sh
   ```

3. **Test build**:
   ```bash
   npx expo run:ios
   ```

4. **Share results**:
   - If it works: Move to Phase 2 (Auth)
   - If it fails: Share exact error message

🥋 **Let's get building!**
