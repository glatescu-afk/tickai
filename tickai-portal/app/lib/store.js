// STORE EN MÉMOIRE — provisoire, à remplacer par la base tickets (Vercel Postgres
// / Neon) quand le back arrivera. ⚠️ En serverless, cette mémoire N'EST PAS
// persistante entre deux requêtes : c'est un stub pour voir le flux en local et
// montrer la forme des données. Rien de définitif ici.

const tickets = new Map();

// Un ticket d'exemple pour que les pages affichent toujours quelque chose.
seed();

function seed() {
  if (tickets.size > 0) return;
  creerTicket({
    id: "REQ-DEMO",
    type: "remediation",
    demandeur_email: "camille@exemple.fr",
    action: "reactiver_notifications",
    application: "Microsoft Teams",
    motif: "Je ne reçois plus de notifications Teams.",
    etat: "traitement",
  });
}

export function creerTicket(data) {
  const id = data.id || "REQ-" + Math.random().toString(36).slice(2, 7).toUpperCase();
  const ticket = {
    id,
    etat: data.etat || "envoyee",
    issue: data.issue || null,
    progression: data.progression || [],
    cree_le: new Date().toISOString(),
    ...data,
    id, // garde l'id généré
  };
  tickets.set(id, ticket);
  return ticket;
}

export function getTicket(id) {
  return tickets.get(id) || null;
}

export function majTicket(id, patch) {
  const t = tickets.get(id);
  if (!t) return null;
  const maj = { ...t, ...patch };
  tickets.set(id, maj);
  return maj;
}

export function listerPrets() {
  // Le runner réclamera ici les tickets « prêts » (ex. autorisés + consentis).
  return [...tickets.values()].filter((t) => t.etat === "prise_en_charge");
}
