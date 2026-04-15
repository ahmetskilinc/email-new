import React from "react"

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-line-of-defense error boundary so uncaught render errors surface as
 * a visible panel instead of an empty white window. Wrap the app root with
 * this in main.tsx.
 */
export class RootErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error("[renderer] uncaught error:", error, info)
  }

  render(): React.ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        style={{
          padding: "2rem",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "13px",
          lineHeight: 1.5,
          color: "#111",
          background: "#fff",
          minHeight: "100vh",
          whiteSpace: "pre-wrap",
        }}
      >
        <h1 style={{ fontSize: "18px", marginBottom: "0.75rem" }}>
          Renderer crashed
        </h1>
        <div style={{ color: "#b00020", marginBottom: "0.75rem" }}>
          {error.name}: {error.message}
        </div>
        {error.stack && (
          <details open>
            <summary style={{ cursor: "pointer", marginBottom: "0.5rem" }}>
              Stack
            </summary>
            <code>{error.stack}</code>
          </details>
        )}
      </div>
    )
  }
}
