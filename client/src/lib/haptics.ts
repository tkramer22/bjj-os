import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

let isNative: boolean;
try {
  isNative = Capacitor.isNativePlatform();
} catch (_) {
  isNative = false;
}

export function triggerHaptic(type: HapticType = 'light'): void {
  if (!isNative) return;
  try {
    const run = async () => {
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
      } catch (_) {}
    };
    run().catch(() => {});
  } catch (_) {}
}

export function vibratePattern(pattern: number[]): void {
  if (!isNative) return;
  try {
    const run = async () => {
      try {
        for (let i = 0; i < pattern.length; i++) {
          if (i % 2 === 0) {
            await Haptics.impact({ style: ImpactStyle.Medium });
          }
          await new Promise(resolve => setTimeout(resolve, pattern[i]));
        }
      } catch (_) {}
    };
    run().catch(() => {});
  } catch (_) {}
}
