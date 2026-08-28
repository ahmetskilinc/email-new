/**
 * Starts a durable workflow, degrading to an inline (undurable) run where
 * the workflow runtime is unavailable — the standalone dev sync server and
 * plain bun scripts don't compile the "use workflow"/"use step" directives,
 * so `start()` refuses there while the functions themselves remain plain
 * async functions that execute correctly, just without resumability.
 *
 * `fallback` is explicit per call site because inlining is not always the
 * right degradation: the self-rescheduling scheduler loop, for instance,
 * must fall back to a single cycle — not an eternal in-process loop.
 */
export async function startWorkflowSafe(
  workflowFn: (input: never) => Promise<unknown>,
  input: unknown,
  fallback: () => Promise<unknown>
): Promise<void> {
  try {
    const { start } = await import("workflow/api")
    await start(workflowFn as (input: unknown) => Promise<unknown>, [input])
  } catch {
    await fallback()
  }
}
