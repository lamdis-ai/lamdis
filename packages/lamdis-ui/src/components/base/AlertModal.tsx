"use client";
import Modal from './Modal';
import Button from './Button';
import type { ReactNode } from 'react';

export default function AlertModal({ open, onClose, title, message, variant = 'success', primaryLabel, onPrimary }: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string | ReactNode;
  variant?: 'success' | 'error' | 'info';
  primaryLabel?: string;
  onPrimary?: () => void;
}) {
  const colors = variant === 'success'
    ? { ring: 'ring-success', iconBg: 'bg-success/15', icon: 'text-success' }
    : variant === 'error'
    ? { ring: 'ring-danger', iconBg: 'bg-danger/15', icon: 'text-danger' }
    : { ring: 'ring-info', iconBg: 'bg-info/15', icon: 'text-info' };
  return (
  <Modal open={open} onClose={onClose} title={title} size="md" variant="dark">
      <div className={`flex items-start gap-3 ${colors.ring}`}>
        <div className={`h-8 w-8 ${colors.iconBg} flex items-center justify-center rounded-full`}>
          {variant === 'success' && (
            <svg className={`h-5 w-5 ${colors.icon}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414L9 13.414l4.707-4.707z" clipRule="evenodd"/></svg>
          )}
          {variant === 'error' && (
            <svg className={`h-5 w-5 ${colors.icon}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 5h2v7H9V5zm0 8h2v2H9v-2z" clipRule="evenodd"/></svg>
          )}
          {variant === 'info' && (
            <svg className={`h-5 w-5 ${colors.icon}`} viewBox="0 0 20 20" fill="currentColor"><path d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm9-3a1 1 0 10-2 0 1 1 0 002 0zM9 9a1 1 0 100 2h1v3a1 1 0 102 0v-4a1 1 0 00-1-1H9z"/></svg>
          )}
        </div>
        <div className="text-sm">
          {typeof message === 'string' ? <p>{message}</p> : message}
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose} className="btn-ghost">Close</Button>
        {primaryLabel && onPrimary && (
          <Button variant="primary" onClick={onPrimary}>{primaryLabel}</Button>
        )}
      </div>
    </Modal>
  );
}
