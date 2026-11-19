'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clock3, MessageSquareText, ScrollText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TicketCard } from '@/components/ticket-card'
import { LevelBadge, SupportStatusBadge } from '@/components/ticket-badges'
import { createClient } from '@/lib/supabase/client'
import { getTicketSummary, type Ticket, type TicketCardData } from '@/lib/types'

type MessageRow = { role: 'user' | 'assistant'; contenu: string; created_at: string }
type JournalRow = { evenement: string; details: unknown; created_at: string }
type DetailTab = 'conversation' | 'journal'

export function SupportTicketDetail({ initialTicket, initialMessages, initialJournal }: { initialTicket: TicketCardData; initialMessages: MessageRow[]; initialJournal: JournalRow[] }) {
  const [ticket, setTicket] = useState(initialTicket)
  const [tab, setTab] = useState<DetailTab>('conversation')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const summary = getTicketSummary(ticket)

  async function updateStatus(status: 'reprise_humaine' | 'cloture') {
    const prompt = status === 'cloture' ? 'Clôturer ce ticket ? Cette action mettra son statut à jour.' : 'Reprendre ce ticket en main ? Il passera à « Pris en main ».'
    if (!window.confirm(prompt)) return
    setSaving(true)
    setError('')
    const updatedAt = new Date().toISOString()
    const supabase = createClient()
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
    <section style={{ animationDelay: '50ms' }} className="motion-enter mt-4 rounded-2xl border border-slate-200/60 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" aria-labelledby="diagnostic-heading"><div className="flex items-center gap-2"><AlertTriangle aria-hidden="true" className="size-4 text-primary" /><h2 id="diagnostic-heading" className="font-semibold text-blue-900">Pré-diagnostic du chatbot</h2></div><p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">{ticket.diagnostic?.trim() || 'Aucun pré-diagnostic renseigné.'}</p></section>
    {String(ticket.niveau) === '1' && (ticket.resultat || ticket.preuve) ? <section style={{ animationDelay: '100ms' }} className="motion-enter mt-4 rounded-2xl border border-slate-200/60 bg-card p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md" aria-labelledby="agent-result-heading"><div className="flex items-center gap-2"><Check aria-hidden="true" className="size-4 text-primary" /><h2 id="agent-result-heading" className="font-semibold text-blue-900">Résultat de l’agent</h2></div>{ticket.resultat ? <p className="mt-3 whitespace-pre-line text-sm leading-6 text-foreground">{ticket.resultat}</p> : null}{ticket.preuve ? <p className="mt-3 whitespace-pre-line border-t border-border pt-3 text-sm leading-6 text-muted-foreground">{ticket.preuve}</p> : null}</section> : null}
    <section style={{ animationDelay: '150ms' }} className="motion-enter mt-7 overflow-hidden rounded-2xl border border-slate-200/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex border-b border-border" role="tablist" aria-label="Historique du ticket">
        <button type="button" role="tab" aria-selected={tab === 'conversation'} onClick={() => setTab('conversation')} className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium ${tab === 'conversation' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}><MessageSquareText aria-hidden="true" className="size-4" />Conversation</button>
        <button type="button" role="tab" aria-selected={tab === 'journal'} onClick={() => setTab('journal')} className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium ${tab === 'journal' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}><ScrollText aria-hidden="true" className="size-4" />Journal</button>
      </div>
      {tab === 'conversation' ? <div className="flex flex-col gap-4 p-4 sm:p-5" role="tabpanel" aria-label="Conversation">
        {initialMessages.length ? initialMessages.map((message, index) => <div key={`${message.created_at}-${index}`} style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }} className={`motion-enter max-w-[88%] rounded-2xl border border-slate-200/60 px-4 py-3 shadow-sm ${message.role === 'user' ? 'self-end bg-primary/5' : 'self-start bg-background'}`}><p className="mb-1 text-[11px] font-semibold text-primary">{message.role === 'user' ? 'Collaborateur' : 'Tick.AI'}</p><p className="whitespace-pre-line text-sm leading-6 text-foreground">{message.contenu}</p><time dateTime={message.created_at} className="mt-2 block text-[11px] text-muted-foreground">{formatDateTime(message.created_at)}</time></div>) : <p className="py-8 text-center text-sm text-muted-foreground">Aucun message dans cette conversation.</p>}
      </div> : <div className="p-4 sm:p-5" role="tabpanel" aria-label="Journal">
        {initialJournal.length ? <ol className="ml-2 border-l border-border pl-5">{initialJournal.map((entry, index) => <li key={`${entry.created_at}-${index}`} style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }} className="motion-enter relative pb-6 last:pb-0"><span aria-hidden="true" className="absolute -left-[1.65rem] top-1 size-2 rounded-full bg-primary ring-4 ring-card" /><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold text-foreground">{entry.evenement.replaceAll('_', ' ')}</h3><time dateTime={entry.created_at} className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock3 aria-hidden="true" className="size-3.5" />{formatDateTime(entry.created_at)}</time></div>{formatDetails(entry.details) ? <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-background p-3 font-sans text-xs leading-5 text-muted-foreground">{formatDetails(entry.details)}</pre> : null}</li>)}</ol> : <p className="py-8 text-center text-sm text-muted-foreground">Aucun événement pour l’instant</p>}
      </div>}
    </section>
    {error ? <p role="alert" className="mt-4 rounded-lg border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">{error}</p> : null}
    <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" disabled={saving || ticket.statut === 'reprise_humaine' || ticket.statut === 'cloture'} onClick={() => void updateStatus('reprise_humaine')} className="border-blue-200 bg-white text-blue-700 shadow-sm transition-all hover:-translate-y-px hover:border-blue-300 hover:bg-blue-50 hover:shadow-md">Reprendre en main</Button>
      {ticket.statut !== 'cloture' ? <Button type="button" disabled={saving} onClick={() => void updateStatus('cloture')} className="bg-blue-600 text-white shadow-sm transition-all hover:-translate-y-px hover:bg-blue-700 hover:shadow-md">Clôturer le ticket</Button> : null}
    </div>
    <p className="sr-only">Résumé : {summary}</p>
  </div>
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatDetails(details: unknown) {
  if (details === null || details === undefined || details === '') return ''
  if (typeof details === 'string') return details
  try { return JSON.stringify(details, null, 2) } catch { return String(details) }
}
