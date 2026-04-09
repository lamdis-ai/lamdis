import type { HTMLAttributes, PropsWithChildren } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> { active?: boolean; padded?: boolean }

export default function Card({ className = '', children, active = false, padded = true, ...props }: PropsWithChildren<CardProps>) {
  return (
    <div className={`card ${active ? 'card-active' : ''} ${padded ? '' : 'p-0'} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
