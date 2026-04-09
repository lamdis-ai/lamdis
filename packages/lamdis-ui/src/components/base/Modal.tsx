"use client";
import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** Optional icon to display next to the title */
  titleIcon?: ReactNode;
  /** Optional subtitle/description under the title */
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  closeOnBackdrop?: boolean;
  variant?: 'dark' | 'light'; // default dark
  /** Whether to show the close button in header */
  showCloseButton?: boolean;
  /** Additional className for the modal container */
  className?: string;
};

const sizeMap = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-5xl',
};

export default function Modal({ 
  open, 
  onClose, 
  title, 
  titleIcon,
  subtitle,
  children, 
  footer, 
  size = 'md', 
  closeOnBackdrop = true, 
  variant = 'dark',
  showCloseButton = true,
  className = '',
}: ModalProps) {
  // Ensure portal only renders after mount to avoid SSR hydration issues
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const isDark = variant === 'dark';
  const containerBase = isDark
    ? 'bg-slate-900 border-slate-700 text-slate-200'
    : 'bg-white border-slate-200 text-slate-900';
  const headerBorder = isDark ? 'border-slate-700' : 'border-slate-200';
  const footerBg = isDark ? '' : 'bg-slate-50';
  const closeHover = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100';
  const bodyScrollbar = isDark ? 'scroll-dark' : '';

  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => closeOnBackdrop && onClose()}
      />
      <div
        className={`relative w-full ${sizeMap[size]} rounded-xl shadow-lg shadow-black/40 border ${containerBase} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
      >
        {/* Modal Header */}
        {(title || showCloseButton) && (
          <div className={`flex items-center justify-between px-6 py-4 border-b ${headerBorder}`}>
            <div className="flex items-center gap-2">
              {titleIcon}
              <div>
                <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
                {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
              </div>
            </div>
            {showCloseButton && (
              <button 
                aria-label="Close" 
                className={`p-2 rounded-lg transition ${closeHover}`} 
                onClick={onClose}
              >
                <FiX size={18} />
              </button>
            )}
          </div>
        )}
        
        {/* Modal Body */}
        <div className={`p-6 max-h-[70vh] overflow-y-auto text-[14px] leading-5 ${bodyScrollbar}`}>
          {children}
        </div>
        
        {/* Modal Footer */}
        {footer && (
          <div className={`px-6 py-4 border-t ${headerBorder} ${footerBg} rounded-b-xl flex items-center justify-end gap-3`}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
