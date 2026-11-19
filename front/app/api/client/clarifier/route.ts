import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { N8N_WEBHOOK_URL } from '@/lib/supabase/config'

const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('message'),
    demande_id: z.string().uuid(),
    texte: z.string().trim().min(1).max(1200).optional(),
  }),
  z.object({ action: z.literal('valider'), demande_id: z.string().uuid(), consentement: z.boolean().optional() }),
])

function getWebhookRecord(value: unknown): Record<string, unknown> | null {
  const record = Array.isArray(value) ? value[0] : value
  return record && typeof record === 'object' ? record as Record<string, unknown> : null
}

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

  const { data: demande } = await supabase.from('demandes').select('id').eq('id', parsed.data.demande_id).eq('user_id', user.id).maybeSingle()
  if (!demande) return Response.json({ error: 'Cette demande est introuvable.' }, { status: 404 })

  // Niveau 1 : on trace l'accord du collaborateur AVANT de lancer la validation (l'agent démarre juste après).
  if (parsed.data.action === 'valider' && parsed.data.consentement === true) {
    const { data: consentOk, error: consentError } = await supabase.rpc('enregistrer_consentement', { p_demande_id: parsed.data.demande_id })
    if (consentError || consentOk !== true) {
      return Response.json({ error: 'Votre accord n’a pas pu être enregistré. Réessayez dans un instant.' }, { status: 409 })
    }
  }
  const webhookBody = parsed.data.action === 'valider' ? { action: 'valider', demande_id: parsed.data.demande_id } : parsed.data

  try {
    const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookBody),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    const responseText = await webhookResponse.text()
    let responseBody: unknown
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      return Response.json({ error: 'La réponse du webhook est invalide.' }, { status: 502 })
    }
    if (!webhookResponse.ok) return Response.json({ error: 'Le webhook n’a pas pu traiter la demande.' }, { status: 502 })

    const record = getWebhookRecord(responseBody)
    if (!record) return Response.json({ error: 'La réponse du webhook est incomplète.' }, { status: 502 })

    if (parsed.data.action === 'valider') {
      if (record.ok !== true) return Response.json({ error: 'La validation n’a pas abouti.' }, { status: 502 })
      return Response.json({ ok: true, numero: typeof record.numero === 'string' ? record.numero : null, niveau: record.niveau === 1 ? 1 : record.niveau === 2 ? 2 : null })
    }

    const type = record.type
    const texte = typeof record.texte === 'string' ? record.texte.trim() : ''
    if ((type !== 'question' && type !== 'resume') || !texte) {
      return Response.json({ error: 'La réponse du webhook est incomplète.' }, { status: 502 })
    }
    return Response.json({ type, texte, niveau: record.niveau === 1 || record.niveau === 2 ? record.niveau : null })
  } catch {
    return Response.json({ error: 'Le conseiller est temporairement indisponible.' }, { status: 503 })
  }
}
