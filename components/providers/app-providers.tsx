'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { SessionProvider } from './session-provider';
import { QueryProvider } from './query-provider';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <QueryProvider>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </QueryProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
