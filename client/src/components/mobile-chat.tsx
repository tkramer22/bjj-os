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
import { Capacitor } from "@capacitor/core";

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
  // Use sessionStorage to persist loadedUserId across tab switches (prevents re-loading welcome message)
  // Only persist actual user IDs (not 'none'), so that a fresh login triggers proper history load
  const [loadedUserId, setLoadedUserIdInternal] = useState<string | null>(() => {
    try {
      const stored = sessionStorage.getItem('bjjos_chat_loaded_user_id');
      // Don't restore 'none' sentinel - only actual user IDs
      return stored && stored !== 'none' ? stored : null;
    } catch {
      return null;
    }
  });
  
  // Track if welcome message was shown this session (separate from user ID)
  const [welcomeShownThisSession, setWelcomeShownThisSession] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('bjjos_welcome_shown') === 'true';
    } catch {
      return false;
    }
  });
  
  // Wrapper that also persists to sessionStorage
  const setLoadedUserId = (id: string | null) => {
    setLoadedUserIdInternal(id);
    try {
      if (id && id !== 'none') {
        sessionStorage.setItem('bjjos_chat_loaded_user_id', id);
      } else {
        sessionStorage.removeItem('bjjos_chat_loaded_user_id');
      }
      // Mark welcome as shown when we load any user
      if (id) {
        sessionStorage.setItem('bjjos_welcome_shown', 'true');
        setWelcomeShownThisSession(true);
      }
    } catch {
      // sessionStorage not available
    }
  };
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [oldestMessageTimestamp, setOldestMessageTimestamp] = useState<string | null>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [thinkingStatus, setThinkingStatus] = useState<string | null>(null);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const thinkingStatusRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);

  // VisualViewport listener for keyboard detection (fallback for iOS)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    
    const viewport = window.visualViewport;
    if (!viewport) return;

    const handleResize = () => {
      const offset = window.innerHeight - viewport.height;
      console.log('[KEYBOARD] VisualViewport offset:', offset);
      setKeyboardOffset(offset > 50 ? offset : 0); // Only set if significant (keyboard open)
      
      // Scroll input into view when keyboard opens
      if (offset > 50 && inputContainerRef.current) {
        setTimeout(() => {
          inputContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }, 100);
      }
    };

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);
    
    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
    };
  }, []);

  // Get authenticated user from API - handle 401 by redirecting to login
  const { data: currentUser, isLoading: isLoadingUser, error: authError } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
    retry: false,
  });
  
  // Handle 401 errors by redirecting to login
  useEffect(() => {
    if (authError && String(authError).includes('401')) {
      console.error('[MOBILE-CHAT] 401 auth error, clearing auth and redirecting to login');
      import('@/lib/capacitorAuth').then(({ clearAuth, isNativeApp }) => {
        clearAuth().then(() => {
          if (isNativeApp()) {
            window.location.href = '/ios-login';
          } else {
            window.location.href = '/login';
          }
        });
      });
    }
  }, [authError]);

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

  // EMERGENCY TIMEOUT: Never spin for more than 10 seconds
  // Handles edge cases where history loading gets stuck
  // Dependencies: Only stable values (isLoading, historyLoaded, message count) - NOT the entire chatContext object
  const messageCount = chatContext.messages.length;
  const historyLoaded = chatContext.historyLoaded;
  
  useEffect(() => {
    if (!isLoading || historyLoaded) return; // Already loaded, no timeout needed
    
    const emergencyTimeout = setTimeout(() => {
      console.warn('[CHAT] Emergency timeout - forcing chat to load');
      setIsLoading(false);
      chatContext.setHistoryLoaded(true);
      // Add welcome message if no messages exist
      if (messageCount === 0) {
        chatContext.addMessage({
          id: "timeout-welcome",
          role: 'assistant',
          content: `Hey! I'm Professor OS.

I've broken down thousands of videos from the best - Danaher, Lachlan, Gordon, Marcelo, and hundreds more. Every recommendation comes with full analysis: key details, timestamps, what to focus on. Tap "Analysis" to see my breakdown, Save videos to your library, or Share them with training partners.

Here's what makes me different: I remember everything. Every technique you're working on, every problem you mention, every win you share. The more we train together, the sharper I get.

What are you working on right now?`,
          timestamp: new Date().toISOString()
        });
      }
    }, 10000); // 10 second emergency timeout
    
    return () => clearTimeout(emergencyTimeout);
  }, [isLoading, historyLoaded]); // Only depend on stable boolean values

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
        // No valid user - show NEW USER welcome message
        chatContext.addMessage({
          id: "0",
          role: 'assistant',
          content: `Hey! I'm Professor OS.

I've broken down thousands of videos from the best - Danaher, Lachlan, Gordon, Marcelo, and hundreds more. Every recommendation comes with full analysis: key details, timestamps, what to focus on. Tap "Analysis" to see my breakdown, Save videos to your library, or Share them with training partners.

Here's what makes me different: I remember everything. Every technique you're working on, every problem you mention, every win you share. The more we train together, the sharper I get.

What are you working on right now?`,
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
      
      // Handle auth error - redirect to login
      if (data.authError) {
        console.error('[HISTORY] Auth error - redirecting to login');
        import('@/lib/capacitorAuth').then(({ clearAuth, isNativeApp }) => {
          clearAuth().then(() => {
            if (isNativeApp()) {
              window.location.href = '/ios-login';
            } else {
              window.location.href = '/login';
            }
          });
        });
        return;
      }
      
      if (data.messages && data.messages.length > 0) {
        // Load history directly into context
        const contextMessages = data.messages.map((msg: any, idx: number) => ({
          id: msg.id || String(idx),
          role: (msg.role === 'user' || msg.sender === 'user') ? 'user' : 'assistant' as const,
          content: msg.content || msg.message || '',
          timestamp: new Date(msg.createdAt || msg.timestamp).toISOString()
        }));
        
        // Add RETURNING USER welcome message at the end (rotating for variety)
        const welcomeBackMessages = [
          // Standard warm
          "Welcome back! Ready to pick up where we left off?",
          "Good to see you again. What are we working on today?",
          "Back on the mats? Let's get after it.",
          "Ready when you are. What's on your mind?",
          "Let's build on what we covered last time. What's up?",
          
          // Coach energy
          "Back for more? I like that. What do you need?",
          "The grind continues. What can I help with?",
          "Another day, another chance to level up. What's the focus?",
          "Consistency wins. What are we sharpening today?",
          "You keep showing up. That's how black belts are made. What's on your mind?",
          
          // BJJ culture
          "Oss! What technique is giving you trouble?",
          "How were the rolls? What do we need to fix?",
          "Did you get any taps since we last talked?",
          "Who gave you problems today? Let's solve it.",
          "Ready to add another weapon to your game?",
          
          // Humor / personality
          "Back already? Your training partners are in trouble.",
          "Let me guess - someone passed your guard again?",
          "Missed me? I've been studying more tape. What do you need?",
          "I was just reviewing some Danaher. Perfect timing.",
          "No rest days from learning. What's up?",
          
          // Motivational
          "Every session counts. Let's make this one matter.",
          "Small improvements, big results. What are we working on?",
          "Future you will thank present you. What's the focus today?",
          "Trust the process. What do you need help with?",
          
          // Curiosity-driven
          "What happened in training? Tell me everything.",
          "Any breakthroughs since last time?",
          "What's been stuck in your head since we last talked?",
          "Something specific bring you back, or just here to learn?"
        ];
        
        const randomWelcome = welcomeBackMessages[Math.floor(Math.random() * welcomeBackMessages.length)];
        
        const welcomeBackMessage = {
          id: "welcome-back-" + Date.now(),
          role: 'assistant' as const,
          content: randomWelcome,
          timestamp: new Date().toISOString()
        };
        
        chatContext.setMessages([...contextMessages, welcomeBackMessage]);
        
        if (contextMessages.length > 0) {
          setOldestMessageTimestamp(contextMessages[0].timestamp);
        }
        setHasMoreMessages(data.hasMore ?? false);
      } else {
        // No history - NEW USER welcome
        chatContext.addMessage({
          id: "welcome",
          role: 'assistant',
          content: `Hey! I'm Professor OS.

I've broken down thousands of videos from the best - Danaher, Lachlan, Gordon, Marcelo, and hundreds more. Every recommendation comes with full analysis: key details, timestamps, what to focus on. Tap "Analysis" to see my breakdown, Save videos to your library, or Share them with training partners.

Here's what makes me different: I remember everything. Every technique you're working on, every problem you mention, every win you share. The more we train together, the sharper I get.

What are you working on right now?`,
          timestamp: new Date().toISOString()
        });
      }
      
      chatContext.setHistoryLoaded(true);
      setIsLoading(false);
      
      requestAnimationFrame(() => scrollToBottom(true));
    } catch (error) {
      console.error('[HISTORY] Failed to load:', error);
      // Error loading history - show NEW USER welcome as fallback
      chatContext.addMessage({
        id: "error-welcome",
        role: 'assistant',
        content: `Hey! I'm Professor OS.

I've broken down thousands of videos from the best - Danaher, Lachlan, Gordon, Marcelo, and hundreds more. Every recommendation comes with full analysis: key details, timestamps, what to focus on. Tap "Analysis" to see my breakdown, Save videos to your library, or Share them with training partners.

Here's what makes me different: I remember everything. Every technique you're working on, every problem you mention, every win you share. The more we train together, the sharper I get.

What are you working on right now?`,
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
      console.log('[CHAT DEBUG] Stream URL:', streamUrl);
      console.log('[CHAT DEBUG] Auth token exists:', !!authToken);
      console.log('[CHAT DEBUG] User ID:', userId);
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      console.log('[CHAT DEBUG] Sending request...');
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ message: messageText, userId }),
      });

      console.log('[CHAT DEBUG] Response status:', response.status);
      console.log('[CHAT DEBUG] Response ok:', response.ok);
      
      if (!response.ok) {
        // Try to get error details from response body
        let errorDetail = '';
        try {
          const errorBody = await response.json();
          errorDetail = errorBody.error || JSON.stringify(errorBody);
          console.error('[CHAT DEBUG] Error response body:', errorDetail);
        } catch {
          errorDetail = response.statusText;
        }
        throw new Error(`Request failed (${response.status}): ${errorDetail}`);
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
      console.error('[MOBILE-CHAT] Error name:', error.name);
      console.error('[MOBILE-CHAT] Error message:', error.message);
      console.error('[MOBILE-CHAT] Error stack:', error.stack);
      stopThinkingAnimation();
      setIsTyping(false);
      
      // Provide more specific error message based on error type
      let errorMessage = "Sorry, I'm having trouble right now. Please try again!";
      if (error.message?.includes('401')) {
        errorMessage = "Your session has expired. Please log out and log back in.";
      } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
        errorMessage = "Connection issue. Please check your internet and try again.";
      } else if (error.message?.includes('timeout')) {
        errorMessage = "Request timed out. Please try again in a moment.";
      }
      
      // Update assistant message with error
      chatContext.updateMessage(assistantMessageId, {
        content: errorMessage
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
    <div className="mobile-chat-container" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
    }}>
      <div className="mobile-chat-header mobile-safe-area-top" style={{ flexShrink: 0 }}>
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
          flex: 1,
          overflowY: 'auto',
          paddingBottom: 20,
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
        ref={inputContainerRef}
        className="mobile-chat-input-container mobile-safe-area-bottom"
        style={{
          flexShrink: 0,
          background: '#0A0A0B',
          borderTop: '1px solid var(--mobile-border)',
          paddingBottom: keyboardOffset > 0 
            ? `${keyboardOffset + 12}px` 
            : 'calc(12px + env(safe-area-inset-bottom, 0px))',
          transition: 'padding-bottom 0.25s ease-out',
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
            padding: '12px 16px',
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
