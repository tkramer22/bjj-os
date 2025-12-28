import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { MobileMessageBubble } from "./mobile-message-bubble";
import { MobileTypingIndicator } from "./mobile-typing-indicator";
import { MobileVoiceRecorder } from "./mobile-voice-recorder";
import { sendChatMessage, getChatHistory } from "@/services/api";
import { formatDateDivider, shouldShowDateDivider } from "@/lib/timestamps";
import { triggerHaptic } from "@/lib/haptics";
import { getApiUrl, isNativeApp } from "@/lib/capacitorAuth";
import { useChatContext } from "@/contexts/ChatContext";

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
  // Use ChatContext for persistence across tab switches (iOS app)
  const chatContext = useChatContext();
  
  // Convert ChatContext messages to component format
  const contextMessages: Message[] = chatContext.messages.map(m => ({
    id: m.id,
    sender: (m.role === 'user' ? 'user' : 'assistant') as "user" | "assistant",
    message: m.content,
    timestamp: new Date(m.timestamp),
    videos: []
  }));
  
  // Use context messages for native app (persists across tab switches)
  // Use local state for web (component lifecycle)
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  
  // For native app: use context messages once history is loaded to prevent flash
  // For web: use local state (component lifecycle)
  const messages = isNativeApp() && chatContext.historyLoaded 
    ? contextMessages 
    : localMessages;
  
  // Unified setMessages that updates both local and context
  // Uses functional update pattern to avoid stale closures
  const setMessages = useCallback((updater: Message[] | ((prev: Message[]) => Message[])) => {
    setLocalMessages(prevMessages => {
      const newMessages = typeof updater === 'function' ? updater(prevMessages) : updater;
      
      // Also update context for persistence (iOS app)
      if (isNativeApp()) {
        chatContext.setMessages(newMessages.map(m => {
          // Safely handle timestamp: Date object, string, or undefined
          let timestampStr: string;
          if (m.timestamp instanceof Date) {
            timestampStr = m.timestamp.toISOString();
          } else if (m.timestamp) {
            timestampStr = new Date(m.timestamp).toISOString();
          } else {
            timestampStr = new Date().toISOString();
          }
          
          return {
            id: m.id,
            role: m.sender === 'user' ? 'user' : 'assistant' as const,
            content: m.message,
            timestamp: timestampStr
          };
        }));
      }
      
      return newMessages;
    });
  }, [chatContext]);
  
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState<string | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const thinkingStatusRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get authenticated user from API (not localStorage which can be stale)
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  // Use authenticated user ID, falling back to localStorage only if API unavailable
  const userId = currentUser?.id?.toString() || localStorage.getItem('mobileUserId') || '1';

  // Thinking status messages that rotate while AI is processing
  const thinkingMessages = [
    "Analyzing your question...",
    "Searching training database...",
    "Finding relevant techniques...",
    "Formulating response...",
  ];

  // Start rotating thinking status messages
  const startThinkingAnimation = () => {
    // Clear any existing interval first to prevent timer leaks on repeated sends
    stopThinkingAnimation();
    
    let index = 0;
    setThinkingStatus(thinkingMessages[0]);
    
    thinkingStatusRef.current = setInterval(() => {
      index = (index + 1) % thinkingMessages.length;
      setThinkingStatus(thinkingMessages[index]);
    }, 2000); // Rotate every 2 seconds
  };

  // Stop thinking animation
  const stopThinkingAnimation = () => {
    if (thinkingStatusRef.current) {
      clearInterval(thinkingStatusRef.current);
      thinkingStatusRef.current = null;
    }
    setThinkingStatus(null);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (thinkingStatusRef.current) {
        clearInterval(thinkingStatusRef.current);
      }
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Only auto-scroll for NEW messages (typing indicator or newly sent/received)
  // Don't scroll when prepending older history
  useEffect(() => {
    if (shouldAutoScroll) {
      scrollToBottom();
    }
  }, [messages.length, isTyping, shouldAutoScroll]);

  // Sync localMessages from context when history loads on native
  // This prevents flash when switching from local to context source
  useEffect(() => {
    if (isNativeApp() && chatContext.historyLoaded && contextMessages.length > 0) {
      setLocalMessages(contextMessages);
    }
  }, [chatContext.historyLoaded, contextMessages]);

  // Load chat history when we have a valid authenticated user ID
  // Re-load if the authenticated user changes (e.g., after auth restoration)
  useEffect(() => {
    const targetUserId = currentUser?.id?.toString();
    const fallbackId = localStorage.getItem('mobileUserId');
    
    console.log('[CHAT-HISTORY] Effect triggered:', { 
      targetUserId, 
      fallbackId,
      isLoadingUser, 
      loadedUserId,
      hasCurrentUser: !!currentUser
    });
    
    // Case 1: Authenticated user is available and not yet loaded
    if (targetUserId && targetUserId !== loadedUserId) {
      console.log('[CHAT-HISTORY] Loading history for authenticated user:', targetUserId);
      loadChatHistory(targetUserId);
      setLoadedUserId(targetUserId);
      return;
    }
    
    // Case 2: Auth check complete, no authenticated user, try localStorage
    if (!isLoadingUser && !currentUser && loadedUserId === null) {
      if (fallbackId && fallbackId !== '1') {
        console.log('[CHAT-HISTORY] Loading history for localStorage user:', fallbackId);
        loadChatHistory(fallbackId);
        setLoadedUserId(fallbackId);
      } else {
        // No valid user - show welcome message
        console.log('[CHAT-HISTORY] No user found, showing welcome message');
        setMessages([{
          id: "0",
          sender: "assistant",
          message: `Welcome to Professor OS!

I'm your personal BJJ coach, available 24/7 to help you level up your game.

What would you like to work on today?`,
          timestamp: new Date(),
          videos: []
        }]);
        setIsLoading(false);
        setLoadedUserId('none');
        // Mark context as loaded for persistence (iOS app)
        if (isNativeApp()) {
          chatContext.setHistoryLoaded(true);
        }
      }
      return;
    }
    
    // Case 3: Still loading auth - try localStorage as immediate fallback
    // This ensures we show SOMETHING while waiting for auth to complete
    if (isLoadingUser && loadedUserId === null && fallbackId && fallbackId !== '1') {
      console.log('[CHAT-HISTORY] Auth still loading, using localStorage fallback:', fallbackId);
      loadChatHistory(fallbackId);
      setLoadedUserId(fallbackId);
    }
  }, [currentUser, isLoadingUser, loadedUserId]);

  const loadChatHistory = async (userIdParam: string) => {
    console.log('[HISTORY] Starting load for user:', userIdParam);
    try {
      const data = await getChatHistory(userIdParam);
      console.log('[HISTORY] API response:', JSON.stringify(data).substring(0, 200));
      console.log('[HISTORY] Messages count:', data.messages?.length || 0);
      if (data.messages && data.messages.length > 0) {
        console.log('[HISTORY] Loading', data.messages.length, 'messages into state');
        // Backend sends: { role: 'user'|'assistant', content: string, createdAt: date }
        // DEDUPLICATION: Track seen message IDs to prevent duplicates
        const seenIds = new Set<string>();
        const deduplicatedMessages = data.messages
          .filter((msg: any, idx: number) => {
            const msgId = String(msg.id || idx);
            if (seenIds.has(msgId)) {
              console.warn('[HISTORY] Skipping duplicate message ID:', msgId);
              return false;
            }
            seenIds.add(msgId);
            return true;
          })
          .map((msg: any, idx: number) => ({
            id: msg.id || String(idx),
            sender: (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'assistant',
            message: msg.content || msg.message || '',
            timestamp: new Date(msg.createdAt || msg.timestamp),
            videos: msg.videos || []
          }));
        console.log('[HISTORY] Setting', deduplicatedMessages.length, 'messages (deduplicated from', data.messages.length, ')');
        setMessages(deduplicatedMessages);
        // Track oldest message timestamp for cursor-based pagination
        if (deduplicatedMessages.length > 0) {
          setOldestMessageTimestamp(deduplicatedMessages[0].timestamp.toISOString());
        }
        // Use hasMore from backend response
        setHasMoreMessages(data.hasMore ?? deduplicatedMessages.length >= 20);
        // Enable auto-scroll for initial load
        setShouldAutoScroll(true);
        // Mark context as loaded for persistence (iOS app)
        if (isNativeApp()) {
          chatContext.setHistoryLoaded(true);
        }
      } else {
        console.log('[HISTORY] No messages found, showing welcome');
        // Welcome message if no history
        setMessages([{
          id: "0",
          sender: "assistant",
          message: `Welcome to Professor OS!

I'm your personal BJJ coach, available 24/7 to help you level up your game.

I can help with:
- Technique breakdowns and analysis
- Position-specific coaching
- Training plan recommendations
- Video suggestions from elite instructors
- Game strategy and problem-solving

Just trained? Tell me what you worked on and I'll give you feedback.

Struggling with something? Describe the position and I'll guide you through it.

Want to improve? Ask me anything about BJJ - from fundamentals to advanced concepts.

What would you like to work on today?`,
          timestamp: new Date(),
          videos: []
        }]);
        // Mark context as loaded for persistence (iOS app)
        if (isNativeApp()) {
          chatContext.setHistoryLoaded(true);
        }
      }
    } catch (error) {
      console.error('Failed to load history:', error);
      // Show welcome message on error
      setMessages([{
        id: "0",
        sender: "assistant",
        message: `Welcome to Professor OS!

I'm your personal BJJ coach, available 24/7 to help you level up your game.

I can help with:
- Technique breakdowns and analysis
- Position-specific coaching
- Training plan recommendations
- Video suggestions from elite instructors
- Game strategy and problem-solving

Just trained? Tell me what you worked on and I'll give you feedback.

Struggling with something? Describe the position and I'll guide you through it.

Want to improve? Ask me anything about BJJ - from fundamentals to advanced concepts.

What would you like to work on today?`,
        timestamp: new Date(),
        videos: []
      }]);
      // Mark context as loaded even on error (iOS app)
      if (isNativeApp()) {
        chatContext.setHistoryLoaded(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Load more (older) messages when scrolling up
  const loadMoreMessages = async () => {
    if (!hasMoreMessages || isLoadingMore || !userId || !oldestMessageTimestamp) return;
    
    // Disable auto-scroll when loading older messages
    setShouldAutoScroll(false);
    setIsLoadingMore(true);
    
    // Save scroll position before loading
    const container = messagesContainerRef.current;
    const scrollHeightBefore = container?.scrollHeight || 0;
    
    const loadMoreCount = 30;
    console.log('[LOAD-MORE] Loading older messages, before:', oldestMessageTimestamp, 'limit:', loadMoreCount);
    
    try {
      // Request older messages using cursor (before timestamp)
      const data = await getChatHistory(userId, loadMoreCount, oldestMessageTimestamp);
      
      if (data.messages && data.messages.length > 0) {
        // Map API messages to our format
        const olderMessages = data.messages.map((msg: any, idx: number) => ({
          id: msg.id || `older-${idx}-${Date.now()}`,
          sender: (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'assistant' as const,
          message: msg.content || msg.message || '',
          timestamp: new Date(msg.createdAt || msg.timestamp),
          videos: msg.videos || []
        }));
        
        // Update oldest timestamp cursor (first message in chronological order)
        if (olderMessages.length > 0) {
          setOldestMessageTimestamp(olderMessages[0].timestamp.toISOString());
        }
        
        // Defensive deduplication before prepending
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const uniqueOlder = olderMessages.filter((m: Message) => !existingIds.has(m.id));
          return [...uniqueOlder, ...prev];
        });
        setHasMoreMessages(data.hasMore ?? false);
        
        // Preserve scroll position after DOM updates
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
      console.error('[LOAD-MORE] Failed to load more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSend = async (text = inputValue) => {
    const messageText = String(text || "").trim();
    if (!messageText || isTyping) return;

    // Re-enable auto-scroll when sending new messages
    setShouldAutoScroll(true);
    triggerHaptic('light');

    const userMessage: Message = {
      id: Date.now().toString(),
      sender: "user",
      message: messageText,
      timestamp: new Date(),
      videos: []
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsTyping(true);
    startThinkingAnimation(); // Show thinking status while waiting

    // Create placeholder assistant message for streaming
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      sender: "assistant",
      message: '',
      timestamp: new Date(),
      videos: []
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Call Claude streaming endpoint with SSE (same as web for consistency)
      const streamUrl = getApiUrl('/api/ai/chat/claude/stream');
      console.log('[MOBILE-CHAT] Sending message to Claude...', { userId, messageLength: messageText.length });
      console.log('[MOBILE-CHAT] Request URL:', streamUrl);
      
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          message: messageText,
          userId,
        }),
      });

      console.log('[MOBILE-CHAT] Response status:', response.status, response.statusText);

      if (!response.ok) {
        console.error('[MOBILE-CHAT] Response not OK:', response.status, response.statusText);
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
      }

      // Read SSE stream with proper buffering
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
                
                // Handle error responses from server (e.g., Claude refused, safety filter)
                if (parsed.error) {
                  console.error('[SSE] Server error:', parsed.error);
                  stopThinkingAnimation();
                  streamedContent = "I had trouble with that message. This can happen when certain words trigger safety filters, even in normal BJJ context. Could you try rephrasing? For example, instead of 'I got destroyed,' you could say 'I struggled against mount.'";
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, message: streamedContent }
                      : msg
                  ));
                  setIsTyping(false);
                  isDone = true;
                  break;
                }
                
                if (parsed.chunk || parsed.content) {
                  const content = parsed.chunk || parsed.content;
                  streamedContent += content;
                  
                  // Stop thinking animation once we get first content
                  stopThinkingAnimation();

                  // Update assistant message with streamed content in real-time
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, message: streamedContent }
                      : msg
                  ));
                } else if (parsed.processedContent) {
                  // Server sent post-processed content with full video tokens
                  // IMPORTANT: This REPLACES the content, not appends - it's the enriched version
                  console.log('[MOBILE-CHAT] ✅ Received processed content with video tokens (REPLACING)');
                  stopThinkingAnimation();
                  streamedContent = parsed.processedContent;
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, message: parsed.processedContent }
                      : msg
                  ));
                } else if (parsed.done) {
                  // Completion signal - just metadata, don't add any content
                  console.log('[MOBILE-CHAT] ✅ Stream complete signal received');
                }
              } catch (e) {
                // Ignore JSON parse errors for partial chunks
              }
            }
          }

          if (isDone) break;
        }
      }

      setIsTyping(false);
      
    } catch (error: any) {
      console.error('[MOBILE-CHAT] Failed to send message:', error);
      console.error('[MOBILE-CHAT] Error details:', {
        message: error?.message,
        name: error?.name,
        stack: error?.stack?.substring(0, 500)
      });
      stopThinkingAnimation();
      setIsTyping(false);
      
      // Remove placeholder message and show error
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
      
      // Provide more specific error message for debugging
      let errorText = "Sorry, I'm having trouble right now. Please try again!";
      if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
        errorText = "Network error - please check your internet connection and try again.";
      } else if (error?.message?.includes('401') || error?.message?.includes('403')) {
        errorText = "Session expired - please log in again.";
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 2).toString(),
        sender: "assistant",
        message: errorText,
        timestamp: new Date(),
        videos: []
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      // Guarantee thinking animation is always stopped
      stopThinkingAnimation();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleVoiceComplete = (transcript: string) => {
    if (transcript) {
      handleSend(transcript);
    }
  };

  // Show loading spinner until we have messages ready
  // For native apps: also wait for historyLoaded to prevent flash
  const showLoading = isLoading || (isNativeApp() && !chatContext.historyLoaded);
  
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
      >
        {/* Load more indicator at top */}
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
          const previousMsg = index > 0 ? messages[index - 1] : undefined;
          const showDivider = shouldShowDateDivider(msg.timestamp, previousMsg?.timestamp);
          
          return (
            <div key={msg.id}>
              {showDivider && (
                <div style={{
                  textAlign: 'center',
                  margin: '1.5rem 0 1rem 0',
                  fontSize: '0.75rem',
                  color: 'var(--mobile-text-secondary)',
                  fontWeight: '600'
                }}>
                  {formatDateDivider(msg.timestamp)}
                </div>
              )}
              <MobileMessageBubble
                message={msg.message}
                sender={msg.sender}
                timestamp={msg.timestamp}
                videos={msg.videos}
              />
            </div>
          );
        })}
        {/* Thinking status indicator (shown before first content arrives) */}
        {thinkingStatus && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 16px',
            marginLeft: '12px',
            marginRight: '48px',
            background: 'rgba(139, 92, 246, 0.1)',
            borderRadius: '12px',
            border: '1px solid rgba(139, 92, 246, 0.2)',
            marginBottom: '8px',
          }} data-testid="thinking-indicator">
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#8B5CF6',
              animation: 'pulse 1.5s ease-in-out infinite',
            }} />
            <span style={{ 
              color: '#A78BFA', 
              fontSize: '0.875rem',
              fontStyle: 'italic',
            }}>
              {thinkingStatus}
            </span>
          </div>
        )}
        {isTyping && !thinkingStatus && <MobileTypingIndicator />}
        <div ref={messagesEndRef} />
      </div>

      <div className="mobile-chat-input-container mobile-safe-area-bottom">
        <MobileVoiceRecorder onRecordingComplete={handleVoiceComplete} />
        
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask about techniques..."
          className="mobile-chat-input"
          rows={1}
          data-testid="input-chat-message"
        />
        
        <button
          onClick={() => handleSend()}
          className="mobile-btn-icon"
          disabled={!inputValue.trim()}
          data-testid="button-send-message"
        >
          <Send />
        </button>
      </div>
    </div>
  );
}
