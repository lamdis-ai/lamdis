import React from 'react';
import AiLoader from './AiLoader';

export interface ChatMessage { role: 'user' | 'assistant' | 'system' | 'thinking'; content: string; }

interface ChatUIProps {
  messages: ChatMessage[];
  loading?: boolean;
  placeholder?: string;
  input: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  variant?: 'dark' | 'light';
}

export const ChatUI: React.FC<ChatUIProps> = ({ messages, loading, placeholder = 'Type a message', input, onChange, onSend, disabled, onKeyDown, className, variant = 'dark' }) => {
  const dark = variant === 'dark';
  // Default key handler: Enter submits, Shift+Enter ignored (no newline in input). Respects external onKeyDown.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (onKeyDown) onKeyDown(e);
    if (e.defaultPrevented) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && input.trim()) onSend();
    }
  };
  const containerCls = dark
    ? 'space-y-3 min-h-[280px] border border-slate-700/60 rounded p-4 bg-slate-900/60 backdrop-blur text-slate-100 overflow-y-auto overflow-x-hidden scroll-dark'
    : 'space-y-3 min-h-[280px] border rounded p-4 bg-white text-slate-900 overflow-y-auto overflow-x-hidden';
  const assistantBubble = dark
    ? 'bg-slate-800/70 border border-slate-600/60 text-slate-100'
    : 'bg-slate-100 border border-slate-300 text-slate-900';
  const thinkingBubble = dark
    ? 'bg-slate-800/50 text-slate-400 border border-slate-600/50 text-xs'
    : 'bg-slate-200 text-slate-600 border border-slate-300 text-xs';
  const systemBubble = dark ? 'bg-slate-800/60 text-slate-300' : 'bg-slate-100 text-slate-700';
  const inputCls = dark
    ? 'flex-1 rounded px-3 py-2 text-sm bg-slate-900/70 border border-slate-700/60 placeholder-slate-500 text-slate-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-500'
    : 'flex-1 rounded px-3 py-2 text-sm bg-white border border-slate-300 placeholder-slate-400 text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/40 focus:border-fuchsia-400';
  const sendBtn = dark
    ? 'px-4 py-2 rounded bg-gradient-to-r from-fuchsia-600 to-sky-600 text-white border border-fuchsia-500/30 hover:brightness-110 disabled:opacity-50'
    : 'px-4 py-2 rounded bg-slate-900 text-white border border-slate-900 hover:bg-black disabled:opacity-50';
  return (
    <div className={className || ''}>
      <div className={containerCls}>
        {messages.length === 0 && !loading && (
          <div className={dark ? 'text-sm text-slate-400' : 'text-sm text-slate-500'}>Ask something that uses your actions.</div>
        )}
        {messages.map((m, i) => {
          const base = 'inline-block px-3 py-2 rounded max-w-[80%] text-sm whitespace-pre-wrap break-words';
          let cls = '';
          if (m.role === 'user') cls = 'bg-gradient-to-br from-fuchsia-600 to-sky-500 text-white shadow';
          else if (m.role === 'assistant') cls = assistantBubble;
          else if (m.role === 'thinking') cls = thinkingBubble;
          else cls = systemBubble;
          return (
            <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
              <span className={base + ' ' + cls}>{m.content}</span>
            </div>
          );
        })}
        {loading && (
          <div className="text-left">
            <AiLoader variant={dark ? 'dark' : 'light'} />
          </div>
        )}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={inputCls}
        />
        <button
          onClick={onSend}
          disabled={disabled || !input.trim()}
          className={sendBtn}
        >
          Send
        </button>
      </div>
    </div>
  );
};

export default ChatUI;
