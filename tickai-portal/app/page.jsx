import Link from "next/link";

export default function Accueil() {
  return (
    <main>
      <h1>Un souci informatique ?</h1>
      <p className="lede">
        Décris ta demande : Tick.AI l'analyse, agit sur la bonne interface et vérifie
        le résultat. Tu suis l'avancement en direct.
      </p>
      <div className="card">
        <p style={{ margin: 0 }}>
          Deux types de demande pris en charge aujourd'hui :
        </p>
        <ul className="muted" style={{ marginBottom: 0 }}>
          <li><strong>Accès logiciel</strong> — création ou renouvellement d'un accès.</li>
          <li><strong>Problème logiciel</strong> — ex. notifications qui ne marchent plus.</li>
        </ul>
        <Link className="btn-link" href="/demande">Créer une demande</Link>
      </div>
      <p className="stub">
        Front de démonstration. Le back (base tickets, routes runner, n8n) se branche
        sur les mêmes routes <code>/api/*</code>, déjà présentes en stub.
      </p>
    </main>
  );
}
