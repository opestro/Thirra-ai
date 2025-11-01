# Frontend Integration Examples

Complete, copy-paste ready examples for integrating the Thirra AI streaming API.

## React + TypeScript (Modern)

```typescript
// hooks/useChat.ts
import { useState, useCallback } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string[];
  toolCalls?: Array<{name: string; args: any}>;
  imageUrls?: string[];
  timestamp: Date;
}

interface UseChatOptions {
  apiUrl?: string;
  onError?: (error: Error) => void;
}

export function useChat(options: UseChatOptions = {}) {
  const { 
    apiUrl = '/api/chat/stream',
    onError 
  } = options;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReasoning, setIsReasoning] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const sendMessage = useCallback(async (prompt: string) => {
    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: prompt,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMessage]);
    setIsStreaming(true);

    // Prepare assistant message
    let assistantMessage: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    };

    try {
      const token = localStorage.getItem('pb_auth');
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt,
          conversationId,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const event = JSON.parse(line);

            switch (event.type) {
              case 'init':
                setConversationId(event.conversation.id);
                break;

              case 'reasoning':
                if (event.status === 'start') {
                  setIsReasoning(true);
                  assistantMessage.reasoning = [];
                } else if (event.status === 'thinking') {
                  assistantMessage.reasoning?.push(event.content);
                } else if (event.status === 'complete') {
                  setIsReasoning(false);
                }
                break;

              case 'chunk':
                assistantMessage.content += event.text;
                updateLastMessage(assistantMessage);
                break;

              case 'tool_calls':
                assistantMessage.toolCalls = event.tools;
                updateLastMessage(assistantMessage);
                break;

              case 'tool_results':
                handleToolResults(event.results, assistantMessage);
                break;

              case 'final':
                // Stream complete
                break;

              case 'error':
                throw new Error(event.message);
            }
          } catch (parseError) {
            console.error('Parse error:', parseError, 'Line:', line);
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      onError?.(error as Error);
    } finally {
      setIsStreaming(false);
      setIsReasoning(false);
    }
  }, [conversationId, apiUrl, onError]);

  function updateLastMessage(message: ChatMessage) {
    setMessages(prev => {
      const newMessages = [...prev];
      const lastMsg = newMessages[newMessages.length - 1];
      
      if (lastMsg?.role === 'assistant') {
        newMessages[newMessages.length - 1] = { ...message };
      } else {
        newMessages.push({ ...message });
      }
      
      return newMessages;
    });
  }

  function handleToolResults(results: any[], message: ChatMessage) {
    results.forEach(result => {
      if (result.tool === 'generate_image' && result.success && result.data.taskId) {
        // Start polling for image
        pollImageGeneration(result.data.taskId, message);
      }
    });
    updateLastMessage(message);
  }

  async function pollImageGeneration(taskId: string, message: ChatMessage) {
    const maxAttempts = 60; // 2 minutes
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) return;
      attempts++;

      try {
        const response = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
        const data = await response.json();

        if (data.data.state === 'success') {
          const result = JSON.parse(data.data.resultJson);
          message.imageUrls = result.resultUrls;
          message.content += `\n\n![Generated Image](${result.resultUrls[0]})`;
          updateLastMessage(message);
        } else if (data.data.state === 'fail') {
          console.error('Image generation failed:', data.data.failMsg);
        } else {
          // Still processing, check again
          setTimeout(poll, 2000);
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    };

    poll();
  }

  const clearMessages = useCallback(() => {
    setMessages([]);
    setConversationId(null);
  }, []);

  return {
    messages,
    isStreaming,
    isReasoning,
    sendMessage,
    clearMessages,
  };
}
```

```tsx
// components/ChatInterface.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';

export function ChatInterface() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const { messages, isStreaming, isReasoning, sendMessage } = useChat({
    onError: (error) => {
      alert(`Error: ${error.message}`);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;
    
    sendMessage(input);
    setInput('');
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-content">
              {msg.content}
              
              {msg.reasoning && msg.reasoning.length > 0 && (
                <details className="reasoning">
                  <summary>🧠 View Reasoning</summary>
                  <ul>
                    {msg.reasoning.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </details>
              )}
              
              {msg.toolCalls && (
                <div className="tool-calls">
                  🛠️ Tools used: {msg.toolCalls.map(tc => tc.name).join(', ')}
                </div>
              )}
              
              {msg.imageUrls && msg.imageUrls.map((url, i) => (
                <img key={i} src={url} alt="Generated" className="generated-image" />
              ))}
            </div>
            
            <div className="timestamp">
              {msg.timestamp.toLocaleTimeString()}
            </div>
          </div>
        ))}
        
        {isReasoning && (
          <div className="reasoning-indicator">
            🧠 AI is thinking...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message... (try: generate an image)"
          disabled={isStreaming}
        />
        <button type="submit" disabled={isStreaming || !input.trim()}>
          {isStreaming ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

## Next.js App Router (Server Actions + Client)

```typescript
// app/actions/chat.ts
'use server';

export async function streamChat(prompt: string, conversationId?: string) {
  const token = /* Get from session/cookies */;
  
  const response = await fetch('http://localhost:4000/api/chat/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, conversationId }),
  });

  return response.body;
}
```

```typescript
// app/components/Chat.tsx
'use client';

import { useState } from 'react';
import { streamChat } from '../actions/chat';

