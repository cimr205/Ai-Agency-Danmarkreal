import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97]",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-accent hover:shadow-[0_0_0_1px_rgba(129,140,248,0.5),0_6px_20px_rgba(99,102,241,0.4)] hover:-translate-y-px shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_14px_rgba(99,102,241,0.3)]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_4px_14px_rgba(248,113,113,0.25)]",
        outline: "border border-[rgba(255,255,255,0.10)] bg-transparent text-[var(--text-secondary)] hover:border-[rgba(255,255,255,0.16)] hover:text-foreground hover:bg-[var(--bg-overlay)]",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-[var(--bg-overlay)] hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        hero: "bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_14px_rgba(99,102,241,0.3)] hover:shadow-[0_0_0_1px_rgba(129,140,248,0.5),0_6px_20px_rgba(99,102,241,0.4)] hover:-translate-y-px",
        "hero-outline": "border-2 border-[rgba(255,255,255,0.16)] bg-transparent text-foreground hover:bg-[var(--bg-overlay)] backdrop-blur-sm",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-lg px-8 text-base",
        xl: "h-14 rounded-xl px-10 text-lg",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
