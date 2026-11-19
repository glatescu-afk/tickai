export type UserRole = 'client' | 'support'

export type Profile = {
  id: string
  nom: string | null
  prenom: string | null
  identifiant_employe: string | null
  poste: string | null
  email: string | null
  role: UserRole
  created_at: string
}

export type Ticket = {
  id: string
  numero: string
  user_id: string
  description_initiale: string
  resume_je: string | null
  resume_propose: string | null
  description_finale: string | null
  categorie_id: string | number | null
  niveau: 1 | 2
  statut: string
  resultat: string | null
  preuve: string | null
  diagnostic: string | null
  consentement_agent?: boolean | null
  consentement_at?: string | null
  duree_s?: number | null
  created_at: string
  updated_at: string
}

export type TicketCardData = Ticket & {
  nom?: string | null
  prenom?: string | null
  identifiant_employe?: string | null
  poste?: string | null
  email?: string | null
  categorie?: string | null
}

export function getTicketSummary(ticket: Ticket) {
  return ticket.description_finale || ticket.resume_propose || ticket.description_initiale
}

export function getClientTicketSummary(ticket: Ticket) {
  return ticket.resume_je || ticket.resume_propose || ticket.description_initiale
}
