import { AppWindow, CalendarDays, Check, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getTicketStatusPresentation, formatTicketDate, levelClassName } from '@/lib/ticket-display'
import { getClientTicketSummary, getTicketSummary, type TicketCardData } from '@/lib/types'
import { TicketTimeline } from '@/components/ticket-timeline'

type TicketCardProps = {
  ticket: TicketCardData
  readOnly: boolean
  compact?: boolean
  showNiveau?: boolean
  onOpen?: () => void
  onAuthorize?: () => void
  clientView?: boolean
}

export function TicketCard({ ticket, readOnly, compact = false, showNiveau = true, onOpen, onAuthorize, clientView = false }: TicketCardProps) {
  const summary = (clientView ? getClientTicketSummary(ticket) : getTicketSummary(ticket)).replace(/\s*pré[- ]diagnostic\s*:[^\n]*(?:\n|$)/gimu, '').trim()
  const status = getTicketStatusPresentation(ticket)
  const application = getApplicationLabel(ticket, summary)
  const levelLabel = `Niveau ${ticket.niveau}`

  return (
    <Card data-read-only={readOnly} className="group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-card py-0 shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-enter motion-reduce:transform-none motion-reduce:transition-none">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={`Ouvrir les détails de la demande ${ticket.numero}`}
          className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        />
      ) : null}
      <CardContent className={`relative z-10 p-5 ${onOpen ? 'pointer-events-none' : ''}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <AppWindow aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="truncate text-xs font-medium text-zinc-500">{application}</p>
              <h2 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-foreground">{summary}</h2>
            </div>
          </div>
          <Badge variant="outline" className={`shrink-0 ${status.className}`}>
            {status.pulse ? <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
            {status.label}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {showNiveau ? <Badge variant="outline" className={levelClassName(ticket.niveau)}>{levelLabel}</Badge> : null}
          <span className="text-xs text-muted-foreground">{ticket.numero}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays aria-hidden="true" className="size-3.5" />
            {formatTicketDate(ticket.created_at)}
          </span>
        </div>
        <TicketTimeline status={ticket.statut} compact={compact} />

        {compact ? <CardProgress ticket={ticket} summary={summary} statusKind={status.kind} onAuthorize={onAuthorize} /> : (
          <div className="mt-5 rounded-xl border border-border bg-background/60 px-4 py-3.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {ticket.description_finale || ticket.resume_propose ? 'Votre demande' : 'Description initiale'}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">{summary}</p>
            <div className="mt-4 grid gap-x-8 gap-y-4 border-t border-border pt-4 sm:grid-cols-2">
              <Detail label="Prénom" value={ticket.prenom} icon={<UserRound aria-hidden="true" className="size-4" />} />
              <Detail label="Nom" value={ticket.nom} />
              <Detail label="Identifiant employé" value={ticket.identifiant_employe} />
              <Detail label="Poste" value={ticket.poste} />
              <Detail label="Adresse e-mail" value={ticket.email} />
              <Detail label="Catégorie" value={ticket.categorie} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function CardProgress({
  ticket,
  summary,
  statusKind,
  onAuthorize,
}: {
  ticket: TicketCardData
  summary: string
  statusKind: ReturnType<typeof getTicketStatusPresentation>['kind']
  onAuthorize?: () => void
}) {
  if (statusKind === 'consent') {
    return (
      <div className="pointer-events-auto relative z-20 mt-5 rounded-xl border border-status-warning/20 bg-status-warning/5 p-3.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-status-warning/80">Périmètre de l’intervention</p>
        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-status-warning/90">{summary}</p>
        <Button
          type="button"
          disabled={!onAuthorize}
          onClick={(event) => {
            event.stopPropagation()
            onAuthorize?.()
          }}
          className="mt-3 h-8 bg-status-warning px-3 text-xs font-semibold text-background hover:bg-status-warning/90"
        >
          <Check data-icon="inline-start" />
          Autoriser l’intervention
        </Button>
      </div>
    )
  }

  if (statusKind === 'progress') {
    return (
      <div className="pointer-events-none mt-4">
        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
          {'Votre demande est en cours de traitement.'}
        </p>
      </div>
    )
  }

  if (statusKind === 'resolved') {
    return (
      <div className="pointer-events-none mt-5 rounded-xl border border-status-success/20 bg-status-success/5 px-3.5 py-3">
        <p className="line-clamp-2 text-xs leading-5 text-status-success/90">
          {ticket.resultat || ticket.preuve || 'Demande marquée comme résolue.'}
        </p>
      </div>
    )
  }

  if (statusKind === 'escalated') {
    return (
      <div className="pointer-events-none mt-5 border-t border-border pt-4 text-xs text-zinc-400">
        {ticket.statut === 'transmis_support' ? 'Votre demande a été transmise au support.' : 'Votre demande a été escaladée vers un technicien.'}
      </div>
    )
  }

  return null
}

function getApplicationLabel(ticket: TicketCardData, summary: string) {
  const searchableText = `${ticket.categorie ?? ''} ${summary}`.toLowerCase()
  if (searchableText.includes('teams')) return 'Microsoft Teams'
  if (searchableText.includes('outlook')) return 'Microsoft Outlook'
  if (searchableText.includes('windows')) return 'Windows'
  return ticket.categorie || 'Support IT'
}

function Detail({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs text-zinc-500">{icon}{label}</p>
      <p className="mt-1.5 break-words text-sm text-zinc-200">{value || 'Non renseigné'}</p>
    </div>
  )
}
