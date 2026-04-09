"use client";
import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';
import { Auth0Provider } from '@auth0/nextjs-auth0/client';

export default function NavSwitch({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isEmbed = pathname?.startsWith('/public/embed') || false;

  if (isEmbed) {
    return (
      <Auth0Provider>
        <div className="min-h-screen w-full">{children}</div>
      </Auth0Provider>
    );
  }

  // Dashboard and all other app routes
  return (
    <Auth0Provider>
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 relative">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-plus-lighter">
          <div className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-fuchsia-600/20 blur-[140px]" />
          <div className="absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full bg-sky-600/20 blur-[140px]" />
        </div>
        <div className="absolute inset-0 pattern-tile opacity-[0.04]" />
        <main className="relative z-10 w-full">{children}</main>
      </div>
    </Auth0Provider>
  );
}
