import "./globals.css";

export const metadata = {
  title: "Tick.AI — Portail",
  description: "Support IT par agents Tick.AI : créer une demande et suivre son traitement.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>
        <div className="wrap">
          <header className="site">
            <span className="brand">Tick.AI</span>
            <span className="tag">portail de support</span>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
