'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { StatusBadge } from '@/components/ticket-badges'

type Ticket = { id: string; numero: string; created_at: string; description_finale: string | null; resume_propose: string | null; description_initiale: string; niveau: number | string | null; statut: string | null }

export function ClientTicketList({ initialTickets, userId }: { initialTickets: Ticket[]; userId: string }) {
  const [tickets, setTickets] = useState(initialTickets)
  useEffect(() => {
    const supabase = createClient()
    const refreshTickets = async () => {
      const { data } = await supabase.from('demandes').select('id,numero,created_at,description_finale,resume_propose,description_initiale,niveau,statut').eq('user_id', userId).order('created_at', { ascending: false })
      if (data) setTickets(data as Ticket[])
    }
    const channel = supabase.channel(`demandes-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'demandes', filter: `user_id=eq.${userId}` }, refreshTickets)
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [userId])

  if (tickets.length === 0) return <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center sm:py-20">
    <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-xl text-primary" aria-hidden="true">＋</div>
    <h2 className="mt-5 text-lg font-medium text-white">Aucune demande pour le moment</h2>
    <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Vos demandes de support apparaîtront ici. Créez un ticket pour commencer.</p>
    <Link href="/client/nouvelle" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm">Faire une demande ticket</Link>
  </div>

  return <div className="grid gap-3">
    {tickets.map((ticket) => <Link key={ticket.id} href={`/client/demandes/${ticket.id}`} className="group rounded-2xl border border-border bg-card/90 p-5 shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="font-mono text-sm text-primary">{ticket.numero}</p><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(ticket.created_at))}</p></div>
        <div className="flex flex-wrap items-center gap-2"><StatusBadge status={ticket.statut} /></div>
      </div>
      <p className="mt-4 line-clamp-2 text-sm leading-6 text-foreground">{ticket.description_finale || ticket.resume_propose || ticket.description_initiale}</p>
      <p className="mt-3 text-xs text-muted-foreground group-hover:text-primary">Voir la demande <span aria-hidden="true">→</span></p>
    </Link>)}
  </div>
}
