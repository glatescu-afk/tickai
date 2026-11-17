import { NextResponse } from "next/server";
import { majTicket, getTicket } from "../../../../lib/store";
import { etatFromIssue } from "../../../../lib/tickets";

// POST /api/tickets/{id}/result — le runner renvoie le Resultat final (engine.Resultat).
// STUB : stocke l'issue + passe le tracker à l'état correspondant.
// ⚠️ On NE clôture PAS automatiquement sur `resolu` : la clôture vient de la
// confirmation de l'utilisateur (étape F du flowchart).
export async function POST(req, { params }) {
  const resultat = await req.json();
  const t = getTicket(params.id);
  if (!t) return new NextResponse(null, { status: 404 });
  const etat = etatFromIssue(resultat.issue);
  const maj = majTicket(params.id, {
    issue: resultat.issue,
    verifie: resultat.verifie ?? null,
    preuve: resultat.preuve || "",
    etat, // reste "resolu" au mieux ; "cloture" seulement après confirmation user
  });
  return NextResponse.json(maj);
}
