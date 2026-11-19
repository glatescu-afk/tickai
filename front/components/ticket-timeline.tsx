import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

type TicketTimelineProps = {
  status: string | null
  compact?: boolean
}

export function TicketTimeline({ status, compact = false }: TicketTimelineProps) {
  const resolvedStatus = status ?? 'brouillon'
  const isResolved = ['resolu', 'cloture'].includes(resolvedStatus)
  const isEscalated = resolvedStatus === 'escalade'
  const isTransferred = resolvedStatus === 'transmis_support'
  const currentColor = isResolved
    ? 'text-status-success'
    : isEscalated
      ? 'text-status-danger'
      : isTransferred
        ? 'text-status-warning'
        : 'text-primary'
  const currentIndex = isResolved ? 2 : ['en_cours', 'transmis_support', 'escalade', 'reprise_humaine'].includes(resolvedStatus) ? 1 : 0
  const steps = ['Envoyée', 'Prise en charge', 'Résolue']

  return (
    <ol aria-label="Suivi de votre demande" className={cn('grid grid-cols-3 gap-2', compact ? 'mt-4' : 'mt-5')}>
      {steps.map((step, index) => {
        const isPast = index < currentIndex
        const isCurrent = index === currentIndex
        const isTerminal = index === 2
        const color = isCurrent ? currentColor : isTerminal && isResolved ? 'text-status-success' : 'text-primary'

        return (
          <li key={step} aria-current={isCurrent ? 'step' : undefined} className="min-w-0 text-center">
            <div className="mb-2 flex items-center">
              {index > 0 ? <span aria-hidden="true" className={cn('h-px flex-1', index <= currentIndex ? 'bg-primary/80' : 'bg-border')} /> : <span aria-hidden="true" className="h-px flex-1" />}
              <span className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]',
                isPast && 'border-primary bg-primary text-primary-foreground',
                isCurrent && `border-current bg-current/15 ${color} motion-safe:animate-pulse`,
                !isPast && !isCurrent && 'border-border bg-background text-muted-foreground',
              )}>
                {isPast ? <Check aria-hidden="true" className="size-3" /> : <span aria-hidden="true" className={cn('size-1.5 rounded-full', isCurrent ? 'bg-current' : 'bg-transparent')} />}
              </span>
              {index < 2 ? <span aria-hidden="true" className={cn('h-px flex-1', index < currentIndex ? 'bg-primary/80' : 'bg-border')} /> : <span aria-hidden="true" className="h-px flex-1" />}
            </div>
            <span className={cn('block text-[11px] leading-4 sm:text-xs', isPast && 'text-primary', isCurrent && `font-semibold ${color}`, !isPast && !isCurrent && 'text-muted-foreground')}>
              {step}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
