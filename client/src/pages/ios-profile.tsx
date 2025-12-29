import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { IOSBottomNav } from "@/components/ios-bottom-nav";
import { User, Settings, ChevronRight, Loader2, X, Check } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { apiRequest } from "@/lib/queryClient";

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
}

type EditableField = 'name' | 'beltLevel' | 'weight' | 'height' | 'style' | null;

const BELT_OPTIONS = ['white', 'blue', 'purple', 'brown', 'black'];
const STYLE_OPTIONS = ['gi', 'no-gi', 'both'];

export default function IOSProfilePage() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const [editingField, setEditingField] = useState<EditableField>(null);
  const [editValue, setEditValue] = useState('');

  const { data: user, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
  });

  const updateProfile = useMutation({
    mutationFn: async (updates: Partial<UserProfile>) => {
      const response = await apiRequest('PATCH', '/api/auth/profile', updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setEditingField(null);
      setEditValue('');
      triggerHaptic('light');
    },
  });

  const handleNavigate = (path: string) => {
    triggerHaptic('light');
    navigate(path);
  };

  const startEditing = (field: EditableField, currentValue: string) => {
    triggerHaptic('light');
    setEditingField(field);
    setEditValue(currentValue || '');
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
          <div style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${getBeltColor(user?.beltLevel)} 0%, #8B5CF6 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '12px',
          }}>
            <User size={36} color="#FFFFFF" />
          </div>
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
            value={user?.weight ? `${user.weight} lbs` : undefined} 
            field="weight"
            placeholder="Tap to set"
          />
          <ProfileRow 
            label="Height" 
            value={user?.height} 
            field="height"
            placeholder="Tap to set"
          />
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {BELT_OPTIONS.map(belt => (
                  <button
                    key={belt}
                    onClick={() => setEditValue(belt)}
                    data-testid={`option-belt-${belt}`}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: editValue === belt ? '#2A2A2E' : 'transparent',
                      border: editValue === belt ? '2px solid #8B5CF6' : '1px solid #2A2A2E',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: getBeltColor(belt),
                      border: belt === 'white' ? '1px solid #52525B' : 'none',
                    }} />
                    <span style={{ 
                      color: '#FFFFFF', 
                      fontSize: '16px',
                      textTransform: 'capitalize',
                    }}>
                      {belt}
                    </span>
                  </button>
                ))}
              </div>
            ) : editingField === 'style' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {STYLE_OPTIONS.map(style => (
                  <button
                    key={style}
                    onClick={() => setEditValue(style)}
                    data-testid={`option-style-${style}`}
                    style={{
                      width: '100%',
                      padding: '16px',
                      background: editValue === style ? '#2A2A2E' : 'transparent',
                      border: editValue === style ? '2px solid #8B5CF6' : '1px solid #2A2A2E',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <span style={{ 
                      color: '#FFFFFF', 
                      fontSize: '16px',
                      textTransform: 'capitalize',
                    }}>
                      {style === 'no-gi' ? 'No-Gi' : style === 'both' ? 'Both' : 'Gi'}
                    </span>
                  </button>
                ))}
              </div>
            ) : editingField === 'weight' ? (
              <div>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    value={editValue.replace(/[^0-9]/g, '')}
                    onChange={e => setEditValue(e.target.value)}
                    placeholder="Enter weight"
                    autoFocus
                    data-testid="input-weight"
                    style={{
                      width: '100%',
                      padding: '16px',
                      paddingRight: '50px',
                      background: '#0A0A0B',
                      border: '1px solid #2A2A2E',
                      borderRadius: '12px',
                      color: '#FFFFFF',
                      fontSize: '16px',
                      outline: 'none',
                    }}
                  />
                  <span style={{
                    position: 'absolute',
                    right: '16px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#71717A',
                    fontSize: '16px',
                  }}>
                    lbs
                  </span>
                </div>
              </div>
            ) : editingField === 'height' ? (
              <input
                type="text"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                placeholder="e.g., 5'10&quot;"
                autoFocus
                data-testid="input-height"
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

      <IOSBottomNav />
    </div>
  );
}
