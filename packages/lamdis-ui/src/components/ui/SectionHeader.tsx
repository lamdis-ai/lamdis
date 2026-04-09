import React from 'react';

type Props = {
  title: string;
  className?: string; // allow passing gradient/text classes for flexibility
};

export default function SectionHeader({ title, className }: Props) {
  const base = 'pb-1 text-3xl md:text-5xl font-heading font-semibold tracking-tight';
  const gradient = 'text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-300 via-fuchsia-200 to-sky-300';
  return <h2 className={`${base} ${className ?? gradient}`}>{title}</h2>;
}
