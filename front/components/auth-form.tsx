'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/client'

type AuthMode = 'client-login' | 'client-signup' | 'support-login'

function authErrorMessage(code: string | undefined, signUp = false) {
  if (code === 'email_not_confirmed') return 'Confirmez votre adresse e-mail avant de vous connecter.'
  if (code === 'over_email_send_rate_limit') return 'Trop de tentatives. Réessayez un peu plus tard.'
  if (code === 'weak_password') return 'Choisissez un mot de passe plus robuste.'
  if (signUp) return 'Impossible de créer le compte. Vérifiez les informations puis réessayez.'
  if (code === 'invalid_credentials' || code === 'user_not_found') return 'Adresse e-mail ou mot de passe incorrect.'
  return 'Une erreur est survenue. Réessayez dans quelques instants.'
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const [error, setError] = useState('')
  const [employeeIdError, setEmployeeIdError] = useState('')
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isSignUp = mode === 'client-signup'
  const isSupport = mode === 'support-login'

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')
    const supabase = createClient()

    if (isSignUp) {
      const identifiantEmploye = String(formData.get('identifiant_employe') ?? '').trim()
      if (!/^J\d{4}$/.test(identifiantEmploye)) {
        setEmployeeIdError('L’identifiant doit commencer par J et être suivi de 4 chiffres (ex. J4821).')
        return
      }
      setEmployeeIdError('')

      setIsSubmitting(true)
      try {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ??
              `${window.location.origin}/auth/callback`,
            data: {
              nom: String(formData.get('nom') ?? '').trim(),
              prenom: String(formData.get('prenom') ?? '').trim(),
              identifiant_employe: identifiantEmploye,
              poste: String(formData.get('poste') ?? '').trim(),
            },
          },
        })

        if (signUpError) {
          setError(authErrorMessage(signUpError.code, true))
          return
        }

        if (data.session) {
          window.location.assign('/client')
          return
        }

        setNotice('Vérifiez votre boîte mail pour confirmer votre compte.')
      } catch {
        setError('Une erreur est survenue. Réessayez dans quelques instants.')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) {
        setError(authErrorMessage(signInError.code))
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profils')
        .select('role')
        .eq('id', data.user.id)
        .maybeSingle()

      const expectedRole = isSupport ? 'support' : 'client'
      if (profileError) {
        await supabase.auth.signOut()
        setError('Impossible de vérifier les droits de ce compte. Réessayez.')
        return
      }
      if (profile?.role !== expectedRole) {
        if (isSupport && profile?.role === 'client') {
          window.location.assign('/support')
          return
        }
        await supabase.auth.signOut()
        setError('Ce compte ne peut pas accéder à cet espace.')
        return
      }

      window.location.assign(isSupport ? '/support' : '/client')
    } catch {
      setError('Une erreur est survenue. Réessayez dans quelques instants.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <FieldGroup className="gap-4">
        {isSignUp && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="prenom" className="text-slate-300">Prénom</FieldLabel>
                <Input id="prenom" name="prenom" autoComplete="given-name" required placeholder="Camille" className="auth-input" />
              </Field>
              <Field>
                <FieldLabel htmlFor="nom" className="text-slate-300">Nom</FieldLabel>
                <Input id="nom" name="nom" autoComplete="family-name" required placeholder="Martin" className="auth-input" />
              </Field>
            </div>
            <Field data-invalid={Boolean(employeeIdError)}>
              <FieldLabel htmlFor="identifiant_employe" className="text-slate-300">Identifiant employé</FieldLabel>
              <Input id="identifiant_employe" name="identifiant_employe" autoComplete="off" required placeholder="J4821" aria-invalid={Boolean(employeeIdError)} aria-describedby={employeeIdError ? 'employee-id-error' : 'employee-id-help'} className="auth-input" />
              {employeeIdError ? (
                <p id="employee-id-error" role="alert" className="text-xs text-status-danger">{employeeIdError}</p>
              ) : (
                <p id="employee-id-help" className="text-xs text-slate-500">Format requis : J suivi de 4 chiffres.</p>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="poste" className="text-slate-300">Poste</FieldLabel>
              <Input id="poste" name="poste" autoComplete="organization-title" required placeholder="Ex. Responsable de site" className="auth-input" />
            </Field>
          </>
        )}
        <Field>
          <FieldLabel htmlFor="email" className="text-slate-300">Adresse e-mail</FieldLabel>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="prenom.nom@entreprise.fr" className="auth-input" />
        </Field>
        <Field>
          <FieldLabel htmlFor="password" className="text-slate-300">Mot de passe</FieldLabel>
          <Input id="password" name="password" type="password" autoComplete={isSignUp ? 'new-password' : 'current-password'} required minLength={6} placeholder="••••••••" className="auth-input" />
        </Field>
      </FieldGroup>

      {error && <p role="alert" className="rounded-xl border border-status-danger/20 bg-status-danger/5 px-4 py-3 text-sm text-status-danger">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-status-success/20 bg-status-success/5 px-4 py-3 text-sm text-status-success">{notice}</p>}

      <Button type="submit" disabled={isSubmitting} className="h-11 w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90">
        {isSubmitting ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : null}
        {isSubmitting ? 'Connexion en cours…' : isSignUp ? 'Créer mon compte' : 'Se connecter'}
      </Button>

      {isSupport ? (
        <Button type="button" variant="outline" disabled className="no-glow h-11 w-full border-slate-200 bg-transparent text-slate-500">
          Créer un compte
        </Button>
      ) : null}

      {mode === 'client-login' ? (
        <p className="text-center text-sm text-slate-400">
          Pas encore de compte ?{' '}
          <Link href="/client/inscription" className="font-medium text-primary hover:text-primary/80">Créer un compte</Link>
        </p>
      ) : null}
      {isSignUp ? (
        <p className="text-center text-sm text-slate-400">
          Vous avez déjà un compte ?{' '}
          <Link href="/client/connexion" className="font-medium text-primary hover:text-primary/80">Se connecter</Link>
        </p>
      ) : null}
    </form>
  )
}
