"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useOrg } from "@/lib/orgContext";
import { useRouter } from "next/navigation";
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
  cards?: ResourceCard[];
  isStreaming?: boolean;
}

interface ResourceCard {
  type: "test" | "suite" | "environment" | "run" | "action" | "setup";
  id: string;
  name: string;
  description?: string;
  status?: "created" | "updated" | "existing" | "running" | "passed" | "failed";
  stepCount?: number;
  passRate?: number;
  href?: string;
}

interface AssistantChatProps {
  className?: string;
  onApply?: (operations: any[]) => void;
  compact?: boolean;
}

/**
 * Format tool name for display
 */
function formatToolName(tool: string): string {
  const names: Record<string, string> = {
    list_environments: "List Environments",
    list_suites: "List Suites",
    list_tests: "List Tests",
    list_actions: "List Actions",
    list_setups: "List Setups",
    run_test: "Run Test",
    run_suite: "Run Suite",
    run_action: "Run Action",
    get_run_results: "Get Results",
    get_test_details: "Get Test Details",
  };
  return names[tool] || tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse resource cards from operations
 */
function parseResourceCards(operations: any[], toolResults: any[]): ResourceCard[] {
  const cards: ResourceCard[] = [];

  // Parse operations (created/updated resources)
  if (operations?.length) {
    for (const op of operations) {
      const card: ResourceCard = {
        type: op.resource?.replace("test_", "") as any,
        id: op.result?.id || op.data?.id || op.op_id,
        name: op.data?.name || op.resource,
        description: op.data?.description,
        status: op.action as any,
        stepCount: op.data?.steps?.length,
      };

      // Set href based on type
      switch (op.resource) {
        case "test":
          card.href = `/dashboard/tests?testId=${card.id}`;
          break;
        case "test_suite":
          card.href = `/dashboard/library/suites/${card.id}`;
          break;
        case "environment":
          card.href = `/dashboard/connections/environments`;
          break;
        case "action":
          card.href = `/dashboard/library/actions`;
          break;
        case "setup":
          card.href = `/dashboard/setups`;
          break;
      }

      cards.push(card);
    }
  }

  // Parse tool results (existing resources found)
  if (toolResults?.length) {
    for (const result of toolResults) {
      if (result.result?.tests?.length) {
        cards.push(
          ...result.result.tests.slice(0, 3).map((t: any) => ({
            type: "test" as const,
            id: t.id,
            name: t.name,
            status: "existing" as const,
            stepCount: t.stepCount,
            href: `/dashboard/tests?testId=${t.id}`,
          }))
        );
      }
      if (result.result?.suites?.length) {
        cards.push(
          ...result.result.suites.slice(0, 3).map((s: any) => ({
            type: "suite" as const,
            id: s.id,
            name: s.name,
            description: s.description,
            status: "existing" as const,
            href: `/dashboard/library/suites/${s.id}`,
          }))
        );
      }
    }
  }

  return cards;
}

/**
 * Resource card component
 */
function ResourceCardComponent({
  card,
  onAction,
}: {
  card: ResourceCard;
  onAction?: (action: string, card: ResourceCard) => void;
}) {
  const router = useRouter();

  const icons: Record<string, React.ReactNode> = {
    test: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    suite: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    environment: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
      </svg>
    ),
    run: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    action: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    setup: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };

  const statusColors: Record<string, string> = {
    created: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    updated: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    existing: "bg-slate-700/50 text-slate-300 border-slate-600/50",
    running: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    passed: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    failed: "bg-red-500/20 text-red-300 border-red-500/30",
  };

  const typeColors: Record<string, string> = {
    test: "from-fuchsia-500/20 to-violet-500/20 border-fuchsia-500/30",
    suite: "from-cyan-500/20 to-blue-500/20 border-cyan-500/30",
    environment: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
    run: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
    action: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
    setup: "from-slate-500/20 to-gray-500/20 border-slate-500/30",
  };

  return (
    <div
      className={`rounded-lg border p-3 bg-gradient-to-br ${typeColors[card.type] || "from-slate-800 to-slate-900 border-slate-700"} hover:border-fuchsia-500/50 transition-all cursor-pointer group`}
      onClick={() => card.href && router.push(card.href)}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0 group-hover:bg-white/20 transition-colors">
          {icons[card.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate">{card.name}</span>
            {card.status && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusColors[card.status]}`}>
                {card.status}
              </span>
            )}
          </div>
          {card.description && (
            <p className="text-xs text-slate-400 mt-0.5 truncate">{card.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2">
            {card.stepCount !== undefined && (
              <span className="text-[10px] text-slate-500">{card.stepCount} steps</span>
            )}
            {card.passRate !== undefined && (
              <span className={`text-[10px] ${card.passRate >= 0.9 ? "text-emerald-400" : card.passRate >= 0.5 ? "text-amber-400" : "text-red-400"}`}>
                {(card.passRate * 100).toFixed(0)}% pass rate
              </span>
            )}
            {card.href && (
              <span className="text-[10px] text-fuchsia-400 group-hover:underline ml-auto">View →</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Quick actions */}
      {(card.type === "test" || card.type === "suite") && card.status !== "running" && (
        <div className="flex gap-2 mt-3 pt-2 border-t border-white/10">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction?.("run", card);
            }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-fuchsia-500/20 text-fuchsia-300 hover:bg-fuchsia-500/30 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            </svg>
            Run
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAction?.("edit", card);
            }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] rounded bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Simple markdown renderer with theme-cohesive styling
 */
function MarkdownContent({ content, isUser }: { content: string; isUser: boolean }) {
  const rendered = useMemo(() => {
    if (!content) return null;

    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeContent: string[] = [];
    let codeLanguage = "";
    let listItems: { level: number; content: string; ordered: boolean }[] = [];

    const flushList = (keyPrefix: string) => {
      if (listItems.length === 0) return null;
      const items = listItems.map((item, i) => (
        <li key={i} className="flex items-start gap-2 ml-1">
          <span className="text-fuchsia-400 mt-0.5 flex-shrink-0">{item.ordered ? `${i + 1}.` : "•"}</span>
          <span>{parseInlineMarkdown(item.content)}</span>
        </li>
      ));
      listItems = [];
      return <ul key={`list-${keyPrefix}`} className="space-y-1.5 my-2">{items}</ul>;
    };

    const parseInlineMarkdown = (text: string): React.ReactNode => {
      const parts: React.ReactNode[] = [];
      let remaining = text;
      let key = 0;

      while (remaining.length > 0) {
        const codeMatch = remaining.match(/^`([^`]+)`/);
        if (codeMatch) {
          parts.push(
            <code key={key++} className="px-1.5 py-0.5 rounded bg-slate-900/80 text-fuchsia-300 font-mono text-[11px] border border-slate-700/50">
              {codeMatch[1]}
            </code>
          );
          remaining = remaining.slice(codeMatch[0].length);
          continue;
        }

        const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
        if (boldMatch) {
          parts.push(<strong key={key++} className="font-semibold text-white">{boldMatch[1]}</strong>);
          remaining = remaining.slice(boldMatch[0].length);
          continue;
        }

        const italicMatch = remaining.match(/^\*([^*]+)\*/);
        if (italicMatch) {
          parts.push(<em key={key++} className="italic text-slate-200">{italicMatch[1]}</em>);
          remaining = remaining.slice(italicMatch[0].length);
          continue;
        }

        const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
        if (linkMatch) {
          parts.push(
            <a key={key++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="text-fuchsia-400 hover:text-fuchsia-300 underline underline-offset-2">
              {linkMatch[1]}
            </a>
          );
          remaining = remaining.slice(linkMatch[0].length);
          continue;
        }

        const nextSpecial = remaining.search(/[`*\[]/);
        if (nextSpecial === -1) {
          parts.push(remaining);
          break;
        } else if (nextSpecial === 0) {
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

      if (line.startsWith("```")) {
        if (!inCodeBlock) {
          const flushedList = flushList(i.toString());
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
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">{codeLanguage}</span>
                </div>
              )}
              <pre className="p-3 bg-slate-900/80 overflow-x-auto">
                <code className="text-[12px] font-mono text-slate-200 leading-relaxed">{codeContent.join("\n")}</code>
              </pre>
            </div>
          );
          codeContent = [];
          codeLanguage = "";
        }
        continue;
      }

      if (inCodeBlock) {
        codeContent.push(line);
        continue;
      }

      const h3Match = line.match(/^### (.+)/);
      if (h3Match) {
        const flushedList = flushList(i.toString());
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
        const flushedList = flushList(i.toString());
        if (flushedList) elements.push(flushedList);
        elements.push(
          <h2 key={`h2-${i}`} className="text-base font-semibold text-white mt-4 mb-2 pb-1 border-b border-slate-700/50">
            {parseInlineMarkdown(h2Match[1])}
          </h2>
        );
        continue;
      }

      const ulMatch = line.match(/^(\s*)[-*] (.+)/);
      if (ulMatch) {
        listItems.push({ level: Math.floor(ulMatch[1].length / 2), content: ulMatch[2], ordered: false });
        continue;
      }

      const olMatch = line.match(/^(\s*)\d+\. (.+)/);
      if (olMatch) {
        listItems.push({ level: Math.floor(olMatch[1].length / 2), content: olMatch[2], ordered: true });
        continue;
      }

      const flushedList = flushList(i.toString());
      if (flushedList) elements.push(flushedList);

      if (line.match(/^---+$/)) {
        elements.push(<hr key={`hr-${i}`} className="my-4 border-slate-700/50" />);
        continue;
      }

      if (line.startsWith("> ")) {
        elements.push(
          <blockquote key={`quote-${i}`} className="my-2 pl-3 border-l-2 border-fuchsia-500/50 text-slate-300 italic">
            {parseInlineMarkdown(line.slice(2))}
          </blockquote>
        );
        continue;
      }

      if (line.trim() === "") {
        if (elements.length > 0) elements.push(<div key={`space-${i}`} className="h-2" />);
        continue;
      }

      elements.push(<p key={`p-${i}`} className="leading-relaxed">{parseInlineMarkdown(line)}</p>);
    }

    const finalList = flushList("final");
    if (finalList) elements.push(finalList);

    return elements;
  }, [content]);

  return <div className={`prose-sm ${isUser ? "text-white" : "text-slate-100"}`}>{rendered}</div>;
}

export default function AssistantChatV2({ className = "", onApply, compact = false }: AssistantChatProps) {
  const { currentOrg } = useOrg();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingOperations, setPendingOperations] = useState<any[] | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleCardAction = useCallback(async (action: string, card: ResourceCard) => {
    if (action === "run" && card.type === "test") {
      // Queue a run request via chat
      setInput(`Run the test "${card.name}"`);
      inputRef.current?.focus();
    } else if (action === "run" && card.type === "suite") {
      setInput(`Run the suite "${card.name}"`);
      inputRef.current?.focus();
    } else if (action === "edit" && card.href) {
      router.push(card.href);
    }
  }, [router]);

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

    // Create streaming message
    const streamingMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [...prev, {
      id: streamingMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
      isStreaming: true,
    }]);

    // Collect tool results as they stream in
    const collectedToolResults: any[] = [];
    let collectedStructured: any = null;

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      
      // Extract orgId properly
      const orgId = typeof currentOrg === "object" ? (currentOrg as any).orgId : currentOrg;

      // Try streaming endpoint first, fall back to non-streaming
      let useStreaming = true;
      let res: Response;
      
      try {
        res = await fetch("/api/orgs/assistant/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            message: userMessage.content,
            history,
            mode: "lamdis",
          }),
        });
        
        // Check for connection/fetch errors
        if (!res.ok) {
          const errText = await res.text();
          // If streaming fails with connection error, fall back
          if (errText.includes("fetch failed") || errText.includes("ECONNREFUSED")) {
            useStreaming = false;
          } else {
            let errMsg = "Failed to get response";
            try {
              const errJson = JSON.parse(errText);
              errMsg = errJson.error || errMsg;
            } catch { errMsg = errText || errMsg; }
            throw new Error(errMsg);
          }
        }
      } catch (streamErr: any) {
        // Stream failed, fall back to regular endpoint
        console.log("[Assistant] Streaming failed, falling back to chat endpoint", streamErr?.message);
        useStreaming = false;
        res = null as any;
      }

      // Fall back to non-streaming chat endpoint
      if (!useStreaming || !res) {
        const chatRes = await fetch("/api/orgs/assistant/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orgId,
            message: userMessage.content,
            history,
            mode: "lamdis",
          }),
        });

        const data = await chatRes.json();

        if (!chatRes.ok) {
          throw new Error(data.error || "Failed to get response");
        }

        // Strip XML, thinking tags, and clean content
        let cleanContent = data.response || data.reply || "";
        // Strip thinking tags (Claude Opus extended thinking)
        cleanContent = cleanContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
        cleanContent = cleanContent.replace(/<thinking>[\s\S]*$/gi, ""); // Unclosed tag
        cleanContent = cleanContent.replace(/<\/thinking>/gi, ""); // Orphan closing tag
        // Strip function call XML
        cleanContent = cleanContent.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "");
        cleanContent = cleanContent.replace(/<invoke[\s\S]*?<\/invoke>/g, "");
        cleanContent = cleanContent.trim();

        // Parse resource cards
        const cards = parseResourceCards(
          data.structured?.operations || [],
          data.structured?.tool_results || []
        );

        // Update the streaming message with final content
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId
              ? {
                  ...m,
                  content: cleanContent,
                  structured: data.structured,
                  operations: data.structured?.operations,
                  toolCalls: data.structured?.tool_calls,
                  toolResults: data.structured?.tool_results,
                  cards,
                  isStreaming: false,
                }
              : m
          )
        );

        if (data.structured?.operations?.length > 0) {
          setPendingOperations(data.structured.operations);
        }
      } else {
        // Process SSE stream
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let currentEventType = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            
            // Parse SSE events from buffer
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Keep incomplete line in buffer

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEventType = line.slice(7).trim();
                continue;
              }
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  // Handle different event types
                  if (currentEventType === "text" || data.text !== undefined) {
                    // Streaming text chunk - accumulate and display progressively
                    const textChunk = data.text || "";
                    accumulatedText += textChunk;
                    
                    // Strip thinking tags from accumulated text for display
                    let displayText = accumulatedText;
                    displayText = displayText.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
                    displayText = displayText.replace(/<thinking>[\s\S]*$/gi, "");
                    displayText = displayText.replace(/<\/thinking>/gi, "");
                    displayText = displayText.trim();
                    
                    // Check if this looks like JSON response (don't show raw JSON while streaming)
                    const looksLikeJson = displayText.startsWith("{") || displayText.startsWith("```json");
                    
                    // If it's JSON, try to extract the response field, otherwise show loading
                    if (looksLikeJson) {
                      try {
                        // Try to find and extract "response": "..." from partial JSON
                        const responseMatch = displayText.match(/"response"\s*:\s*"((?:[^"\\]|\\.)*)"/);
                        if (responseMatch && responseMatch[1]) {
                          // Unescape JSON string
                          displayText = responseMatch[1]
                            .replace(/\\n/g, "\n")
                            .replace(/\\t/g, "\t")
                            .replace(/\\"/g, '"')
                            .replace(/\\\\/g, "\\");
                        } else {
                          // Still building JSON, show nothing (loading dots will show)
                          displayText = "";
                        }
                      } catch {
                        // Can't parse yet, show nothing
                        displayText = "";
                      }
                    }
                    
                    // Update message with current accumulated text
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMsgId
                          ? { ...m, content: displayText, isStreaming: true }
                          : m
                      )
                    );
                  } else if (currentEventType === "tool_result" || data.tool) {
                    // Tool result event
                    collectedToolResults.push(data);
                    
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMsgId
                          ? { ...m, toolResults: [...collectedToolResults] }
                          : m
                      )
                    );
                  } else if (currentEventType === "message" || data.response !== undefined || data.structured) {
                    // Final message event with structured data
                    collectedStructured = data.structured;
                    let cleanContent = data.response || accumulatedText || "";
                    
                    // Strip thinking tags
                    cleanContent = cleanContent.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
                    cleanContent = cleanContent.replace(/<thinking>[\s\S]*$/gi, "");
                    cleanContent = cleanContent.replace(/<\/thinking>/gi, "");
                    cleanContent = cleanContent.replace(/<function_calls>[\s\S]*?<\/function_calls>/g, "");
                    cleanContent = cleanContent.replace(/<invoke[\s\S]*?<\/invoke>/g, "");
                    cleanContent = cleanContent.trim();

                    // Parse resource cards
                    const cards = parseResourceCards(
                      data.structured?.operations || [],
                      collectedToolResults
                    );

                    // Update message with final content
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMsgId
                          ? {
                              ...m,
                              content: cleanContent,
                              structured: data.structured,
                              operations: data.structured?.operations,
                              toolCalls: data.structured?.tool_calls,
                              toolResults: collectedToolResults,
                              cards,
                              isStreaming: false,
                            }
                          : m
                      )
                    );

                    if (data.structured?.operations?.length > 0) {
                      setPendingOperations(data.structured.operations);
                    }
                  } else if (currentEventType === "error" || data.error) {
                    throw new Error(data.error);
                  } else if (currentEventType === "done") {
                    // Stream complete - finalize
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === streamingMsgId
                          ? { ...m, isStreaming: false }
                          : m
                      )
                    );
                  }
                } catch (parseErr) {
                  // Ignore parse errors for incomplete JSON
                }
              }
            }
          }
        }

        // Mark streaming as complete if not already done
        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingMsgId && m.isStreaming
              ? { ...m, isStreaming: false }
              : m
          )
        );
      }

    } catch (err: any) {
      setError(err?.message || "Something went wrong");
      setMessages((prev) => prev.filter((m) => m.id !== streamingMsgId));
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

      // Create cards for results
      const resultCards: ResourceCard[] = data.results
        .filter((r: any) => r.success && r.result)
        .map((r: any) => ({
          type: r.operation?.resource?.replace("test_", "") || "test",
          id: r.result?.id || r.result?._id,
          name: r.result?.name || r.operation?.data?.name,
          status: "created" as const,
          stepCount: r.result?.steps?.length,
          href:
            r.operation?.resource === "test"
              ? `/dashboard/tests?testId=${r.result?.id || r.result?._id}`
              : r.operation?.resource === "test_suite"
              ? `/dashboard/library/suites/${r.result?.id || r.result?._id}`
              : undefined,
        }));

      const resultMessage: Message = {
        id: `system-${Date.now()}`,
        role: "assistant",
        content: data.success
          ? `✅ Successfully created ${data.results.filter((r: any) => r.success).length} resources. Click the cards below to view them.`
          : `⚠️ Applied ${data.results.filter((r: any) => r.success).length} of ${data.results.length} operations. Some failed.`,
        timestamp: new Date(),
        cards: resultCards,
      };

      setMessages((prev) => [...prev, resultMessage]);
      setPendingOperations(null);
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
      <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
        <div
          className={`max-w-[90%] rounded-xl ${
            isUser
              ? "bg-gradient-to-br from-fuchsia-600/30 to-violet-600/20 border border-fuchsia-500/40"
              : "bg-slate-800/60 border border-slate-700/50"
          } px-4 py-3`}
        >
          <div className="flex items-start gap-3">
            {!isUser && (
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
            )}

            <div className="flex-1 min-w-0">
              {/* Streaming indicator */}
              {message.isStreaming && !message.content && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <div className="w-2 h-2 bg-fuchsia-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              )}

              {/* Message content */}
              {message.content && <MarkdownContent content={message.content} isUser={isUser} />}

              {/* Resource cards */}
              {message.cards && message.cards.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span className="text-xs font-medium text-fuchsia-400">Resources</span>
                  </div>
                  <div className="grid gap-2">
                    {message.cards.map((card, i) => (
                      <ResourceCardComponent key={card.id || i} card={card} onAction={handleCardAction} />
                    ))}
                  </div>
                </div>
              )}

              {/* Tool results */}
              {message.toolResults && message.toolResults.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-5 h-5 rounded bg-violet-500/20 flex items-center justify-center">
                      <svg className="w-3 h-3 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <span className="text-xs font-medium text-violet-300">Actions Executed</span>
                  </div>
                  <div className="space-y-2">
                    {message.toolResults.map((result: any, i: number) => (
                      <div key={i} className={`rounded-lg border p-2 ${result.error ? "bg-red-500/10 border-red-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${result.error ? "bg-red-400" : "bg-emerald-400"}`} />
                          <span className="text-xs font-medium text-white">{formatToolName(result.tool)}</span>
                          {!result.error && <span className="text-emerald-400 text-[10px] ml-auto">✓</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending operations */}
              {message.operations && message.operations.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span className="text-xs font-medium text-cyan-400">Pending Operations ({message.operations.length})</span>
                  </div>
                  <div className="space-y-2">
                    {message.operations.slice(0, 5).map((op: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-300 bg-slate-900/40 rounded-lg px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${op.action === "create" ? "bg-emerald-500/20 text-emerald-300" : op.action === "update" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}`}>
                          {op.action}
                        </span>
                        <span className="text-slate-400">{op.resource}</span>
                        {op.data?.name && <span className="text-white truncate">"{op.data.name}"</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[10px] text-slate-500 mt-3">{message.timestamp.toLocaleTimeString()}</div>
            </div>

            {isUser && (
              <div className="w-6 h-6 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg className="w-3.5 h-3.5 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
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
      {/* Header - hidden in compact mode */}
      {!compact && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-fuchsia-500 to-violet-600 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Lamdis Assistant</h3>
              <p className="text-xs text-slate-400">AI-powered test builder & configuration helper</p>
            </div>
          </div>
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setPendingOperations(null); }} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-slate-800">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className={`flex-1 overflow-y-auto ${compact ? 'p-3 space-y-1.5 text-[13px]' : 'p-4 space-y-2'}`}>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900 flex items-center justify-center mb-6 border border-slate-700/50 shadow-xl">
              <svg className="w-10 h-10 text-fuchsia-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h4 className="text-base font-semibold text-white mb-2">How can I help you today?</h4>
            <p className="text-sm text-slate-400 max-w-md mb-6 leading-relaxed">I can help you build tests, create suites, set up assertions, manage configurations, and explain how Lamdis works.</p>
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {["Create a compliance test", "Show me my tests", "Help me set up an environment", "Explain test steps"].map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} className="px-4 py-2 text-xs rounded-lg bg-slate-800/60 text-slate-300 border border-slate-700/50 hover:bg-slate-700/60 hover:border-fuchsia-500/30 hover:text-white transition-all duration-200">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(renderMessage)}
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
                <div className="text-sm text-white font-medium">{pendingOperations.length} operation{pendingOperations.length > 1 ? "s" : ""} ready</div>
                <div className="text-xs text-slate-400">Review and confirm to create resources</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => setPendingOperations(null)} className="text-xs bg-slate-700 hover:bg-slate-600">Cancel</Button>
              <Button onClick={handleApplyOperations} className="text-xs bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500" disabled={loading}>
                {loading ? "Applying..." : "Apply Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-4 py-3 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center"><svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg></div>
            <div className="flex-1 text-sm text-red-400">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400/60 hover:text-red-400 p-1"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-slate-800 bg-slate-900/50">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Ask me to create tests, explain concepts, or help with configuration..." className="flex-1 bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-fuchsia-500/50 resize-none min-h-[48px] max-h-[120px] transition-all" rows={1} disabled={loading} />
          <Button type="submit" disabled={!input.trim() || loading || !currentOrg} className="px-4 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </Button>
        </form>
        <div className="text-[10px] text-slate-500 mt-2 text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Enter</kbd> to send · <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Shift+Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
