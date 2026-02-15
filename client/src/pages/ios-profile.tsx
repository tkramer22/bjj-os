import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { User, Settings, ChevronRight, Loader2, X, Check, Camera as CameraIcon, Image, Trash2 } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/capacitorAuth";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

console.log('✅ iOS PROFILE loaded');

interface UserProfile {
  id: number;
  username?: string;
  name?: string;
  displayName?: string;
  email?: string;
  phoneNumber?: string;
  beltLevel?: string;
  style?: string;
  weight?: number | string;
  height?: string;
  unitPreference?: 'imperial' | 'metric';
  avatarUrl?: string;
}

type EditableField = 'name' | 'beltLevel' | 'weight' | 'height' | 'style' | null;

const BELT_OPTIONS = ['white', 'blue', 'purple', 'brown', 'black'];
const STYLE_OPTIONS = ['gi', 'nogi', 'both'];

// Generate weight options
const WEIGHT_OPTIONS_LBS = Array.from({ length: 201 }, (_, i) => 100 + i); // 100-300 lbs
const WEIGHT_OPTIONS_KG = Array.from({ length: 91 }, (_, i) => 45 + i); // 45-135 kg

// Generate height options
const HEIGHT_OPTIONS_IMPERIAL: string[] = [];
for (let feet = 4; feet <= 7; feet++) {
  for (let inches = 0; inches < 12; inches++) {
    HEIGHT_OPTIONS_IMPERIAL.push(`${feet}'${inches}"`);
    if (feet === 7 && inches === 0) break;
  }
}
const HEIGHT_OPTIONS_METRIC = Array.from({ length: 96 }, (_, i) => 120 + i); // 120-215 cm

