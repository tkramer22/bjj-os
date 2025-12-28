import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send, Sparkles, Copy, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AdminLayout } from "./dashboard";
import { queryClient } from "@/lib/queryClient";
import { adminApiRequest } from "@/lib/adminApi";
import "./chat.css";

interface Message {
  id: number;
  userId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType: string;
  isRead: boolean;
  metadata: any;
  createdAt: string;
}

const quickTestPrompts = [
  "How many users signed up today?",
  "What's the current MRR?",
  "How many videos were added this week?",
  "What's the trial conversion rate?",
  "Are there any curation jobs running?",
  "Show me today's key metrics",
];

export default function AdminChat() {
  const [inputValue, setInputValue] = useState("");
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  // Load chat history (48 hours)
  const { data: historyData, isLoading: historyLoading } = useQuery<{ messages: Message[] }>({
    queryKey: ['/api/admin/dev-os/history'],
    refetchInterval: 5000, // Poll for new messages every 5 seconds
  });

  const messages = historyData?.messages || [];
  
  // Log history data when it changes
  useEffect(() => {
    console.log('🔷 [FRONTEND] History data updated:', {
      messageCount: messages.length,
      isLoading: historyLoading
    });
    
    if (messages.length > 0) {
      const lastThree = messages.slice(-3);
      console.log('🔷 [FRONTEND] Last 3 messages:');
      lastThree.forEach((msg, idx) => {
        console.log(`  ${idx + 1}. Role: ${msg.role}, Content length: ${msg.content?.length || 0}, Content: ${msg.content?.substring(0, 100) || '[EMPTY]'}`);
      });
    }
  }, [messages, historyLoading]);

  // Send message mutation for Dev OS
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      console.log('🔷 [FRONTEND] Sending message to Dev OS:', message);
      const response = await adminApiRequest('/api/admin/dev-os/chat', 'POST', { message });
      console.log('🔷 [FRONTEND] Response received:', response);
      console.log('🔷 [FRONTEND] Response keys:', Object.keys(response || {}));
      console.log('🔷 [FRONTEND] Response.response field:', response?.response);
      console.log('🔷 [FRONTEND] Response.response length:', response?.response?.length);
      return response;
    },
    onSuccess: async (data) => {
      console.log('🔷 [FRONTEND] Mutation success, data:', data);
      // Invalidate history to reload messages from database
      console.log('🔷 [FRONTEND] Invalidating history query...');
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/dev-os/history'] });
      console.log('🔷 [FRONTEND] History query invalidated');
    },
    onError: (error) => {
      console.error('🔷 [FRONTEND] Mutation error:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Clear chat history
  const clearChatMutation = useMutation({
    mutationFn: async () => {
      return adminApiRequest('/api/admin/dev-os/clear-history', 'POST', {});
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/dev-os/history'] });
      toast({
        title: "Chat Cleared",
        description: "Your chat history has been cleared",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear history",
        variant: "destructive",
      });
    },
  });

  // Generate daily report
  const dailyReportMutation = useMutation({
    mutationFn: async () => {
      return adminApiRequest('/api/admin/dev-os/daily-report', 'GET', undefined);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/dev-os/history'] });
      toast({
        title: "Daily Report Generated",
        description: "Check the chat for your daily report",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate daily report",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (messageOverride?: string) => {
    const messageToSend = String(messageOverride || inputValue);
    if (!messageToSend.trim()) return;

    setInputValue("");
    sendMessageMutation.mutate(messageToSend);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyMessage = (message: Message) => {
    navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId(null), 2000);
    toast({
      title: "Copied",
      description: "Message copied to clipboard",
    });
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputValue]);

  return (
    <AdminLayout>
      <div className="admin-chat-container">
        {/* Header - Responsive */}
        <div className="chat-page-header">
          <div className="chat-header-title">
            <h2>Dev OS</h2>
          </div>
          <div className="chat-header-actions">
            <Button
              variant="outline"
              onClick={() => dailyReportMutation.mutate()}
              disabled={dailyReportMutation.isPending}
              className="chat-action-btn"
              data-testid="button-daily-report"
            >
              <FileText className="w-4 h-4 btn-icon" />
              <span className="btn-label">Daily Report</span>
            </Button>
            <Button
              variant="outline"
              onClick={() => clearChatMutation.mutate()}
              disabled={messages.length === 0 || clearChatMutation.isPending}
              className="chat-action-btn"
              data-testid="button-clear-chat"
            >
              <span className="btn-icon">🗑️</span>
              <span className="btn-label">Clear History</span>
            </Button>
          </div>
        </div>

        {/* Quick Prompts - Responsive Grid */}
        <Card className="quick-prompts-section p-4">
          <h3 className="quick-prompts-title">Quick Prompts</h3>
          <div className="quick-prompts-grid">
            {quickTestPrompts.map((prompt, index) => (
              <Badge
                key={index}
                variant="outline"
                className="quick-prompt-badge cursor-pointer hover-elevate active-elevate-2"
                onClick={() => handleSendMessage(prompt)}
                data-testid={`quick-prompt-${index}`}
              >
                {prompt}
              </Badge>
            ))}
          </div>
        </Card>

        {/* Chat Messages - Responsive Container */}
        <div className="chat-messages-wrapper">
          <div className="chat-messages-list">
            {historyLoading && (
              <div className="chat-loading">
                Loading chat history...
              </div>
            )}

            {!historyLoading && messages.length === 0 && (
              <div className="chat-empty">
                <div className="chat-empty-icon">
                  <Sparkles />
                </div>
                <p className="text-lg font-medium">Start chatting with Dev OS</p>
                <p className="chat-empty-text">Try one of the quick prompts above or type your own message</p>
                <p className="text-xs mt-2 opacity-60">Messages persist for 48 hours</p>
              </div>
            )}

            {messages.map((message: Message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg p-4 relative group ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : message.messageType === 'report'
                      ? 'bg-accent border-2 border-primary'
                      : 'bg-muted'
                  }`}
                  data-testid={`message-${message.role}`}
                >
                  {/* Copy button */}
                  <button
                    onClick={() => handleCopyMessage(message)}
                    className={`absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity ${
                      message.role === 'user' 
                        ? 'hover:bg-primary-foreground/20' 
                        : 'hover:bg-muted-foreground/20'
                    }`}
                    data-testid={`button-copy-${message.id}`}
                  >
                    {copiedMessageId === message.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>

                  {/* Report badge */}
                  {message.messageType === 'report' && (
                    <Badge variant="secondary" className="mb-2">
                      <FileText className="w-3 h-3 mr-1" />
                      Daily Report
                    </Badge>
                  )}

                  <p className="whitespace-pre-wrap pr-8">{message.content}</p>
                  <p className="text-xs mt-2 opacity-70">
                    {new Date(message.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}

            {sendMessageMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Responsive */}
          <div className="chat-input-wrapper">
            <div className="chat-input-form">
              <div className="chat-textarea-wrapper">
                <Textarea
                  ref={textareaRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask about BJJ OS metrics, system health, or business data..."
                  className="chat-textarea"
                  rows={1}
                  data-testid="input-message"
                />
              </div>
              <Button
                onClick={() => handleSendMessage()}
                disabled={!inputValue.trim() || sendMessageMutation.isPending}
                className="chat-send-btn"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
