"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import AssistantChatV2 from "./AssistantChatV2";

interface FloatingAssistantButtonProps {
  className?: string;
}

/**
 * Floating Lamdis Assistant Button
 * 
 * A reusable floating action button that opens a chat assistant panel.
 * Can be placed on any page and will appear in the bottom-right corner.
 */
export default function FloatingAssistantButton({ className = "" }: FloatingAssistantButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggleChat = useCallback(() => {
    setIsOpen(prev => !prev);
  }, []);

  const closeChat = useCallback(() => {
    setIsOpen(false);
    setIsExpanded(false);
  }, []);

  const toggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeChat();
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeChat]);

  if (!mounted) return null;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={toggleChat}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 
          shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40 
          transition-all duration-300 flex items-center justify-center group
          hover:scale-105 active:scale-95 ${className}`}
        aria-label={isOpen ? "Close Lamdis Assistant" : "Open Lamdis Assistant"}
      >
        {/* Animated icon transition */}
        <div className="relative w-6 h-6">
          {/* Chat icon - shown when closed */}
          <svg
            className={`absolute inset-0 w-6 h-6 text-white transition-all duration-300 ${
              isOpen ? "opacity-0 rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {/* Close icon - shown when open */}
          <svg
            className={`absolute inset-0 w-6 h-6 text-white transition-all duration-300 ${
              isOpen ? "opacity-100 rotate-0 scale-100" : "opacity-0 -rotate-90 scale-50"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        
        {/* Pulse animation when closed */}
        {!isOpen && (
          <span className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-20" />
        )}
      </button>

      {/* Chat Panel - Rendered in portal for proper z-index handling */}
      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:bg-transparent lg:backdrop-blur-0"
            onClick={closeChat}
          />
          
          {/* Chat Panel */}
          <div
            className={`fixed z-50 rounded-2xl bg-slate-900 border border-slate-700 
              shadow-2xl shadow-black/40 overflow-hidden
              animate-in slide-in-from-bottom-4 fade-in duration-300 transition-all
              ${isExpanded 
                ? "inset-4 sm:inset-8 lg:inset-16" 
                : "bottom-24 right-6 w-[calc(100vw-3rem)] sm:w-[420px] max-w-[420px] h-[min(600px,calc(100vh-8rem))]"
              }`}
          >
            {/* Minimal Header - just controls */}
            <div className="flex items-center justify-end gap-1 px-2 py-1.5 bg-slate-800/50 border-b border-slate-700/50">
              {/* Expand/Collapse button */}
              <button
                onClick={toggleExpand}
                className="w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center transition-colors"
                aria-label={isExpanded ? "Collapse" : "Expand"}
              >
                {isExpanded ? (
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                  </svg>
                )}
              </button>
              {/* Close button */}
              <button
                onClick={closeChat}
                className="w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Chat Content */}
            <div className="h-[calc(100%-32px)]">
              <AssistantChatV2 className="h-full" compact />
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}