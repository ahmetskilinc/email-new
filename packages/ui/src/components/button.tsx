"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-bruv-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-bruv-neutral-strong focus-visible:ring-3 focus-visible:ring-bruv-focus/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-bruv-danger aria-invalid:ring-3 aria-invalid:ring-bruv-danger/20 dark:aria-invalid:border-bruv-danger/50 dark:aria-invalid:ring-bruv-danger/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-bruv-accent text-bruv-accent-on [a]:hover:bg-bruv-accent/80",
        outline:
          "border-bruv-neutral bg-bruv-base-0 hover:bg-bruv-subtle hover:text-bruv-primary aria-expanded:bg-bruv-subtle aria-expanded:text-bruv-primary dark:border-bruv-neutral dark:bg-bruv-subtle/30 dark:hover:bg-bruv-subtle/50",
        secondary:
          "bg-bruv-subtle text-bruv-primary hover:bg-bruv-subtle/80 aria-expanded:bg-bruv-subtle aria-expanded:text-bruv-primary",
        ghost:
          "hover:bg-bruv-subtle hover:text-bruv-primary aria-expanded:bg-bruv-subtle aria-expanded:text-bruv-primary dark:hover:bg-bruv-subtle/50",
        destructive:
          "bg-bruv-danger/10 text-bruv-danger hover:bg-bruv-danger/20 focus-visible:border-bruv-danger/40 focus-visible:ring-bruv-danger/20 dark:bg-bruv-danger/20 dark:hover:bg-bruv-danger/30 dark:focus-visible:ring-bruv-danger/40",
        link: "text-bruv-accent underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-bruv-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-bruv-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-bruv-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-bruv-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
