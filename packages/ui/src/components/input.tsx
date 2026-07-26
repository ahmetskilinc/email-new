import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@workspace/ui/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-bruv-lg border border-bruv-neutral bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-bruv-primary placeholder:text-bruv-tertiary focus-visible:border-bruv-neutral-strong focus-visible:ring-3 focus-visible:ring-bruv-focus/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-bruv-subtle/50 disabled:opacity-50 aria-invalid:border-bruv-danger aria-invalid:ring-3 aria-invalid:ring-bruv-danger/20 md:text-sm dark:bg-bruv-subtle/30 dark:disabled:bg-bruv-subtle/80 dark:aria-invalid:border-bruv-danger/50 dark:aria-invalid:ring-bruv-danger/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
