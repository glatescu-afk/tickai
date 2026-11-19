import Link from 'next/link'
import { Plus, TicketCheck } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { RequestsList } from '@/components/requests-list'
import { SignOutButton } from '@/components/sign-out-button'
import { requireRole } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { Ticket } from '@/lib/types'

const ticketColumns = 'id, numero, user_id, description_initiale, resume_je, resume_propose, description_finale, categorie_id, niveau, statut, resultat, preuve, diagnostic, created_at, updated_at'

export default async function ClientHomePage() {
  const { user, profile } = await requireRole('client')
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('demandes')
    .select(ticketColumns)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
      <AppHeader><SignOutButton /></AppHeader>
      <section className="pb-16 pt-10 sm:pt-14">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-primary">
              <TicketCheck aria-hidden="true" className="size-4" />
              ESPACE COLLABORATEUR
            </p>
            <h1 className="page-title-gradient mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Bonjour{profile.prenom ? ` ${profile.prenom}` : ''}
            </h1>
            <p className="mt-2 text-sm text-slate-400">Consultez l’avancement de vos demandes et les prochaines étapes.</p>
          </div>
          <Link href="/client/nouvelle" className="shine-effect inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Plus aria-hidden="true" className="size-4" />
            Faire une demande ticket
          </Link>
        </div>

        <div className="mt-11">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Mes demandes</h2>
              <p className="mt-1 text-sm text-zinc-500">Chaque étape se met à jour dès que votre ticket évolue.</p>
            </div>
            {data && data.length > 0 ? <span className="rounded-full border border-blue-200 bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-800 shadow-sm">{data.length} demande{data.length === 1 ? '' : 's'}</span> : null}
          </div>
          {error ? (
            <p role="alert" className="rounded-xl border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">Impossible de charger les demandes. Vérifiez la configuration d’accès aux tickets.</p>
          ) : (
            <RequestsList userId={user.id} initialTickets={(data ?? []) as Ticket[]} />
          )}
        </div>
      </section>
    </main>
  )
}
