import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'


export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-[14px] border border-border bg-card text-card-foreground', className)} {...props} />
}


export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pt-4', className)} {...props} />
}


export function CardTitle({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('text-sm font-medium text-muted-foreground', className)} {...props} />
}


export function CardContent({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pt-2 pb-4', className)} {...props} />
}