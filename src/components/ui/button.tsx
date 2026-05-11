import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotify-green focus-visible:ring-offset-2 focus-visible:ring-offset-spotify-black disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-spotify-green text-black hover:bg-spotify-green-dark",
        secondary: "bg-spotify-medium-gray text-white hover:bg-white/20",
        outline:
          "border border-white/20 bg-transparent text-white hover:bg-white/10",
        ghost: "text-white hover:bg-white/10",
        destructive: "bg-red-500/80 text-white hover:bg-red-500",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-8 px-4 text-xs",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
