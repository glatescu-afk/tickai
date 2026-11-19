'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Inbox, Layers, Search, Send, Sparkles, Tag, TicketCheck } from 'lucide-react'
import { LevelBadge, StatusBadge } from '@/components/ticket-badges'
import { createClient } from '@/lib/supabase/client'
import { getTicketSummary, type Profile, type Ticket } from '@/lib/types'

type Category = { id: string | number; nom: string }
type SupportTicket = Ticket & { collaborateur: Profile | null; categorie: string | null }
const tabs = [
  { id: 'action', label: 'À traiter', statuses: ['transmis_support', 'escalade', 'reprise_humaine'], inactiveClass: 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C]', activeClass: 'border-2 border-[#EA580C] bg-[#FFEDD5] text-[#C2410C]' },
  { id: 'active', label: 'En cours', statuses: ['valide', 'en_cours'], inactiveClass: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]', activeClass: 'border-2 border-[#1D4ED8] bg-[#DBEAFE] text-[#1D4ED8]' },
  { id: 'resolved', label: 'Résolus', statuses: ['resolu', 'cloture'], inactiveClass: 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]', activeClass: 'border-2 border-[#15803D] bg-[#DCFCE7] text-[#15803D]' },
  { id: 'all', label: 'Tous', statuses: [], inactiveClass: 'border-[#E2E8F0] bg-[#F8FAFC] text-[#334155]', activeClass: 'border-2 border-[#334155] bg-[#E2E8F0] text-[#334155]' },
] as const

export function SupportDashboard({ initialTickets, profiles, categories }: { initialTickets: Ticket[]; profiles: Profile[]; categories: Category[] }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('action')
  const [level, setLevel] = useState('all')
  const [category, setCategory] = useState('all')
  const [query, setQuery] = useState('')
  const [newestFirst, setNewestFirst] = useState(true)
  const supabase = useMemo(() => createClient(), [])
  const fetcher = useCallback(async () => {
    const { data, error } = await supabase.from('demandes').select('id, numero, user_id, description_initiale, resume_propose, description_finale, categorie_id, niveau, statut, resultat, preuve, diagnostic, created_at, updated_at').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Ticket[]
  }, [supabase])
  const { data: tickets = initialTickets, error, mutate } = useSWR('support-demandes', fetcher, { fallbackData: initialTickets, revalidateOnFocus: true })
  const profileMap = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles])
  const categoryMap = useMemo(() => new Map(categories.map((item) => [String(item.id), item.nom])), [categories])
  const rows: SupportTicket[] = tickets.map((ticket) => ({ ...ticket, collaborateur: profileMap.get(ticket.user_id) ?? null, categorie: ticket.categorie_id ? categoryMap.get(String(ticket.categorie_id)) ?? null : null }))
  const filteredRows = rows.filter((ticket) => {
    const currentTab = tabs.find((tab) => tab.id === activeTab)!
    const needle = query.trim().toLocaleLowerCase('fr')
    const person = ticket.collaborateur
    const searchable = `${ticket.numero} ${getTicketSummary(ticket)} ${ticket.categorie ?? ''} ${person?.prenom ?? ''} ${person?.nom ?? ''} ${person?.identifiant_employe ?? ''}`.toLocaleLowerCase('fr')
    return (!currentTab.statuses.length || currentTab.statuses.includes(ticket.statut as never))
      && (level === 'all' || String(ticket.niveau) === level)
      && (category === 'all' || String(ticket.categorie_id) === category)
      && (!needle || searchable.includes(needle))
  }).sort((a, b) => (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) * (newestFirst ? 1 : -1))
  const sortDirectionLabel = newestFirst ? 'du plus récent au plus ancien' : 'du plus ancien au plus récent'
  function toggleDateSort() {
    setNewestFirst((current) => !current)
  }

  useEffect(() => {
    const channel = supabase.channel('support-demandes-live').on('postgres_changes', { event: '*', schema: 'public', table: 'demandes' }, () => { void mutate() }).subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [supabase, mutate])

  const open = tickets.filter((ticket) => !['resolu', 'cloture'].includes(ticket.statut ?? ''))
  const resolved = tickets.filter((ticket) => ticket.statut === 'resolu')
  const transferred = tickets.filter((ticket) => ['transmis_support', 'escalade'].includes(ticket.statut ?? ''))
  const levelOneValidated = tickets.filter((ticket) => String(ticket.niveau) === '1' && ['valide', 'en_cours', 'resolu', 'cloture'].includes(ticket.statut ?? ''))
  const resolutionRate = levelOneValidated.length ? Math.round(resolved.filter((ticket) => String(ticket.niveau) === '1').length / levelOneValidated.length * 100) : 0

  return <section className="pb-16 pt-8 sm:pt-10">
    <div className="motion-enter mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.15em] text-primary"><TicketCheck aria-hidden="true" className="size-4" />ESPACE ENTREPRISE</p><h1 className="page-title-gradient mt-2 text-3xl font-semibold tracking-tight">Tableau de bord support</h1><p className="mt-2 text-sm text-muted-foreground">Vue opérationnelle des demandes et de leur traitement.</p></div><span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-sm">{tickets.length} ticket{tickets.length === 1 ? '' : 's'} au total</span></div>
    <div className="metric-grid mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric title="Tickets ouverts" value={open.length} icon={<Inbox aria-hidden="true" className="size-5" />} accentClassName="bg-primary/10 text-primary" />
      <Metric title="Résolus par l’agent" value={resolved.length} icon={<CheckCircle2 aria-hidden="true" className="size-5" />} accentClassName="bg-status-success/10 text-status-success" />
      <Metric title="Transmis au support" value={transferred.length} icon={<Send aria-hidden="true" className="size-5" />} accentClassName="bg-status-warning/10 text-status-warning" />
      <Metric title="Résolution automatique" value={`${resolutionRate}%`} icon={<Sparkles aria-hidden="true" className="size-5" />} accentClassName="bg-violet-100 text-violet-700" />
    </div>
    <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les tickets">
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id
        const count = tab.id === 'all' ? tickets.length : tickets.filter((item) => tab.statuses.includes(item.statut as never)).length
        return <button key={tab.id} type="button" style={{ animationDelay: `${index * 0.4}s` }} role="tab" aria-selected={isActive} onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 ${isActive ? `${tab.activeClass} font-bold` : tab.inactiveClass}`}>
          {tab.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${isActive ? 'bg-white text-current shadow-sm' : 'bg-white/80 text-current'}`}>{count}</span>
        </button>
      })}
    </div>
    <div className="mb-4 flex flex-col gap-3 xl:flex-row">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Rechercher dans les tickets</span><Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-blue-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher numéro, collaborateur ou demande…" className="h-10 w-full rounded-xl border border-blue-200 bg-white pl-9 pr-3 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-500 focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-200" /></label>
        <button type="button" onClick={toggleDateSort} title={`Trier ${sortDirectionLabel}`} aria-label={`Trier ${sortDirectionLabel}`} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-white text-slate-500 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 xl:hidden"><ArrowUpDown aria-hidden="true" className="size-4" /></button>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="flex h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs text-violet-800 shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none"><Layers aria-hidden="true" className="size-4 text-[#6D28D9]" />Niveau<select value={level} onChange={(event) => setLevel(event.target.value)} className="bg-transparent font-medium text-slate-800 outline-none"><option value="all">Tous</option><option value="1">1</option><option value="2">2</option></select></label>
        <label className="flex h-10 min-w-0 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs text-blue-800 shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none"><Tag aria-hidden="true" className="size-4 text-[#1D4ED8]" />Catégorie<select value={category} onChange={(event) => setCategory(event.target.value)} className="max-w-40 bg-transparent font-medium text-slate-800 outline-none"><option value="all">Toutes</option>{categories.map((item) => <option key={item.id} value={String(item.id)}>{item.nom}</option>)}</select></label>
      </div>
    </div>
    {error ? <p role="alert" className="rounded-2xl border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger shadow-sm">Impossible de charger les tickets. Actualisez la page pour réessayer.</p> : filteredRows.length ? <div className="space-y-3">
      <div className="hidden grid-cols-[minmax(7rem,0.8fr)_minmax(10rem,1.4fr)_minmax(12rem,2fr)_minmax(7rem,1fr)_5rem_9rem_8rem] gap-3 rounded-2xl border border-slate-200/60 bg-card/80 px-4 py-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground shadow-sm xl:grid"><span>Numéro</span><span>Collaborateur</span><span>Demande</span><span>Catégorie</span><span>Niveau</span><span>Statut</span><button type="button" onClick={toggleDateSort} title={`Trier ${sortDirectionLabel}`} aria-label={`Trier ${sortDirectionLabel}`} className="inline-flex items-center gap-1.5 text-left hover:text-foreground">Créée le{newestFirst ? <ArrowDown aria-hidden="true" className="size-3.5 text-blue-600" /> : <ArrowUp aria-hidden="true" className="size-3.5 text-blue-600" />}</button></div>
      <ul className="grid gap-3">{filteredRows.map((ticket, index) => <li key={ticket.id}><Link href={`/support/${ticket.id}`} style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }} className="motion-enter grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl border border-slate-200/60 bg-card px-4 py-4 text-sm shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary xl:grid-cols-[minmax(7rem,0.8fr)_minmax(10rem,1.4fr)_minmax(12rem,2fr)_minmax(7rem,1fr)_5rem_9rem_8rem] xl:items-center">
        <span className="font-mono text-xs font-medium text-primary"><span className="mb-1 block font-sans text-[10px] uppercase text-muted-foreground xl:hidden">Numéro</span>{ticket.numero}</span>
        <span className="min-w-0 text-xs text-foreground"><span className="mb-1 block text-[10px] uppercase text-muted-foreground xl:hidden">Collaborateur</span><span className="block truncate font-medium">{[ticket.collaborateur?.prenom, ticket.collaborateur?.nom].filter(Boolean).join(' ') || 'Profil indisponible'}</span><span className="block truncate text-muted-foreground">{ticket.collaborateur?.identifiant_employe || '—'}</span></span>
        <span className="col-span-2 min-w-0 text-xs font-medium text-foreground xl:col-span-1"><span className="mb-1 block text-[10px] uppercase text-muted-foreground xl:hidden">Demande</span><span className="block truncate">{firstSentence(getTicketSummary(ticket))}</span></span>
        <span className="text-xs text-muted-foreground"><span className="mb-1 block text-[10px] uppercase text-muted-foreground xl:hidden">Catégorie</span>{ticket.categorie || '—'}</span>
        <span><span className="mb-1 block text-[10px] uppercase text-muted-foreground xl:hidden">Niveau</span><LevelBadge level={ticket.niveau} /></span>
        <span><span className="mb-1 block text-[10px] uppercase text-muted-foreground xl:hidden">Statut</span><StatusBadge status={ticket.statut} /></span>
        <span className="text-xs text-muted-foreground"><span className="mb-1 block text-[10px] uppercase text-muted-foreground xl:hidden">Créée le</span>{formatDate(ticket.created_at)}</span>
      </Link></li>)}</ul>
    </div> : <div className="motion-enter flex min-h-56 flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-card px-6 py-10 text-center shadow-sm"><span className="flex size-12 items-center justify-center rounded-full bg-primary/5 text-primary/70"><Inbox aria-hidden="true" className="size-5" /></span><p className="mt-4 text-sm font-medium text-foreground">Aucune demande ici pour le moment</p></div>}
  </section>
}

function Metric({ title, value, icon, accentClassName }: { title: string; value: string | number; icon: ReactNode; accentClassName: string }) {
  return <div className="motion-enter animate-float rounded-2xl border border-slate-200/60 bg-card px-4 py-4 shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none"><div className="flex items-start justify-between gap-3"><p className="text-xs leading-5 text-muted-foreground">{title}</p><span className={`flex size-10 shrink-0 items-center justify-center rounded-full ${accentClassName}`}>{icon}</span></div><p className="mt-3 text-3xl font-semibold tabular-nums text-blue-900">{value}</p></div>
}

function firstSentence(text: string) {
  return text.trim().split(/(?<=[.!?])\s+/u)[0] || text
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value))
}
