import { Geist, Geist_Mono } from "next/font/google"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { Suspense } from "react"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/providers/query-provider"
import { cn } from "@workspace/ui/lib/utils"
import { AppProviders } from "@/components/app-providers"
import { Metadata } from "next"

const fontSans = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontMono.variable)}
    >
      <body className="h-screen overflow-hidden">
        <AppProviders>
          <NuqsAdapter>
            <ThemeProvider>
              <QueryProvider>
                <Suspense
                  fallback={
                    <div className="flex h-screen items-center justify-center">
                      <div className="size-6 animate-spin rounded-full border-2 border-bruv-neutral-strong border-t-transparent" />
                    </div>
                  }
                >
                  {children}
                </Suspense>
              </QueryProvider>
            </ThemeProvider>
          </NuqsAdapter>
        </AppProviders>
      </body>
    </html>
  )
}

export const metadata: Metadata = {
  title: "Tulli",
  description: "Tulli - Email client for the modern web",
}
