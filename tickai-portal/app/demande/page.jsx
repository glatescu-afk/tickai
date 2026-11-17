"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Demande() {
  const router = useRouter();
  const [type, setType] = useState("remediation");
  const [envoi, setEnvoi] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setEnvoi(true);
    const f = new FormData(e.currentTarget);
    // Forme alignée sur engine.Ticket (le back/runner la consommera telle quelle).
    const demande = {
      type,
      demandeur_email: f.get("email"),
      motif: f.get("motif"),
      ...(type === "acces_logiciel"
        ? { role: f.get("role"), logiciel: f.get("logiciel") }
        : { action: f.get("action"), application: f.get("application") }),
    };
    try {
      const r = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demande),
      });
      const t = await r.json();
      router.push(`/suivi/${t.id}`);
    } catch {
      setEnvoi(false);
      alert("Envoi impossible (stub). Réessaie.");
    }
  }

  return (
    <main>
      <h1>Nouvelle demande</h1>
      <p className="lede">Un seul ticket sera créé. Tu recevras un lien de suivi.</p>
      <form className="card" onSubmit={onSubmit}>
        <label htmlFor="type">Type de demande</label>
        <select id="type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="remediation">Problème logiciel (N2)</option>
          <option value="acces_logiciel">Accès logiciel (N1)</option>
        </select>

        <label htmlFor="email">Ton email</label>
        <input id="email" name="email" type="email" required defaultValue="camille@exemple.fr" />

        {type === "acces_logiciel" ? (
          <>
            <label htmlFor="role">Ton rôle</label>
            <input id="role" name="role" required defaultValue="design" />
            <label htmlFor="logiciel">Logiciel demandé</label>
            <input id="logiciel" name="logiciel" required defaultValue="Figma" />
          </>
        ) : (
          <>
            <label htmlFor="action">Que faut-il faire ?</label>
            <input id="action" name="action" required defaultValue="reactiver_notifications" />
            <label htmlFor="application">Application concernée</label>
            <input id="application" name="application" required defaultValue="Microsoft Teams" />
          </>
        )}

        <label htmlFor="motif">Décris ton besoin</label>
        <textarea id="motif" name="motif" defaultValue="Je ne reçois plus mes notifications Teams." />

        <button type="submit" disabled={envoi}>{envoi ? "Envoi…" : "Créer la demande"}</button>
        <p className="hint">
          Les champs reprennent la forme <code>Ticket</code> de l'engine — le runner la
          consommera sans transformation.
        </p>
      </form>
    </main>
  );
}
