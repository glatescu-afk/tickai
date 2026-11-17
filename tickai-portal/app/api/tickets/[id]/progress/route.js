import { NextResponse } from "next/server";
import { majTicket, getTicket } from "../../../../lib/store";

// POST /api/tickets/{id}/progress — le runner signale l'avancement (on_progress).
// Body : { "etape": "decision" | "diagnostic" | "action" | "verification" | "termine" }
// STUB : empile l'étape ; un vrai back avancerait le tracker et déclencherait les mails.
export async function POST(req, { params }) {
  const { etape } = await req.json();
  const t = getTicket(params.id);
  if (!t) return new NextResponse(null, { status: 404 });
  const progression = [...(t.progression || []), etape];
  // Cartographie simple étape -> état du tracker (le back affinera).
  const etat = etape === "action" ? "traitement"
    : etape === "verification" ? "a_verifier"
    : t.etat;
  const maj = majTicket(params.id, { progression, etat });
  return NextResponse.json(maj);
}
