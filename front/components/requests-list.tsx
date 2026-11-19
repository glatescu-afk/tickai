'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { TicketDetailSheet } from '@/components/ticket-detail-sheet'
import { StatusBadge } from '@/components/ticket-badges'
import { createClient } from '@/lib/supabase/client'
import { getClientTicketSummary, type Ticket, type TicketCardData } from '@/lib/types'

const ticketColumns = 'id, numero, user_id, description_initiale, resume_je, resume_propose, description_finale, categorie_id, niveau, statut, resultat, preuve, diagnostic, created_at, updated_at'
const filters = [
  { id: 'all', label: 'Toutes', inactiveClass: 'border-slate-200 bg-slate-100 text-slate-800', activeClass: 'border-2 border-slate-700 bg-slate-200 text-slate-800' },
  { id: 'incomplete', label: 'À compléter', inactiveClass: 'border-orange-200 bg-orange-50 text-orange-800', activeClass: 'border-2 border-orange-600 bg-orange-100 text-orange-800' },
  { id: 'active', label: 'En cours', inactiveClass: 'border-blue-200 bg-blue-50 text-blue-800', activeClass: 'border-2 border-blue-700 bg-blue-100 text-blue-800' },
  { id: 'support', label: 'Transmises', inactiveClass: 'border-violet-200 bg-violet-50 text-violet-800', activeClass: 'border-2 border-violet-700 bg-violet-100 text-violet-800' },
  { id: 'resolved', label: 'Résolues', inactiveClass: 'border-green-200 bg-green-50 text-green-800', activeClass: 'border-2 border-green-700 bg-green-100 text-green-800' },
] as const

type SortColumn = 'created_at' | 'updated_at'

type FilterId = (typeof filters)[number]['id']

