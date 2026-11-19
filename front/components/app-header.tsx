'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

export function AppHeader({
  children,
  section,
  name,
  showLogout = false,
}: {
  children?: ReactNode
  section?: string
  name?: string
  showLogout?: boolean
}) {
  const router = useRouter()
  const [isScrolled, setIsScrolled] = useState(false)

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 8)
    updateScrollState()
    window.addEventListener('scroll', updateScrollState, { passive: true })
    return () => window.removeEventListener('scroll', updateScrollState)
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/')
    router.refresh()
  }

  return (
    <header className={`sticky top-0 z-40 -mx-5 border-b border-slate-200/70 bg-white/70 backdrop-blur-md transition-shadow duration-200 sm:-mx-8 ${isScrolled ? 'shadow-[0_4px_18px_rgba(30,58,138,0.10)]' : ''}`}>
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-md text-base font-semibold tracking-tight text-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Tick.AI, accueil"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-tickai.png" alt="Tick.AI" width={143} height={96} className="h-11 w-auto select-none" draggable={false} />
          </Link>
          {section ? <span className="hidden truncate border-l border-border pl-3 text-xs text-zinc-500 xl:inline">{section}</span> : null}
        </div>


        <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
          {name ? <span className="hidden truncate text-sm text-zinc-400 md:inline">{name}</span> : null}
          {children}
          {showLogout ? (
            <Button type="button" variant="outline" size="sm" onClick={signOut} className="border-border bg-card text-zinc-300 hover:border-primary/40 hover:bg-muted hover:text-foreground">
              Déconnexion
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  )
}
