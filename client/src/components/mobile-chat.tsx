import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { MobileMessageBubble } from "./mobile-message-bubble";
import { MobileTypingIndicator } from "./mobile-typing-indicator";
import { MobileVoiceRecorder } from "./mobile-voice-recorder";
import { getChatHistory } from "@/services/api";
import { formatDateDivider, shouldShowDateDivider } from "@/lib/timestamps";
import { triggerHaptic } from "@/lib/haptics";
import { getApiUrl, isNativeApp, getAuthToken } from "@/lib/capacitorAuth";
import { useChatContext } from "@/contexts/ChatContext";
import { Keyboard } from '@capacitor/keyboard';
import { Capacitor } from '@capacitor/core';

interface Message {
  id: string;
  sender: "user" | "assistant";
  message: string;
  timestamp: Date;
  videos?: any[];
}

interface AuthUser {
  id: number;
  email?: string;
  name?: string;
  username?: string;
}

export function MobileChat() {
  // SINGLE SOURCE OF TRUTH: ChatContext only - NO local state
  const chatContext = useChatContext();
  
  // Convert ChatContext messages to component format for rendering
  const messages: Message[] = chatContext.messages.map(m => ({
    id: m.id,
    sender: (m.role === 'user' ? 'user' : 'assistant') as "user" | "assistant",
    message: m.content,
    timestamp: new Date(m.timestamp),
    videos: []
  }));
  
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState<string | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const thinkingStatusRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Handle keyboard show/hide for iOS native
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const showListener = Keyboard.addListener('keyboardWillShow', (info) => {
      setKeyboardHeight(info.keyboardHeight);
      // Scroll to bottom when keyboard appears
      setTimeout(() => scrollToBottom(true), 100);
    });

    const hideListener = Keyboard.addListener('keyboardWillHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showListener.then(l => l.remove());
      hideListener.then(l => l.remove());
    };
  }, []);

  // Get authenticated user from API
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  const userId = currentUser?.id?.toString() || localStorage.getItem('mobileUserId') || '1';

  const thinkingMessages = [
    "Analyzing your question...",
    "Searching training database...",
    "Finding relevant techniques...",
    "Formulating response...",
  ];

  const startThinkingAnimation = () => {
    stopThinkingAnimation();
    let index = 0;
    setThinkingStatus(thinkingMessages[0]);
    thinkingStatusRef.current = setInterval(() => {
      index = (index + 1) % thinkingMessages.length;
      setThinkingStatus(thinkingMessages[index]);
    }, 2000);
  };

  const stopThinkingAnimation = () => {
    if (thinkingStatusRef.current) {
      clearInterval(thinkingStatusRef.current);
      thinkingStatusRef.current = null;
    }
    setThinkingStatus(null);
  };

  useEffect(() => {
    return () => {
      if (thinkingStatusRef.current) {
        clearInterval(thinkingStatusRef.current);
      }
    };
  }, []);

  const scrollToBottom = (instant?: boolean) => {
    messagesEndRef.current?.scrollIntoView({ behavior: instant ? "instant" : "smooth" });
  };

  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages.length, isTyping, shouldAutoScroll]);

  // CRITICAL: Always scroll to bottom when returning to chat tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && messages.length > 0) {
        requestAnimationFrame(() => scrollToBottom(true));
      }
    };

    const handleFocus = () => {
      if (messages.length > 0) {
        requestAnimationFrame(() => scrollToBottom(true));
      }
    };

    // Listen for iOS tab navigation return event
    const handleChatReturn = () => {
      if (messages.length > 0) {
        // Use multiple requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            scrollToBottom(true);
          });
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('ios-chat-return', handleChatReturn);
    
    if (messages.length > 0) {
      requestAnimationFrame(() => scrollToBottom(true));
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('ios-chat-return', handleChatReturn);
    };
  }, [messages.length]);

  // Load chat history - writes directly to context
  useEffect(() => {
    const targetUserId = currentUser?.id?.toString();
    const fallbackId = localStorage.getItem('mobileUserId');
    
    if (targetUserId && targetUserId !== loadedUserId) {
      loadChatHistory(targetUserId);
      setLoadedUserId(targetUserId);
      return;
    }
    
    if (!isLoadingUser && !currentUser && loadedUserId === null) {
      if (fallbackId && fallbackId !== '1') {
        loadChatHistory(fallbackId);
        setLoadedUserId(fallbackId);
      } else {
        // No valid user - show welcome message directly in context
        chatContext.addMessage({
          id: "0",
          role: 'assistant',
          content: `Welcome to Professor OS!

I'm your personal BJJ coach, available 24/7 to help you level up your game.

What would you like to work on today?`,
          timestamp: new Date().toISOString()
        });
        setIsLoading(false);
        setLoadedUserId('none');
        chatContext.setHistoryLoaded(true);
      }
      return;
    }
    
    if (isLoadingUser && loadedUserId === null && fallbackId && fallbackId !== '1') {
      loadChatHistory(fallbackId);
      setLoadedUserId(fallbackId);
    }
  }, [currentUser, isLoadingUser, loadedUserId]);

  const loadChatHistory = async (userIdParam: string) => {
    console.log('[HISTORY] Loading for user:', userIdParam);
    try {
      const data = await getChatHistory(userIdParam);
      if (data.messages && data.messages.length > 0) {
        // Load history directly into context
        const contextMessages = data.messages.map((msg: any, idx: number) => ({
          id: msg.id || String(idx),
          role: (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'assistant' as const,
          content: msg.content || msg.message || '',
          timestamp: new Date(msg.createdAt || msg.timestamp).toISOString()
        }));
        
        chatContext.setMessages(contextMessages);
        
        if (contextMessages.length > 0) {
          setOldestMessageTimestamp(contextMessages[0].timestamp);
        }
        setHasMoreMessages(data.hasMore ?? false);
      } else {
        // No history - show welcome
        chatContext.addMessage({
          id: "welcome",
          role: 'assistant',
          content: `Hey! I'm Professor OS, your personal BJJ coach.

I'm here to help you with:
• Technique breakdowns and details
• Training advice and game planning
• Competition prep and strategy
• Drilling ideas and concepts

What's on your mind?`,
          timestamp: new Date().toISOString()
        });
      }
      
      chatContext.setHistoryLoaded(true);
      setIsLoading(false);
      
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (error) {
      console.error('[HISTORY] Failed to load:', error);
      chatContext.addMessage({
        id: "error-welcome",
        role: 'assistant',
        content: "Welcome! I'm Professor OS, your BJJ coach. What would you like to work on?",
        timestamp: new Date().toISOString()
      });
      chatContext.setHistoryLoaded(true);
      setIsLoading(false);
    }
  };

  const loadMoreMessages = async () => {
    if (isLoadingMore || !hasMoreMessages || !oldestMessageTimestamp) return;
    
    setIsLoadingMore(true);
    const container = messagesContainerRef.current;
    const scrollHeightBefore = container?.scrollHeight || 0;
    
    try {
      const data = await getChatHistory(userId, 30, oldestMessageTimestamp);
      
      if (data.messages && data.messages.length > 0) {
        const olderMessages = data.messages.map((msg: any, idx: number) => ({
          id: msg.id || `older-${idx}-${Date.now()}`,
          role: (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'assistant' as const,
          content: msg.content || msg.message || '',
          timestamp: new Date(msg.createdAt || msg.timestamp).toISOString()
        }));
        
        if (olderMessages.length > 0) {
          setOldestMessageTimestamp(olderMessages[0].timestamp);
        }
        
        // Prepend older messages to context
        const existingIds = new Set(chatContext.messages.map(m => m.id));
        const uniqueOlder = olderMessages.filter((m: any) => !existingIds.has(m.id));
        chatContext.setMessages([...uniqueOlder, ...chatContext.messages]);
        
        setHasMoreMessages(data.hasMore ?? false);
        
        requestAnimationFrame(() => {
          if (container) {
            const scrollHeightAfter = container.scrollHeight;
            container.scrollTop = scrollHeightAfter - scrollHeightBefore;
          }
        });
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('[LOAD-MORE] Failed:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSend = async (text = inputValue) => {
    const messageText = String(text || "").trim();
    if (!messageText || isTyping) return;
    
    setShouldAutoScroll(true);
    triggerHaptic('light');

    // Create user message and add to context
    const userMessageId = Date.now().toString();
    chatContext.addMessage({
      id: userMessageId,
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString()
    });

    setInputValue("");
    setIsTyping(true);
    startThinkingAnimation();

    // Create assistant placeholder and add to context
    const assistantMessageId = (Date.now() + 1).toString();
    chatContext.addMessage({
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    });
    console.log('Added assistant placeholder to context:', assistantMessageId);

    try {
      const streamUrl = getApiUrl('/api/ai/chat/claude/stream');
      
      // Get auth token for native app auth (cookies don't work reliably on iOS)
      const authToken = await getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ message: messageText, userId }),
      });

      if (!response.ok) {
        throw new Error(`Failed to send: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';
      let buffer = '';
      let isDone = false;

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n');
          buffer = events.pop() || '';

          for (const line of events) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                isDone = true;
                stopThinkingAnimation();
                setIsTyping(false);
                triggerHaptic('light');
                break;
              }

              try {
                const parsed = JSON.parse(data);
                
                if (parsed.error) {
                  console.error('[SSE] Server error:', parsed.error);
                  stopThinkingAnimation();
                  // Update assistant message in context with error
                  chatContext.updateMessage(assistantMessageId, {
                    content: "I had trouble with that message. Could you try rephrasing?"
                  });
                  setIsTyping(false);
                  isDone = true;
                  break;
                }
                
                if (parsed.chunk || parsed.content) {
                  const content = parsed.chunk || parsed.content;
                  streamedContent += content;
                  stopThinkingAnimation();
                  // Update assistant message in context with streamed content
                  chatContext.updateMessage(assistantMessageId, { content: streamedContent });
                } else if (parsed.processedContent) {
                  console.log('[MOBILE-CHAT] Received processed content with video tokens');
                  stopThinkingAnimation();
                  streamedContent = parsed.processedContent;
                  chatContext.updateMessage(assistantMessageId, { content: parsed.processedContent });
                } else if (parsed.done) {
                  console.log('[MOBILE-CHAT] Stream complete signal');
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }

          if (isDone) break;
        }
      }

      setIsTyping(false);
      
    } catch (error: any) {
      console.error('[MOBILE-CHAT] Failed to send:', error);
      stopThinkingAnimation();
      setIsTyping(false);
      
      // Update assistant message with error
      chatContext.updateMessage(assistantMessageId, {
        content: "Sorry, I'm having trouble right now. Please try again!"
      });
    } finally {
      stopThinkingAnimation();
      console.log('=== HANDLE SEND COMPLETE ===');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceTranscription = (transcript: string) => {
    if (transcript) {
      setInputValue(transcript);
      textareaRef.current?.focus();
    }
  };

  // Show loading until history is loaded
  const showLoading = isLoading || !chatContext.historyLoaded;
  
  if (showLoading) {
    return (
      <div className="mobile-chat-container">
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          height: '100%'
        }}>
          <div style={{ fontSize: "2rem", animation: 'spin 1s linear infinite' }}>⚙️</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mobile-chat-container">
      <div className="mobile-chat-header mobile-safe-area-top">
        <div>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "0.25rem" }}>Prof. OS</h2>
          <p style={{ 
            fontSize: "0.875rem", 
            color: "var(--mobile-text-secondary)" 
          }}>
            Your Training Partner
          </p>
        </div>
      </div>

      <div 
        className="mobile-chat-messages"
        ref={messagesContainerRef}
        onScroll={(e) => {
          const container = e.currentTarget;
          if (container.scrollTop < 100 && hasMoreMessages && !isLoadingMore) {
            loadMoreMessages();
          }
        }}
        style={{
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + 100 : 180,
        }}
      >
        {isLoadingMore && (
          <div style={{ textAlign: 'center', padding: '12px', color: 'var(--mobile-text-secondary)' }}>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⚙️</span> Loading older messages...
          </div>
        )}
        {!hasMoreMessages && messages.length > 20 && (
          <div style={{ textAlign: 'center', padding: '12px', color: 'var(--mobile-text-secondary)', fontSize: '0.75rem' }}>
            Beginning of conversation
          </div>
        )}
        
        {messages.map((msg, index) => {
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const showDivider = shouldShowDateDivider(
            msg.timestamp,
            prevMessage?.timestamp ?? undefined
          );
          
          return (
            <div key={msg.id}>
              {showDivider && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '16px 0 8px', 
                  color: 'var(--mobile-text-secondary)',
                  fontSize: '0.75rem',
                  fontWeight: 500
                }}>
                  {formatDateDivider(msg.timestamp)}
                </div>
              )}
              <MobileMessageBubble
                sender={msg.sender}
                message={msg.message}
                timestamp={msg.timestamp}
                videos={msg.videos}
                isLastMessage={index === messages.length - 1}
              />
            </div>
          );
        })}
        
        {isTyping && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            background: 'var(--mobile-card-bg)',
            borderRadius: '16px',
            maxWidth: '80%',
          }}>
            <div style={{
              display: 'flex',
              gap: '4px',
            }}>
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--mobile-primary)',
                animation: 'pulse 1.4s ease-in-out infinite',
              }} />
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--mobile-primary)',
                animation: 'pulse 1.4s ease-in-out infinite 0.2s',
              }} />
              <span style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--mobile-primary)',
                animation: 'pulse 1.4s ease-in-out infinite 0.4s',
              }} />
            </div>
            {thinkingStatus && (
              <span style={{
                fontSize: '14px',
                color: 'var(--mobile-text-secondary)',
                marginLeft: '8px',
              }}>
                {thinkingStatus}
              </span>
            )}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <div 
        className="mobile-chat-input-container mobile-safe-area-bottom"
        style={{
          position: 'fixed',
          bottom: keyboardHeight > 0 ? keyboardHeight : 80,
          left: 0,
          right: 0,
          zIndex: 9998,
          background: '#0A0A0B',
          borderTop: '1px solid var(--mobile-border)',
          paddingBottom: keyboardHeight > 0 ? 0 : 'env(safe-area-inset-bottom, 0px)',
          transition: 'bottom 0.25s ease-out',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '8px',
          padding: '12px 16px',
        }}>
          <MobileVoiceRecorder onTranscriptionComplete={handleVoiceTranscription} disabled={isTyping} />
          
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            background: '#111113',
            borderRadius: '24px',
            padding: '12px 56px 12px 20px',
            minHeight: '48px',
            maxHeight: '150px',
            border: '1px solid #333333',
          }}>
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                const target = e.target;
                target.style.height = 'auto';
                const newHeight = Math.min(target.scrollHeight, 120);
                target.style.height = newHeight + 'px';
              }}
              onKeyPress={handleKeyPress}
              placeholder="Ask Professor OS..."
              disabled={isTyping}
              data-testid="input-chat-message"
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                color: 'var(--mobile-text-primary)',
                fontSize: '1rem',
                resize: 'none',
                outline: 'none',
                maxHeight: '120px',
                minHeight: '24px',
                lineHeight: '1.4',
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
              rows={1}
            />
          </div>
          
          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim() || isTyping}
            data-testid="button-send-message"
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              border: 'none',
              background: inputValue.trim() && !isTyping 
                ? '#2563EB' 
                : '#333333',
              color: inputValue.trim() && !isTyping 
                ? 'white' 
                : '#6B7280',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: inputValue.trim() && !isTyping ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              boxShadow: inputValue.trim() && !isTyping 
                ? '0 4px 12px rgba(139, 92, 246, 0.4)' 
                : 'none',
            }}
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
