import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mic, Send, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import UserLayout from "@/components/layouts/UserLayout";
import { VideoPlayer } from "@/components/VideoPlayer";
import { ThumbnailImage } from "@/components/ThumbnailImage";
import { triggerHaptic } from "@/lib/haptics";
import { IOSSpinner } from "@/components/ios-spinner";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { useChatContext } from "@/contexts/ChatContext";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string for consistent serialization with context
  videoRecommendation?: {
    id: number;
    title: string;
    instructor: string;
    duration: string;
    thumbnail?: string;
    videoId?: string;
  };
}

interface AuthUser {
  id: number;
  phoneNumber: string;
  username?: string;
  displayName?: string;
  name?: string;
  beltLevel?: 'white' | 'blue' | 'purple' | 'brown' | 'black';
  style?: 'gi' | 'nogi' | 'both';
  trainingFrequency?: number;
  onboardingCompleted: boolean;
  createdAt?: string;
  subscriptionType?: string;
}

// Helper function to parse [VIDEO:...] tokens from message content
// Deduplicates videos - if same video ID appears multiple times, only show one card
function parseVideoTokens(content?: string): { text: string; video?: { id: number; title: string; instructor: string; duration: string; videoId: string; startTimeSeconds?: number } }[] {
  // Guard against undefined/null content
  if (!content) {
    return [{ text: '' }];
  }
  
  const segments: { text: string; video?: { id: number; title: string; instructor: string; duration: string; videoId: string; startTimeSeconds?: number } }[] = [];
  const videoRegex = /\[VIDEO:\s*([^\]]+)\]/g;
  const seenVideoIds = new Set<number>(); // Track videos we've already added
  const seenVideoTitles = new Set<string>(); // Fallback for videos without ID
  
  let lastIndex = 0;
  let match;
  
  while ((match = videoRegex.exec(content)) !== null) {
    // Add text before the video token
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index) });
    }
    
    // Parse video data from token
    const videoData = match[1].split('|').map(s => s.trim());
    
    // Try enriched format first: [VIDEO: title | instructor | duration | videoId | id | startTime]
    if (videoData.length >= 5) {
      const videoId = videoData[3]?.trim() || '';
      const dbId = parseInt(videoData[4], 10);
      
      // Guard against invalid IDs - fall through to fallback handling
      if (isNaN(dbId)) {
        console.warn('[parseVideoTokens] Invalid video ID (NaN), using fallback:', videoData[4]);
        // Don't process - let it fall through to else block
      } else {
        // DEDUPLICATION: Skip if we've already seen this video
        if (seenVideoIds.has(dbId)) {
          console.log('[parseVideoTokens] Skipping duplicate video ID:', dbId);
          lastIndex = match.index + match[0].length;
          continue;
        }
        seenVideoIds.add(dbId);
        
        // Parse timestamp from 6th field if available (e.g., "135" for 2:15)
        let startTimeSeconds = 0;
        if (videoData.length >= 6 && videoData[5]) {
          const parsedTime = parseInt(videoData[5], 10);
          if (!isNaN(parsedTime)) {
            startTimeSeconds = parsedTime;
            console.log('[parseVideoTokens] Extracted enriched timestamp:', startTimeSeconds, 'seconds');
          }
        }
        
        // Also try to extract START: from duration field (e.g., "START: 2:15" or "2:15")
        if (startTimeSeconds === 0 && videoData[2]) {
          const timeMatch = videoData[2].match(/(?:START:\s*)?(\d+):(\d+)/i);
          if (timeMatch) {
            startTimeSeconds = parseInt(timeMatch[1], 10) * 60 + parseInt(timeMatch[2], 10);
            console.log('[parseVideoTokens] Extracted duration timestamp:', startTimeSeconds, 'seconds');
          }
        }
        
        const video = {
          title: videoData[0],
          instructor: videoData[1],
          duration: videoData[2],
          videoId,
          id: dbId,
          startTimeSeconds
        };
        
        // Debug: log if videoId is missing in enriched format
        if (!videoId) {
          console.warn('[parseVideoTokens] Enriched token missing videoId:', videoData);
        }
        
        segments.push({
          text: '',
          video
        });
        
        lastIndex = match.index + match[0].length;
        continue; // Skip fallback handling
      }
    }
    
    // Fallback: Claude format [VIDEO: Title by Instructor | START: MM:SS]
    // Only runs if enriched format was invalid (NaN ID) or not enough fields
    if (videoData.length < 5 || isNaN(parseInt(videoData[4], 10))) {
      console.warn('[parseVideoTokens] Enrichment failed, using fallback format. Parts:', videoData.length);
      
      // Extract title and instructor from "Title by Instructor"
      const titleAndInstructor = videoData[0] || '';
      const byMatch = titleAndInstructor.match(/^(.+?)\s+by\s+(.+)$/i);
      
      // Extract START: timestamp if present (e.g., "START: 2:15" or "START: 04:32")
      let startTimeSeconds = 0;
      let startTimeDisplay = '';
      const startMatch = match[1].match(/START:\s*(\d+):(\d+)/i);
      if (startMatch) {
        const minutes = parseInt(startMatch[1], 10);
        const seconds = parseInt(startMatch[2], 10);
        startTimeSeconds = minutes * 60 + seconds;
        startTimeDisplay = `${minutes}:${startMatch[2].padStart(2, '0')}`;
        console.log('[parseVideoTokens] Extracted START timestamp:', startTimeDisplay, '(', startTimeSeconds, 'seconds)');
      }
      
      if (byMatch) {
        const title = byMatch[1].trim();
        const instructor = byMatch[2].trim();
        const titleKey = `${title.toLowerCase()}-${instructor.toLowerCase()}`;
        
        // DEDUPLICATION: Skip if we've already seen this title/instructor combo
        if (seenVideoTitles.has(titleKey)) {
          console.log('[parseVideoTokens] Skipping duplicate video by title:', title);
          lastIndex = match.index + match[0].length;
          continue;
        }
        seenVideoTitles.add(titleKey);
        
        // Create fallback video card with timestamp if available
        const video = {
          title,
          instructor,
          duration: startTimeDisplay || 'full',
          videoId: '', // Empty videoId means card will show text only (no embed)
          id: Date.now(), // Temporary ID for React key
          startTimeSeconds // Include parsed timestamp for video player
        };
        
        segments.push({
          text: '',
          video
        });
        
        console.log('[parseVideoTokens] Rendered fallback card:', title, 'by', instructor, startTimeDisplay ? `@ ${startTimeDisplay}` : '');
      } else {
        // Can't parse - show as text
        console.warn('[parseVideoTokens] Could not parse video token:', match[1]);
        segments.push({ text: match[0] });
      }
    }
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({ text: content.slice(lastIndex) });
  }
  
  return segments.length > 0 ? segments : [{ text: content }];
}

