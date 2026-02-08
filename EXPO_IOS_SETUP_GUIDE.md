# BJJ OS - Expo iOS Setup Guide
**App Store Ready Standalone Build**

This guide will help you build the iOS version of BJJ OS using Expo, connecting to your bjjos.app backend API.

---

## 🎯 Quick Start Checklist

- [ ] Expo CLI installed globally
- [ ] Xcode installed (App Store)
- [ ] iOS Simulator configured
- [ ] Backend API accessible at bjjos.app
- [ ] Test phone number ready: (914) 837-3750

---

## 📋 Part 1: Fix Current Build Issues

### Common iOS Build Problems & Solutions

#### Problem 1: Corrupted Podfile/iOS Folder
**Solution**: Clean rebuild from scratch
```bash
# Delete corrupted iOS folder
rm -rf ios/

# Delete Pods
rm -rf ios/Pods
rm ios/Podfile.lock

# Regenerate iOS folder with Expo
npx expo prebuild --clean --platform ios

# Install pods
cd ios && pod install --repo-update && cd ..
```

#### Problem 2: Metro Bundler Issues
**Solution**: Use standalone build (no Metro required)
```bash
# Build production JavaScript bundle
npx expo export --platform ios

# Or use EAS Build for App Store
eas build --platform ios --profile production
```

#### Problem 3: Dependency Conflicts
**Solution**: Use exact Expo SDK 54 versions
```json
{
  "dependencies": {
    "expo": "~54.0.0",
    "react-native": "0.76.5",
    "react": "18.3.1"
  }
}
```

#### Problem 4: AppDelegate.mm Bundle Loading
**Solution**: Configure for bundled JS (not Metro)
```objc
// ios/BJJOS/AppDelegate.mm
- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}
```

---

## 📦 Part 2: Project Setup

### Step 1: Create Fresh Expo Project (If Needed)

If your current project is too corrupted, start fresh:

```bash
# Create new Expo project with TypeScript
npx create-expo-app BJJOS --template expo-template-blank-typescript

cd BJJOS

# Install Expo SDK 54
npm install expo@~54.0.0

# Install required dependencies
npm install @react-navigation/native @react-navigation/bottom-tabs
npm install react-native-screens react-native-safe-area-context
npm install @react-native-async-storage/async-storage
npm install expo-av expo-speech
npm install @tanstack/react-query
npm install axios
npm install date-fns
```

### Step 2: Configure app.json

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
        "NSCameraUsageDescription": "BJJ OS needs camera access for technique analysis.",
        "UIBackgroundModes": ["audio"]
      }
    },
    "android": {
      "package": "com.bjjos.app",
      "versionCode": 1,
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0F1419"
      }
    },
    "plugins": [
      [
        "expo-av",
        {
          "microphonePermission": "Allow BJJ OS to access your microphone for voice input."
        }
      ]
    ],
    "extra": {
      "apiBaseUrl": "https://bjjos.app/api",
      "eas": {
        "projectId": "your-project-id-here"
      }
    }
  }
}
```

### Step 3: Configure eas.json (For App Store Builds)

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
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false,
        "resourceClass": "m-medium"
      }
    },
    "production": {
      "ios": {
        "simulator": false,
        "resourceClass": "m-medium"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

---

## 🔧 Part 3: Core Implementation Files

### 1. API Configuration

**File**: `config/api.ts`
```typescript
import Constants from 'expo-constants';

// Get API base URL from app.json
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://bjjos.app/api';

export const API_CONFIG = {
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  },
};

export default API_CONFIG;
```

### 2. API Client with Axios

**File**: `services/api.ts`
```typescript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_CONFIG } from '../config/api';

// Create axios instance
const api = axios.create({
  baseURL: API_CONFIG.baseURL,
  timeout: API_CONFIG.timeout,
  headers: API_CONFIG.headers,
});

// Add cache busting to all requests
api.interceptors.request.use((config) => {
  const separator = config.url?.includes('?') ? '&' : '?';
  config.url = `${config.url}${separator}_t=${Date.now()}`;
  return config;
});

// ===== AUTHENTICATION =====

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
  
  // Store userId after successful verification
  if (response.data.userId) {
    await AsyncStorage.setItem('userId', String(response.data.userId));
  }
  
  return response.data;
}

