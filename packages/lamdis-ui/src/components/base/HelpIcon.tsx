"use client";
import { ReactNode, useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Coords { left: number; top: number; width: number; }

export default function HelpIcon({ title, children, className }: { title: string; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const hideTimer = useRef<number | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ left: r.left + window.scrollX, top: r.bottom + window.scrollY + 6, width: r.width });
  }, []);

  const show = useCallback(() => {
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); hideTimer.current = null; }
    // Ensure we compute position immediately on hover/focus so the tooltip renders without a frame of delay
    updatePosition();
    setOpen(true);
  }, [updatePosition]);
  const scheduleHide = useCallback(() => {
    if (hideTimer.current) { window.clearTimeout(hideTimer.current); }
    // Slightly longer delay so users can move cursor toward tooltip
    hideTimer.current = window.setTimeout(() => setOpen(false), 220);
  }, []);
  const toggle = useCallback(() => {
    setOpen(o => {
      const next = !o;
      if (next) updatePosition();
      return next;
    });
  }, [updatePosition]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    function handle() { updatePosition(); }
    window.addEventListener('scroll', handle, true);
    window.addEventListener('resize', handle);
    return () => { window.removeEventListener('scroll', handle, true); window.removeEventListener('resize', handle); };
  }, [open, updatePosition]);

  const tooltip = open && coords ? (
    <div
      role="tooltip"
      className="fixed z-[9999] w-80 rounded-md border border-slate-700/80 bg-slate-900/95 backdrop-blur-xl p-3 text-[11px] leading-relaxed text-slate-300 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.65)] ring-1 ring-black/40 animate-fade-in"
      style={{ left: Math.max(8, Math.min(coords.left - 8, window.innerWidth - 320 - 8)), top: coords.top }}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onPointerEnter={show}
      onPointerLeave={scheduleHide}
    >
      <div className="font-semibold mb-1 text-slate-100 tracking-wide text-[12px]">{title}</div>
      {children}
    </div>
  ) : null;

  return (
    <span
      className={"relative inline-flex items-center " + (className || '')}
      onMouseEnter={show}
      onMouseLeave={scheduleHide}
      onPointerEnter={show}
      onPointerLeave={scheduleHide}
    >
      <button
        ref={btnRef}
        type="button"
        className="ml-2 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] leading-none text-slate-400 hover:text-slate-100 border-slate-600/60 hover:border-fuchsia-500/50 bg-slate-800/40 hover:bg-slate-700/50 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? 'help-popover' : undefined}
        onClick={toggle}
        onFocus={show}
        onMouseEnter={show}
        onBlur={scheduleHide}
      >
        ?
      </button>
      {tooltip && typeof window !== 'undefined' ? createPortal(tooltip, document.body) : null}
    </span>
  );
}
