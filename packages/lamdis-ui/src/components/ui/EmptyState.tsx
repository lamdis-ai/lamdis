import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`border border-slate-700 rounded-xl bg-slate-900/50 p-12 text-center ${className}`}>
      {icon && (
        <div className="mx-auto text-4xl text-slate-600 mb-4">
          {icon}
        </div>
      )}
      <h3 className="text-slate-300 font-medium mb-2">{title}</h3>
      <p className="text-slate-500 text-sm mb-4 max-w-md mx-auto">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg transition"
        >
          {action.icon}
          {action.label}
        </button>
      )}
    </div>
  );
}