export function Chat() {
  const [messages, setMessages] = useState<Array<{role: string; content: string}>>([]);
  const [input, setInput] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setMessages(prev => [...prev, { role: 'user', content: input }]);
    
    const stream = await streamChat(input);
    const reader = stream?.getReader();
    const decoder = new TextDecoder();
    
    let assistantMessage = '';
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n').filter(Boolean);
      
      for (const line of lines) {
        const event = JSON.parse(line);
        
        if (event.type === 'chunk') {
          assistantMessage += event.text;
          setMessages(prev => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].content = assistantMessage;
            return newMsgs;
          });
        }
      }
    }

    setInput('');
  }

  return (
    <div>
      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role}>
            {msg.content}
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={e => setInput(e.target.value)} />
        <button>Send</button>
      </form>
    </div>
  );
}
```

## Plain HTML + JavaScript (No Framework)

```html
<!DOCTYPE html>
<html>
<head>
  <title>Thirra AI Chat</title>
  <style>
    body { font-family: system-ui; max-width: 800px; margin: 40px auto; }
    .messages { height: 500px; overflow-y: auto; border: 1px solid #ccc; padding: 20px; }
    .message { margin: 10px 0; padding: 10px; border-radius: 8px; }
    .user { background: #e3f2fd; }
    .assistant { background: #f5f5f5; }
    .reasoning { color: #666; font-size: 0.9em; margin-top: 10px; }
    .tool-call { background: #fff3cd; padding: 5px; margin: 5px 0; border-radius: 4px; }
    #input { width: 70%; padding: 10px; margin-top: 20px; }
    button { padding: 10px 20px; }
  </style>
</head>
<body>
  <h1>Thirra AI Chat</h1>
  
  <div class="messages" id="messages"></div>
  
  <div>
    <input type="text" id="input" placeholder="Type your message...">
    <button onclick="sendMessage()">Send</button>
  </div>

  <script>
    const messagesDiv = document.getElementById('messages');
    const inputEl = document.getElementById('input');
    const authToken = localStorage.getItem('pb_auth');

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = `message ${role}`;
      div.textContent = content;
      messagesDiv.appendChild(div);
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
      return div;
    }

    async function sendMessage() {
      const prompt = inputEl.value.trim();
      if (!prompt) return;

      addMessage('user', prompt);
      const assistantDiv = addMessage('assistant', '');
      inputEl.value = '';

      try {
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ prompt }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let assistantText = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.trim()) continue;

            const event = JSON.parse(line);

            switch (event.type) {
              case 'chunk':
                assistantText += event.text;
                assistantDiv.textContent = assistantText;
                break;

              case 'tool_calls':
                const toolDiv = document.createElement('div');
                toolDiv.className = 'tool-call';
                toolDiv.textContent = `🛠️ Using: ${event.tools[0].name}`;
                assistantDiv.appendChild(toolDiv);
                break;

              case 'tool_results':
                event.results.forEach(result => {
                  if (result.tool === 'generate_image' && result.success) {
                    pollImageStatus(result.data.taskId, assistantDiv);
                  }
                });
                break;

              case 'reasoning':
                if (event.status === 'thinking') {
                  const reasoningDiv = document.createElement('div');
                  reasoningDiv.className = 'reasoning';
                  reasoningDiv.textContent = `🧠 ${event.content}`;
                  assistantDiv.appendChild(reasoningDiv);
                }
                break;
            }
          }
        }
      } catch (error) {
        assistantDiv.textContent = `Error: ${error.message}`;
        assistantDiv.style.color = 'red';
      }
    }

    async function pollImageStatus(taskId, parentDiv) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/webhooks/nanobanana/status/${taskId}`);
          const data = await response.json();

          if (data.data.state === 'success') {
            clearInterval(interval);
            const result = JSON.parse(data.data.resultJson);
            const img = document.createElement('img');
            img.src = result.resultUrls[0];
            img.style.maxWidth = '100%';
            img.style.marginTop = '10px';
            parentDiv.appendChild(img);
          } else if (data.data.state === 'fail') {
            clearInterval(interval);
            const errorDiv = document.createElement('div');
            errorDiv.style.color = 'red';
            errorDiv.textContent = 'Image generation failed';
            parentDiv.appendChild(errorDiv);
          }
        } catch (error) {
          clearInterval(interval);
        }
      }, 2000);

      setTimeout(() => clearInterval(interval), 120000);
    }

    inputEl.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>
```

## Vue 3 + Pinia Store

```typescript
// stores/chat.ts
import { defineStore } from 'pinia';

export const useChatStore = defineStore('chat', {
  state: () => ({
    messages: [],
    isStreaming: false,
    isReasoning: false,
    conversationId: null,
  }),

  actions: {
    async sendMessage(prompt: string) {
      this.messages.push({ role: 'user', content: prompt });
      this.isStreaming = true;

      try {
        const token = localStorage.getItem('pb_auth');
        const response = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            prompt,
            conversationId: this.conversationId,
          }),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        this.messages.push({ role: 'assistant', content: '' });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const lines = decoder.decode(value).split('\n').filter(Boolean);
          
          for (const line of lines) {
            const event = JSON.parse(line);
            const lastMsg = this.messages[this.messages.length - 1];

            switch (event.type) {
              case 'init':
                this.conversationId = event.conversation.id;
                break;

              case 'chunk':
                lastMsg.content += event.text;
                break;

              case 'reasoning':
                this.isReasoning = event.status !== 'complete';
                break;

              case 'tool_calls':
                lastMsg.toolCalls = event.tools;
                break;
            }
          }
        }
      } finally {
        this.isStreaming = false;
        this.isReasoning = false;
      }
    },
  },
});
```

These examples are ready to use! Just:
1. Replace auth token logic with your implementation
2. Adjust API URLs if needed
3. Style according to your design system

