"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui";
import { PwaProvider } from "@/components/pwa/pwa-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: (count, err: unknown) => count < 1 && !((err as { status?: number })?.status && [401, 403, 404].includes((err as { status: number }).status)), refetchOnWindowFocus: false, staleTime: 5_000 },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <PwaProvider>{children}</PwaProvider>
          <Toaster
            position="bottom-right"
            closeButton
            toastOptions={{
              classNames: {
                toast: "!bg-surface !text-fg !border-line !shadow-overlay !rounded-lg !text-sm !font-sans",
                description: "!text-fg-subtle",
                success: "[&_[data-icon]]:!text-success",
                error: "[&_[data-icon]]:!text-danger",
              },
            }}
            className="max-md:!bottom-[calc(var(--spacing-bottomnav)+env(safe-area-inset-bottom)+0.5rem)]"
          />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
