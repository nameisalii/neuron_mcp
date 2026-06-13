import { type InputHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={id} className="block text-sm font-medium text-ink mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={clsx(
            'block w-full rounded-[10px] border bg-white px-3.5 py-2.5 text-sm text-ink',
            'placeholder:text-muted/70 shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent',
            'disabled:bg-gray-50 disabled:text-muted',
            error ? 'border-red-300 focus:ring-red-400/40 focus:border-red-400' : 'border-warm',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
