import React, { useState, useRef, useEffect } from 'react';
import { Send, Trash2, User } from 'lucide-react';
import { ChatMessage, AppView } from '../../types';
import { INITIAL_AI_CHAT_MESSAGES } from '../../data/mockData';
import { SmilingCloudMascot3D } from '../common/PastelIllustrations';

interface AssistantViewProps {
  onNavigate: (view: AppView) => void;
  externalPrompt?: string;
  onClearExternalPrompt?: () => void;
}

export const AssistantView: React.FC<AssistantViewProps> = ({
  externalPrompt,
  onClearExternalPrompt,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_AI_CHAT_MESSAGES);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedQuestions = [
    'Explain Python functions.',
    'Create a study plan for me.',
    'Give me a practice quiz.',
    'Help me understand my weak areas.',
    'Recommend resources for my career goal.',
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  useEffect(() => {
    if (externalPrompt) {
      handleSendPrompt(externalPrompt);
      if (onClearExternalPrompt) onClearExternalPrompt();
    }
  }, [externalPrompt]);

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim()) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    setTimeout(() => {
      let replyText = '';
      let snippet: string | undefined = undefined;
      let lang: string | undefined = undefined;

      const lower = promptText.toLowerCase();

      if (lower.includes('functions') || lower.includes('function')) {
        replyText =
          "In Python, functions are first-class citizens. That means you can pass them as arguments, return them from other functions, and assign them to variables.\n\nKey Concepts:\n1. Parameters vs Arguments: Default arguments are evaluated at definition time (avoid mutable defaults!).\n2. Arbitrary arguments: Use `*args` for extra positional items and `**kwargs` for keyword dictionaries.\n3. Lambda Expressions: Anonymous 1-line functions useful with `map()`, `filter()`, and `sorted()`.";
        snippet = `def apply_multiplier(factor):\n    # Returning a closure\n    def multiplier(n):\n        return n * factor\n    return multiplier\n\ndouble = apply_multiplier(2)\nprint(double(10))  # Output: 20`;
        lang = 'python';
      } else if (lower.includes('study plan') || lower.includes('plan')) {
        replyText =
          "Here is your personalized 14-day study plan to complete Stage 3 (Functions & Data Structures):\n\n• Days 1–3: Master function scopes, `*args`, and `**kwargs` with 2 hands-on labs.\n• Days 4–7: Deep dive into Dictionary and Hash Table complexities (O(1) lookups).\n• Days 8–10: Closures and custom Python decorators.\n• Days 11–14: Build the Stage 3 Capstone (TTL In-Memory Cache) and take the 10-question diagnostic.";
      } else if (lower.includes('practice quiz') || lower.includes('quiz') || lower.includes('test')) {
        replyText =
          "Great initiative! You can take our interactive Diagnostic Assessment directly right now with immediate score calculation and strength/weakness analysis.\n\nWould you like to test Python Fundamentals (5 questions) or Data Structures (10 questions)?";
      } else if (lower.includes('weak') || lower.includes('weakness') || lower.includes('improve')) {
        replyText =
          "Based on your recent assessment diagnostics, your main growth opportunity is in Advanced Memory Models and Structural Pattern Matching (`match/case` in Python 3.10+).\n\nActionable Advice:\n1. Review the article on 'Python Memory Management & Garbage Collection'.\n2. Practice writing functions with immutable tuple returns.\n3. Complete the Stage 3 practice unit on collections.";
      } else if (lower.includes('resource') || lower.includes('career goal') || lower.includes('recommend')) {
        replyText =
          "For your goal: 'Become a Python Developer', here are the top 3 recommended milestones:\n\n1. Resource: 'Modern RESTful APIs with FastAPI & Pydantic' (8.5 hours)\n2. Resource: 'PostgreSQL Indexing Strategies & SQLAlchemy 2.0'\n3. Interactive Lab: 'Building a Containerized Job Scheduler API'\n\nYou can access these right in the Explore Resources library.";
      } else {
        replyText = `Thank you for asking about "${promptText}". In your personalized Skillora track, focusing on active recall and writing clean code implementations helps concepts stick twice as fast. Let me know if you'd like code examples, a quick study plan, or practice questions!`;
      }

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: replyText,
        codeSnippet: snippet,
        language: lang,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setIsTyping(false);
    }, 750);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt(inputValue);
    }
  };

  const handleClear = () => {
    setMessages([INITIAL_AI_CHAT_MESSAGES[0]]);
  };

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col pastel-card overflow-hidden animate-in fade-in duration-150">
      {/* Companion Top Header with 3D Cloud Mascot */}
      <div className="px-6 py-4 border-b border-[#EEE6E5] bg-gradient-to-r from-[#FFF1D6]/75 via-[#FAF6F2] to-[#F0E9FA]/80 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-14 h-11 rounded-[16px] bg-[#FFFCFA] border border-[#EEE6E5] flex items-center justify-center shadow-xs shrink-0">
            <SmilingCloudMascot3D className="w-12 h-9" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-extrabold text-[#343047]">
                Skillora AI Study Companion
              </h2>
              <span className="text-[10px] font-bold text-[#6F4FA8] bg-[#F0E9FA] border border-[#DFD2F2] px-2.5 py-0.5 rounded-full">
                Always Friendly
              </span>
            </div>
            <p className="text-[11px] text-[#8B8295]">
              Synced with your Python roadmap and diagnostic insights
            </p>
          </div>
        </div>

        <button
          onClick={handleClear}
          className="clay-button-soft px-3 py-2 text-xs font-bold flex items-center gap-1.5 text-[#8B8295] hover:text-[#343047]"
          title="Clear conversation"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Clear</span>
        </button>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-5 bg-[#FFFCFA]">
        {messages.map((msg) => {
          const isUser = msg.sender === 'user';
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              {/* Avatar */}
              {isUser ? (
                <div className="w-9 h-9 rounded-[14px] clay-squircle-peach text-white flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-[14px] bg-[#FFF1D6] border border-[#F3DFB4] flex items-center justify-center shrink-0 shadow-xs">
                  <SmilingCloudMascot3D className="w-8 h-6" />
                </div>
              )}

              {/* Bubble */}
              <div className="max-w-[82%] sm:max-w-[75%] space-y-1.5">
                <div
                  className={`p-4 rounded-[22px] text-xs sm:text-[13px] leading-relaxed whitespace-pre-line ${
                    isUser
                      ? 'bg-[#C9B7E8]/45 text-[#343047] border border-[#DFD2F2] rounded-tr-[6px] shadow-[0_6px_16px_-6px_rgba(167,139,206,0.28)]'
                      : 'bg-[#FAF6F2] text-[#343047] border border-[#EEE6E5] rounded-tl-[6px] shadow-[0_6px_16px_-6px_rgba(124,102,148,0.12)]'
                  }`}
                >
                  {msg.text}

                  {msg.codeSnippet && (
                    <div className="mt-3 p-3.5 rounded-[14px] bg-[#343047] text-[#F7F3FB] text-xs font-mono overflow-x-auto">
                      <pre>{msg.codeSnippet}</pre>
                    </div>
                  )}
                </div>

                <div
                  className={`flex items-center gap-2 text-[10px] text-[#8B8295] px-1 ${
                    isUser ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <span>{msg.timestamp}</span>
                </div>
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-[14px] bg-[#FFF1D6] border border-[#F3DFB4] flex items-center justify-center shrink-0">
              <SmilingCloudMascot3D className="w-8 h-6" />
            </div>
            <div className="p-3.5 px-4 rounded-[20px] bg-[#FAF6F2] border border-[#EEE6E5] text-[#6B6178] text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C9B7E8] animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-[#F8D9D0] animate-bounce delay-100" />
              <span className="w-2 h-2 rounded-full bg-[#A9D5B3] animate-bounce delay-200" />
              <span className="text-[11px] font-medium ml-1">Thinking through your question...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompt Cards */}
      <div className="px-6 py-2.5 border-t border-[#EEE6E5] bg-[#FAF6F2]/75">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-[11px] font-bold text-[#8B8295] shrink-0">Try asking:</span>
          {suggestedQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSendPrompt(q)}
              className="px-3 py-1.5 rounded-full bg-[#FFFCFA] border border-[#EEE6E5] hover:border-[#C9B7E8] hover:bg-[#F0E9FA]/60 text-[#343047] text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 shadow-2xs"
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* Clean Input Composer */}
      <div className="p-4 px-6 border-t border-[#EEE6E5] bg-[#FFFCFA]">
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about Python, algorithms, study plans, or weak areas..."
            className="flex-1 py-3 pl-5 pr-14 text-xs bg-[#FAF6F2] border border-[#EEE6E5] rounded-full focus:bg-[#FFFCFA] focus:outline-none focus:ring-2 focus:ring-[#C9B7E8] transition-all text-[#343047] placeholder:text-[#A49BB0]"
          />
          <button
            onClick={() => handleSendPrompt(inputValue)}
            disabled={!inputValue.trim()}
            className="absolute right-1.5 w-9 h-9 rounded-full clay-button-primary flex items-center justify-center disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[#8B8295] px-2">
          <span>Press Enter to send · Interactive prototype companion</span>
          <span className="font-mono">Gemini-ready</span>
        </div>
      </div>
    </div>
  );
};
