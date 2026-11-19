import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { N8N_EXECUTION_WEBHOOK_URL } from '@/lib/supabase/config'

const requestSchema = z.object({ demande_id: z.string().uuid() })

// Le collaborateur avait choisi « Plus tard » : il donne maintenant son accord, on lance l'agent (workflow 2).
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Votre session a expiré. Reconnectez-vous.' }, { status: 401 })

  const { data: profile } = await supabase.from('profils').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'client') return Response.json({ error: 'Cette action est réservée à l’espace client.' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'La demande est invalide.' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'La demande est incomplète.' }, { status: 400 })

  const { data: demande } = await supabase.from('demandes').select('id, statut').eq('id', parsed.data.demande_id).eq('user_id', user.id).maybeSingle()
  if (!demande) return Response.json({ error: 'Cette demande est introuvable.' }, { status: 404 })
  if (demande.statut !== 'en_attente_consentement') return Response.json({ error: 'L’intervention a déjà été lancée pour cette demande.' }, { status: 409 })

  // Trace l'accord (uniquement sur un ticket niveau 1 en attente, voir la fonction Supabase).
  const { data: consentOk, error: consentError } = await supabase.rpc('enregistrer_consentement', { p_demande_id: parsed.data.demande_id })
  if (consentError || consentOk !== true) return Response.json({ error: 'Votre accord n’a pas pu être enregistré. Réessayez dans un instant.' }, { status: 409 })

  try {
    const response = await fetch(N8N_EXECUTION_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demande_id: parsed.data.demande_id }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) return Response.json({ error: 'L’intervention n’a pas pu être lancée. Réessayez dans un instant.' }, { status: 502 })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ error: 'L’intervention n’a pas pu être lancée. Réessayez dans un instant.' }, { status: 503 })
  }
}
