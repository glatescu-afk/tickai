import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { SignOutButton } from '@/components/sign-out-button'
import { LiveTicketDetail } from '@/components/live-ticket-detail'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Ticket, TicketCardData } from '@/lib/types'
import { notFound } from 'next/navigation'

const ticketColumns = 'id, numero, user_id, description_initiale, resume_je, resume_propose, description_finale, categorie_id, niveau, statut, resultat, preuve, diagnostic, created_at, updated_at'

export default async function ClientTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, profile } = await requireRole('client')
  const supabase = await createClient()
  const { data } = await supabase
    .from('demandes')
    .select(ticketColumns)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) notFound()

  const ticket = data as Ticket
  let categoryName: string | null = null
  if (ticket.categorie_id) {
    const { data: category } = await supabase
      .from('categories')
      .select('nom')
      .eq('id', ticket.categorie_id)
      .maybeSingle()
    categoryName = category?.nom ?? null
  }

  const ticketDetails: TicketCardData = {
    ...ticket,
    nom: profile.nom,
    prenom: profile.prenom,
    identifiant_employe: profile.identifiant_employe,
    poste: profile.poste,
    email: profile.email ?? user.email ?? null,
    categorie: categoryName,
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
      <AppHeader><SignOutButton /></AppHeader>
      <section className="mx-auto max-w-3xl pb-16 pt-9 sm:pt-12">
        <Link href="/client" className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-white">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Toutes mes demandes
        </Link>
        <div className="mb-6 mt-8 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"><FileText aria-hidden="true" className="size-5" /></span>
          <div>
            <p className="text-xs font-medium tracking-[0.14em] text-primary">DÉTAIL DE LA DEMANDE</p>
            <h1 className="page-title-gradient mt-1 text-2xl font-semibold">{ticket.numero}</h1>
          </div>
        </div>
        <LiveTicketDetail ticket={ticketDetails} userId={user.id} />
      </section>
    </main>
  )
}
