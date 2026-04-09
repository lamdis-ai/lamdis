import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import NavSwitch from '@/components/layout/NavSwitch';
import { GoogleAnalytics } from '@next/third-parties/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { ToastProvider } from '@/components/base/Toast';

export const metadata: Metadata = {
  title: {
    default: 'Lamdis',
    template: '%s | Lamdis',
  },
  description: 'AI Workflow Monitoring & Compliance',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const GA_ID = process.env.NEXT_PUBLIC_GA_ID || 'G-G8NQST352Z';
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <GoogleAnalytics gaId={GA_ID} />
      <body className={GeistSans.className + ' overflow-x-hidden'}>
        <ToastProvider>
          <NavSwitch>{children}</NavSwitch>
        </ToastProvider>
      </body>
    </html>
  );
}
