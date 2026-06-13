import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { clsx } from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
}

const variantClasses = {
  // Navy fill / white text — the dominant primary action
  primary: 'bg-navy text-white hover:bg-navy-deep shadow-soft hover:shadow-lift hover:-translate-y-0.5',
  // Soft blue tint background with navy text
  secondary: 'bg-accent-soft text-navy hover:bg-[#dde3fb]',
  ghost: 'text-muted hover:bg-gray-100 hover:text-ink',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const sizeClasses = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          'inline-flex items-center justify-center rounded-[10px] font-medium',
          'focus:outline-none focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-none',
          'transition-all duration-150',
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
