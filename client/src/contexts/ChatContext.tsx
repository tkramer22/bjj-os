import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string for consistent serialization
  videos?: any[]; // Video recommendations attached to messages
}

interface ChatContextType {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  addMessage: (message: Message) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  historyLoaded: boolean;
  setHistoryLoaded: (loaded: boolean) => void;
  backgroundProcessing: boolean;
  setBackgroundProcessing: (processing: boolean) => void;
  // Typing/analyzing state - persists across navigation
  isTyping: boolean;
  setIsTyping: (typing: boolean) => void;
}

const ChatContext = createContext<ChatContextType | null>(null);

// Deduplication helper - filters out duplicate messages by ID
function deduplicateMessages(messages: Message[]): Message[] {
  const seen = new Set<string>();
  return messages.filter(m => {
    if (seen.has(m.id)) {
      return false;
    }
    seen.add(m.id);
    return true;
  });
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessagesInternal] = useState<Message[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [backgroundProcessing, setBackgroundProcessingInternal] = useState(false);
  const [isTyping, setIsTypingInternal] = useState(false);
  const backgroundTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Wrap setIsTyping to auto-clear after timeout (failsafe)
  const setIsTyping = useCallback((typing: boolean) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    
    setIsTypingInternal(typing);
    
    // Auto-clear after 90 seconds as failsafe
    if (typing) {
      typingTimeoutRef.current = setTimeout(() => {
        console.log('[CHAT] Typing timeout - auto-clearing');
        setIsTypingInternal(false);
      }, 90000);
    }
  }, []);

  // Wrap setBackgroundProcessing to auto-clear after timeout (failsafe)
  const setBackgroundProcessing = useCallback((processing: boolean) => {
    // Clear any existing timeout
    if (backgroundTimeoutRef.current) {
      clearTimeout(backgroundTimeoutRef.current);
      backgroundTimeoutRef.current = null;
    }
    
    setBackgroundProcessingInternal(processing);
    
    // Auto-clear after 60 seconds as failsafe
    if (processing) {
      backgroundTimeoutRef.current = setTimeout(() => {
        console.log('[CHAT] Background processing timeout - auto-clearing');
        setBackgroundProcessingInternal(false);
      }, 60000);
    }
  }, []);

  // Wrap setMessages to always deduplicate
  const setMessages: React.Dispatch<React.SetStateAction<Message[]>> = useCallback((action) => {
    setMessagesInternal(prev => {
      const newMessages = typeof action === 'function' ? action(prev) : action;
      return deduplicateMessages(newMessages);
    });
  }, []);

  const addMessage = useCallback((message: Message) => {
    setMessagesInternal(prev => {
      // Check for duplicate before adding
      if (prev.some(m => m.id === message.id)) {
        return prev;
      }
      return [...prev, message];
    });
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    ));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setHistoryLoaded(false);
  }, []);

  return (
    <ChatContext.Provider value={{
      messages,
      setMessages,
      addMessage,
      updateMessage,
      clearMessages,
      historyLoaded,
      setHistoryLoaded,
      backgroundProcessing,
      setBackgroundProcessing,
      isTyping,
      setIsTyping,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChatContext must be used within a ChatProvider');
  }
  return context;
}
