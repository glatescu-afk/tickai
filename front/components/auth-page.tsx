import { ShieldCheck } from 'lucide-react'
import { AppHeader } from '@/components/app-header'
import { AuthForm } from '@/components/auth-form'

type AuthMode = 'client-login' | 'client-signup' | 'support-login'

const pageCopy: Record<AuthMode, { title: string; description: string; label: string }> = {
  'client-login': {
    title: 'Connexion à votre espace.',
    description: 'Connectez-vous pour suivre vos demandes et retrouver vos échanges.',
    label: 'ESPACE CLIENT',
  },
  'client-signup': {
    title: 'Créez votre espace.',
    description: 'Créez votre compte collaborateur pour contacter le support IT.',
    label: 'CRÉER UN COMPTE CLIENT',
  },
  'support-login': {
    title: 'Se connecter',
    description: 'Connectez-vous à votre espace de travail support IT.',
    label: 'ESPACE ENTREPRISE',
  },
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const copy = pageCopy[mode]

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 sm:px-8">
      <AppHeader section="Connexion" />
      <section className="flex flex-1 items-center justify-center py-12">
        <div className="animate-float float-always grid w-full max-w-4xl overflow-hidden rounded-3xl border border-border bg-card/90 shadow-sm md:grid-cols-[0.85fr_1.15fr]">
          <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.07] bg-card p-8 md:flex">
            <div style={{ animationDelay: '0.6s' }} className="float-tag relative flex size-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
              <ShieldCheck aria-hidden="true" className="size-6" />
            </div>
            <div className="relative">
              <p className="text-xs font-medium tracking-[0.18em] text-primary">TICK.AI</p>
              <p className="mt-3 text-2xl font-medium leading-snug text-white">Du signalement à la résolution.</p>
              <p className="mt-3 max-w-xs text-sm leading-6 text-slate-400">Suivez vos demandes et leurs résolutions.</p>
            </div>
            <p className="relative text-xs text-slate-600">Assistance claire. Suivi en temps réel.</p>
          </div>
          <div className="p-6 sm:p-9 md:p-10">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-primary">{copy.label}</p>
            <h1 className="page-title-gradient mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{copy.title}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-400">{copy.description}</p>
            <div className="mt-7">
              <AuthForm mode={mode} />
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
