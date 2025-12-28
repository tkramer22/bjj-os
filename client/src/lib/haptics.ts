import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export async function triggerHaptic(type: HapticType = 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    switch (type) {
      case 'light':
        await Haptics.impact({ style: ImpactStyle.Light });
        break;
      case 'medium':
        await Haptics.impact({ style: ImpactStyle.Medium });
        break;
      case 'heavy':
        await Haptics.impact({ style: ImpactStyle.Heavy });
        break;
      case 'success':
        await Haptics.notification({ type: NotificationType.Success });
        break;
      case 'warning':
        await Haptics.notification({ type: NotificationType.Warning });
        break;
      case 'error':
        await Haptics.notification({ type: NotificationType.Error });
        break;
      case 'selection':
        await Haptics.selectionStart();
        await Haptics.selectionChanged();
        await Haptics.selectionEnd();
        break;
    }
  } catch (error) {
    console.warn('Haptics not available:', error);
  }
}

export async function vibratePattern(pattern: number[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    for (let i = 0; i < pattern.length; i++) {
      if (i % 2 === 0) {
        await Haptics.impact({ style: ImpactStyle.Medium });
      }
      await new Promise(resolve => setTimeout(resolve, pattern[i]));
    }
  } catch (error) {
    console.warn('Haptics pattern not available:', error);
  }
}
