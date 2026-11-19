'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  return (
    <Button variant="outline" size="sm" onClick={signOut} className="border-border bg-card text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground">
      <LogOut data-icon="inline-start" />
      Déconnexion
    </Button>
  )
}