export function RequestsList({ userId, initialTickets }: { userId: string; initialTickets: Ticket[] }) {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [query, setQuery] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('created_at')
  const [newestFirst, setNewestFirst] = useState(true)
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase.from('demandes').select(ticketColumns).eq('user_id', userId).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Ticket[]
  }, [supabase, userId])

  const { data: tickets, error, isLoading, mutate } = useSWR(['demandes', userId], fetcher, { fallbackData: initialTickets, revalidateOnFocus: true })
  const allTickets = tickets ?? []
  const visibleTickets = useMemo(() => allTickets.filter((ticket) => {
    const status = ticket.statut ?? 'brouillon'
    const matchesFilter = filter === 'all'
      ? true
      : filter === 'incomplete'
        ? isIncompleteStatus(status)
        : filter === 'active'
          ? ['valide', 'en_cours'].includes(status)
          : filter === 'support'
            ? ['transmis_support', 'escalade', 'reprise_humaine'].includes(status)
            : ['resolu', 'cloture'].includes(status)
    const needle = query.trim().toLocaleLowerCase('fr')
    const matchesQuery = !needle || `${ticket.numero} ${getClientTicketSummary(ticket)}`.toLocaleLowerCase('fr').includes(needle)
    return matchesFilter && matchesQuery
  }).sort((a, b) => (new Date(b[sortColumn]).getTime() - new Date(a[sortColumn]).getTime()) * (newestFirst ? 1 : -1)), [allTickets, filter, newestFirst, query, sortColumn])
  const selectedTicket = allTickets.find((ticket) => ticket.id === selectedTicketId) ?? null
  const sortDirectionLabel = newestFirst ? 'du plus récent au plus ancien' : 'du plus ancien au plus récent'

  function toggleSort(column: SortColumn) {
    if (sortColumn === column) {
      setNewestFirst((current) => !current)
      return
    }
    setSortColumn(column)
    setNewestFirst(true)
  }

  function sortIcon(column: SortColumn) {
    if (sortColumn !== column) return <ArrowUpDown aria-hidden="true" className="size-3.5 text-slate-400" />
    return newestFirst
      ? <ArrowDown aria-hidden="true" className="size-3.5 text-blue-600" />
      : <ArrowUp aria-hidden="true" className="size-3.5 text-blue-600" />
  }

  useEffect(() => {
    const channel = supabase.channel(`demandes-${userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'demandes', filter: `user_id=eq.${userId}`,
    }, () => { void mutate() }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [supabase, userId, mutate])

  if (error) return <Card className="border-status-danger/20 bg-status-danger/5"><CardContent className="flex flex-col items-center gap-4 py-10 text-center"><p role="alert" className="text-sm text-status-danger">Impossible de charger vos demandes pour le moment.</p><Button variant="outline" size="sm" onClick={() => void mutate()}>Réessayer</Button></CardContent></Card>
  if (isLoading && !tickets?.length) return <div role="status" aria-label="Chargement de vos demandes" className="grid gap-3"><span className="sr-only">Chargement de vos demandes…</span>{[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="skeleton-pulse rounded-2xl border border-slate-200/60 bg-card p-5 shadow-sm"><div className="h-4 w-28 rounded-full bg-slate-200" /><div className="mt-4 h-4 w-3/4 rounded-full bg-slate-200" /><div className="mt-3 h-2 w-full rounded-full bg-slate-100" /><div className="mt-5 h-3 w-24 rounded-full bg-slate-100" /></div>)}</div>
  if (!allTickets.length) return <Empty className="motion-enter min-h-[280px] rounded-2xl border border-slate-200/60 bg-card px-6 py-14 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"><EmptyHeader><EmptyMedia variant="icon" className="mb-3 size-14 rounded-2xl border border-primary/20 bg-primary/10 text-primary"><Inbox aria-hidden="true" className="size-6" /></EmptyMedia><EmptyTitle className="text-base font-semibold text-foreground">Votre espace est prêt.</EmptyTitle><EmptyDescription className="max-w-sm text-sm leading-6 text-muted-foreground">Faites une demande ticket pour commencer.</EmptyDescription></EmptyHeader><EmptyContent><Link href="/client/nouvelle" className="text-sm font-medium text-primary">Faire une demande ticket</Link></EmptyContent></Empty>

  return <>
    <div className="mb-5 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les demandes">
        {filters.map((item, index) => {
          const count = allTickets.filter((ticket) => {
            const status = ticket.statut ?? 'brouillon'
            if (item.id === 'all') return true
            if (item.id === 'incomplete') return isIncompleteStatus(status)
            if (item.id === 'active') return ['valide', 'en_cours'].includes(status)
            if (item.id === 'support') return ['transmis_support', 'escalade', 'reprise_humaine'].includes(status)
            return ['resolu', 'cloture'].includes(status)
          }).length
          const isActive = filter === item.id
          return (
            <button
              key={item.id}
              type="button"
              style={{ animationDelay: `${index * 0.4}s` }}
              role="tab"
              aria-selected={isActive}
              onClick={() => setFilter(item.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 ${isActive ? `${item.activeClass} font-bold` : `${item.inactiveClass} font-medium`}`}
            >
              {item.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${isActive ? 'bg-white text-current shadow-sm' : 'bg-white/80 text-current'}`}>{count}</span>
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Rechercher par numéro ou texte</span><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-blue-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher une demande…" className="h-10 w-full rounded-xl border border-blue-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-500 focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-200" /></label>
        <button type="button" onClick={() => toggleSort(sortColumn)} title={`Trier ${sortDirectionLabel}`} aria-label={`Trier ${sortDirectionLabel}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 lg:hidden"><ArrowUpDown aria-hidden="true" className="size-4" /></button>
      </div>
    </div>
    {visibleTickets.length ? <div className="space-y-3">
      <div className="hidden grid-cols-[minmax(7rem,0.8fr)_minmax(12rem,2fr)_9rem_8rem_8rem] gap-4 rounded-2xl border border-slate-200/60 bg-card/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm lg:grid"><span>Numéro</span><span>Demande</span><span>Statut</span><button type="button" onClick={() => toggleSort('created_at')} title={`Trier par date de création, ${sortDirectionLabel}`} aria-label={`Trier par date de création, ${sortDirectionLabel}`} className="inline-flex items-center gap-1.5 text-left hover:text-foreground">Créée le{sortIcon('created_at')}</button><button type="button" onClick={() => toggleSort('updated_at')} title={`Trier par dernière mise à jour, ${sortDirectionLabel}`} aria-label={`Trier par dernière mise à jour, ${sortDirectionLabel}`} className="inline-flex items-center gap-1.5 text-left hover:text-foreground">Dernière mise à jour{sortIcon('updated_at')}</button></div>
      <ul className="grid gap-3">{visibleTickets.map((ticket, index) => <li key={ticket.id}>
        <div style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }} className="motion-enter relative rounded-2xl border border-slate-200/60 bg-card shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:border-blue-300 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none">
          <button type="button" onClick={() => isIncompleteStatus(ticket.statut) ? router.push(`/client/nouvelle?demande=${ticket.id}`) : setSelectedTicketId(ticket.id)} aria-label={isIncompleteStatus(ticket.statut) ? `Reprendre la demande ${ticket.numero}` : `Ouvrir le détail de ${ticket.numero}`} className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" />
          <div aria-hidden="true" className="pointer-events-none relative grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-4 text-left lg:grid-cols-[minmax(7rem,0.8fr)_minmax(12rem,2fr)_9rem_8rem_8rem] lg:items-center">
            <span className="font-mono text-xs font-medium text-primary"><span className="mb-1 block font-sans text-[10px] uppercase tracking-wide text-muted-foreground lg:hidden">Numéro</span>{ticket.numero}</span>
            <span className="col-span-2 min-w-0 text-sm font-medium text-foreground lg:col-span-1"><span className="mb-1 block font-sans text-[10px] uppercase tracking-wide text-muted-foreground lg:hidden">Demande</span><span className="block truncate">{firstSentence(getClientTicketSummary(ticket))}</span></span>
            <span><span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground lg:hidden">Statut</span>{isIncompleteStatus(ticket.statut) ? <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">À compléter</span> : <StatusBadge status={ticket.statut} />}</span>
            <span className="text-xs text-muted-foreground"><span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground lg:hidden">Créée le</span>{formatDate(ticket.created_at)}</span>
            <span className="text-xs text-muted-foreground"><span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground lg:hidden">Dernière mise à jour</span>{formatDate(ticket.updated_at)}</span>
          </div>
        </div>
      </li>)}</ul>
    </div> : <Empty className="min-h-56 rounded-2xl border border-slate-200/60 bg-card px-6 py-10 shadow-sm"><EmptyHeader><EmptyMedia variant="icon" className="mb-2 size-12 rounded-2xl border border-primary/15 bg-primary/5 text-primary/70"><Inbox aria-hidden="true" className="size-5" /></EmptyMedia><EmptyTitle className="text-sm font-semibold text-foreground">Aucune demande ici pour le moment</EmptyTitle></EmptyHeader></Empty>}
    <TicketDetailSheet ticket={selectedTicket as TicketCardData | null} onClose={() => setSelectedTicketId(null)} showNiveau={false} clientView />
  </>
}

function isIncompleteStatus(status: string | null) {
  return status === 'brouillon' || status === 'en_clarification'
}

function firstSentence(text: string) {
  const first = text.trim().split(/(?<=[.!?])\s+/u)[0]
  return first || text
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))
}
