import Link from "next/link";
import { getTicket } from "../../lib/store";
import { ETATS, LABELS, indexEtat } from "../../lib/tickets";

export const dynamic = "force-dynamic";

export default function Suivi({ params }) {
  const ticket = getTicket(params.id);
  // En serverless, le store en mémoire peut être vide : on retombe sur un exemple
  // pour que la page montre toujours le tracker. Le back lira la vraie base.
  const etat = ticket?.etat || "traitement";
  const courant = indexEtat(etat);
  const cible = ticket?.application || ticket?.logiciel || "Microsoft Teams";

  return (
    <main>
      <h1>Suivi de ma demande</h1>
      <p className="lede">
        Ticket <strong>{params.id}</strong>
        {ticket ? null : <span className="badge">exemple</span>} · {cible}
      </p>

      <ol className="track">
        {ETATS.map((e, i) => (
          <li key={e} className={i < courant ? "done" : i === courant ? "done current" : ""}>
            <span className="dot">{i + 1}</span>
            <span className="lbl">{LABELS[e]}</span>
          </li>
        ))}
      </ol>

      <Link className="btn-link" href="/demande">Nouvelle demande</Link>

      <p className="stub">
        État affiché en dur tant que le back n'est pas branché. Quand il le sera, cette
        page lira l'état réel du ticket (mis à jour par le runner via{" "}
        <code>/api/tickets/{"{id}"}/progress</code> et <code>/result</code>).
      </p>
    </main>
  );
}