export default function IOSProfilePage({ hideBottomNav }: { hideBottomNav?: boolean } = {}) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const weightPickerRef = useRef<HTMLDivElement>(null);
  const heightPickerRef = useRef<HTMLDivElement>(null);
  const beltPickerRef = useRef<HTMLDivElement>(null);
  const stylePickerRef = useRef<HTMLDivElement>(null);
  const initialScrollSetRef = useRef<string | null>(null);
  const lastBeltIndex = useRef<number>(-1);
  const lastStyleIndex = useRef<number>(-1);
  const lastWeightIndex = useRef<number>(-1);
  const lastHeightIndex = useRef<number>(-1);

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
  });

  // Determine which unit system to use
  const isMetric = user?.unitPreference === 'metric';
  const weightOptions = isMetric ? WEIGHT_OPTIONS_KG : WEIGHT_OPTIONS_LBS;
  const heightOptions = isMetric ? HEIGHT_OPTIONS_METRIC.map(cm => `${cm} cm`) : HEIGHT_OPTIONS_IMPERIAL;
  const weightUnit = isMetric ? 'kg' : 'lbs';

  // Convert weight for display based on unit preference
  const getDisplayWeight = () => {
    if (!user?.weight) return undefined;
    const numericWeight = typeof user.weight === 'string' ? parseInt(user.weight) : user.weight;
    if (isNaN(numericWeight)) return undefined;
    return `${numericWeight} ${weightUnit}`;
  };

  // Handle unit toggle with conversion (clamped to valid ranges)
  const handleUnitToggle = async (newUnit: 'imperial' | 'metric') => {
    triggerHaptic('light');
    
    // Convert weight if exists
    let updates: Partial<UserProfile> = { unitPreference: newUnit };
    
    if (user?.weight) {
      const currentWeight = typeof user.weight === 'string' ? parseInt(user.weight) : user.weight;
      if (!isNaN(currentWeight)) {
        if (newUnit === 'metric' && !isMetric) {
          // Converting lbs to kg (clamp to 45-135 kg range)
          const convertedKg = Math.round(currentWeight * 0.453592);
          updates.weight = Math.max(45, Math.min(135, convertedKg));
        } else if (newUnit === 'imperial' && isMetric) {
          // Converting kg to lbs (clamp to 100-300 lbs range)
          const convertedLbs = Math.round(currentWeight * 2.20462);
          updates.weight = Math.max(100, Math.min(300, convertedLbs));
        }
      }
    }
    
    // Convert height if exists
    if (user?.height) {
      if (newUnit === 'metric' && !isMetric) {
        // Converting feet/inches to cm (clamp to 120-215 cm range)
        const match = user.height.match(/(\d+)'(\d+)"/);
        if (match) {
          const feet = parseInt(match[1]);
          const inches = parseInt(match[2]);
          const totalInches = feet * 12 + inches;
          const cm = Math.round(totalInches * 2.54);
          const clampedCm = Math.max(120, Math.min(215, cm));
          updates.height = `${clampedCm} cm`;
        }
      } else if (newUnit === 'imperial' && isMetric) {
        // Converting cm to feet/inches (clamp to 4'0" - 7'0" range)
        const match = user.height.match(/(\d+)\s*cm/);
        if (match) {
          const cm = parseInt(match[1]);
          // Clamp cm to valid range first (4'0" = 121.92cm, 7'0" = 213.36cm)
          const clampedCm = Math.max(122, Math.min(213, cm));
          const totalInches = Math.round(clampedCm / 2.54);
          const feet = Math.floor(totalInches / 12);
          const inches = totalInches % 12;
          // Ensure feet is in valid range (4-7)
          const clampedFeet = Math.max(4, Math.min(7, feet));
          const finalInches = clampedFeet === 7 ? 0 : inches; // 7'0" is max
          updates.height = `${clampedFeet}'${finalInches}"`;
        }
      }
    }
    
    updateProfile.mutate(updates);
  };

  // Set initial scroll position for weight picker (only once when opened)
  useEffect(() => {
    if (editingField === 'weight' && weightPickerRef.current && initialScrollSetRef.current !== 'weight') {
      const numericWeight = parseInt(editValue) || (isMetric ? 80 : 180);
      const index = weightOptions.indexOf(numericWeight);
      if (index >= 0) {
        setTimeout(() => {
          if (weightPickerRef.current) {
            weightPickerRef.current.scrollTop = index * 40;
          }
        }, 50);
        initialScrollSetRef.current = 'weight';
      }
    } else if (editingField !== 'weight' && editingField !== 'height') {
      initialScrollSetRef.current = null;
    }
  }, [editingField, isMetric]);

  // Set initial scroll position for height picker (only once when opened)
  useEffect(() => {
    if (editingField === 'height' && heightPickerRef.current && initialScrollSetRef.current !== 'height') {
      let index = heightOptions.indexOf(editValue);
      if (index < 0) {
        // Defaults
        if (isMetric) {
          index = heightOptions.indexOf("178 cm");
        } else {
          index = heightOptions.indexOf("5'10\"");
        }
      }
      if (index >= 0) {
        setTimeout(() => {
          if (heightPickerRef.current) {
            heightPickerRef.current.scrollTop = index * 40;
          }
        }, 50);
        initialScrollSetRef.current = 'height';
      }
    } else if (!['weight', 'height', 'beltLevel', 'style'].includes(editingField || '')) {
      initialScrollSetRef.current = null;
    }
  }, [editingField, isMetric]);

  // Set initial scroll position for belt picker (only once when opened)
  useEffect(() => {
    if (editingField === 'beltLevel' && beltPickerRef.current && initialScrollSetRef.current !== 'beltLevel') {
      let index = BELT_OPTIONS.indexOf(editValue.toLowerCase());
      if (index < 0) {
        index = 0; // Default to white belt
      }
      if (index >= 0) {
        setTimeout(() => {
          if (beltPickerRef.current) {
            beltPickerRef.current.scrollTop = index * 40;
          }
        }, 50);
        initialScrollSetRef.current = 'beltLevel';
      }
    }
  }, [editingField, editValue]);

  // Set initial scroll position for style picker (only once when opened)
  useEffect(() => {
    if (editingField === 'style' && stylePickerRef.current && initialScrollSetRef.current !== 'style') {
      let index = STYLE_OPTIONS.indexOf(editValue.toLowerCase());
      if (index < 0) {
        index = 0; // Default to gi
      }
      if (index >= 0) {
        setTimeout(() => {
          if (stylePickerRef.current) {
            stylePickerRef.current.scrollTop = index * 40;
          }
        }, 50);
        initialScrollSetRef.current = 'style';
      }
    }
  }, [editingField, editValue]);

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<UserProfile>) => {
      console.log('[PROFILE] Saving updates:', updates);
      console.log('[PROFILE] Token in localStorage:', localStorage.getItem('sessionToken')?.substring(0, 20) + '...');
      const response = await apiRequest('PATCH', '/api/auth/profile', updates);
      const result = await response.json();
      console.log('[PROFILE] Save response:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('[PROFILE] Save SUCCESS:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setEditingField(null);
      setEditValue('');
      triggerHaptic('light');
    },
    onError: (error) => {
      console.error('[PROFILE] Save FAILED:', error);
      triggerHaptic('error');
    },
  });

  // Native camera/photo handling with proper error handling for iOS
  const handleNativePhoto = async (source: CameraSource) => {
    console.log('[CAMERA] ====== CAMERA BUTTON TAPPED ======');
    console.log('[CAMERA] Source:', source === CameraSource.Camera ? 'CAMERA' : 'PHOTOS');
    
    setShowAvatarModal(false);
    setIsUploadingAvatar(true);
    
    try {
      console.log('[CAMERA] About to call Camera.getPhoto...');
      console.log('[CAMERA] Camera object exists:', !!Camera);
      console.log('[CAMERA] Camera.getPhoto exists:', !!Camera?.getPhoto);
      
      // Request permission and capture photo using Capacitor Camera
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: true,
        resultType: CameraResultType.DataUrl,
        source: source,
        width: 400,
        height: 400,
      });
      
      console.log('[CAMERA] Camera.getPhoto returned successfully');
      console.log('[CAMERA] Photo object:', photo);
      console.log('[CAMERA] Has dataUrl:', !!photo?.dataUrl);
      
      if (!photo.dataUrl) {
        console.log('[CAMERA] No dataUrl - user cancelled or no photo returned');
        setIsUploadingAvatar(false);
        return;
      }
      
      console.log('[CAMERA] dataUrl length:', photo.dataUrl.length);
      
      // Upload to server
      console.log('[CAMERA] Starting upload to server...');
      await uploadAvatarToServer(photo.dataUrl);
      console.log('[CAMERA] Upload complete');
      
    } catch (error: any) {
      console.error('[CAMERA] ====== CAMERA ERROR ======');
      console.error('[CAMERA] Error object:', error);
      console.error('[CAMERA] Error message:', error?.message);
      console.error('[CAMERA] Error code:', error?.code);
      console.error('[CAMERA] Full error JSON:', JSON.stringify(error, null, 2));
      
      // Handle specific error cases gracefully
      const errorMessage = error?.message || String(error);
      
      if (errorMessage.includes('cancelled') || errorMessage.includes('User cancelled')) {
        console.log('[CAMERA] User cancelled photo selection');
      } else if (errorMessage.includes('permission') || errorMessage.includes('denied')) {
        console.error('[CAMERA] Permission denied:', errorMessage);
        alert('Camera or photo access was denied. Please enable access in Settings.');
      } else if (errorMessage.includes('no camera') || errorMessage.includes('unavailable')) {
        console.error('[CAMERA] Camera unavailable:', errorMessage);
        alert('Camera is not available on this device.');
      } else if (errorMessage.includes('UNIMPLEMENTED')) {
        console.error('[CAMERA] Plugin not installed - UNIMPLEMENTED error');
        alert('Camera plugin not installed. Please reinstall the app.');
      } else {
        console.error('[CAMERA] Unknown error:', error);
        alert('Camera error: ' + errorMessage);
      }
      triggerHaptic('error');
    } finally {
      console.log('[CAMERA] ====== CAMERA FLOW COMPLETE ======');
      setIsUploadingAvatar(false);
    }
  };

  const uploadAvatarToServer = async (dataUrl: string) => {
    try {
      // Resize if needed (max 400px)
      const resizedUrl = await resizeImage(dataUrl, 400);
      
      // Upload to server
      const sessionToken = localStorage.getItem('sessionToken') || localStorage.getItem('token');
      const response = await fetch(getApiUrl('/api/auth/avatar'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ avatarUrl: resizedUrl }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to upload avatar');
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      triggerHaptic('success');
    } catch (error) {
      console.error('[AVATAR] Upload error:', error);
      triggerHaptic('error');
    }
  };

  const handleAvatarUpload = async (file: File) => {
    // Check file size (2MB limit)
    if (file.size > 2 * 1024 * 1024) {
      console.error('File too large (max 2MB)');
      triggerHaptic('error');
      return;
    }
    
    setIsUploadingAvatar(true);
    setShowAvatarModal(false);
    
    try {
      // Convert to base64 data URL using Promise wrapper
      const base64Url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      await uploadAvatarToServer(base64Url);
    } catch (error) {
      console.error('Avatar upload error:', error);
      triggerHaptic('error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const resizeImage = (dataUrl: string, maxSize: number): Promise<string> => {
    return new Promise((resolve) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        if (width > height) {
          if (width > maxSize) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = dataUrl;
    });
  };

  const handleRemoveAvatar = async () => {
    setShowAvatarModal(false);
    setIsUploadingAvatar(true);
    
    try {
      const sessionToken = localStorage.getItem('sessionToken') || localStorage.getItem('token');
      const response = await fetch(getApiUrl('/api/auth/avatar'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'Authorization': `Bearer ${sessionToken}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ avatarUrl: null }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to remove avatar');
      }
      
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      triggerHaptic('light');
    } catch (error) {
      console.error('Avatar remove error:', error);
      triggerHaptic('error');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    navigate(path);
  };

  const startEditing = (field: EditableField, currentValue: string) => {
    triggerHaptic('light');
    setEditingField(field);
    // Normalize belt and style to lowercase to match picker options
    if (field === 'beltLevel' || field === 'style') {
      setEditValue((currentValue || '').toLowerCase());
    } else {
      setEditValue(currentValue || '');
    }
  };

  const saveField = () => {
    if (!editingField) return;
    triggerHaptic('medium');
    
    let value: string | number = editValue;
    if (editingField === 'weight') {
      value = parseInt(editValue) || 0;
    }
    
    updateProfile.mutate({ [editingField]: value });
  };

  const cancelEditing = () => {
    triggerHaptic('light');
    setEditingField(null);
    setEditValue('');
  };

  const getBeltColor = (belt?: string) => {
    const colors: Record<string, string> = {
      white: '#FFFFFF',
      blue: '#3B82F6',
      purple: '#8B5CF6',
      brown: '#92400E',
      black: '#1F2937'
    };
    return colors[belt?.toLowerCase() || 'white'] || '#FFFFFF';
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
      </div>
    );
  }

  const ProfileRow = ({ 
    label, 
    value, 
    field, 
    placeholder = "Tap to set" 
  }: { 
    label: string; 
    value?: string | number; 
    field: EditableField;
    placeholder?: string;
  }) => (
    <button
      onClick={() => startEditing(field, String(value || ''))}
      data-testid={`button-edit-${field}`}
      style={{
        width: '100%',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid #2A2A2E',
        padding: '16px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer',
        textAlign: 'left',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '4px' }}>
          {label}
        </div>
        <div style={{ 
          fontSize: '16px', 
          color: value ? '#FFFFFF' : '#52525B',
          textTransform: field === 'beltLevel' || field === 'style' ? 'capitalize' : 'none',
        }} data-testid={`text-${field}`}>
          {value || placeholder}
        </div>
      </div>
      <ChevronRight size={20} color="#71717A" />
    </button>
  );

  return (
    <div 
      className="ios-page"
      style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        color: '#FFFFFF',
        paddingBottom: '100px',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid #2A2A2E',
      }}>
        <h1 style={{ 
          fontSize: '28px', 
          fontWeight: 700,
          margin: 0,
        }}>
          Profile
        </h1>
      </div>

      <div style={{ padding: '20px' }}>
        {/* Profile Avatar */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '32px',
        }}>
          <button
            onClick={() => { triggerHaptic('light'); setShowAvatarModal(true); }}
            data-testid="button-edit-avatar"
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: user?.avatarUrl ? 'transparent' : `linear-gradient(135deg, ${getBeltColor(user?.beltLevel)} 0%, #8B5CF6 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '12px',
              border: 'none',
              cursor: 'pointer',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {isUploadingAvatar ? (
              <Loader2 className="animate-spin" size={32} color="#8B5CF6" />
            ) : user?.avatarUrl ? (
              <img 
                src={user.avatarUrl} 
                alt="Profile" 
                style={{ 
                  width: '100%', 
                  height: '100%', 
                  objectFit: 'cover' 
                }} 
              />
            ) : (
              <User size={36} color="#FFFFFF" />
            )}
            {/* Camera badge */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: '#8B5CF6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #0A0A0B',
            }}>
              <CameraIcon size={12} color="#FFFFFF" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarUpload(file);
              e.target.value = '';
            }}
            data-testid="input-avatar-file"
          />
        </div>

        {/* Editable Fields Card */}
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          padding: '0 20px',
          marginBottom: '24px',
          border: '1px solid #2A2A2E',
        }}>
          <ProfileRow 
            label="Name" 
            value={user?.name || user?.displayName || user?.username} 
            field="name"
          />
          <ProfileRow 
            label="Belt" 
            value={user?.beltLevel} 
            field="beltLevel"
          />
          <ProfileRow 
            label="Weight" 
            value={getDisplayWeight()} 
            field="weight"
            placeholder="Tap to set"
          />
          <ProfileRow 
            label="Height" 
            value={user?.height} 
            field="height"
            placeholder="Tap to set"
          />
          
          {/* Unit Toggle */}
          <div style={{
            padding: '16px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '15px', color: '#FFFFFF' }}>Units</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => handleUnitToggle('imperial')}
                data-testid="button-unit-imperial"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: !isMetric ? '#8B5CF6' : '#2A2A2E',
                  color: !isMetric ? '#FFFFFF' : '#71717A',
                }}
              >
                Imperial
              </button>
              <button
                onClick={() => handleUnitToggle('metric')}
                data-testid="button-unit-metric"
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  fontSize: '14px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: isMetric ? '#8B5CF6' : '#2A2A2E',
                  color: isMetric ? '#FFFFFF' : '#71717A',
                }}
              >
                Metric
              </button>
            </div>
          </div>
          <div style={{ borderBottom: 'none' }}>
            <ProfileRow 
              label="Style" 
              value={user?.style} 
              field="style"
            />
          </div>
        </div>

        {/* App Settings Link */}
        <div style={{
          background: '#1A1A1D',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '1px solid #2A2A2E',
        }}>
          <button
            onClick={() => handleNavigate('/ios-settings')}
            data-testid="button-settings"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <Settings size={20} color="#71717A" />
              <span style={{ color: '#FFFFFF', fontSize: '15px' }}>App Settings</span>
            </div>
            <ChevronRight size={20} color="#71717A" />
          </button>
        </div>
      </div>

      {/* Edit Modal */}
      {editingField && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 1000,
          }}
          onClick={cancelEditing}
          data-testid="modal-edit-overlay"
        >
          <div 
            style={{
              width: '100%',
              background: '#1A1A1D',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '20px',
            }}>
              <button
                onClick={cancelEditing}
                data-testid="button-cancel-edit"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                }}
              >
                <X size={24} color="#71717A" />
              </button>
              <span style={{ 
                fontSize: '17px', 
                fontWeight: 600,
                textTransform: 'capitalize',
              }}>
                Edit {editingField === 'beltLevel' ? 'Belt' : editingField}
              </span>
              <button
                onClick={saveField}
                disabled={updateProfile.isPending}
                data-testid="button-save-edit"
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  opacity: updateProfile.isPending ? 0.5 : 1,
                }}
              >
                {updateProfile.isPending ? (
                  <Loader2 className="animate-spin" size={24} color="#8B5CF6" />
                ) : (
                  <Check size={24} color="#8B5CF6" />
                )}
              </button>
            </div>

            {/* Input/Selector based on field type */}
            {editingField === 'beltLevel' ? (
              <div>
                {/* iOS-style picker wheel for belt */}
                <div 
                  style={{
                    height: '200px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#0A0A0B',
                    borderRadius: '12px',
                    border: '1px solid #2A2A2E',
                  }}
                  data-testid="picker-belt"
                >
                  {/* Selection highlight */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '40px',
                    transform: 'translateY(-50%)',
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderTop: '1px solid #8B5CF6',
                    borderBottom: '1px solid #8B5CF6',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }} />
                  {/* Fade gradients */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to bottom, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to top, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  {/* Scrollable list */}
                  <div 
                    ref={beltPickerRef}
                    style={{
                      height: '100%',
                      overflowY: 'scroll',
                      scrollSnapType: 'y mandatory',
                      paddingTop: '80px',
                      paddingBottom: '80px',
                    }}
                    onScroll={(e) => {
                      const container = e.currentTarget;
                      const itemHeight = 40;
                      const scrollTop = container.scrollTop;
                      const selectedIndex = Math.round(scrollTop / itemHeight);
                      if (BELT_OPTIONS[selectedIndex] !== undefined && selectedIndex !== lastBeltIndex.current) {
                        triggerHaptic('light');
                        lastBeltIndex.current = selectedIndex;
                        setEditValue(BELT_OPTIONS[selectedIndex]);
                      }
                    }}
                  >
                    {BELT_OPTIONS.map((belt) => (
                      <div
                        key={belt}
                        onClick={() => setEditValue(belt)}
                        data-testid={`option-belt-${belt}`}
                        style={{
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px',
                          fontSize: '20px',
                          color: editValue === belt ? '#FFFFFF' : '#71717A',
                          fontWeight: editValue === belt ? 600 : 400,
                          scrollSnapAlign: 'center',
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        <div style={{
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: getBeltColor(belt),
                          border: belt === 'white' ? '1px solid #52525B' : 'none',
                        }} />
                        {belt}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : editingField === 'style' ? (
              <div>
                {/* iOS-style picker wheel for style */}
                <div 
                  style={{
                    height: '200px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#0A0A0B',
                    borderRadius: '12px',
                    border: '1px solid #2A2A2E',
                  }}
                  data-testid="picker-style"
                >
                  {/* Selection highlight */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '40px',
                    transform: 'translateY(-50%)',
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderTop: '1px solid #8B5CF6',
                    borderBottom: '1px solid #8B5CF6',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }} />
                  {/* Fade gradients */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to bottom, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to top, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  {/* Scrollable list */}
                  <div 
                    ref={stylePickerRef}
                    style={{
                      height: '100%',
                      overflowY: 'scroll',
                      scrollSnapType: 'y mandatory',
                      paddingTop: '80px',
                      paddingBottom: '80px',
                    }}
                    onScroll={(e) => {
                      const container = e.currentTarget;
                      const itemHeight = 40;
                      const scrollTop = container.scrollTop;
                      const selectedIndex = Math.round(scrollTop / itemHeight);
                      if (STYLE_OPTIONS[selectedIndex] !== undefined && selectedIndex !== lastStyleIndex.current) {
                        triggerHaptic('light');
                        lastStyleIndex.current = selectedIndex;
                        setEditValue(STYLE_OPTIONS[selectedIndex]);
                      }
                    }}
                  >
                    {STYLE_OPTIONS.map((style) => (
                      <div
                        key={style}
                        onClick={() => setEditValue(style)}
                        data-testid={`option-style-${style}`}
                        style={{
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          color: editValue === style ? '#FFFFFF' : '#71717A',
                          fontWeight: editValue === style ? 600 : 400,
                          scrollSnapAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {style === 'nogi' ? 'No-Gi' : style === 'both' ? 'Both' : 'Gi'}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : editingField === 'weight' ? (
              <div>
                {/* iOS-style picker wheel for weight */}
                <div 
                  style={{
                    height: '200px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#0A0A0B',
                    borderRadius: '12px',
                    border: '1px solid #2A2A2E',
                  }}
                  data-testid="picker-weight"
                >
                  {/* Selection highlight */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '40px',
                    transform: 'translateY(-50%)',
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderTop: '1px solid #8B5CF6',
                    borderBottom: '1px solid #8B5CF6',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }} />
                  {/* Fade gradients */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to bottom, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to top, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  {/* Scrollable list */}
                  <div 
                    ref={weightPickerRef}
                    style={{
                      height: '100%',
                      overflowY: 'scroll',
                      scrollSnapType: 'y mandatory',
                      paddingTop: '80px',
                      paddingBottom: '80px',
                    }}
                    onScroll={(e) => {
                      const container = e.currentTarget;
                      const itemHeight = 40;
                      const scrollTop = container.scrollTop;
                      const selectedIndex = Math.round(scrollTop / itemHeight);
                      if (weightOptions[selectedIndex] !== undefined && selectedIndex !== lastWeightIndex.current) {
                        triggerHaptic('light');
                        lastWeightIndex.current = selectedIndex;
                        setEditValue(String(weightOptions[selectedIndex]));
                      }
                    }}
                  >
                    {weightOptions.map((weight) => (
                      <div
                        key={weight}
                        onClick={() => setEditValue(String(weight))}
                        style={{
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          color: editValue === String(weight) ? '#FFFFFF' : '#71717A',
                          fontWeight: editValue === String(weight) ? 600 : 400,
                          scrollSnapAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {weight} {weightUnit}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : editingField === 'height' ? (
              <div>
                {/* iOS-style picker wheel for height */}
                <div 
                  style={{
                    height: '200px',
                    overflow: 'hidden',
                    position: 'relative',
                    background: '#0A0A0B',
                    borderRadius: '12px',
                    border: '1px solid #2A2A2E',
                  }}
                  data-testid="picker-height"
                >
                  {/* Selection highlight */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: 0,
                    right: 0,
                    height: '40px',
                    transform: 'translateY(-50%)',
                    background: 'rgba(139, 92, 246, 0.2)',
                    borderTop: '1px solid #8B5CF6',
                    borderBottom: '1px solid #8B5CF6',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }} />
                  {/* Fade gradients */}
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to bottom, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '80px',
                    background: 'linear-gradient(to top, #0A0A0B, transparent)',
                    pointerEvents: 'none',
                    zIndex: 2,
                  }} />
                  {/* Scrollable list */}
                  <div 
                    ref={heightPickerRef}
                    style={{
                      height: '100%',
                      overflowY: 'scroll',
                      scrollSnapType: 'y mandatory',
                      paddingTop: '80px',
                      paddingBottom: '80px',
                    }}
                    onScroll={(e) => {
                      const container = e.currentTarget;
                      const itemHeight = 40;
                      const scrollTop = container.scrollTop;
                      const selectedIndex = Math.round(scrollTop / itemHeight);
                      if (heightOptions[selectedIndex] !== undefined && selectedIndex !== lastHeightIndex.current) {
                        triggerHaptic('light');
                        lastHeightIndex.current = selectedIndex;
                        setEditValue(heightOptions[selectedIndex]);
                      }
                    }}
                  >
                    {heightOptions.map((height) => (
                      <div
                        key={height}
                        onClick={() => setEditValue(height)}
                        style={{
                          height: '40px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          color: editValue === height ? '#FFFFFF' : '#71717A',
                          fontWeight: editValue === height ? 600 : 400,
                          scrollSnapAlign: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        {height}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder={`Enter ${editingField}`}
                autoFocus
                data-testid={`input-${editingField}`}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: '#0A0A0B',
                  border: '1px solid #2A2A2E',
                  borderRadius: '12px',
                  color: '#FFFFFF',
                  fontSize: '16px',
                  outline: 'none',
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Avatar Options Modal */}
      {showAvatarModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'flex-end',
            zIndex: 1000,
          }}
          onClick={() => setShowAvatarModal(false)}
          data-testid="modal-avatar-overlay"
        >
          <div 
            style={{
              width: '100%',
              background: '#1A1A1D',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              padding: '20px',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ 
              width: '36px', 
              height: '4px', 
              background: '#3A3A3C', 
              borderRadius: '2px',
              margin: '0 auto 20px',
            }} />
            
            <button
              onClick={() => handleNativePhoto(CameraSource.Camera)}
              data-testid="button-take-photo"
              style={{
                width: '100%',
                padding: '16px',
                background: '#2A2A2E',
                border: 'none',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                marginBottom: '8px',
              }}
            >
              <CameraIcon size={20} color="#FFFFFF" />
              <span style={{ color: '#FFFFFF', fontSize: '16px' }}>
                Take Photo
              </span>
            </button>

            <button
              onClick={() => handleNativePhoto(CameraSource.Photos)}
              data-testid="button-choose-photo"
              style={{
                width: '100%',
                padding: '16px',
                background: '#2A2A2E',
                border: 'none',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                marginBottom: '8px',
              }}
            >
              <Image size={20} color="#FFFFFF" />
              <span style={{ color: '#FFFFFF', fontSize: '16px' }}>
                Choose from Library
              </span>
            </button>

            {user?.avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                data-testid="button-remove-photo"
                style={{
                  width: '100%',
                  padding: '16px',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  marginBottom: '8px',
                }}
              >
                <Trash2 size={20} color="#DC2626" />
                <span style={{ color: '#DC2626', fontSize: '16px' }}>
                  Remove Photo
                </span>
              </button>
            )}

            <button
              onClick={() => setShowAvatarModal(false)}
              data-testid="button-cancel-avatar"
              style={{
                width: '100%',
                padding: '16px',
                background: 'transparent',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                marginTop: '8px',
              }}
            >
              <span style={{ color: '#71717A', fontSize: '16px' }}>
                Cancel
              </span>
            </button>
          </div>
        </div>
      )}

      {!hideBottomNav && <IOSBottomNav />}
    </div>
  );
}
