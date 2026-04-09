import React from 'react';

interface AiLoaderProps {
  variant?: 'dark' | 'light';
  label?: string;
  className?: string;
}

// Subtle, modern animated equalizer-style loader with brand gradient
const AiLoader: React.FC<AiLoaderProps> = ({ variant = 'dark', label = 'Thinking', className }) => {
  const bubble =
    variant === 'dark'
      ? 'bg-slate-800/50 border border-slate-600/50 text-slate-300'
      : 'bg-slate-200 border border-slate-300 text-slate-700';

  const barBase =
    'w-[6px] rounded-sm bg-gradient-to-b from-fuchsia-500 via-sky-400 to-fuchsia-500 shadow-[0_0_12px_rgba(99,102,241,0.35)]';

  return (
    <div className={`inline-flex items-center gap-3 px-3 py-2 rounded ${bubble} ${className || ''}`} aria-live="polite" aria-busy>
      <div className="relative h-5 w-[68px] flex items-end justify-between">
        <span className={`${barBase} h-[10px]`} style={{ animation: 'lamdisBar 1.2s ease-in-out -0.3s infinite' }} />
        <span className={`${barBase} h-[14px]`} style={{ animation: 'lamdisBar 1.2s ease-in-out -0.15s infinite' }} />
        <span className={`${barBase} h-[18px]`} style={{ animation: 'lamdisBar 1.2s ease-in-out 0s infinite' }} />
        <span className={`${barBase} h-[14px]`} style={{ animation: 'lamdisBar 1.2s ease-in-out 0.15s infinite' }} />
        <span className={`${barBase} h-[10px]`} style={{ animation: 'lamdisBar 1.2s ease-in-out 0.3s infinite' }} />
      </div>
      <span className="sr-only">{label}</span>
      <style jsx>{`
        @keyframes lamdisBar {
          0%, 100% { transform: scaleY(0.6); opacity: 0.7; }
          50% { transform: scaleY(1.25); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default AiLoader;
