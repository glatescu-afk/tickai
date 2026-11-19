import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppHeader } from '@/components/app-header'
import { SignOutButton } from '@/components/sign-out-button'
import { SupportDashboard } from '@/components/support-dashboard'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Ticket } from '@/lib/types'

const ticketColumns = 'id, numero, user_id, description_initiale, resume_propose, description_finale, categorie_id, niveau, statut, resultat, preuve, diagnostic, created_at, updated_at'

export const metadata: Metadata = { title: 'Tableau de bord support' }

export default async function SupportDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/support/connexion')
  const { data: profile } = await supabase.from('profils').select('id, nom, prenom, identifiant_employe, poste, email, role, created_at').eq('id', user.id).maybeSingle()

  if (profile?.role !== 'support') return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
      <AppHeader section="TABLEAU DE BORD SUPPORT"><SignOutButton /></AppHeader>
      <section className="mx-auto max-w-xl py-20 text-center">
        <h1 className="page-title-gradient text-2xl font-semibold">Accès réservé au support IT</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Ce compte n’est pas autorisé à consulter les tickets de l’entreprise.</p>
        <Link href="/client" className="mt-5 inline-flex text-sm font-medium text-primary hover:text-primary/80">Rejoindre l’espace collaborateur</Link>
      </section>
    </main>
  )

  const [{ data: tickets }, { data: profiles }, { data: categories }] = await Promise.all([
    supabase.from('demandes').select(ticketColumns).order('created_at', { ascending: false }),
    supabase.from('profils').select('id, nom, prenom, identifiant_employe, poste, email, role, created_at'),
    supabase.from('categories').select('id, nom'),
  ])

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
    <AppHeader><SignOutButton /></AppHeader>
    <SupportDashboard initialTickets={(tickets ?? []) as Ticket[]} profiles={(profiles ?? []) as Profile[]} categories={categories ?? []} />
  </main>
}
