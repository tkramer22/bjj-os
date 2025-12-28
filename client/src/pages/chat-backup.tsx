import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mic, Send, Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
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
function parseVideoTokens(content?: string): { text: string; video?: { id: number; title: string; instructor: string; duration: string; videoId: string } }[] {
  // Guard against undefined/null content
  if (!content) {
    return [{ text: '' }];
  }
  
  const segments: { text: string; video?: { id: number; title: string; instructor: string; duration: string; videoId: string } }[] = [];
  const videoRegex = /\[VIDEO:\s*([^\]]+)\]/g;
  
  let lastIndex = 0;
  let match;
  
  while ((match = videoRegex.exec(content)) !== null) {
    // Add text before the video token
    if (match.index > lastIndex) {
      segments.push({ text: content.slice(lastIndex, match.index) });
    }
    
    // Parse video data from token
    const videoData = match[1].split('|').map(s => s.trim());
    if (videoData.length >= 5) {
      segments.push({
        text: '',
        video: {
          title: videoData[0],
          instructor: videoData[1],
          duration: videoData[2],
          videoId: videoData[3],
          id: parseInt(videoData[4], 10)
        }
      });
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [savedVideoIds, setSavedVideoIds] = useState<Set<number>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Fetch authenticated user
  const { data: currentUser, isLoading: isLoadingUser, error: userError, isFetching: isFetchingUser } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  const userId = currentUser?.id?.toString() || '';

  // Fetch chat history
  const { data: chatHistory } = useQuery<{ messages: any[] }>({
    queryKey: ['/api/ai/chat/history', userId],
    enabled: !!userId,
  });

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

  // Load chat history into messages
  useEffect(() => {
    if (chatHistory?.messages && chatHistory.messages.length > 0) {
      const loadedMessages: Message[] = chatHistory.messages.map((msg: any) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.createdAt),
      }));
      setMessages(loadedMessages);
    }
  }, [chatHistory]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText: string) => {
      return await apiRequest('POST', '/api/ai/chat/message', {
        message: messageText,
        userId,
      });
    },
    onSuccess: (data: any) => {
      setIsTyping(false);
      
      // Add assistant message
      const assistantMessage: Message = {
        id: Date.now().toString() + '-assistant',
        role: 'assistant',
        content: data.content || '',
        timestamp: new Date(),
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      
      // Invalidate chat history to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history', userId] });
    },
    onError: (error: any) => {
      setIsTyping(false);
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;
    
    const messageText = inputValue.trim();
    setInputValue("");
    
    // Add user message immediately
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);
    
    // Send to API
    sendMessageMutation.mutate(messageText);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Save video mutation
  const saveVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      return await apiRequest('POST', '/api/ai/save-video', {
        videoId,
        userId,
      });
    },
    onSuccess: (_, videoId) => {
      setSavedVideoIds(prev => new Set([...Array.from(prev), videoId]));
      toast({
        title: "Saved",
        description: "Video added to your library",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ai/saved-videos', userId] });
    },
  });

  const unsaveVideoMutation = useMutation({
    mutationFn: async (videoId: number) => {
      return await apiRequest('DELETE', `/api/ai/save-video/${videoId}`, {
        userId,
      });
    },
    onSuccess: (_, videoId) => {
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
  });

  const toggleSaveVideo = (videoId: number) => {
    if (savedVideoIds.has(videoId)) {
      unsaveVideoMutation.mutate(videoId);
    } else {
      saveVideoMutation.mutate(videoId);
    }
  };

  if (isLoadingUser) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center">
        <div className="text-white/70 text-sm">Loading...</div>
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="min-h-screen bg-[#0A0A0B] flex flex-col">
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-32" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                      ? 'bg-[#2563EB] text-white rounded-tr-sm'
                      : 'bg-[#111113] text-white/90 rounded-tl-sm'
                  }`}
                  style={{ fontSize: '15px', lineHeight: '1.5' }}
                >
                  {/* Parse and render message content with video recommendations */}
                  {parseVideoTokens(message.content).map((segment, idx) => (
                    <div key={idx}>
                      {segment.text && <p className="whitespace-pre-wrap">{segment.text}</p>}
                      {segment.video && (
                        <div 
                          className="mt-3 bg-[#0A0A0B] border border-[#1A1A1C] rounded-lg p-3 space-y-2"
                          data-testid={`video-card-${segment.video.id}`}
                        >
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
                              onClick={() => window.open(`https://youtube.com/watch?v=${segment.video!.videoId}`, '_blank')}
                              data-testid={`button-watch-${segment.video.id}`}
                            >
                              Watch
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
                      )}
                    </div>
                  ))}
                  
                  {/* Timestamp */}
                  <div className="text-[12px] text-white/50 mt-2">
                    {message.timestamp.toLocaleTimeString('en-US', { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })}
                  </div>
                </div>
              </div>
            ))}
            
            {/* Typing indicator */}
            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-[#111113] text-white/90 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </main>

      {/* Input Area - Fixed at bottom */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-[1000] bg-[#0A0A0B] border-t border-[#1A1A1C] px-4 pb-4"
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
  );
}
