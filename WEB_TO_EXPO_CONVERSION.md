# Web PWA → Expo iOS Conversion Guide
**Quick Reference for Adapting BJJ OS Code**

This document shows side-by-side comparisons of how to convert your existing web code to Expo.

---

## 🔄 1. Imports

### Web (PWA)
```typescript
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
```

### Expo (iOS)
```typescript
import { useNavigation, useRoute } from '@react-navigation/native';
import { Alert } from 'react-native';
import { TouchableOpacity, Text } from 'react-native';
```

---

## 🎨 2. Styling

### Web (PWA)
```typescript
<div className="mobile-container">
  <h1 className="mobile-title">Prof. OS</h1>
  <p style={{ color: 'var(--mobile-text-secondary)' }}>Chat</p>
</div>
```

### Expo (iOS)
```typescript
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme/colors';

<View style={styles.container}>
  <Text style={styles.title}>Prof. OS</Text>
  <Text style={styles.subtitle}>Chat</Text>
</View>

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.mobileTextPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.mobileTextSecondary,
  },
});
```

---

## 🔐 3. Storage

### Web (PWA)
```typescript
// Set
localStorage.setItem('mobileUserId', '123');

// Get
const userId = localStorage.getItem('mobileUserId');

// Remove
localStorage.removeItem('mobileUserId');

// Clear all
localStorage.clear();
```

### Expo (iOS)
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// Set
await AsyncStorage.setItem('mobileUserId', '123');

// Get
const userId = await AsyncStorage.getItem('mobileUserId');

// Remove
await AsyncStorage.removeItem('mobileUserId');

// Clear all
await AsyncStorage.clear();
```

---

## 🧭 4. Navigation

### Web (PWA)
```typescript
import { Link, useLocation } from 'wouter';

// Navigate
<Link href="/app/settings">Settings</Link>

// Or programmatically
const [location, setLocation] = useLocation();
setLocation('/app/settings');

// Get current route
const [location] = useLocation();
```

### Expo (iOS)
```typescript
import { useNavigation } from '@react-navigation/native';
import { TouchableOpacity, Text } from 'react-native';

// Navigate
const navigation = useNavigation();

<TouchableOpacity onPress={() => navigation.navigate('Settings')}>
  <Text>Settings</Text>
</TouchableOpacity>

// Or programmatically
navigation.navigate('Settings');

// Get current route
const route = useRoute();
const currentRoute = route.name;
```

---

## 🌐 5. API Calls

### Web (PWA)
```typescript
import { apiRequest } from '@/lib/queryClient';

// GET
const response = await fetch('/api/auth/profile', {
  credentials: 'include',
});
const data = await response.json();

// POST
await apiRequest('POST', '/api/ai/chat/message', {
  userId,
  message,
});
```

### Expo (iOS)
```typescript
import axios from 'axios';
import { API_CONFIG } from '../config/api';

// GET
const response = await axios.get(
  `${API_CONFIG.baseURL}/auth/profile`
);
const data = response.data;

// POST
await axios.post(`${API_CONFIG.baseURL}/ai/chat/message`, {
  userId,
  message,
});
```

---

## 📱 6. UI Components

### Web (PWA)
```typescript
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

<Input
  type="text"
  placeholder="Enter message..."
  value={inputValue}
  onChange={(e) => setInputValue(e.target.value)}
/>

<Button onClick={handleSubmit}>
  Send
</Button>
```

### Expo (iOS)
```typescript
import { TextInput, TouchableOpacity, Text } from 'react-native';

<TextInput
  placeholder="Enter message..."
  value={inputValue}
  onChangeText={setInputValue}
  style={styles.input}
/>

<TouchableOpacity onPress={handleSubmit} style={styles.button}>
  <Text style={styles.buttonText}>Send</Text>
</TouchableOpacity>
```

---

## 🎤 7. Voice Input

### Web (PWA)
```typescript
// Uses Web Speech API
const recognition = new webkitSpeechRecognition();
recognition.start();

recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  console.log(transcript);
};
```

### Expo (iOS)
```typescript
import * as Speech from 'expo-speech';
import Voice from '@react-native-voice/voice';

// For text-to-speech
Speech.speak('Hello from Prof. OS');

// For speech-to-text
Voice.start('en-US');

Voice.onSpeechResults = (e) => {
  const transcript = e.value[0];
  console.log(transcript);
};
```

---

## 📹 8. Video Player

### Web (PWA)
```typescript
<div className="video-container">
  <iframe
    src={`https://www.youtube.com/embed/${videoId}?start=${startTime}`}
    allow="autoplay; fullscreen"
  />
</div>
```

### Expo (iOS)
```typescript
import { WebView } from 'react-native-webview';

<WebView
  source={{
    uri: `https://www.youtube.com/embed/${videoId}?start=${startTime}`,
  }}
  allowsFullscreenVideo={true}
  style={{ flex: 1 }}
/>
```

---

## 🔔 9. Notifications/Toasts

### Web (PWA)
```typescript
import { useToast } from '@/hooks/use-toast';

const { toast } = useToast();

toast({
  title: "Success",
  description: "Message sent successfully!",
});

toast({
  variant: "destructive",
  title: "Error",
  description: "Something went wrong",
});
```

### Expo (iOS)
```typescript
import { Alert } from 'react-native';

// Success
Alert.alert(
  "Success",
  "Message sent successfully!"
);

// Error
Alert.alert(
  "Error",
  "Something went wrong",
  [{ text: "OK" }]
);
```

---

## ⚙️ 10. Environment Variables

### Web (PWA)
```typescript
// Access in code
const apiUrl = import.meta.env.VITE_API_URL;

// .env file
VITE_API_URL=https://bjjos.app/api
```

### Expo (iOS)
```typescript
import Constants from 'expo-constants';

// Access in code
const apiUrl = Constants.expoConfig?.extra?.apiBaseUrl;

// app.json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "https://bjjos.app/api"
    }
  }
}
```

---

## 📊 11. Data Fetching (React Query)

### Web (PWA)
```typescript
import { useQuery } from '@tanstack/react-query';

const { data, isLoading } = useQuery({
  queryKey: ['/api/auth/profile'],
  // Uses default fetcher from queryClient
});
```

### Expo (iOS)
```typescript
import { useQuery } from '@tanstack/react-query';
import { getUserProfile } from '../services/api';

const { data, isLoading } = useQuery({
  queryKey: ['profile'],
  queryFn: getUserProfile,
});
```

---

## 🔒 12. Authentication Flow

### Web (PWA)
```typescript
// After verification
localStorage.setItem('mobileUserId', userId);

// Set cookie (handled by backend)
document.cookie = `sessionToken=${token}; path=/`;

// Check auth
const isLoggedIn = !!localStorage.getItem('mobileUserId');
```

### Expo (iOS)
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

// After verification
await AsyncStorage.setItem('userId', userId);

// No cookies - use headers or AsyncStorage
// Backend should use userId from request body instead

// Check auth
const userId = await AsyncStorage.getItem('userId');
const isLoggedIn = !!userId;
```

---

## 🎨 13. Icons

### Web (PWA)
```typescript
import { MessageCircle, Bookmark, Send } from 'lucide-react';

<MessageCircle size={24} color="#8B5CF6" />
```

### Expo (iOS)
```typescript
import { MessageCircle, Bookmark, Send } from 'react-native-feather';

<MessageCircle width={24} height={24} color="#8B5CF6" />
```

---

## 📏 14. Safe Areas

### Web (PWA)
```css
/* CSS */
.mobile-container {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

### Expo (iOS)
```typescript
import { SafeAreaView } from 'react-native-safe-area-context';

<SafeAreaView style={styles.container} edges={['top', 'bottom']}>
  {/* Your content */}
</SafeAreaView>
```

---

## 🎯 15. Complete Component Comparison

### Web (PWA) - MobileCoach Component

```typescript
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Send } from 'lucide-react';
import { sendChatMessage } from '@/services/api';

