import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 whitespace-nowrap
   rounded-2xl text-sm font-semibold
   transition-all duration-200 ease-out
   disabled:pointer-events-none disabled:opacity-50
   [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4
   shrink-0 [&_svg]:shrink-0 outline-none
   focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
   active:scale-[0.98] active:transition-transform`,
  {
    variants: {
      variant: {
        default: `
          bg-gradient-to-b from-primary to-primary/80
          text-primary-foreground
          shadow-lg shadow-black/20
          hover:shadow-xl hover:shadow-black/25
          hover:translate-y-[-2px]
        `,
        destructive: `
          bg-gradient-to-b from-destructive to-destructive/85
          text-destructive-foreground
          shadow-[0_4px_24px_-8px] shadow-destructive/30
          hover:shadow-[0_8px_32px_-8px] hover:shadow-destructive/40
          hover:translate-y-[-1px]
        `,
        outline: `
          border-2 border-border bg-transparent
          hover:bg-accent hover:border-primary/30
          shadow-sm hover:shadow
        `,
        secondary: `
          bg-secondary text-secondary-foreground
          hover:bg-secondary/80 shadow-sm
        `,
        ghost: `hover:bg-accent/50 hover:text-accent-foreground`,
        link: `text-primary underline-offset-4 hover:underline`,
        glass: `
          bg-white/5 backdrop-blur-xl
          border border-white/10
          hover:bg-white/10 hover:border-primary/20
        `,
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-xl gap-1.5 px-3",
        lg: "h-12 rounded-2xl px-8 text-base",
        xl: "h-14 rounded-2xl px-10 text-lg font-bold",
        icon: "size-10 rounded-xl",
        "icon-sm": "size-8 rounded-xl",
        "icon-lg": "size-12 rounded-2xl",
        "icon-xl": "size-16 rounded-2xl",
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
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
