import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Join Your Organization',
  description:
    'Join your team on Lamdis to start testing and assuring your AI assistants. Enter a join code or create a new organization.',
  alternates: { canonical: 'https://lamdis.ai/join' },
};

export default function JoinLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
