import { NextResponse } from "next/server";
import { creerTicket } from "../../lib/store";

// POST /api/tickets — crée un ticket (appelé par le formulaire ET par n8n).
// STUB : écrit dans le store en mémoire. À remplacer par un insert en base.
export async function POST(req) {
  const demande = await req.json();
  // TODO (back) : valider la forme Ticket, écrire en base, renvoyer l'id de suivi.
  const ticket = creerTicket({ ...demande, etat: "envoyee" });
  return NextResponse.json(ticket, { status: 201 });
}
