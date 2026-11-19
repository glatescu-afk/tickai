'use client'

import { useCallback, useEffect, useMemo } from 'react'
import useSWR from 'swr'
import { TicketCard } from '@/components/ticket-card'
import { createClient } from '@/lib/supabase/client'
import type { TicketCardData } from '@/lib/types'

type TicketUpdate = Pick<TicketCardData, 'statut' | 'preuve' | 'resultat' | 'diagnostic' | 'updated_at'>

export function LiveTicketDetail({ ticket, userId }: { ticket: TicketCardData; userId: string }) {
  const supabase = useMemo(() => createClient(), [])
  const fetcher = useCallback(async (): Promise<TicketUpdate | null> => {
    const { data, error } = await supabase
      .from('demandes')
      .select('statut, preuve, resultat, diagnostic, updated_at')
      .eq('id', ticket.id)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw error
    return data as TicketUpdate | null
  }, [supabase, ticket.id, userId])

  const { data: latestUpdate, mutate } = useSWR(['demande-detail', ticket.id, userId], fetcher, {
    fallbackData: {
      statut: ticket.statut,
      preuve: ticket.preuve,
      resultat: ticket.resultat,
      diagnostic: ticket.diagnostic,
      updated_at: ticket.updated_at,
    },
    revalidateOnFocus: true,
  })

  useEffect(() => {
    const channel = supabase
      .channel(`demande-detail-${ticket.id}-${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'demandes',
        filter: `user_id=eq.${userId}`,
      }, () => {
        void mutate()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [supabase, ticket.id, userId, mutate])

  const liveTicket = latestUpdate ? { ...ticket, ...latestUpdate } : ticket

  return <TicketCard ticket={liveTicket} readOnly showNiveau={false} clientView />
}
