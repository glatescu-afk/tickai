'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoaderCircle, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Affiché au collaborateur quand l'agent attend son accord (il avait choisi « Plus tard »).
export function LaunchInterventionBox({ demandeId, onLaunched }: { demandeId: string; onLaunched?: () => void }) {
  const [isLaunching, setIsLaunching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [launched, setLaunched] = useState(false)
  const router = useRouter()

  async function launch() {
    if (isLaunching) return
    setIsLaunching(true)
    setError(null)
    try {
      const response = await fetch('/api/client/lancer-intervention', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demande_id: demandeId }),
      })
      const payload = await response.json().catch(() => ({})) as { error?: string }
      if (!response.ok) {
        setError(payload.error ?? 'L’intervention n’a pas pu être lancée. Réessayez dans un instant.')
        return
      }
      setLaunched(true)
      onLaunched?.()
      router.refresh()
    } catch {
      setError('L’intervention n’a pas pu être lancée. Réessayez dans un instant.')
    } finally {
      setIsLaunching(false)
    }
  }

  if (launched) {
    return <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900 shadow-sm" role="status">L’intervention est lancée. Ne touchez pas à votre souris ni à votre clavier pendant environ 1 minute.</section>
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5" aria-labelledby={`launch-${demandeId}`}>
      <h2 id={`launch-${demandeId}`} className="font-semibold text-amber-900">L’agent attend votre accord</h2>
      <p className="mt-2 text-sm leading-6 text-slate-700">Quand vous êtes disponible, lancez l’intervention : l’agent Tick.AI prendra la main sur votre ordinateur pendant environ 1 minute. Ne touchez pas à votre souris ni à votre clavier pendant l’intervention.</p>
      {error ? <p role="alert" className="mt-3 rounded-xl border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">{error}</p> : null}
      <Button type="button" onClick={() => void launch()} disabled={isLaunching} className="mt-4 h-10 bg-primary px-4 text-primary-foreground hover:bg-primary/90">
        {isLaunching ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Play aria-hidden="true" className="size-4" />}
        {isLaunching ? 'Lancement…' : 'Lancer l’intervention maintenant'}
      </Button>
    </section>
  )
}
