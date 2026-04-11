import { RouterProvider, createHashRouter, Navigate } from "react-router-dom"
import { QueryProvider } from "./providers/query-provider"
import { ThemeProvider } from "./providers/theme-provider"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import { Toaster } from "@workspace/ui/components/sonner"
import { Suspense } from "react"
import { MailLayout } from "./routes/mail/layout"
import { MailFolder } from "./routes/mail/folder"
import { CalendarPage } from "./routes/calendar"
import { OnboardingPage } from "./routes/onboarding"

const router = createHashRouter([
  {
    path: "/",
    element: <Navigate to="/mail/inbox" replace />,
  },
  {
    path: "/mail",
    element: <MailLayout />,
    children: [
      { path: ":folder", element: <MailFolder /> },
      { path: "all-inboxes", element: <MailFolder /> },
    ],
  },
  {
    path: "/calendar",
    element: <CalendarPage />,
  },
  {
    path: "/onboarding",
    element: <OnboardingPage />,
  },
])

export function App(): React.ReactElement {
  return (
    <ThemeProvider>
      <QueryProvider>
        <TooltipProvider>
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center">
                <div className="size-6 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              </div>
            }
          >
            <RouterProvider router={router} />
          </Suspense>
          <Toaster />
        </TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  )
}
