const statusStyle: Record<string, string> = {
  resolu: 'border-status-success/20 bg-status-success/10 text-status-success',
  en_cours: 'border-primary/20 bg-primary/10 text-primary',
  valide: 'border-primary/20 bg-primary/10 text-primary',
  en_clarification: 'border-primary/20 bg-primary/10 text-primary',
  escalade: 'border-status-danger/20 bg-status-danger/10 text-status-danger',
  transmis_support: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
  cloture: 'border-border bg-muted text-muted-foreground',
  brouillon: 'border-border bg-muted text-muted-foreground',
}
const statusLabel: Record<string, string> = {
  resolu: 'Résolu', en_cours: 'En cours', valide: 'Validé', en_clarification: 'En clarification',
  escalade: 'Escaladé', transmis_support: 'Transmis au support', cloture: 'Clôturé', brouillon: 'Brouillon',
}

export function LevelBadge({ level }: { level: number | string | null }) {
  const isLevelTwo = String(level) === '2'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${isLevelTwo ? 'border-[#DDD6FE] bg-[#F5F3FF] text-[#6D28D9]' : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]'}`}>Niveau {isLevelTwo ? '2' : '1'}</span>
}

export function StatusBadge({ status }: { status: string | null }) {
  const value = status ?? 'brouillon'
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyle[value] ?? statusStyle.brouillon}`}>{statusLabel[value] ?? value.replaceAll('_', ' ')}</span>
}
