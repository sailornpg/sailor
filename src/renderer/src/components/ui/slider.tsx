import * as React from 'react'
import { Slider as SliderPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  thumbProps?: React.ComponentProps<typeof SliderPrimitive.Thumb>
}

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  children,
  thumbProps,
  ...props
}: SliderProps) {
  const values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  )

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      min={min}
      max={max}
      value={value}
      defaultValue={defaultValue}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative z-0 grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-2.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute h-full bg-[var(--appearance-accent)] data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {children}
      {Array.from({ length: values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          {...thumbProps}
          className={cn(
            'relative z-20 block size-4 shrink-0 rounded-full border-0 bg-background shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-2 focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50',
            thumbProps?.className,
          )}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
