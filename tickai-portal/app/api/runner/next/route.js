import { NextResponse } from "next/server";
import { listerPrets } from "../../../lib/store";

// Toujours exécuté à la demande (jamais mis en cache statique).
export const dynamic = "force-dynamic";

// GET /api/runner/next — le runner Python réclame un ticket prêt à traiter.
// STUB : renvoie le premier ticket « prêt », ou 204 s'il n'y en a pas.
// À sécuriser (Authorization: Bearer RUNNER_TOKEN) et à brancher sur la base.
export async function GET() {
  const prets = listerPrets();
  if (prets.length === 0) {
    return new NextResponse(null, { status: 204 });
  }
  // On renvoie la forme Ticket attendue par engine.Ticket (côté runner).
  return NextResponse.json(prets[0]);
}
