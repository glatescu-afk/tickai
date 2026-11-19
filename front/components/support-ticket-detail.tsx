'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, ChevronRight, Clock3, MessageSquareText, ShieldCheck, Timer, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TicketCard } from '@/components/ticket-card'
import { LevelBadge, SupportStatusBadge } from '@/components/ticket-badges'
import { createClient } from '@/lib/supabase/client'
import { getTicketSummary, type TicketCardData } from '@/lib/types'

type MessageRow = { role: 'user' | 'assistant'; contenu: string; created_at: string }
type JournalRow = { evenement: string; details: unknown; created_at: string }

// Fiche d'audit (spec Gabriel : documentation/audit-support-dashboard.md)
export function SupportTicketDetail({ initialTicket, initialMessages, initialJournal }: { initialTicket: TicketCardData; initialMessages: MessageRow[]; initialJournal: JournalRow[] }) {
  const [ticket, setTicket] = useState(initialTicket)
  const [journal, setJournal] = useState(initialJournal)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const summary = getTicketSummary(ticket)
  const isLevelOne = String(ticket.niveau) === '1'

  // Temps réel : la fiche se met à jour seule (ex. en_cours → resolu) et la frise s'allonge.
  useEffect(() => {
    const channel = supabase.channel(`audit-${ticket.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'demandes', filter: `id=eq.${ticket.id}` }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new
        setTicket((current) => ({ ...current, ...(row as Partial<TicketCardData>) }))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journal', filter: `demande_id=eq.${ticket.id}` }, (payload: { new: Record<string, unknown> }) => {
        const row = payload.new
        const entry = row as JournalRow
        setJournal((current) => [...current, entry].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [supabase, ticket.id])

  async function updateStatus(status: 'reprise_humaine' | 'cloture') {
    const prompt = status === 'cloture' ? 'Clôturer ce ticket ? Cette action mettra son statut à jour.' : 'Reprendre ce ticket en main ? Il passera à « Pris en main ».'
    if (!window.confirm(prompt)) return
    setSaving(true)
    setError('')
    const updatedAt = new Date().toISOString()
    const { error: updateError } = await supabase.from('demandes').update({ statut: status, updated_at: updatedAt }).eq('id', ticket.id)
    setSaving(false)
    if (updateError) {
      setError('La mise à jour du ticket a échoué. Vérifiez vos droits puis réessayez.')
      return
    }
    setTicket((current) => ({ ...current, statut: status, updated_at: updatedAt }))
    router.refresh()
  }

  return <div className="mt-6">
    <div className="motion-enter mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium tracking-[0.14em] text-primary">DÉTAIL DU TICKET</p><h1 className="page-title-gradient mt-1 text-2xl font-semibold">{ticket.numero}</h1><p className="mt-1 text-xs text-muted-foreground">Créé le {formatDateTime(ticket.created_at)}</p></div><div className="flex items-center gap-2"><LevelBadge level={ticket.niveau} /><SupportStatusBadge status={ticket.statut} /></div></div>
    <div style={{ animationDelay: '40ms' }}><TicketCard ticket={ticket} readOnly showNiveau /></div>

    <section style={{ animationDelay: '60ms' }} className="motion-enter mt-4 rounded-2xl border border-slate-200/60 bg-card p-5 shadow-sm" aria-labelledby="audit-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="audit-heading" className="flex items-center gap-2 font-semibold text-blue-900"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />Fiche d’audit</h2>
        <p className="text-xs text-muted-foreground">Mis à jour le {formatDateTime(ticket.updated_at)}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <ConsentPill ticket={ticket} />
        {isLevelOne ? <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700"><Timer aria-hidden="true" className="size-3.5" />Durée : {formatDuration(ticket.duree_s, journal)}</span> : null}
      </div>

      {isLevelOne ? <>
        <AuditBlock icon={<Wrench aria-hidden="true" className="size-4 text-primary" />} title="Ce que l’agent a fait" text={ticket.resultat} empty={ticket.statut === 'en_cours' ? 'L’agent est en train d’intervenir…' : 'Aucune action de l’agent pour le moment.'} />
        <AuditBlock icon={<Check aria-hidden="true" className="size-4 text-status-success" />} title="Preuve (vérification indépendante)" text={ticket.preuve} empty="Aucune preuve pour le moment." muted />
      </> : null}

      <div className="mt-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900"><Clock3 aria-hidden="true" className="size-4 text-primary" />Frise</h3>
        {journal.length ? <ol className="ml-2 mt-3 border-l border-border pl-5">{journal.map((entry, index) => <li key={`${entry.created_at}-${index}`} className="relative pb-3 last:pb-0"><span aria-hidden="true" className="absolute -left-[1.6rem] top-1.5 size-2 rounded-full bg-primary ring-4 ring-card" /><p className="text-sm text-foreground"><time dateTime={entry.created_at} className="mr-3 font-mono text-xs text-muted-foreground">{formatTime(entry.created_at)}</time>{eventLabel(entry.evenement)}</p></li>)}</ol> : <p className="mt-2 text-sm text-muted-foreground">Aucun événement pour l’instant.</p>}
      </div>

      <details className="group mt-5 rounded-xl border border-slate-200/70 bg-slate-50/60 px-4 py-3" open={!isLevelOne}>
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-blue-900"><ChevronRight aria-hidden="true" className="size-4 transition-transform group-open:rotate-90" /><AlertTriangle aria-hidden="true" className="size-4 text-primary" />{isLevelOne ? 'Diagnostic (coulisses)' : 'Diagnostic'}</summary>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">{ticket.diagnostic?.trim() || 'Aucun diagnostic renseigné.'}</p>
      </details>
    </section>

    <section style={{ animationDelay: '150ms' }} className="motion-enter mt-7 overflow-hidden rounded-2xl border border-slate-200/60 bg-card shadow-sm" aria-labelledby="conversation-heading">
      <h2 id="conversation-heading" className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-blue-900"><MessageSquareText aria-hidden="true" className="size-4 text-primary" />Conversation avec le chatbot</h2>
      <div className="flex flex-col gap-4 p-4 sm:p-5">
        {initialMessages.length ? initialMessages.map((message, index) => <div key={`${message.created_at}-${index}`} className={`max-w-[88%] rounded-2xl border border-slate-200/60 px-4 py-3 shadow-sm ${message.role === 'user' ? 'self-end bg-primary/5' : 'self-start bg-background'}`}><p className="mb-1 text-[11px] font-semibold text-primary">{message.role === 'user' ? 'Collaborateur' : 'Tick.AI'}</p><p className="whitespace-pre-line text-sm leading-6 text-foreground">{message.contenu}</p><time dateTime={message.created_at} className="mt-2 block text-[11px] text-muted-foreground">{formatDateTime(message.created_at)}</time></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucun message dans cette conversation.</p>}
      </div>
    </section>
    {error ? <p role="alert" className="mt-4 rounded-lg border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">{error}</p> : null}
    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={saving || ticket.statut === 'reprise_humaine' || ticket.statut === 'cloture'} onClick={() => void updateStatus('reprise_humaine')} className="border-blue-200 bg-white text-blue-700 shadow-sm transition-all hover:-translate-y-px hover:border-blue-300 hover:bg-blue-50 hover:shadow-md">Reprendre en main</Button>
      {ticket.statut !== 'cloture' ? <Button type="button" disabled={saving} onClick={() => void updateStatus('cloture')} className="bg-blue-600 text-white shadow-sm transition-all hover:-translate-y-px hover:bg-blue-700 hover:shadow-md">Clôturer le ticket</Button> : null}
    </div>
    <p className="sr-only">Résumé : {summary}</p>
  </div>
}

function AuditBlock({ icon, title, text, empty, muted = false }: { icon: ReactNode; title: string; text: string | null | undefined; empty: string; muted?: boolean }) {
  return <div className="mt-5">
    <h3 className="flex items-center gap-2 text-sm font-semibold text-blue-900">{icon}{title}</h3>
    <p className={`mt-2 whitespace-pre-line text-sm leading-6 ${text?.trim() ? (muted ? 'text-slate-600' : 'text-foreground') : 'text-muted-foreground'}`}>{text?.trim() || empty}</p>
  </div>
}

function ConsentPill({ ticket }: { ticket: TicketCardData }) {
  if (String(ticket.niveau) === '2') return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">Consentement : non requis (niveau 2)</span>
  if (ticket.consentement_agent) return <span className="inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-green-800"><Check aria-hidden="true" className="size-3.5" />Consentement donné{ticket.consentement_at ? ` le ${formatDateTime(ticket.consentement_at)}` : ''}</span>
  if (ticket.statut === 'en_attente_consentement') return <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-800">En attente de l’accord du collaborateur</span>
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">Consentement : —</span>
}

// Libellés de la frise (spec Gabriel §3)
const journalLabels: Record<string, string> = {
  agent_lance: 'Agent lancé',
  verification_ok: 'Vérification OK → résolu',
  escalade: 'Escaladé → transmis à un humain',
  diagnostic_genere: 'Diagnostic généré → transmis au support',
  diagnostic_agent: 'Diagnostic de l’agent',
}

function eventLabel(evenement: string) {
  const label = journalLabels[evenement] ?? evenement.replaceAll('_', ' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

// Durée (spec Gabriel §4) : duree_s, sinon écart entre le premier et le dernier événement de la frise.
function formatDuration(dureeS: number | null | undefined, journal: JournalRow[]) {
  let seconds = dureeS == null ? null : Number(dureeS)
  if (seconds == null && journal.length > 1) {
    seconds = (new Date(journal[journal.length - 1].created_at).getTime() - new Date(journal[0].created_at).getTime()) / 1000
  }
  if (seconds == null || Number.isNaN(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return minutes ? `${minutes} min ${rest} s` : `${rest} s`
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
}
