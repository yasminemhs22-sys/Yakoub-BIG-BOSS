import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from '@/router/routes';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/auth/AuthProvider';
import './styles/global.css';

/**
 * Query defaults tuned for Algerian mobile networks rather than a fast office
 * connection. Catalogue data changes rarely, so a generous staleTime avoids
 * refetching the same product list on every tab switch. Retries are limited
 * because on a flaky connection an aggressive retry loop drains battery and
 * data without helping.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
