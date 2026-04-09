import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          {label}
          {props.required && ' *'}
        </label>
      )}
      <input
        {...props}
        className={`w-full px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-transparent transition-colors ${error ? 'border-red-500' : ''} ${className}`}
        style={{ colorScheme: 'dark' }}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-slate-300 mb-1.5">
          {label}
          {props.required && ' *'}
        </label>
      )}
      <textarea
        {...props}
        className={`w-full px-3 py-2 rounded-lg bg-slate-800/70 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-fuchsia-500/50 focus:border-transparent resize-none transition-colors ${error ? 'border-red-500' : ''} ${className}`}
        style={{ colorScheme: 'dark' }}
      />
      {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
    </div>
  );
}
