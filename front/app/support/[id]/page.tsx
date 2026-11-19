import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { SignOutButton } from '@/components/sign-out-button'
import { SupportTicketDetail } from '@/components/support-ticket-detail'
import { createClient } from '@/lib/supabase/server'
import type { Ticket, TicketCardData } from '@/lib/types'

export const metadata: Metadata = { title: 'Tableau de bord support' }

export default async function SupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/support/connexion')
  const { data: actor } = await supabase.from('profils').select('role').eq('id', user.id).maybeSingle()
  if (actor?.role !== 'support') redirect('/support')

  const { data: ticket } = await supabase.from('demandes')
    .select('id, numero, user_id, description_initiale, resume_propose, description_finale, categorie_id, niveau, statut, resultat, preuve, diagnostic, created_at, updated_at')
    .eq('id', id).maybeSingle()
  if (!ticket) notFound()

  const [{ data: collaborator }, { data: category }, { data: messages }, { data: journal }] = await Promise.all([
    supabase.from('profils').select('id, nom, prenom, identifiant_employe, poste, email, role, created_at').eq('id', ticket.user_id).maybeSingle(),
    ticket.categorie_id ? supabase.from('categories').select('nom').eq('id', ticket.categorie_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('messages').select('demande_id, role, contenu, created_at').eq('demande_id', id).order('created_at', { ascending: true }),
    supabase.from('journal').select('demande_id, evenement, details, created_at').eq('demande_id', id).order('created_at', { ascending: true }),
  ])
  const ticketDetails: TicketCardData = {
    ...(ticket as Ticket),
    nom: collaborator?.nom,
    prenom: collaborator?.prenom,
    identifiant_employe: collaborator?.identifiant_employe,
    poste: collaborator?.poste,
    email: collaborator?.email,
    categorie: category?.nom ?? null,
  }

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
    <AppHeader><SignOutButton /></AppHeader>
    <section className="mx-auto max-w-4xl pb-16 pt-8 sm:pt-10">
      <Link href="/support" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft aria-hidden="true" className="size-4" />Retour au tableau de bord support</Link>
      <SupportTicketDetail initialTicket={ticketDetails} initialMessages={messages ?? []} initialJournal={journal ?? []} />
    </section>
  </main>
}
