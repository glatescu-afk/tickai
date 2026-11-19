'use client'

import { Dialog } from '@base-ui/react/dialog'
import { ArrowUpRight, CheckCircle2, Clock3, ShieldCheck, TicketCheck, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getTicketStatusPresentation, formatTicketDate, levelClassName } from '@/lib/ticket-display'
import { getClientTicketSummary, getTicketSummary, type TicketCardData } from '@/lib/types'
import { TicketTimeline } from '@/components/ticket-timeline'
import { LaunchInterventionBox } from '@/components/launch-intervention-box'

type TicketDetailSheetProps = {
  ticket: TicketCardData | null
  onClose: () => void
  showNiveau?: boolean
  onEscalate?: () => void
  clientView?: boolean
}

export function TicketDetailSheet({ ticket, onClose, showNiveau = true, onEscalate, clientView = false }: TicketDetailSheetProps) {
  if (!ticket) {
    return <Dialog.Root open={false}><Dialog.Portal /></Dialog.Root>
  }

  const status = getTicketStatusPresentation(ticket)
  const summary = clientView ? getClientTicketSummary(ticket) : getTicketSummary(ticket)
  const hasVerifiedProof = ticket.statut === 'resolu' && Boolean(ticket.preuve?.trim())

  return (
    <Dialog.Root open={Boolean(ticket)} onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-[2px] transition-opacity duration-200 data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
        <Dialog.Popup className="fixed inset-y-0 right-0 z-[101] flex h-dvh w-full max-w-xl flex-col border-l border-border/60 bg-card shadow-xl transition-transform duration-300 data-[starting-style]:translate-x-full data-[ending-style]:translate-x-full">
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5 sm:px-7">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <TicketCheck aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">Détail de la demande</p>
                <Dialog.Title className="mt-1 truncate text-lg font-semibold text-zinc-50">{ticket.numero}</Dialog.Title>
                <Dialog.Description className="sr-only">Suivi de cette demande.</Dialog.Description>
              </div>
            </div>
            <Dialog.Close aria-label="Fermer le panneau de détails" className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <X aria-hidden="true" className="size-4" />
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
            <div className="flex flex-wrap items-center gap-2">
              {showNiveau ? <Badge variant="outline" className={levelClassName(ticket.niveau)}>Niveau {ticket.niveau}</Badge> : null}
              <Badge variant="outline" className={status.className}>
                {status.pulse ? <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-current" /> : null}
                {status.label}
              </Badge>
            </div>
            <TicketTimeline status={ticket.statut} />

            {clientView && ticket.statut === 'en_attente_consentement' ? <div className="mt-6"><LaunchInterventionBox demandeId={ticket.id} /></div> : null}
            <section className="mt-6 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5" aria-labelledby="ticket-summary-title">
              <h2 id="ticket-summary-title" className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Votre demande</h2>
              <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-200">{summary.replace(/\s*pré[- ]diagnostic\s*:[^\n]*(?:\n|$)/gimu, '').trim()}</p>
            </section>

            <section className="mt-7" aria-labelledby="ticket-timeline-title">
              <div className="flex items-center gap-2">
                <Clock3 aria-hidden="true" className="size-4 text-primary" />
                <h2 id="ticket-timeline-title" className="text-sm font-semibold text-zinc-100">Activité horodatée</h2>
              </div>
              <ol className="ml-2 mt-4 border-l border-zinc-800 pl-5">
                <li className="relative pb-5">
                  <span aria-hidden="true" className="absolute -left-[1.56rem] top-1.5 size-2 rounded-full bg-primary ring-4 ring-background" />
                  <p className="text-sm font-medium text-zinc-200">Demande créée</p>
                  <time dateTime={ticket.created_at} className="mt-1 block text-xs text-zinc-500">{formatDateTime(ticket.created_at)}</time>
                </li>
                {ticket.updated_at !== ticket.created_at ? (
                  <li className="relative">
                    <span aria-hidden="true" className="absolute -left-[1.56rem] top-1.5 size-2 rounded-full bg-zinc-600 ring-4 ring-background" />
                    <p className="text-sm font-medium text-zinc-200">Dernière mise à jour</p>
                    <time dateTime={ticket.updated_at} className="mt-1 block text-xs text-zinc-500">{formatDateTime(ticket.updated_at)}</time>
                  </li>
                ) : null}
              </ol>
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                Les journaux techniques détaillés ne sont pas disponibles pour ce ticket.
              </p>
            </section>

            <section className={`mt-7 rounded-2xl border p-4 ${hasVerifiedProof ? 'border-status-success/20 bg-status-success/5' : 'border-border bg-card/70'}`} aria-labelledby="ticket-proof-title">
              <div className="flex items-center gap-2">
                {hasVerifiedProof ? <ShieldCheck aria-hidden="true" className="size-4 text-status-success" /> : <CheckCircle2 aria-hidden="true" className="size-4 text-zinc-500" />}
                <h2 id="ticket-proof-title" className="text-sm font-semibold text-zinc-100">Preuve de résolution</h2>
                {hasVerifiedProof ? <Badge variant="outline" className="ml-auto border-status-success/20 bg-status-success/10 text-status-success">Vérifié</Badge> : null}
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
                {ticket.preuve || ticket.resultat || 'Aucune preuve ni résultat de test n’est renseigné pour le moment.'}
              </p>
              {ticket.resultat && ticket.preuve ? <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-5 text-zinc-400">Résultat : {ticket.resultat}</p> : null}
            </section>
          </div>

          <div className="border-t border-border bg-background px-5 py-4 sm:px-7">
            <Button
              type="button"
              variant="outline"
              disabled={!onEscalate}
              onClick={onEscalate}
              className="h-10 w-full border-border bg-card text-zinc-200 hover:border-primary/40 hover:bg-muted"
            >
              <ArrowUpRight data-icon="inline-start" />
              Demander l’aide d’un technicien
            </Button>
            {!onEscalate ? <p className="mt-2 text-center text-xs text-zinc-500">Cette option sera disponible lorsque l’accès sécurisé sera configuré.</p> : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
