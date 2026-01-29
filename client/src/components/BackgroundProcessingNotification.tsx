import { useChatContext } from '@/contexts/ChatContext';
import { useEffect, useState } from 'react';

export function BackgroundProcessingNotification() {
  const { backgroundProcessing } = useChatContext();
  const [dotOpacity, setDotOpacity] = useState(1);

  // Simple pulsing animation using state
  useEffect(() => {
    if (!backgroundProcessing) return;
    
    const interval = setInterval(() => {
      setDotOpacity(prev => prev === 1 ? 0.3 : 1);
    }, 500);
    
    return () => clearInterval(interval);
  }, [backgroundProcessing]);

  if (!backgroundProcessing) return null;

  return (
    <div 
      data-testid="notification-background-processing"
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        background: 'rgba(139, 92, 246, 0.95)',
        color: 'white',
        padding: '12px 20px',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: 600,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
      }}
    >
      <div 
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#fff',
          opacity: dotOpacity,
          transition: 'opacity 0.3s ease'
        }} 
      />
      Professor OS is thinking...
    </div>
  );
}