export default function ChatPage() {
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<number>>(new Set());
  const [currentVideo, setCurrentVideo] = useState<{ videoId: string; title: string; instructor: string; startTimeSeconds?: number } | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("Analyzing your training");
  const { messages, setMessages, historyLoaded, setHistoryLoaded } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Fetch authenticated user
  const { data: currentUser, isLoading: isLoadingUser, error: userError, isFetching: isFetchingUser } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  const userId = currentUser?.id?.toString() || '';

  // Fetch chat history - refetch on mount to ensure fresh data on app open
  const { data: chatHistory, isLoading: isLoadingHistory } = useQuery<{ messages: any[] }>({
    queryKey: ['/api/ai/chat/history', userId],
    enabled: !!userId,
    refetchOnMount: true, // Always refetch on mount to load history on app open
    staleTime: 0, // Consider data stale immediately to force refetch
  });

  // CRITICAL: Load chat history from cache or API on mount
  // Skip if context already has messages (user navigated back to chat tab)
  useLayoutEffect(() => {
    // If context already has messages, they persist across navigation - no reload needed
    if (messages.length > 0 || historyLoaded) {
      console.log('[CHAT] Context already has', messages.length, 'messages - skipping reload');
      return;
    }
    
    // Get userId directly from cache (don't wait for React Query to populate currentUser)
    const cachedUser = queryClient.getQueryData<AuthUser>(['/api/auth/me']);
    const cachedUserId = cachedUser?.id?.toString();
    
    if (cachedUserId) {
      const cachedData = queryClient.getQueryData<{ messages: any[] }>(['/api/ai/chat/history', cachedUserId]);
      if (cachedData?.messages && cachedData.messages.length > 0) {
        // DEDUPLICATION: Track seen message IDs to prevent duplicates
        const seenIds = new Set<string>();
        const loadedMessages = cachedData.messages
          .filter((msg: any) => {
            const msgId = String(msg.id);
            if (seenIds.has(msgId)) {
              console.warn('[CHAT] Skipping duplicate message ID from cache:', msgId);
              return false;
            }
            seenIds.add(msgId);
            return true;
          })
          .map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            timestamp: msg.createdAt, // Keep as ISO string for consistent serialization
          }));
        console.log('[CHAT] Loading', loadedMessages.length, 'messages from React Query cache (deduplicated from', cachedData.messages.length, ')');
        setMessages(loadedMessages);
        setHistoryLoaded(true);
      }
    }
  }, []); // Run only on mount - check context first, then cache

  // Fetch saved videos
  const { data: savedVideosData } = useQuery<{ videos: { id: string }[] }>({
    queryKey: ['/api/ai/saved-videos', userId],
    enabled: !!userId,
  });

  // Update saved video IDs when data changes
  useEffect(() => {
    if (savedVideosData?.videos) {
      setSavedVideoIds(new Set(savedVideosData.videos.map(v => parseInt(v.id))));
    }
  }, [savedVideosData]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (userError && !isLoadingUser) {
      toast({
        title: "Authentication Required",
        description: "Please log in to continue",
        variant: "destructive",
      });
      navigate('/login');
    }
  }, [userError, isLoadingUser, navigate, toast]);

  // CRITICAL FIX: Redirect to onboarding if not completed
  // IMPORTANT: Only redirect if we have stable, non-fetching data
  useEffect(() => {
    // Wait until user data is loaded AND not currently refetching
    if (!isLoadingUser && !isFetchingUser && currentUser) {
      console.log('[CHAT] User data loaded, checking onboarding status:', {
        onboardingCompleted: currentUser.onboardingCompleted,
        isFetching: isFetchingUser,
        isLoading: isLoadingUser
      });
      
      if (!currentUser.onboardingCompleted) {
        console.log('[CHAT] User has not completed onboarding, redirecting to /onboarding');
        navigate('/onboarding');
      } else {
        console.log('[CHAT] User has completed onboarding, staying on /chat');
      }
    }
  }, [currentUser, isLoadingUser, isFetchingUser, navigate]);

  // Load chat history into messages when available (fallback if cache wasn't hit by useLayoutEffect)
  // This handles the case where data fetches fresh from the API
  useEffect(() => {
    // Skip if context already has messages or history was already loaded
    if (messages.length > 0 || historyLoaded) return;
    
    if (chatHistory?.messages && chatHistory.messages.length > 0) {
      // DEDUPLICATION: Track seen message IDs to prevent duplicates
      const seenIds = new Set<string>();
      const loadedMessages: Message[] = chatHistory.messages
        .filter((msg: any) => {
          const msgId = String(msg.id);
          if (seenIds.has(msgId)) {
            console.warn('[CHAT] Skipping duplicate message ID from history:', msgId);
            return false;
          }
          seenIds.add(msgId);
          return true;
        })
        .map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.createdAt, // Keep as ISO string for consistent serialization
        }));
      
      console.log('[CHAT] Loading', loadedMessages.length, 'messages from API response (deduplicated from', chatHistory.messages.length, ')');
      setMessages(loadedMessages);
      setHistoryLoaded(true);
    }
  }, [chatHistory, messages.length, historyLoaded, setMessages, setHistoryLoaded]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Rotating loading messages for better UX
  useEffect(() => {
    if (!isTyping) {
      setLoadingMessage("Analyzing your training");
      return;
    }

    const messages = [
      "Analyzing your training",
      "Reviewing your patterns",
      "Finding relevant techniques",
      "Crafting response"
    ];
    
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % messages.length;
      setLoadingMessage(messages[index]);
    }, 2000); // Rotate every 2 seconds

    return () => clearInterval(interval);
  }, [isTyping]);

  // Streaming message handler (SSE for instant first-token delivery)
  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;
    
    // Haptic feedback on send
    triggerHaptic('light');
    
    const messageText = inputValue.trim();
    setInputValue("");
    
    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date().toISOString(), // Use ISO string for consistent serialization
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    
    // Create placeholder assistant message for streaming
    const assistantMessageId = Date.now().toString() + '-assistant';
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(), // Use ISO string for consistent serialization
    };
    
    setMessages(prev => [...prev, assistantMessage]);
    
    try {
      // Call Claude streaming endpoint with SSE
      const response = await fetch('/api/ai/chat/claude/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: messageText,
          userId,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      // Read SSE stream with proper buffering for partial events
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let streamedContent = '';
      let buffer = ''; // Buffer for partial SSE events across chunks
      let isDone = false;
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // Decode chunk and add to buffer
          buffer += decoder.decode(value, { stream: true });
          
          // Process complete SSE events (ending with \n\n or single \n)
          const events = buffer.split('\n');
          
          // Keep the last partial line in the buffer
          buffer = events.pop() || '';
          
          for (const line of events) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              
              if (data === '[DONE]') {
                isDone = true;
                setIsTyping(false);
                break;
              }
              
              try {
                const parsed = JSON.parse(data);
                
                // Handle error responses from server (e.g., Claude refused, safety filter)
                if (parsed.error) {
                  console.error('[SSE] Server error:', parsed.error);
                  streamedContent = "I had trouble with that message. This can happen when certain words trigger safety filters, even in normal BJJ context. Could you try rephrasing? For example, instead of 'I got destroyed,' you could say 'I struggled against mount.'";
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId
                      ? { ...msg, content: streamedContent }
                      : msg
                  ));
                  setIsTyping(false);
                  isDone = true;
                  break;
                }
                
                // Handle both 'chunk' (from streaming) and 'content' (legacy)
                if (parsed.chunk || parsed.content) {
                  const content = parsed.chunk || parsed.content;
                  streamedContent += content;
                  
                  // Update assistant message with streamed content in real-time
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId
                      ? { ...msg, content: streamedContent }
                      : msg
                  ));
                } else if (parsed.processedContent) {
                  // Server sent post-processed content with full video tokens
                  // IMPORTANT: This REPLACES the content, not appends - it's the enriched version
                  console.log('[VIDEO TOKENS] ✅ Received processed content with video tokens (REPLACING, not appending)');
                  streamedContent = parsed.processedContent;
                  setMessages(prev => prev.map(msg => 
                    msg.id === assistantMessageId
                      ? { ...msg, content: parsed.processedContent }
                      : msg
                  ));
                } else if (parsed.done) {
                  // Completion signal - just metadata, don't add any content
                  console.log('[SSE] ✅ Stream complete. Metadata:', parsed.metadata);
                }
              } catch (e) {
                // Ignore JSON parse errors for partial chunks
                console.debug('[SSE] Skipping unparseable data:', data.substring(0, 50));
              }
            }
          }
          
          // Exit loop if done signal received
          if (isDone) break;
        }
      }
      
      setIsTyping(false);
      
      // CRITICAL FIX: Invalidate chat history query so it refetches on next mount
      // This ensures messages persist when navigating away and back to /chat
      console.log('[CHAT] Message sent successfully, invalidating chat history cache');
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history', userId] });
    } catch (error: any) {
      setIsTyping(false);
      
      // Remove placeholder assistant message on error
      setMessages(prev => prev.filter(msg => msg.id !== assistantMessageId));
      
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Save video mutation - uses same endpoint as library page
  const saveVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      console.log('[CHAT SAVE] Attempting to save video:', { videoId, userId });
      triggerHaptic('light');
      return await apiRequest('POST', '/api/ai/saved-videos', {
        videoId,
        userId,
      });
    },
    onSuccess: (_, videoId) => {
      console.log('[CHAT SAVE] Successfully saved video:', videoId);
      triggerHaptic('success');
      setSavedVideoIds(prev => new Set([...Array.from(prev), videoId]));
      toast({
        title: "Saved",
        description: "Video added to your library",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', userId] });
    },
    onError: (error: any, videoId) => {
      console.error('[CHAT SAVE] Failed to save video:', { videoId, error: error.message || error });
      toast({
        title: "Error",
        description: error.message || "Failed to save video",
        variant: "destructive",
      });
    },
  });

  // Unsave video mutation - uses same endpoint as library page
  const unsaveVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      console.log('[CHAT UNSAVE] Attempting to unsave video:', { videoId, userId });
      return await apiRequest('DELETE', `/api/ai/saved-videos/${videoId}`, {
        userId,
      });
    },
    onSuccess: (_, videoId) => {
      console.log('[CHAT UNSAVE] Successfully unsaved video:', videoId);
      setSavedVideoIds(prev => {
        const newArr = Array.from(prev);
        return new Set(newArr.filter(id => id !== videoId));
      });
      toast({
        title: "Removed",
        description: "Video removed from your library",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', userId] });
    },
    onError: (error: any, videoId) => {
      console.error('[CHAT UNSAVE] Failed to unsave video:', { videoId, error: error.message || error });
      toast({
        title: "Error",
        description: error.message || "Failed to remove video",
        variant: "destructive",
      });
    },
  });

  const toggleSaveVideo = (videoId: number) => {
    console.log('[CHAT TOGGLE SAVE] Toggle save for video:', { videoId, isSaved: savedVideoIds.has(videoId), userId });
    if (savedVideoIds.has(videoId)) {
      unsaveVideoMutation.mutate(videoId);
    } else {
      saveVideoMutation.mutate(videoId);
    }
  };

  // Pull-to-refresh handler - reload chat history
  const handleRefresh = async () => {
    if (userId) {
      await queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history', userId] });
    }
  };

  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <IOSSpinner size="lg" className="text-purple-400" />
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <UserLayout>
      <div className="h-full bg-[#0A0A0B] flex flex-col overflow-hidden">
      {/* Header - Sticky at top */}
      <header 
        className="sticky top-0 z-100 bg-[#0A0A0B] border-b border-[#1A1A1C]"
        style={{ height: '80px' }}
        data-testid="chat-header"
      >
        <div className="h-full flex flex-col items-center justify-center px-6">
          <h1 className="text-[20px] md:text-[24px] font-bold text-white tracking-tight">
            Prof. OS
          </h1>
          <p className="text-[13px] md:text-[14px] text-white/70 text-center leading-relaxed mt-1" style={{ letterSpacing: '0.02em' }}>
            Learns your game.<br className="md:hidden" /> Makes you better.
          </p>
        </div>
      </header>

      {/* Main Content Area - Extra padding on mobile for input + nav bar */}
      <main className="flex-1 overflow-y-auto pb-48 md:pb-32" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Welcome Message (shown when no messages) */}
        {!hasMessages && (
          <div className="flex items-center justify-center min-h-full px-5 py-20">
            <div 
              className="bg-[#0A0A0B] border border-[#1A1A1C] rounded-xl p-10 md:p-16 max-w-[600px] w-full text-center"
              style={{ 
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
              data-testid="welcome-message"
            >
              {/* Prof. OS Title */}
              <h2 className="text-[24px] md:text-[28px] font-medium text-white mb-8" style={{ letterSpacing: '0.02em' }}>
                Prof. OS
              </h2>

              {/* Capability Statements */}
              <div className="space-y-6 mb-10">
                <p className="text-[15px] md:text-[16px] text-white/90 leading-relaxed" style={{ letterSpacing: '0.02em' }}>
                  I've analyzed 10,000+<br />
                  videos from elite<br />
                  instructors.
                </p>
                
                <p className="text-[15px] md:text-[16px] text-white/90 leading-relaxed" style={{ letterSpacing: '0.02em' }}>
                  I track patterns in<br />
                  your training you<br />
                  can't see.
                </p>
                
                <p className="text-[15px] md:text-[16px] text-white/90 leading-relaxed" style={{ letterSpacing: '0.02em' }}>
                  I remember every<br />
                  detail you share.
                </p>
              </div>

              {/* Relationship Statement */}
              <p className="text-[15px] md:text-[16px] text-white/85 leading-relaxed mb-16" style={{ letterSpacing: '0.02em' }}>
                The more we talk,<br />
                the smarter I get<br />
                about YOUR jiu jitsu.
              </p>

              {/* CTA Question */}
              <p className="text-[16px] md:text-[18px] font-medium text-white" style={{ letterSpacing: '0.02em' }}>
                What did you work<br />
                on today?
              </p>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {hasMessages && (
          <div className="max-w-[600px] mx-auto px-5 py-6 space-y-2">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-[#2563EB] text-white rounded-tr-sm chat-message-sent'
                      : 'bg-[#111113] text-white/90 rounded-tl-sm chat-message-streaming'
                  }`}
                  style={{ fontSize: '15px', lineHeight: '1.5' }}
                >
                  {/* Parse and render message content with video recommendations */}
                  {parseVideoTokens(message.content).map((segment, idx) => (
                    <div key={idx}>
                      {segment.text && <p className="whitespace-pre-wrap">{segment.text}</p>}
                      {segment.video && (
                        <div 
                          className="mt-3 bg-[#0A0A0B] border border-[#1A1A1C] rounded-lg overflow-hidden"
                          data-testid={`video-card-${segment.video.id}`}
                        >
                          {/* Thumbnail with robust fallback chain */}
                          <ThumbnailImage
                            videoId={segment.video.videoId}
                            title={segment.video.title}
                            className="bg-[#1A1A1C]"
                          />
                          
                          {/* Content */}
                          <div className="p-3 space-y-2">
                            <h4 className="text-[14px] font-semibold text-white/90">
                              {segment.video.title}
                            </h4>
                            <p className="text-[12px] text-[#2563EB]">
                              {segment.video.instructor}
                            </p>
                            <div className="flex items-center gap-2 pt-2">
                              <Button
                                size="sm"
                                className="h-9 bg-[#2563EB] hover:bg-[#1d4ed8] text-white rounded-full"
                                onClick={() => setCurrentVideo({ 
                                  videoId: segment.video!.videoId, 
                                  title: segment.video!.title, 
                                  instructor: segment.video!.instructor,
                                  startTimeSeconds: segment.video!.startTimeSeconds || 0
                                })}
                                data-testid={`button-watch-${segment.video.id}`}
                              >
                                {segment.video!.startTimeSeconds && segment.video!.startTimeSeconds > 0 
                                  ? `Watch @ ${Math.floor(segment.video!.startTimeSeconds / 60)}:${String(segment.video!.startTimeSeconds % 60).padStart(2, '0')}` 
                                  : 'Watch'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-9 w-9 p-0"
                                onClick={() => toggleSaveVideo(segment.video!.id)}
                                data-testid={`button-save-${segment.video.id}`}
                              >
                                {savedVideoIds.has(segment.video.id) ? (
                                  <BookmarkCheck className="h-4 w-4 text-[#2563EB]" />
                                ) : (
                                  <Bookmark className="h-4 w-4 text-white/50" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  
                  {/* Timestamp */}
                  <div className="text-[12px] text-white/50 mt-2">
                    {new Date(message.timestamp).toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Enhanced typing indicator with rotating messages */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#111113] text-white/90 rounded-2xl rounded-tl-sm px-4 py-3 chat-thinking-indicator">
                  <div className="flex items-start gap-3">
                    <div className="flex gap-1 mt-1">
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </div>
                    <div className="text-[14px] text-white/70">
                      {loadingMessage}...
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area - Fixed above bottom navigation on mobile */}
      <div 
        className="fixed left-0 right-0 z-50 bg-[#0A0A0B] border-t border-[#1A1A1C] px-4 pb-4 md:bottom-0 bottom-16"
        style={{ 
          paddingTop: '16px',
          paddingBottom: 'calc(16px + env(safe-area-inset-bottom))'
        }}
        data-testid="chat-input-area"
      >
        <div className="max-w-[600px] mx-auto space-y-3">
          {/* Input Field */}
          <div className="relative">
            <textarea
              ref={input => input && (input.style.fontSize = '16px')} // Prevent iOS zoom
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask Prof. OS..."
              className="w-full bg-[#111113] border border-[#333333] rounded-3xl px-5 py-3 pr-14 text-white placeholder:text-white/60 resize-none focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent"
              style={{ 
                fontSize: '16px', // Prevent iOS zoom
                minHeight: '48px',
                maxHeight: '120px',
              }}
              rows={1}
              data-testid="input-message"
            />
            
            {/* Voice Button (inside input, right side) */}
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-white/70 hover:text-white transition-colors rounded-full"
              data-testid="button-voice"
            >
              <Mic className="w-5 h-5" />
            </button>
          </div>

          {/* Send Button */}
          <Button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="w-full h-12 bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-medium rounded-3xl text-[16px]"
            data-testid="button-send"
          >
            Send
          </Button>
        </div>
      </div>
      </div>

      {/* Video Player Modal */}
      {currentVideo && (
        <VideoPlayer
          videoId={currentVideo.videoId}
          title={currentVideo.title}
          instructor={currentVideo.instructor}
          startTime={currentVideo.startTimeSeconds || 0}
          onClose={() => setCurrentVideo(null)}
        />
      )}
    </UserLayout>
  );
}
