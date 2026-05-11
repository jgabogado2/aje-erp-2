'use client';

import { Toaster } from 'sonner';
import { SessionProvider } from './session-provider';
import { QueryProvider } from './query-provider';

// Single client-side wrapper for everything that needs to live in one tree.
// Order matters: SessionProvider outermost (lots of children read from it),
// QueryProvider next (hooks read session for auth headers), Toaster last so
// it can be triggered from anywhere inside.
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <QueryProvider>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </QueryProvider>
    </SessionProvider>
  );
}
