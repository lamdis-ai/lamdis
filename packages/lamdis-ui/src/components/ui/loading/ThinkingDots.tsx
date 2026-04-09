"use client";
import React from 'react';

// A small, reusable thinking indicator with three animated dots
export default function ThinkingDots({ className = "" }: { className?: string }) {
  return (
    <span className={["inline-flex items-center gap-1", className].filter(Boolean).join(" ")}
      aria-label="Thinking"
      role="status"
    >
      <span className="sr-only">Thinking…</span>
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.2s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.2s]" />
    </span>
  );
}
