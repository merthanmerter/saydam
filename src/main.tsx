import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppErrorBoundary } from "@/app/components/error-boundary";
import { router } from "@/app/router";
import { SessionProvider } from "@/app/session";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RouterProvider router={router} context={{ queryClient }} />
        </SessionProvider>
        <Toaster position="top-center" richColors />
      </QueryClientProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
