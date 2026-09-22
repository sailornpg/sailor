"use client";

import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { ShimmerLabel } from "./surfaces";

export type GenerationLoaderVariant = "dots" | "squares" | "rounded";

export interface GenerationLoaderProps extends Omit<
  ComponentProps<"div">,
  "children"
> {
  label: string;
  tick: number;
  variant?: GenerationLoaderVariant;
}

const CELL_SHAPES: Record<GenerationLoaderVariant, string> = {
  dots: "rounded-full",
  squares: "rounded-[1px]",
  rounded: "rounded-[3px]",
};

/**
 * Sailor deviation from the registry default: the catalog ships a centered
 * vertical stack (matrix above label) as a standalone empty state. In the
 * thread this stands in for one line of assistant text, so the root is a
 * single row and the matrix is half size (`size-1`/`gap-0.5`), which keeps the
 * label at its normal reading size instead of shrinking it to fit.
 */
export function GenerationLoader({
  label,
  tick,
  variant = "dots",
  className,
  ...props
}: GenerationLoaderProps) {
  const pixelOffset = Math.floor(tick / 3);

  return (
    <div
      data-slot="generation-loader"
      className={cn("flex flex-row items-center gap-2", className)}

      {...props}
    >
      <div aria-hidden className="grid shrink-0 grid-cols-3 gap-0.5">
        {Array.from({ length: 9 }, (_, index) => {
          const active = (index * 2 + pixelOffset) % 9 < 3;

          return (
            <span
              key={index}
              className={cn(
                "bg-foreground size-1 transition-opacity duration-300 motion-reduce:transition-none",
                CELL_SHAPES[variant],
                active ? "opacity-90" : "opacity-15",
              )}
            />
          );
        })}
      </div>
      <ShimmerLabel className="text-foreground/55 relative inline-block text-sm">
        {label}
      </ShimmerLabel>
    </div>
  );
}
