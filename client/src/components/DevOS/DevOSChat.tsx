import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";

interface DevOSMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export default function DevOSChat() {
  const [inputMessage, setInputMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Load message history
  const { data: historyData, isLoading } = useQuery<{ success: boolean; messages: DevOSMessage[] }>({
    queryKey: ['/api/admin/dev-os/messages'],
    staleTime: Infinity,
    refetchOnWindowFocus: false
  });

  const messages = historyData?.messages || [];

  // Send message mutation
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      console.log('🔵 [FRONTEND] Sending Dev OS message:', message);
      
      const response = await apiRequest<{ 
        success: boolean; 
        response: string; 
        actionsExecuted?: any[];
        systemData?: any;
      }>('/api/admin/dev-os/chat', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      
      console.log('✅ [FRONTEND] Dev OS response received:', {
        success: response.success,
        responseLength: response.response?.length,
        actionsExecuted: response.actionsExecuted?.length || 0
      });
      
      return response;
    },
    onMutate: async (message) => {
      // Optimistically append user message
      await queryClient.cancelQueries({ queryKey: ['/api/admin/dev-os/messages'] });
      
      const previousMessages = queryClient.getQueryData<{ success: boolean; messages: DevOSMessage[] }>(['/api/admin/dev-os/messages']);
      
      queryClient.setQueryData<{ success: boolean; messages: DevOSMessage[] }>(['/api/admin/dev-os/messages'], (old) => {
        if (!old) return { success: true, messages: [{
          id: 'temp-' + Date.now(),
          role: 'user',
          content: message,
          createdAt: new Date().toISOString()
        }] };
        
        return {
          ...old,
          messages: [...old.messages, {
            id: 'temp-' + Date.now(),
            role: 'user',
            content: message,
            createdAt: new Date().toISOString()
          }]
        };
      });

      return { previousMessages };
    },
    onSuccess: () => {
      console.log('✅ [FRONTEND] Streaming complete');
      // Refetch to get persisted messages from DB
      queryClient.invalidateQueries({ queryKey: ['/api/admin/dev-os/messages'] });
      setInputMessage('');
    },
    onError: (error, variables, context) => {
      console.error('❌ [FRONTEND] Mutation error handler:', error);
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['/api/admin/dev-os/messages'], context.previousMessages);
      }
    }
  });

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || sendMessageMutation.isPending) return;
    sendMessageMutation.mutate(inputMessage.trim());
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (isLoading) {
    return (
      <div className="dev-os-chat-container">
        <div className="chat-loading">Loading Dev OS...</div>
      </div>
    );
  }

  return (
    <div className="dev-os-chat-container">
      {/* Messages Area */}
      <div className="chat-messages" data-testid="devos-chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="empty-icon">🤖</div>
            <h3>Dev OS Intelligence</h3>
            <p>Ask me about system status, metrics, or run actions</p>
            <div className="example-queries">
              <button 
                onClick={() => setInputMessage("Give me a system status")}
                className="example-chip"
                data-testid="example-query-status"
              >
                System Status
              </button>
              <button 
                onClick={() => setInputMessage("How many active users today?")}
                className="example-chip"
                data-testid="example-query-users"
              >
                Active Users
              </button>
              <button 
                onClick={() => setInputMessage("What's our MRR?")}
                className="example-chip"
                data-testid="example-query-mrr"
              >
                MRR
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`chat-message ${msg.role}`}
              data-testid={`message-${msg.role}`}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? '👤' : '🤖'}
              </div>
              <div className="message-content">
                <div className="message-text">{msg.content}</div>
                <div className="message-time">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))
        )}
        
        {/* Typing Indicator */}
        {sendMessageMutation.isPending && (
          <div className="chat-message assistant typing" data-testid="typing-indicator">
            <div className="message-avatar">🤖</div>
            <div className="message-content">
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area">
        <div className="chat-input-container">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask Dev OS..."
            className="chat-input"
            rows={1}
            disabled={sendMessageMutation.isPending}
            data-testid="input-devos-message"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || sendMessageMutation.isPending}
            className="chat-send-button"
            data-testid="button-send-devos-message"
          >
            {sendMessageMutation.isPending ? '⏳' : '▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
