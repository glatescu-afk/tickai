import Link from 'next/link'
import { ArrowUpRight, Building2, CircleUserRound } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { Card, CardContent } from '@/components/ui/card'

const spaces = [
  {
    title: 'Espace client',
    description: 'Ouvrez une demande, suivez son avancement et retrouvez vos résolutions.',
    audience: 'COLLABORATEURS',
    href: '/client/connexion',
    icon: CircleUserRound,
    accent: 'primary',
  },
  {
    title: 'Espace entreprise',
    description: 'Un espace dédié aux équipes support et aux opérations IT.',
    audience: 'ÉQUIPES SUPPORT IT',
    href: '/support/connexion',
    icon: Building2,
    accent: 'cyan',
  },
]

export default function HomePage() {
  return (
    <main className="relative isolate flex min-h-screen flex-col overflow-x-clip px-5 sm:px-8">
      <AppHeader section="SUPPORT IT" />

      <section className="mx-auto flex w-full flex-1 flex-col items-center justify-center py-10 text-center sm:py-12">
        <p className="text-xl font-medium text-primary sm:text-2xl">Une expérience support plus fluide</p>
        <h1 className="page-title-gradient mt-3 text-balance text-5xl font-semibold leading-[1.03] tracking-[-0.05em] sm:text-6xl">
          Du signalement à la <span>résolution.</span>
        </h1>

        <div className="home-card-grid mt-10 grid w-full max-w-4xl grid-cols-1 gap-8 sm:grid-cols-2">
          {spaces.map((space) => {
            const Icon = space.icon
            const isClient = space.accent === 'primary'
            return (
              <Link key={space.href} href={space.href} aria-label={`Accéder à ${space.title}`} className="group rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background">
                <Card className="animate-float h-full cursor-pointer border-border bg-card/90 py-0 shadow-[0_2px_8px_rgba(37,99,235,0.12)] transition-all duration-200 group-hover:-translate-y-1 group-hover:border-blue-300 group-hover:bg-card group-hover:shadow-[0_8px_20px_rgba(37,99,235,0.18)] motion-reduce:transform-none motion-reduce:transition-none">
                  <CardContent className="flex h-full min-h-48 flex-col p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[9px] font-medium tracking-[0.1em] text-blue-700">{space.audience}</span>
                      <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl border ${isClient ? 'border-primary/20 bg-primary/10 text-primary' : 'border-status-cyan/20 bg-status-cyan/10 text-status-cyan'}`}>
                        <Icon aria-hidden="true" className="size-4" />
                      </span>
                    </div>
                    <h2 className="mt-4 text-lg font-semibold tracking-tight text-white">{space.title}</h2>
                    <p className="mt-2 text-xs leading-5 text-slate-400">{space.description}</p>
                    <span className="shine-effect mt-auto inline-flex items-center gap-2 pt-5 text-xs font-medium text-primary">
                      Accéder à l’espace <ArrowUpRight aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </span>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

      </section>
      <footer className="mx-auto flex w-full max-w-6xl items-center justify-between border-t border-white/[0.06] py-3 text-[11px] text-slate-600">
        <span>Tick.AI</span><span>Du signalement à la résolution.</span>
      </footer>
    </main>
  )
}
