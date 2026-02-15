import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mic, Send, Brain, MoreVertical, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getApiUrl } from "@/lib/capacitorAuth";
import AdaptiveLayout from "@/components/adaptive-layout";
import { reviewManager } from "@/services/reviewManager";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AuthUser {
  id: number;
  email?: string;
  name?: string;
  username?: string;
  beltLevel?: string;
  onboardingCompleted: boolean;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Fetch authenticated user
  const { data: currentUser, isLoading: isLoadingUser } = useQuery<AuthUser>({
    queryKey: ['/api/auth/me'],
  });

  const userId = currentUser?.id?.toString() || '';

  // Fetch chat history
  const { data: chatHistory } = useQuery<{ messages: any[] }>({
    queryKey: ['/api/ai/chat/history', userId],
    enabled: !!userId,
  });

  // Load chat history into messages
  useEffect(() => {
    if (chatHistory?.messages) {
      const loadedMessages: Message[] = chatHistory.messages.map((msg: any) => ({
        id: msg.id || String(Date.now() + Math.random()),
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content || '',
        timestamp: new Date(msg.createdAt || Date.now()),
      }));
      setMessages(loadedMessages);
    }
  }, [chatHistory]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Streaming message handler (SSE for instant first-token delivery)
  const handleSendMessage = async () => {
    if (!inputValue.trim() || !userId || isTyping) return;

    const messageText = inputValue.trim();
    setInputValue("");
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Add user message immediately
    const userMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    // Create placeholder assistant message for streaming
    const assistantMessageId = String(Date.now()) + '-assistant';
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      // Call Claude streaming endpoint with SSE
      const response = await fetch(getApiUrl('/api/ai/chat/claude/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
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
                if (parsed.chunk || parsed.content) {
                  const content = parsed.chunk || parsed.content;
                  streamedContent += content;

                  // Update assistant message with streamed content in real-time
                  setMessages(prev => prev.map(msg =>
                    msg.id === assistantMessageId
                      ? { ...msg, content: streamedContent }
                      : msg
                  ));
                }
              } catch (e) {
                // Ignore JSON parse errors for partial chunks
              }
            }
          }

          // Exit loop if done signal received
          if (isDone) break;
        }
      }

      setIsTyping(false);
      queryClient.invalidateQueries({ queryKey: ['/api/ai/chat/history', userId] });
      
      reviewManager.trackMessageSent();
      reviewManager.maybeRequestReview().catch(console.error);

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

  const handleVoiceInput = () => {
    if (!isRecording) {
      // Start recording
      setIsRecording(true);
      toast({
        title: "Voice input",
        description: "Voice recording coming soon!",
      });
      // TODO: Implement Whisper API integration
      setTimeout(() => setIsRecording(false), 2000);
    } else {
      // Stop recording
      setIsRecording(false);
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  return (
    <AdaptiveLayout>
      <div className="chat-page">
        {/* Header */}
        <header className="chat-header">
          <div className="header-content">
            <button 
              onClick={() => navigate('/dashboard')} 
              className="back-button"
              data-testid="button-back"
              aria-label="Back to dashboard"
            >
              <ArrowLeft className="back-icon" />
            </button>
            <div className="header-title">
              <Brain className="header-icon" />
              <div>
                <h1 className="title">Prof. OS</h1>
                <p className="tagline">Learns your game. Makes you better.</p>
              </div>
            </div>
            <button className="menu-button" data-testid="button-menu">
              <MoreVertical className="menu-icon" />
            </button>
          </div>
        </header>

        {/* Chat Messages */}
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="intro-message">
              <div className="intro-icon">
                <Brain />
              </div>
              <h2 className="intro-title">Welcome to Prof. OS</h2>
              <div className="intro-text">
                <p>I've analyzed 10,000+ hours of world-class BJJ instruction.</p>
                <p>I track patterns you can't see in your training.</p>
                <p>I remember every detail about your game.</p>
                <p>The more we talk, the smarter I get about <strong>YOUR</strong> jiu jitsu.</p>
              </div>
              <p className="intro-cta">What would you like to work on today?</p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.role}`}
                  data-testid={`message-${message.role}`}
                >
                  {message.role === 'assistant' && (
                    <div className="message-avatar">
                      <Brain className="avatar-icon" />
                    </div>
                  )}
                  <div className="message-content">
                    <p className="message-text">{message.content}</p>
                    <span className="message-time">
                      {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="message assistant typing">
                  <div className="message-avatar">
                    <Brain className="avatar-icon" />
                  </div>
                  <div className="message-content">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="chat-input-area">
          <div className="input-container">
            <textarea
              ref={textareaRef}
              value={inputValue}
              onChange={handleInput}
              onKeyPress={handleKeyPress}
              placeholder="Ask Prof. OS..."
              className="chat-input"
              rows={1}
              data-testid="input-message"
            />
            <button
              onClick={handleVoiceInput}
              className={`voice-button ${isRecording ? 'recording' : ''}`}
              data-testid="button-voice"
            >
              <Mic className="voice-icon" />
              {isRecording && <div className="recording-pulse" />}
            </button>
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isTyping}
              className="send-button"
              data-testid="button-send"
            >
              <Send className="send-icon" />
            </button>
          </div>
        </div>

        <style>{`
          /* ==================== CHAT PAGE ==================== */
          .chat-page {
            display: flex;
            flex-direction: column;
            height: 100vh;
            background: #000;
            color: #fff;
          }

          /* ==================== HEADER ==================== */
          .chat-header {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 64px;
            border-bottom: 1px solid #27272A;
            background: #000000;
            z-index: 50;
            flex-shrink: 0;
          }

          @media (min-width: 768px) {
            .chat-header {
              height: 72px;
            }
          }

          .header-content {
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 16px;
          }

          .header-title {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .header-icon {
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
            padding: 6px;
            border-radius: 8px;
          }

          .title {
            font-size: 18px;
            font-weight: 700;
            margin: 0;
            line-height: 1;
          }

          @media (min-width: 768px) {
            .title {
              font-size: 24px;
            }
          }

          .tagline {
            font-size: 12px;
            color: #71717A;
            margin: 4px 0 0 0;
          }

          @media (min-width: 768px) {
            .tagline {
              font-size: 14px;
            }
          }

          .back-button {
            width: 44px;
            height: 44px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            cursor: pointer;
            border-radius: 8px;
            margin-right: 8px;
            transition: all 0.2s ease;
          }

          .back-button:hover {
            background: rgba(255, 255, 255, 0.1);
          }

          .back-button:active {
            transform: scale(0.95);
          }

          .back-icon {
            width: 24px;
            height: 24px;
            color: #fff;
          }

          .menu-button {
            width: 36px;
            height: 36px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            cursor: pointer;
            border-radius: 8px;
          }

          @media (min-width: 768px) {
            .menu-button {
              display: none;
            }
          }

          .menu-button:hover {
            background: rgba(255, 255, 255, 0.05);
          }

          .menu-icon {
            width: 20px;
            height: 20px;
            color: #71717A;
          }

          /* ==================== MESSAGES ==================== */
          .chat-messages {
            flex: 1;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 16px;
            padding-top: 80px;
            background: #000;
          }

          @media (min-width: 768px) {
            .chat-messages {
              padding: 24px;
              padding-top: 96px;
              max-width: 900px;
              margin: 0 auto;
              width: 100%;
            }
          }

          /* ==================== INTRO MESSAGE ==================== */
          .intro-message {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 48px 24px;
            min-height: 400px;
            animation: fadeIn 600ms ease;
          }

          .intro-icon {
            width: 80px;
            height: 80px;
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 24px;
          }

          .intro-icon svg {
            width: 48px;
            height: 48px;
          }

          .intro-title {
            font-size: 28px;
            font-weight: 700;
            margin: 0 0 24px 0;
          }

          .intro-text {
            max-width: 600px;
            color: #A0A0A0;
            line-height: 1.8;
            margin-bottom: 24px;
          }

          .intro-text p {
            margin: 8px 0;
          }

          .intro-text strong {
            color: #fff;
          }

          .intro-cta {
            font-size: 16px;
            color: #fff;
            font-weight: 500;
          }

          /* ==================== CHAT BUBBLES ==================== */
          .message {
            display: flex;
            gap: 12px;
            margin-bottom: 16px;
            animation: fadeIn 300ms ease;
          }

          .message.user {
            flex-direction: row-reverse;
          }

          .message-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }

          .avatar-icon {
            width: 20px;
            height: 20px;
          }

          .message-content {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 16px;
            background: #0F0F0F;
          }

          @media (min-width: 768px) {
            .message-content {
              max-width: 70%;
              padding: 14px 18px;
            }
          }

          .message.user .message-content {
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
          }

          .message-text {
            margin: 0;
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
          }

          .message-time {
            display: block;
            font-size: 11px;
            color: #71717A;
            margin-top: 6px;
          }

          /* ==================== TYPING INDICATOR ==================== */
          .typing-indicator {
            display: flex;
            gap: 6px;
            padding: 4px 0;
          }

          .typing-indicator span {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #71717A;
            animation: typing 1.4s infinite;
          }

          .typing-indicator span:nth-child(2) {
            animation-delay: 0.2s;
          }

          .typing-indicator span:nth-child(3) {
            animation-delay: 0.4s;
          }

          @keyframes typing {
            0%, 60%, 100% {
              transform: translateY(0);
              opacity: 0.4;
            }
            30% {
              transform: translateY(-8px);
              opacity: 1;
            }
          }

          /* ==================== INPUT AREA ==================== */
          .chat-input-area {
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            background: #000;
            border-top: 1px solid rgba(255, 255, 255, 0.1);
            flex-shrink: 0;
          }

          @media (min-width: 768px) {
            .chat-input-area {
              padding: 16px 24px;
              max-width: 900px;
              margin: 0 auto;
              width: 100%;
            }
          }

          .input-container {
            display: flex;
            align-items: flex-end;
            gap: 8px;
            background: #0F0F0F;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            padding: 8px 12px;
          }

          @media (min-width: 768px) {
            .input-container {
              padding: 10px 16px;
            }
          }

          .chat-input {
            flex: 1;
            background: transparent;
            border: none;
            outline: none;
            color: #fff;
            font-size: 15px;
            resize: none;
            max-height: 120px;
            overflow-y: auto;
            font-family: inherit;
            line-height: 1.5;
            padding: 4px 0;
          }

          @media (min-width: 768px) {
            .chat-input {
              font-size: 16px;
            }
          }

          .chat-input::placeholder {
            color: #71717A;
          }

          .voice-button,
          .send-button {
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 50%;
            cursor: pointer;
            transition: all 150ms ease;
            position: relative;
          }

          @media (min-width: 768px) {
            .voice-button,
            .send-button {
              width: 40px;
              height: 40px;
            }
          }

          .voice-button {
            background: transparent;
          }

          .voice-button:hover {
            background: rgba(255, 255, 255, 0.05);
          }

          .voice-button.recording {
            background: rgba(239, 68, 68, 0.1);
          }

          .voice-icon {
            width: 18px;
            height: 18px;
            color: #71717A;
          }

          .voice-button.recording .voice-icon {
            color: #EF4444;
          }

          .recording-pulse {
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.3);
            animation: pulse 1.5s infinite;
          }

          @keyframes pulse {
            0%, 100% {
              transform: scale(1);
              opacity: 0.7;
            }
            50% {
              transform: scale(1.3);
              opacity: 0;
            }
          }

          .send-button {
            background: linear-gradient(135deg, #2563EB 0%, #7C3AED 100%);
          }

          .send-button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }

          .send-button:not(:disabled):hover {
            transform: scale(1.05);
          }

          .send-icon {
            width: 18px;
            height: 18px;
          }

          /* ==================== ANIMATIONS ==================== */
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}</style>
      </div>
    </AdaptiveLayout>
  );
}
