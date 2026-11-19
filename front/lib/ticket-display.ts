import type { Ticket } from '@/lib/types'

const statusStyles: Record<string, string> = {
  resolu: 'border-status-success/20 bg-status-success/10 text-status-success',
  en_cours: 'border-primary/20 bg-primary/10 text-primary',
  valide: 'border-primary/20 bg-primary/10 text-primary',
  en_clarification: 'border-primary/20 bg-primary/10 text-primary',
  en_attente_consentement: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
  consentement_requis: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
  escalade: 'border-status-danger/20 bg-status-danger/10 text-status-danger',
  transmis_support: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
  cloture: 'border-border bg-muted text-muted-foreground',
  brouillon: 'border-border bg-muted text-muted-foreground',
}

const statusLabels: Record<string, string> = {
  resolu: 'Résolu',
  en_cours: 'En cours',
  valide: 'Validé',
  en_clarification: 'En clarification',
  en_attente_consentement: 'En attente de consentement',
  consentement_requis: 'En attente de consentement',
  escalade: 'Escaladé',
  transmis_support: 'Transmis au support',
  cloture: 'Clôturé',
  brouillon: 'Brouillon',
}

export type TicketStatusPresentation = {
  label: string
  className: string
  kind: 'consent' | 'progress' | 'resolved' | 'escalated' | 'default'
  pulse: boolean
}

export function getTicketStatusPresentation(ticket: Pick<Ticket, 'statut' | 'preuve'>): TicketStatusPresentation {
  const status = ticket.statut ?? 'brouillon'
  const isConsentRequired = status === 'en_attente_consentement' || status === 'consentement_requis'
  const isEscalated = status === 'escalade' || status === 'transmis_support'
  const hasVerifiedProof = status === 'resolu' && Boolean(ticket.preuve?.trim())

  if (isConsentRequired) {
    return { label: 'En attente de consentement', className: statusStyles[status], kind: 'consent', pulse: false }
  }
  if (status === 'en_cours') {
    return { label: statusLabels.en_cours, className: statusStyles.en_cours, kind: 'progress', pulse: true }
  }
  if (status === 'resolu') {
    return {
      label: hasVerifiedProof ? 'Résolu · Vérifié' : 'Résolu',
      className: statusStyles.resolu,
      kind: 'resolved',
      pulse: false,
    }
  }
  if (isEscalated) {
    return { label: statusLabels[status], className: statusStyles[status], kind: 'escalated', pulse: false }
  }

  return {
    label: statusLabels[status] ?? status.replaceAll('_', ' '),
    className: statusStyles[status] ?? 'border-border bg-muted text-muted-foreground',
    kind: 'default',
    pulse: false,
  }
}

export function statusLabel(status: string) {
  return statusLabels[status] ?? status.replaceAll('_', ' ')
}

export function statusClassName(status: string) {
  return statusStyles[status] ?? 'border-border bg-muted text-muted-foreground'
}

export function levelClassName(level: Ticket['niveau']) {
  return level === 1
    ? 'border-blue-200 bg-blue-100 text-blue-700'
    : 'border-amber-200 bg-amber-100 text-amber-700'
}

export function formatTicketDate(date: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(date))
}