export default function MobileCoach() {
  const [message, setMessage] = useState('');
  const { toast } = useToast();
  const userId = localStorage.getItem('mobileUserId');

  const handleSend = async () => {
    try {
      await sendChatMessage(userId, message);
      setMessage('');
      toast({ title: "Message sent!" });
    } catch (error) {
      toast({ 
        variant: "destructive",
        title: "Error sending message" 
      });
    }
  };

  return (
    <div className="mobile-container">
      <h1 className="mobile-title">Prof. OS</h1>
      
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Ask a question..."
        className="mobile-input"
      />
      
      <button onClick={handleSend} className="mobile-btn-primary">
        <Send size={20} />
        Send
      </button>
    </div>
  );
}
```

### Expo (iOS) - CoachScreen Component

```typescript
import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { Send } from 'react-native-feather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendChatMessage } from '../services/api';
import { COLORS, SPACING, FONTS } from '../theme/colors';

export default function CoachScreen() {
  const [message, setMessage] = useState('');
  const [userId, setUserId] = useState('');

  useEffect(() => {
    loadUserId();
  }, []);

  const loadUserId = async () => {
    const id = await AsyncStorage.getItem('userId');
    setUserId(id || '');
  };

  const handleSend = async () => {
    try {
      await sendChatMessage(userId, message);
      setMessage('');
      Alert.alert("Success", "Message sent!");
    } catch (error) {
      Alert.alert("Error", "Failed to send message");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Prof. OS</Text>
      
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Ask a question..."
        placeholderTextColor={COLORS.mobileTextMuted}
        style={styles.input}
      />
      
      <TouchableOpacity onPress={handleSend} style={styles.button}>
        <Send color="#FFFFFF" width={20} height={20} />
        <Text style={styles.buttonText}>Send</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.md,
    backgroundColor: COLORS.mobileDarkBg,
  },
  title: {
    fontSize: 24,
    fontFamily: FONTS.bold,
    color: COLORS.mobileTextPrimary,
    marginBottom: SPACING.md,
  },
  input: {
    backgroundColor: COLORS.mobileSurface,
    borderRadius: 12,
    padding: SPACING.md,
    fontSize: 16,
    color: COLORS.mobileTextPrimary,
    marginBottom: SPACING.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.mobilePrimaryPurple,
    borderRadius: 12,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: FONTS.semibold,
    color: '#FFFFFF',
  },
});
```

---

## 📚 Key Differences Summary

| Feature | Web PWA | Expo iOS |
|---------|---------|----------|
| **Routing** | Wouter | React Navigation |
| **Storage** | localStorage | AsyncStorage (async) |
| **Styling** | CSS classes | StyleSheet API |
| **HTTP** | Fetch + credentials | Axios + headers |
| **Icons** | lucide-react | react-native-feather |
| **Notifications** | useToast | Alert |
| **Video** | iframe | WebView |
| **Voice** | Web Speech API | expo-speech / Voice |
| **Env Vars** | import.meta.env | Constants.expoConfig |
| **Safe Areas** | CSS env() | SafeAreaView |

---

## ✅ Migration Checklist

- [ ] Replace all `localStorage` with `AsyncStorage` (add await)
- [ ] Convert CSS classes to StyleSheet objects
- [ ] Replace Wouter with React Navigation
- [ ] Change `<div>` to `<View>`, `<p>` to `<Text>`
- [ ] Replace `<button>` with `<TouchableOpacity>`
- [ ] Replace `<input>` with `<TextInput>`
- [ ] Update API base URL to full domain
- [ ] Replace Web Speech API with expo-speech
- [ ] Replace iframe with WebView for videos
- [ ] Add SafeAreaView for iOS safe areas
- [ ] Update icon imports (lucide → feather)
- [ ] Replace toast with Alert
- [ ] Update environment variable access

---

**Pro Tip**: Start with one screen (e.g., CoachScreen), get it fully working, then copy the pattern to other screens. This is faster than converting everything at once!

🥋 **Ready to build!**
