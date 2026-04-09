"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useOrg } from "@/lib/orgContext";
import Button from "@/components/base/Button";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  structured?: any;
  operations?: any[];
  toolCalls?: any[];
  toolResults?: any[];
}

interface AssistantChatProps {
  className?: string;
  onApply?: (operations: any[]) => void;
}

/**
 * Format tool name for display
 */
function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    list_environments: 'List Environments',
    list_suites: 'List Suites',
    list_tests: 'List Tests',
    list_actions: 'List Actions',
    list_setups: 'List Setups',
    run_test: 'Run Test',
    run_suite: 'Run Suite',
    run_action: 'Run Action',
    get_run_results: 'Get Results',
    get_test_details: 'Get Test Details',
  };
  return names[tool] || tool.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Render tool result in a nice format
 */
function renderToolResult(tool: string, result: any): React.ReactNode {
  if (!result) return null;

  // Handle list results
  if (result.count !== undefined) {
    const items = result.environments || result.suites || result.tests || result.actions || result.setups || [];
    
    if (items.length === 0) {
      return (
        <div className="text-slate-400 text-xs italic">No items found</div>
      );
    }

    return (
      <div className="space-y-1">
        <div className="text-[10px] text-slate-500 mb-1">{result.count} item{result.count !== 1 ? 's' : ''} found</div>
        <div className="max-h-32 overflow-y-auto space-y-1">
          {items.slice(0, 10).map((item: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400/50" />
              <span className="text-slate-200 font-medium truncate">{item.name || item.key || item.id}</span>
              {item.channel && <span className="text-[10px] text-slate-500">({item.channel})</span>}
              {item.stepCount !== undefined && <span className="text-[10px] text-slate-500">{item.stepCount} steps</span>}
            </div>
          ))}
          {items.length > 10 && (
            <div className="text-[10px] text-slate-500">+ {items.length - 10} more...</div>
          )}
        </div>
      </div>
    );
  }

  // Handle run results
  if (result.status) {
    return (
      <div className="flex items-center gap-2">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
          result.status === 'queued' ? 'bg-amber-500/20 text-amber-300' :
          result.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' :
          'bg-slate-700 text-slate-300'
        }`}>
          {result.status}
        </span>
        {result.message && <span className="text-xs text-slate-300">{result.message}</span>}
      </div>
    );
  }

  // Handle test details
  if (result.steps && Array.isArray(result.steps)) {
    return (
      <div className="space-y-1">
        <div className="text-xs text-slate-200 font-medium">{result.name}</div>
        <div className="text-[10px] text-slate-500">{result.steps.length} steps</div>
      </div>
    );
  }

  // Fallback: JSON preview
  return (
    <pre className="text-[10px] font-mono text-slate-400 overflow-x-auto max-h-24">
      {JSON.stringify(result, null, 2).slice(0, 200)}
    </pre>
  );
}

/**
 * Simple markdown renderer with theme-cohesive styling
 */
function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  const rendered = useMemo(() => {
    if (!content) return null;

    // Process the content line by line for better control
    const lines = content.split('\n');
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLanguage = '';
    let listItems: { level: number; content: string; ordered: boolean }[] = [];

    const flushList = () => {
      if (listItems.length === 0) return null;
      
      const items = listItems.map((item, i) => (
        <li key={i} className="flex items-start gap-2 ml-1">
          <span className="text-fuchsia-400 mt-0.5 flex-shrink-0">
            {item.ordered ? `${i + 1}.` : '•'}
          </span>
          <span>{parseInlineMarkdown(item.content)}</span>
        </li>
      ));
      
      listItems = [];
      return (
        <ul className="space-y-1.5 my-2">
          {items}
        </ul>
      );
    };

    const parseInlineMarkdown = (text: string): React.ReactNode => {
      // Handle inline code, bold, italic, and links
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let key = 0;

      while (remaining.length > 0) {
        // Inline code (backticks)
        const codeMatch = remaining.match(/^`([^`]+)`/);
        if (codeMatch) {
          parts.push(
            <code
              key={key++}
              className="px-1.5 py-0.5 rounded bg-slate-900/80 text-fuchsia-300 font-mono text-[11px] border border-slate-700/50"
            >
              {codeMatch[1]}
            </code>
          );
          remaining = remaining.slice(codeMatch[0].length);
          continue;
        }

        // Bold with asterisks
        const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          parts.push(
            <strong key={key++} className="font-semibold text-white">
              {boldMatch[1]}
            </strong>
          );
          remaining = remaining.slice(boldMatch[0].length);
          continue;
        }

        // Italic with asterisks
        const italicMatch = remaining.match(/^\*([^*]+)\*/);
        if (italicMatch) {
          parts.push(
            <em key={key++} className="italic text-slate-200">
              {italicMatch[1]}
            </em>
          );
          remaining = remaining.slice(italicMatch[0].length);
          continue;
        }

        // Links
        const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          parts.push(
            <a
              key={key++}
              href={linkMatch[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2"
            >
              {linkMatch[1]}
            </a>
          );
          remaining = remaining.slice(linkMatch[0].length);
          continue;
        }

        // Regular text - take up to the next special character
        const nextSpecial = remaining.search(/[`*\[]/);
        if (nextSpecial === -1) {
          parts.push(remaining);
          break;
        } else if (nextSpecial === 0) {
          // Special char didn't match any pattern, treat as text
          parts.push(remaining[0]);
          remaining = remaining.slice(1);
        } else {
          parts.push(remaining.slice(0, nextSpecial));
          remaining = remaining.slice(nextSpecial);
        }
      }

      return parts.length === 1 ? parts[0] : <>{parts}</>;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code block start/end
      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          const flushedList = flushList();
          if (flushedList) elements.push(flushedList);
          
          inCodeBlock = true;
          codeLanguage = line.slice(3).trim();
          codeContent = [];
        } else {
          inCodeBlock = false;
          elements.push(
            <div key={`code-${i}`} className="my-3 rounded-lg overflow-hidden border border-slate-700/50">
              {codeLanguage && (
                <div className="px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">
                    {codeLanguage}
                  </span>
                </div>
              )}
              <pre className="p-3 bg-slate-900/80 overflow-x-auto">
                <code className="text-[12px] font-mono text-slate-200 leading-relaxed">
                  {codeContent.join('\n')}
                </code>
              </pre>
            </div>
          );
          codeContent = [];
          codeLanguage = '';
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      // Headers
      const h3Match = line.match(/^### (.+)/);
      if (h3Match) {
        const flushedList = flushList();
        if (flushedList) elements.push(flushedList);
        
        elements.push(
          <h3 key={`h3-${i}`} className="text-sm font-semibold text-white mt-4 mb-2 flex items-center gap-2">
            <span className="w-1 h-4 bg-fuchsia-500 rounded-full"></span>
            {parseInlineMarkdown(h3Match[1])}
          </h3>
        );
        continue;
      }

      const h2Match = line.match(/^## (.+)/);
      if (h2Match) {
        const flushedList = flushList();
        if (flushedList) elements.push(flushedList);
        
        elements.push(
          <h2 key={`h2-${i}`} className="text-base font-semibold text-white mt-4 mb-2 pb-1 border-b border-slate-700/50">
            {parseInlineMarkdown(h2Match[1])}
          </h2>
        );
        continue;
      }

      const h1Match = line.match(/^# (.+)/);
      if (h1Match) {
        const flushedList = flushList();
        if (flushedList) elements.push(flushedList);
        
        elements.push(
          <h1 key={`h1-${i}`} className="text-lg font-bold text-white mt-4 mb-3 pb-2 border-b border-slate-700/50">
            {parseInlineMarkdown(h1Match[1])}
          </h1>
        );
        continue;
      }

      // Unordered list items
      const ulMatch = line.match(/^(\s*)[-*] (.+)/);
      if (ulMatch) {
        const level = Math.floor(ulMatch[1].length / 2);
        listItems.push({ level, content: ulMatch[2], ordered: false });
        continue;
      }

      // Ordered list items
      const olMatch = line.match(/^(\s*)\d+\. (.+)/);
      if (olMatch) {
        const level = Math.floor(olMatch[1].length / 2);
        listItems.push({ level, content: olMatch[2], ordered: true });
        continue;
      }

      // If we hit a non-list line, flush any pending list
      const flushedList = flushList();
      if (flushedList) elements.push(flushedList);

      // Horizontal rule
      if (line.match(/^---+$/)) {
        elements.push(
          <hr key={`hr-${i}`} className="my-4 border-slate-700/50" />
        );
        continue;
      }

      // Blockquote
      if (line.startsWith('> ')) {
        elements.push(
          <blockquote
            key={`quote-${i}`}
            className="my-2 pl-3 border-l-2 border-fuchsia-500/50 text-slate-300 italic"
          >
            {parseInlineMarkdown(line.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Empty line
      if (line.trim() === '') {
        // Only add spacing if there are previous elements
        if (elements.length > 0) {
          elements.push(<div key={`space-${i}`} className="h-2" />);
        }
        continue;
      }

      // Regular paragraph
      elements.push(
        <p key={`p-${i}`} className="leading-relaxed">
          {parseInlineMarkdown(line)}
        </p>
      );
    }

    // Flush any remaining list items
    const finalList = flushList();
    if (finalList) elements.push(finalList);

    return elements;
  }, [content]);

  return (
    <div className={`prose-sm ${isUser ? 'text-white' : 'text-slate-100'}`}>
      {rendered}
    </div>
  );
}

export default function AssistantChat({ className = "", onApply }: AssistantChatProps) {
  const { currentOrg } = useOrg();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOperations, setPendingOperations] = useState<any[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || loading || !currentOrg) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/orgs/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: currentOrg,
          message: userMessage.content,
          history,
          mode: "lamdis",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to get response");
      }

      // Strip any XML-like tags from the response content
      let cleanContent = data.response || data.reply || "";
      cleanContent = cleanContent.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '');
      cleanContent = cleanContent.replace(/<invoke[\s\S]*?<\/invoke>/g, '');
      cleanContent = cleanContent.trim();

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: cleanContent,
        timestamp: new Date(),
        structured: data.structured,
        operations: data.structured?.operations,
        toolCalls: data.structured?.tool_calls,
        toolResults: data.structured?.tool_results,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // If there are operations, set them as pending for user approval
      if (data.structured?.operations?.length > 0) {
        setPendingOperations(data.structured.operations);
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyOperations = async () => {
    if (!pendingOperations?.length || !currentOrg) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/orgs/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: currentOrg,
          operations: pendingOperations,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to apply operations");
      }

      // Add a system message about the applied operations
      const resultMessage: Message = {
        id: `system-${Date.now()}`,
        role: "assistant",
        content: data.success
          ? `✅ Successfully applied ${data.results.filter((r: any) => r.success).length} operations.`
          : `⚠️ Applied ${data.results.filter((r: any) => r.success).length} of ${data.results.length} operations. Some failed.`,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, resultMessage]);
      setPendingOperations(null);

      // Notify parent if callback provided
      onApply?.(pendingOperations);
    } catch (err: any) {
      setError(err?.message || "Failed to apply operations");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const renderMessage = (message: Message) => {
    const isUser = message.role === "user";

    return (
      <div
        key={message.id}
        className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
      >
        <div
          className={`max-w-[85%] rounded-xl ${
            isUser
              ? "bg-gradient-to-br from-fuchsia-600/30 to-violet-600/20 border border-fuchsia-500/40 px-4 py-3"
              : "bg-slate-800/60 border border-slate-700/50 px-4 py-3"
          }`}
        >
          {/* User avatar or assistant icon */}
          <div className="flex items-start gap-3">
            {!isUser && (
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  className="w-3.5 h-3.5 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
            )}
            
            <div className="flex-1 min-w-0">
              <MarkdownContent content={message.content} isUser={isUser} />

              {/* Show questions from assistant */}
              {message.structured?.questions?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-xs font-medium text-fuchsia-400 uppercase tracking-wide">
                      Questions to clarify
                    </span>
                  </div>
                  <div className="space-y-2">
                    {message.structured.questions.map((q: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-300 bg-slate-900/40 rounded-lg px-3 py-2">
                        <span className="text-fuchsia-400 font-medium">{i + 1}.</span>
                        {q}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Show sensitive data acknowledgement */}
              {message.structured?.sensitive_acknowledged?.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    <div>
                      <span className="text-xs text-amber-300 font-medium">Sensitive data detected and handled securely</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {message.structured.sensitive_acknowledged.map((type: string, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/10 text-amber-200 border border-amber-500/20 font-medium">
                            {type}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Show tool calls (pending or executed) */}
              {((message.toolCalls && message.toolCalls.length > 0) || (message.toolResults && message.toolResults.length > 0)) && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium text-violet-300">
                      Actions Executed
                    </span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
                      {(message.toolResults && message.toolResults.length) || (message.toolCalls && message.toolCalls.length) || 0}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    {(message.toolResults || []).map((result: any, i: number) => (
                      <div key={i} className="rounded-lg overflow-hidden border border-slate-700/50">
                        {/* Tool header */}
                        <div className={`flex items-center gap-2 px-3 py-2 ${
                          result.error 
                            ? "bg-red-500/10 border-b border-red-500/20"
                            : "bg-emerald-500/10 border-b border-emerald-500/20"
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            result.error ? "bg-red-400" : "bg-emerald-400"
                          }`} />
                          <span className="text-xs font-medium text-white">
                            {formatToolName(result.tool)}
                          </span>
                          {result.error && (
                            <span className="text-red-400 text-[10px] ml-auto">{result.error}</span>
                          )}
                          {!result.error && (
                            <span className="text-emerald-400 text-[10px] ml-auto">
                              <svg className="w-3 h-3 inline mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Success
                            </span>
                          )}
                        </div>
                        
                        {/* Tool result */}
                        {result.result && (
                          <div className="px-3 py-2 bg-slate-900/50">
                            {renderToolResult(result.tool, result.result)}
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {/* Show pending tool calls if no results yet */}
                    {message.toolCalls && !message.toolResults && message.toolCalls.map((call: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-amber-300">{formatToolName(call.tool)}</span>
                        <span className="text-[10px] text-slate-500">executing...</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Show operations preview */}
              {message.operations && message.operations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span className="text-xs font-medium text-cyan-400 uppercase tracking-wide">
                      Proposed Operations ({message.operations.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {message.operations.slice(0, 5).map((op: any, i: number) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 text-sm text-slate-300 bg-slate-900/40 rounded-lg px-3 py-2"
                      >
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                            op.action === "create"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : op.action === "update"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-red-500/20 text-red-300"
                          }`}
                        >
                          {op.action}
                        </span>
                        <span className="text-slate-400 text-xs">{op.resource}</span>
                        {op.data?.name && (
                          <span className="text-slate-200 text-xs truncate max-w-[200px] font-medium">
                            "{op.data.name}"
                          </span>
                        )}
                      </div>
                    ))}
                    {message.operations.length > 5 && (
                      <div className="text-xs text-slate-500 pl-3">
                        + {message.operations.length - 5} more operations...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500 mt-3">
                {message.timestamp.toLocaleTimeString()}
              </div>
            </div>

            {isUser && (
              <div className="w-6 h-6 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg
                  className="w-3.5 h-3.5 text-slate-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
            <svg
              className="w-5 h-5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Lamdis Assistant</h3>
            <p className="text-xs text-slate-400">
              AI-powered test builder & configuration helper
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => {
              setMessages([]);
              setPendingOperations(null);
            }}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-slate-800"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900 flex items-center justify-center mb-6 border border-slate-700/50 shadow-xl">
              <svg
                className="w-10 h-10 text-fuchsia-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h4 className="text-base font-semibold text-white mb-2">
              How can I help you today?
            </h4>
            <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">
              I can help you build tests, create suites, set up assertions, manage configurations, and explain how Lamdis works.
            </p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {[
                "Create a test for my chat assistant",
                "Help me set up a compliance suite",
                "Show me my existing tests",
                "Explain how test steps work",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="px-4 py-2 text-xs rounded-lg bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:bg-slate-700/60 hover:border-fuchsia-500/30 hover:text-white transition-all duration-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {loading && (
          <div className="flex justify-start mb-4">
            <div className="bg-slate-800/60 rounded-xl px-4 py-3 border border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center">
                  <svg
                    className="w-3.5 h-3.5 text-white animate-pulse"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce" />
                  <div
                    className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <div
                    className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
                <span className="text-xs text-slate-400">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Pending operations approval */}
      {pendingOperations && pendingOperations.length > 0 && (
        <div className="px-4 py-3 border-t border-slate-800 bg-gradient-to-r from-cyan-500/5 to-fuchsia-500/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <div className="text-sm text-white font-medium">
                  {pendingOperations.length} operation{pendingOperations.length > 1 ? "s" : ""} ready to apply
                </div>
                <div className="text-xs text-slate-400">
                  Review the changes above and confirm to proceed
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setPendingOperations(null)}
                className="text-xs bg-slate-700 hover:bg-slate-600"
              >
                Cancel
              </Button>
              <Button
                onClick={handleApplyOperations}
                className="text-xs bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500"
                disabled={loading}
              >
                {loading ? "Applying..." : "Apply Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div className="flex-1 text-sm text-red-400">{error}</div>
            <button
              onClick={() => setError(null)}
              className="text-red-400/60 hover:text-red-400 p-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me to create tests, explain concepts, or help with configuration..."
            className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50 resize-none min-h-[48px] max-h-[120px] transition-all"
            rows={1}
            disabled={loading}
          />
          <Button
            type="submit"
            disabled={!input.trim() || loading || !currentOrg}
            className="px-4 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </Button>
        </form>
        <div className="text-[10px] text-slate-500 mt-2 text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Enter</kbd> to send · <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Shift+Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