export async function checkUser(phoneNumber: string) {
  const response = await api.post('/auth/check-user', {
    phoneNumber,
    phone_number: phoneNumber,
  });
  return response.data;
}

export async function getUserProfile() {
  const response = await api.get('/auth/profile');
  return response.data;
}

export async function updateUserProfile(updates: any) {
  const response = await api.patch('/auth/profile', updates);
  return response.data;
}

export async function completeOnboarding(userId: string, answers: any) {
  const response = await api.post('/onboarding/complete', {
    userId,
    ...answers,
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

// ===== VIDEOS =====

export async function getSavedVideos(userId: string) {
  const response = await api.get(`/ai/saved-videos/${userId}`);
  return response.data;
}

export async function saveVideo(userId: string, videoId: string, note = '') {
  const response = await api.post('/ai/saved-videos', {
    userId,
    videoId,
    note,
  });
  return response.data;
}

export async function unsaveVideo(userId: string, videoId: string) {
  const response = await api.delete(`/ai/saved-videos/${videoId}`, {
    data: { userId },
  });
  return response.data;
}

// ===== PROGRESS =====

export async function getUserProgress(userId: string) {
  const response = await api.get(`/ai/user/${userId}/context`);
  return response.data;
}

export default api;
```

### 3. Auth Utilities

**File**: `utils/auth.ts`
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEYS = {
  USER_ID: 'userId',
  USER_DATA: 'userData',
  SESSION_TOKEN: 'sessionToken',
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
  await AsyncStorage.multiRemove([
    AUTH_KEYS.USER_ID,
    AUTH_KEYS.SESSION_TOKEN,
    AUTH_KEYS.USER_DATA,
  ]);
}

export async function isAuthenticated(): Promise<boolean> {
  const userId = await getUserId();
  return userId !== null;
}
```

### 4. Theme/Colors

**File**: `theme/colors.ts`
```typescript
export const COLORS = {
  // Background
  mobileDarkBg: '#0F1419',
  mobileCardBg: '#1A1F29',
  mobileSurface: '#22272F',
  mobileBorder: '#2E3440',
  
  // Text
  mobileTextPrimary: '#F3F4F6',
  mobileTextSecondary: '#9CA3AF',
  mobileTextMuted: '#6B7280',
  
  // Primary (Purple/Blue)
  mobilePrimaryPurple: '#8B5CF6',
  mobilePrimaryBlue: '#3B82F6',
  
  // Status
  mobileSuccessGreen: '#10B981',
  mobileWarningYellow: '#F59E0B',
  mobileErrorRed: '#EF4444',
  
  // Belt Colors (IBJJF)
  beltWhite: '#FFFFFF',
  beltBlue: '#2563EB',
  beltPurple: '#7C3AED',
  beltBrown: '#92400E',
  beltBlack: '#000000',
  beltBlackStripe: '#DC2626',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
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
  '3xl': 30,
};
```

---

## 🏗️ Part 4: Navigation Setup

### App.tsx (Root Component)

```typescript
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MessageCircle, Bookmark, TrendingUp, Settings } from 'react-native-feather';
import { StatusBar } from 'expo-status-bar';

import { isAuthenticated } from './utils/auth';
import { COLORS } from './theme/colors';

// Screens
import AuthNavigator from './navigation/AuthNavigator';
import CoachScreen from './screens/CoachScreen';
import SavedScreen from './screens/SavedScreen';
import ProgressScreen from './screens/ProgressScreen';
import SettingsScreen from './screens/SettingsScreen';

const Tab = createBottomTabNavigator();
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
    return null; // Or loading screen
  }

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationContainer>
        <StatusBar style="light" />
        {isLoggedIn ? (
          <Tab.Navigator
            screenOptions={{
              tabBarStyle: {
                backgroundColor: COLORS.mobileCardBg,
                borderTopColor: COLORS.mobileBorder,
                borderTopWidth: 1,
              },
              tabBarActiveTintColor: COLORS.mobilePrimaryPurple,
              tabBarInactiveTintColor: COLORS.mobileTextSecondary,
              headerShown: false,
            }}
          >
            <Tab.Screen
              name="Coach"
              component={CoachScreen}
              options={{
                tabBarIcon: ({ color }) => <MessageCircle color={color} size={24} />,
              }}
            />
            <Tab.Screen
              name="Saved"
              component={SavedScreen}
              options={{
                tabBarIcon: ({ color }) => <Bookmark color={color} size={24} />,
              }}
            />
            <Tab.Screen
              name="Progress"
              component={ProgressScreen}
              options={{
                tabBarIcon: ({ color }) => <TrendingUp color={color} size={24} />,
              }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                tabBarIcon: ({ color }) => <Settings color={color} size={24} />,
              }}
            />
          </Tab.Navigator>
        ) : (
          <AuthNavigator onAuthComplete={() => setIsLoggedIn(true)} />
        )}
      </NavigationContainer>
    </QueryClientProvider>
  );
}
```

---

## 🚀 Part 5: Build & Deploy

### Option A: Build for iOS Simulator (Testing)

```bash
# Generate iOS project
npx expo prebuild --clean --platform ios

# Install pods
cd ios && pod install && cd ..

# Build for simulator
npx expo run:ios --device
```

### Option B: EAS Build (App Store Ready)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Configure project
eas build:configure

# Build for iOS
eas build --platform ios --profile production

# Or build for simulator testing
eas build --platform ios --profile development
```

### Build Commands Explained

| Command | Purpose | Metro Required? |
|---------|---------|-----------------|
| `expo run:ios` | Local development | ✅ Yes |
| `eas build --profile development` | Simulator testing | ❌ No |
| `eas build --profile production` | App Store submission | ❌ No |
| `expo export` | Generate JS bundle | ❌ No |

---

## 🧪 Part 6: Testing Checklist

### Pre-Build Tests
- [ ] `npx expo doctor` shows no errors
- [ ] All dependencies match Expo SDK 54
- [ ] app.json is valid JSON
- [ ] API_BASE_URL points to bjjos.app

### Build Tests
- [ ] iOS folder generates without errors
- [ ] Pods install successfully
- [ ] Xcode opens project without warnings
- [ ] Build succeeds in Xcode

### Runtime Tests
- [ ] App launches in simulator
- [ ] Login screen displays
- [ ] Phone number (914) 837-3750 accepts input
- [ ] SMS verification works
- [ ] Prof. OS chat interface loads
- [ ] Messages send to bjjos.app API
- [ ] Responses display correctly

### App Store Readiness
- [ ] Standalone build works (no Metro)
- [ ] App icon configured (1024x1024)
- [ ] Splash screen configured
- [ ] Privacy policy URL added
- [ ] Microphone permission description set
- [ ] Bundle identifier configured

---

## 🐛 Part 7: Troubleshooting

### Error: "Unable to resolve module"
**Solution**: Clear cache
```bash
npx expo start --clear
watchman watch-del-all
rm -rf node_modules && npm install
```

### Error: "No bundle URL present"
**Solution**: Check AppDelegate.mm
```objc
// Ensure this is correct:
return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
```

### Error: "CocoaPods could not find compatible versions"
**Solution**: Update pods
```bash
cd ios
rm Podfile.lock
rm -rf Pods
pod repo update
pod install
cd ..
```

### Error: "Xcode build failed"
**Solution**: Clean build folder
```
In Xcode: Product → Clean Build Folder (Cmd+Shift+K)
Then: Product → Build (Cmd+B)
```

### Backend Connection Issues
**Solution**: Test API manually
```bash
# Test from terminal
curl https://bjjos.app/api/auth/check-user \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "9148373750"}'
```

---

## 📱 Part 8: Key Screens Implementation

### CoachScreen (Chat Interface)

**File**: `screens/CoachScreen.tsx`
```typescript
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send } from 'react-native-feather';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { sendChatMessage, getChatHistory } from '../services/api';
import { getUserId } from '../utils/auth';
import { COLORS, SPACING, FONTS, FONT_SIZES } from '../theme/colors';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  message: string;
  timestamp: Date;
}

export default function CoachScreen() {
  const [inputValue, setInputValue] = useState('');
  const [userId, setUserId] = useState<string>('');
  const flatListRef = useRef<FlatList>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    loadUserId();
  }, []);

  const loadUserId = async () => {
    const id = await getUserId();
    setUserId(id || '1');
  };

  // Load chat history
  const { data: historyData, isLoading } = useQuery({
    queryKey: ['chatHistory', userId],
    queryFn: () => getChatHistory(userId),
    enabled: !!userId,
  });

  const messages: Message[] = historyData?.messages?.map((msg: any, idx: number) => ({
    id: String(idx),
    sender: msg.sender === 'user' ? 'user' : 'assistant',
    message: msg.message,
    timestamp: new Date(msg.timestamp),
  })) || [];

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (message: string) => sendChatMessage(userId, message),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chatHistory', userId] });
    },
  });

  const handleSend = () => {
    const text = inputValue.trim();
    if (!text) return;

    setInputValue('');
    sendMutation.mutate(text);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.mobilePrimaryPurple} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Prof. OS</Text>
          <Text style={styles.headerSubtitle}>Your Training Partner</Text>
        </View>

        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View
              style={[
                styles.messageBubble,
                item.sender === 'user' ? styles.userBubble : styles.assistantBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  item.sender === 'user' ? styles.userText : styles.assistantText,
                ]}
              >
                {item.message}
              </Text>
            </View>
          )}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        />

        {/* Loading indicator */}
        {sendMutation.isPending && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>Prof. OS is thinking...</Text>
          </View>
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={inputValue}
            onChangeText={setInputValue}
            placeholder="Ask about techniques..."
            placeholderTextColor={COLORS.mobileTextMuted}
            multiline
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!inputValue.trim() || sendMutation.isPending}
            style={[
              styles.sendButton,
              (!inputValue.trim() || sendMutation.isPending) && styles.sendButtonDisabled,
            ]}
          >
            <Send color="#FFFFFF" size={20} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.mobileDarkBg,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mobileDarkBg,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.mobileCardBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.mobileBorder,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xl,
    fontFamily: FONTS.bold,
    color: COLORS.mobileTextPrimary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextSecondary,
    marginTop: 4,
  },
  messagesList: {
    padding: SPACING.md,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: SPACING.md,
    borderRadius: 16,
    marginBottom: SPACING.sm,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.mobilePrimaryPurple,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.mobileCardBg,
  },
  messageText: {
    fontSize: FONT_SIZES.base,
    fontFamily: FONTS.regular,
  },
  userText: {
    color: '#FFFFFF',
  },
  assistantText: {
    color: COLORS.mobileTextPrimary,
  },
  typingContainer: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  typingText: {
    fontSize: FONT_SIZES.sm,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextSecondary,
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.mobileCardBg,
    borderTopWidth: 1,
    borderTopColor: COLORS.mobileBorder,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.mobileSurface,
    borderRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.base,
    fontFamily: FONTS.regular,
    color: COLORS.mobileTextPrimary,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.mobilePrimaryPurple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
```

---

## ✅ Part 9: Final Deployment Steps

### Step 1: Test in Simulator
```bash
npx expo run:ios
```

### Step 2: Build for App Store
```bash
# Create production build
eas build --platform ios --profile production

# Wait for build to complete (EAS will email you)
# Download .ipa file

# Upload to App Store Connect
# Use Transporter app or Xcode → Product → Archive
```

### Step 3: App Store Connect
1. Create app in App Store Connect
2. Fill out app information
3. Add screenshots (6.5" and 5.5" required)
4. Set pricing ($19.99/month subscription)
5. Add privacy policy URL: `https://bjjos.app/privacy`
6. Submit for review

---

## 🎯 Success Criteria

Your app is ready when:
- ✅ Builds without errors in Xcode
- ✅ Launches in iOS Simulator
- ✅ Connects to bjjos.app API
- ✅ Login flow works with (914) 837-3750
- ✅ Prof. OS chat responds correctly
- ✅ No Metro bundler required
- ✅ Standalone .ipa file generated
- ✅ App Store submission successful

---

**NEXT STEPS**: 
1. Run the prebuild command to regenerate iOS folder
2. Test in simulator
3. Fix any remaining build errors
4. Deploy to TestFlight for beta testing

Need help with a specific error? Share the exact error message and I'll provide the fix! 🥋
