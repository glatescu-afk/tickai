import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Profile, UserRole } from '@/lib/types'

const loginRoutes: Record<UserRole, string> = {
  client: '/client/connexion',
  support: '/support/connexion',
}

export async function requireRole(role: UserRole): Promise<{ user: User; profile: Profile }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(loginRoutes[role])

  const { data: profile } = await supabase
    .from('profils')
    .select('id, nom, prenom, identifiant_employe, poste, email, role, created_at')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== role) redirect(loginRoutes[role])

  return { user, profile: profile as Profile }
}
