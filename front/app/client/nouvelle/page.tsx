import type { Metadata } from 'next'
import { AppHeader } from '@/components/app-header'
import { NewRequestWizard } from '@/components/new-request-wizard'
import { SignOutButton } from '@/components/sign-out-button'
import { requireRole } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'Faire une demande ticket',
  description: 'Décrivez votre demande et transmettez-la au support Tick.AI.',
  robots: { index: false, follow: false },
}

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ demande?: string }> }) {
  const [{ user, profile }, query] = await Promise.all([requireRole('client'), searchParams])

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8">
      <AppHeader><SignOutButton /></AppHeader>
      <NewRequestWizard profile={profile} email={profile.email ?? user.email ?? null} initialDemandeId={query.demande} />
    </main>
  )
}
