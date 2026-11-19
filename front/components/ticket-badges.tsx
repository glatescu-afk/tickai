const statusStyle: Record<string, string> = {
  resolu: 'border-status-success/20 bg-status-success/10 text-status-success',
  en_cours: 'border-primary/20 bg-primary/10 text-primary',
  valide: 'border-primary/20 bg-primary/10 text-primary',
  en_clarification: 'border-primary/20 bg-primary/10 text-primary',
  escalade: 'border-status-danger/20 bg-status-danger/10 text-status-danger',
  transmis_support: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
  cloture: 'border-border bg-muted text-muted-foreground',
  brouillon: 'border-border bg-muted text-muted-foreground',
  en_attente_consentement: 'border-amber-200 bg-amber-100 text-amber-800',
}
const statusLabel: Record<string, string> = {
  resolu: 'Résolu', en_cours: 'En cours', valide: 'Validé', en_clarification: 'En clarification',
  escalade: 'Escaladé', transmis_support: 'Transmis au support', cloture: 'Clôturé', brouillon: 'Brouillon',
  reprise_humaine: 'Pris en charge',
  en_attente_consentement: 'En attente de votre accord',
}

export function LevelBadge({ level }: { level: number | string | null }) {
  const isLevelTwo = String(level) === '2'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${isLevelTwo ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]' : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]'}`}>Niveau {isLevelTwo ? '2' : '1'}</span>
}

export function StatusBadge({ status }: { status: string | null }) {
  const value = status ?? 'brouillon'
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle[value] ?? statusStyle.brouillon}`}>{value === 'en_cours' ? <span aria-hidden="true" className="live-dot size-1.5 rounded-full bg-current" /> : null}{statusLabel[value] ?? value.replaceAll('_', ' ')}</span>
}

// Côté support : 4 étiquettes simples (les statuts Supabase restent inchangés).
const supportStatus: Record<string, { label: string; className: string; note?: string }> = {
  transmis_support: { label: 'À prendre', className: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]' },
  escalade: { label: 'À prendre', className: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]', note: 'L’agent n’a pas réussi' },
  reprise_humaine: { label: 'Pris en main', className: 'border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]' },
  valide: { label: 'Agent en cours', className: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]' },
  en_cours: { label: 'Agent en cours', className: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]' },
  en_attente_consentement: { label: 'En attente du collaborateur', className: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]' },
  resolu: { label: 'Résolu', className: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]' },
  cloture: { label: 'Résolu', className: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]', note: 'Par le support' },
}

export function SupportStatusBadge({ status }: { status: string | null }) {
  const value = status ?? 'brouillon'
  const item = supportStatus[value]
  if (!item) return <StatusBadge status={status} />
  return <span className="inline-flex flex-col items-start gap-1">
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${item.className}`}>{value === 'valide' || value === 'en_cours' ? <span aria-hidden="true" className="live-dot size-1.5 rounded-full bg-current" /> : null}{item.label}</span>
    {item.note ? <span className="text-[10px] leading-none text-muted-foreground">{item.note}</span> : null}
  </span>
}
