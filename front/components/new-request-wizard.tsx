'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  LoaderCircle,
  Mail,
  MessageSquareText,
  Send,
  Ticket,
  TicketCheck,
} from 'lucide-react'
import { ProgressSteps } from '@/components/progress-steps'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageAvatar, MessageContent, MessageHeader } from '@/components/ui/message'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { getMockChatbotReply, type MockChatMessage } from '@/lib/mock-chatbot'
import type { Profile } from '@/lib/types'

type ChatMessage = MockChatMessage

type ClarificationResponse = {
  type: 'question' | 'resume'
  texte: string
  texte_je?: string
  niveau: 1 | 2 | null
}

type CreatedTicket = {
  id: string
  numero: string | null
  createdAt: string
}

type WizardProps = {
  profile: Profile
  email: string | null
  initialDemandeId?: string
}

export function NewRequestWizard({ profile, email, initialDemandeId }: WizardProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [description, setDescription] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [summary, setSummary] = useState<string | null>(null)
  const [readyToConfirm, setReadyToConfirm] = useState(false)
  const [categoryName, setCategoryName] = useState<string | null>(null)
  const [niveau, setNiveau] = useState<1 | 2>(2)
  const [consent, setConsent] = useState(false)
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [assistantError, setAssistantError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isCreatingDraft, setIsCreatingDraft] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdTicket, setCreatedTicket] = useState<CreatedTicket | null>(null)
  const [isTestMode, setIsTestMode] = useState(false)
  const [pauseConfirmed, setPauseConfirmed] = useState(false)

  const canContinue = description.trim().length > 0

  useEffect(() => {
    if (!initialDemandeId) return
    let cancelled = false
    async function restoreConversation() {
      const supabase = createClient()
      const [{ data: demande }, { data: rows }] = await Promise.all([
        supabase.from('demandes').select('id, numero, created_at, description_initiale, resume_je, resume_propose, niveau, categorie_id').eq('id', initialDemandeId).eq('user_id', profile.id).maybeSingle(),
        supabase.from('messages').select('role, contenu').eq('demande_id', initialDemandeId).order('created_at', { ascending: true }),
      ])
      if (cancelled || !demande) return
      const transcriptRows = ((rows ?? []) as { role: string; contenu: string }[]).filter((row) => row.role === 'user' || row.role === 'assistant')
      const lastAssistantIndex = transcriptRows.reduce((last, row, index) => row.role === 'assistant' ? index : last, -1)
      const hasSavedSummary = Boolean(demande.resume_je || demande.resume_propose)
      const savedSummary = demande.resume_je || demande.resume_propose || demande.description_initiale
      const transcript = transcriptRows
        .filter((_, index) => !hasSavedSummary || index !== lastAssistantIndex)
        .map((row) => ({ role: row.role as 'user' | 'assistant', content: row.contenu }))
      setCreatedTicket({ id: demande.id, numero: demande.numero, createdAt: demande.created_at })
      setDescription(demande.description_initiale)
      setMessages(transcript)
      setSummary(savedSummary)
      setReadyToConfirm(hasSavedSummary)
      setStep(2)
      if (demande.niveau === 1 || demande.niveau === 2) setNiveau(demande.niveau)
      if (demande.categorie_id) {
        const { data: category } = await supabase.from('categories').select('nom').eq('id', demande.categorie_id).maybeSingle()
        if (!cancelled) setCategoryName(category?.nom ?? null)
      }
    }
    void restoreConversation()
    return () => { cancelled = true }
  }, [initialDemandeId, profile.id])

  async function askAssistant(history: ChatMessage[], demandeId: string, texte?: string) {
    setAssistantLoading(true)
    setAssistantError(null)
    const payload = { action: 'message' as const, demande_id: demandeId, ...(texte ? { texte } : {}) }

    try {
      let result: ClarificationResponse
      try {
        const response = await fetch('/api/client/clarifier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await response.json()
        if (!response.ok && response.status !== 502 && response.status !== 503) {
          setAssistantError(data.error ?? 'La conversation ne peut pas être chargée pour le moment.')
          return
        }
        if (!response.ok) throw new Error(data.error ?? 'clarification_failed')
        result = data as ClarificationResponse
      } catch {
        setIsTestMode(true)
        await new Promise((resolve) => setTimeout(resolve, 800))
        const mock = getMockChatbotReply(description.trim(), history)
        result = { type: mock.readyToConfirm ? 'resume' : 'question', texte: mock.summary ?? mock.message, niveau: mock.niveau }
      }

      let summaryText: string | null = null
      if (result.type === 'resume') {
        summaryText = result.texte_je?.trim() || null
        if (!summaryText) {
          const supabase = createClient()
          const { data: latestAssistantMessage } = await supabase
            .from('messages')
            .select('contenu')
            .eq('demande_id', demandeId)
            .eq('role', 'assistant')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          summaryText = latestAssistantMessage?.contenu?.trim() || result.texte
        }
      }
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: result.type === 'resume' ? 'Voici votre demande :' : result.texte,
      }
      setMessages([...history, assistantMessage])
      setReadyToConfirm(result.type === 'resume')
      setSummary(summaryText)
      setNiveau(result.niveau === 1 ? 1 : 2)
    } catch {
      setAssistantError('Le conseiller ne répond pas pour le moment. Réessayez dans un instant.')
      setReadyToConfirm(false)
    } finally {
      setAssistantLoading(false)
    }
  }

  async function startClarification() {
    if (!canContinue || isCreatingDraft) return

    setIsCreatingDraft(true)
    setSubmitError(null)
    const supabase = createClient()

    const { data, error } = await supabase
      .from('demandes')
      .insert({
        user_id: profile.id,
        description_initiale: description.trim(),
        statut: 'brouillon',
      })
      .select('id, numero, created_at')
      .single()

    if (error || !data) {
      setSubmitError('La demande n’a pas pu être enregistrée. Vérifiez votre connexion et réessayez.')
      setIsCreatingDraft(false)
      return
    }

    const ticket = {
      id: data.id,
      numero: data.numero ?? null,
      createdAt: data.created_at ?? new Date().toISOString(),
    }
    setCreatedTicket(ticket)
    window.history.replaceState(null, '', `/client/nouvelle?demande=${ticket.id}`)
    setStep(2)
    setIsCreatingDraft(false)
    void askAssistant([], ticket.id)
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const content = draft.trim()
    if (!content || assistantLoading || !createdTicket) return

    const nextMessages = [...messages, { role: 'user' as const, content }]
    setMessages(nextMessages)
    setDraft('')
    setReadyToConfirm(false)
    setSummary(null)
    void askAssistant(nextMessages, createdTicket.id, content)
  }

  function addMoreDetail() {
    setReadyToConfirm(false)
    setSummary(null)
    setDraft('')
  }

  async function openReview() {
    if (!createdTicket) return
    if (isTestMode) {
      setStep(3)
      return
    }
    const supabase = createClient()
    const { data, error } = await supabase.from('demandes').select('niveau, categorie_id').eq('id', createdTicket.id).eq('user_id', profile.id).maybeSingle()
    if (error || !data) {
      setAssistantError('La demande est introuvable. Réessayez ou corrigez votre réponse.')
      return
    }
    if (data.niveau === 1 || data.niveau === 2) setNiveau(data.niveau)
    if (data.categorie_id) {
      const { data: category } = await supabase.from('categories').select('nom').eq('id', data.categorie_id).maybeSingle()
      setCategoryName(category?.nom ?? null)
    }
    setStep(3)
  }

  async function submitRequest() {
    if (!createdTicket || !summary || isSubmitting) return
    if (niveau === 1 && !consent) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      const response = await fetch('/api/client/clarifier', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'valider', demande_id: createdTicket.id, ...(niveau === 1 ? { consentement: consent } : {}) }),
      })
      const payload = await response.json() as { error?: string; numero?: string | null; niveau?: 1 | 2 | null }
      if (response.status === 409) {
        setSubmitError(payload.error ?? 'Votre accord n’a pas pu être enregistré. Réessayez dans un instant.')
        return
      }
      if (!response.ok || payload.error) throw new Error(payload.error ?? 'validation_failed')
      setCreatedTicket({ ...createdTicket, numero: payload.numero ?? createdTicket.numero })
      if (payload.niveau === 1 || payload.niveau === 2) setNiveau(payload.niveau)
      setStep(4)
    } catch {
      setIsTestMode(true)
      setStep(4)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
      <div className={`mx-auto ${step === 2 ? 'flex min-h-[calc(100dvh-5rem)] max-w-4xl flex-col py-3' : 'max-w-3xl pb-16 pt-8 sm:pt-10'}`}>
      {step !== 2 ? (
        <>
          <Link href="/client" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Retour à mes demandes
          </Link>
          <div className="mt-7 flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <TicketCheck aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="text-xs font-medium tracking-[0.14em] text-primary">ESPACE CLIENT</p>
              <h1 className="page-title-gradient mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Faire une demande ticket</h1>
            </div>
          </div>
          <div className="my-8 rounded-2xl border border-slate-200/60 bg-card px-4 py-5 shadow-sm sm:px-6">
            <ProgressSteps step={step} />
          </div>
        </>
      ) : (
        <Link href="/client" className="mb-2 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Quitter la conversation
        </Link>
      )}

      {step === 1 ? (
        <RequestDetailsStep
          description={description}
          onDescriptionChange={setDescription}
          onContinue={() => void startClarification()}
          canContinue={canContinue}
          isCreatingDraft={isCreatingDraft}
          submitError={submitError}
        />
      ) : null}

      {step === 2 && createdTicket && pauseConfirmed ? <PauseConfirmation /> : null}

      {step === 2 && createdTicket && !pauseConfirmed ? (
        <ClarificationStep
          messages={messages}
          draft={draft}
          summary={summary}
          readyToConfirm={readyToConfirm}
          assistantLoading={assistantLoading}
          assistantError={assistantError}
          isTestMode={isTestMode}
          onDraftChange={setDraft}
          onSend={sendMessage}
          onRetry={() => {
            const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')
            void askAssistant(messages, createdTicket.id, latestUserMessage?.content)
          }}
          onAddMoreDetail={addMoreDetail}
          onBack={() => setStep(1)}
          onContinue={() => void openReview()}
          onPause={() => setPauseConfirmed(true)}
        />
      ) : null}

      {step === 3 && createdTicket && summary ? (
        <ReviewStep
          category={categoryName}
          summary={summary}
          profile={profile}
          email={email}
          submitError={submitError}
          isSubmitting={isSubmitting}
          niveau={niveau}
          consent={consent}
          onConsentChange={setConsent}
          onBack={() => setStep(2)}
          onSubmit={() => void submitRequest()}
        />
      ) : null}

      {step === 4 && createdTicket ? <ConfirmationStep ticket={createdTicket} email={email} isTestMode={isTestMode} /> : null}
    </div>
  )
}

function RequestDetailsStep({
  description,
  onDescriptionChange,
  onContinue,
  canContinue,
  isCreatingDraft,
  submitError,
}: {
  description: string
  onDescriptionChange: (value: string) => void
  onContinue: () => void
  canContinue: boolean
  isCreatingDraft: boolean
  submitError: string | null
}) {
  return (
    <Card className="motion-enter rounded-2xl border border-slate-200/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-1">
        <p className="text-xs font-medium tracking-[0.14em] text-primary">ÉTAPE 1 · DEMANDE</p>
        <CardTitle className="text-xl text-blue-900">Que se passe-t-il ?</CardTitle>
        <CardDescription className="max-w-xl leading-6 text-muted-foreground">
          Décrivez votre demande et l’application concernée.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div>
          <label htmlFor="request-description" className="mb-2 block text-sm font-medium text-slate-200">Décrivez votre demande</label>
          <textarea
            id="request-description"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
            maxLength={2000}
            rows={6}
            placeholder="Expliquez ce qui ne fonctionne pas…"
            className="auth-input min-h-36 w-full resize-y rounded-xl px-3 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-describedby="request-description-help"
            required
          />
          <div id="request-description-help" className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
            <span>N’indiquez jamais votre mot de passe ni de code confidentiel.</span>
            <span aria-live="polite">{description.length}/2000</span>
          </div>
        </div>
        {submitError ? <p role="alert" className="mt-4 rounded-xl border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">{submitError}</p> : null}
      </CardContent>
      <CardFooter className="justify-end border-t border-border bg-card/80">
        <Button type="button" onClick={onContinue} disabled={!canContinue || isCreatingDraft} className="h-10 bg-primary px-4 text-primary-foreground hover:bg-primary/90">
          {isCreatingDraft ? 'Préparation de votre demande…' : 'Continuer'}
          {isCreatingDraft ? <LoaderCircle data-icon="inline-end" className="animate-spin" /> : <ArrowRight data-icon="inline-end" />}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ClarificationStep({
  messages,
  draft,
  summary,
  readyToConfirm,
  assistantLoading,
  assistantError,
  isTestMode,
  onDraftChange,
  onSend,
  onRetry,
  onAddMoreDetail,
  onBack,
  onContinue,
  onPause,
}: {
  messages: ChatMessage[]
  draft: string
  summary: string | null
  readyToConfirm: boolean
  assistantLoading: boolean
  assistantError: string | null
  isTestMode: boolean
  onDraftChange: (value: string) => void
  onSend: (event: FormEvent<HTMLFormElement>) => void
  onRetry: () => void
  onAddMoreDetail: () => void
  onBack: () => void
  onContinue: () => void
  onPause: () => void
}) {
  const lastMessageRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    lastMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [assistantLoading, messages.length, readyToConfirm])

  return (
    <Card className="motion-enter flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-1">
        <p className="text-xs font-medium tracking-[0.14em] text-primary">ÉTAPE 2 · DÉTAIL</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-xl text-blue-900">
              <MessageSquareText aria-hidden="true" className="size-5 text-primary" />
              Détails du problème
            </CardTitle>
          </div>
          {isTestMode ? <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-400">Mode test</span> : null}
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="chat-transcript flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl border border-border/70 bg-background/60 p-4" role="log" aria-label="Conversation avec Tick.AI" aria-live="polite" aria-relevant="additions text">
          {messages.map((message, index) => {
            const isUser = message.role === 'user'
            return (
              <Message key={`${message.role}-${index}`} ref={!assistantLoading && index === messages.length - 1 ? lastMessageRef : undefined} align={isUser ? 'end' : 'start'} style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }} className="motion-enter gap-2">
                {!isUser ? (
                  <MessageAvatar className="mb-1 size-8 rounded-xl border border-primary/25 bg-primary/10 text-primary">
                    <MessageSquareText aria-hidden="true" className="size-4" />
                  </MessageAvatar>
                ) : null}
                <MessageContent className="max-w-[88%] gap-1">
                  <MessageHeader className={`px-2 text-[11px] ${isUser ? 'justify-end text-status-cyan' : 'text-primary'}`}>
                    {isUser ? 'Vous' : 'Tick.AI'}
                  </MessageHeader>
                  <Bubble variant={isUser ? 'default' : 'muted'} align={isUser ? 'end' : 'start'}>
                    <BubbleContent className={`${isUser ? 'whitespace-pre-wrap' : 'whitespace-pre-line'} px-4 py-3 text-sm leading-6 ${isUser ? 'rounded-2xl rounded-br-md border-primary/30 bg-primary text-primary-foreground ' : 'rounded-2xl rounded-bl-md border-border bg-muted text-foreground'}`}>
                      {message.content}
                    </BubbleContent>
                  </Bubble>
                </MessageContent>
              </Message>
            )
          })}
          {assistantLoading ? (
            <Message ref={lastMessageRef} align="start" className="motion-enter gap-2">
              <MessageAvatar className="mb-1 size-8 rounded-xl border border-primary/25 bg-primary/10 text-primary">
                <MessageSquareText aria-hidden="true" className="size-4" />
              </MessageAvatar>
              <MessageContent className="max-w-[88%] gap-1">
                <MessageHeader className="px-2 text-[11px] text-primary">Tick.AI</MessageHeader>
                <Bubble variant="muted"><BubbleContent className="rounded-2xl rounded-bl-md border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                  <span role="status">Tick.AI écrit…</span>
                  <span className="ml-1 inline-flex items-center gap-1" aria-hidden="true"><span className="typing-dot size-1 rounded-full bg-primary" /><span className="typing-dot size-1 rounded-full bg-primary" /><span className="typing-dot size-1 rounded-full bg-primary" /></span>
                </BubbleContent></Bubble>
              </MessageContent>
            </Message>
          ) : null}
          <div ref={messages.length > 0 || assistantLoading ? undefined : lastMessageRef} />
        </div>

        {summary ? (
          <div className="motion-enter animate-float rounded-2xl border border-slate-200/60 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-900">
              <Ticket aria-hidden="true" className="size-4 text-primary" />
              Votre demande
            </div>
            <SummaryFields summary={summary} className="mt-3" />
          </div>
        ) : null}

        {assistantError ? (
          <div className="rounded-xl border border-status-warning/20 bg-status-warning/5 p-4" role="alert">
            <p className="text-sm leading-6 text-status-warning">{assistantError}</p>
            <Button type="button" variant="outline" onClick={onRetry} disabled={assistantLoading} className="mt-3 border-status-warning/20 bg-transparent text-status-warning hover:bg-status-warning/10">Réessayer</Button>
          </div>
        ) : null}

        {!readyToConfirm || !summary ? (
          <form onSubmit={onSend} className="sticky bottom-0 border-t border-border bg-card/95 py-3 backdrop-blur">
            <label htmlFor="clarification-reply" className="mb-2 block text-sm font-medium text-foreground">Votre réponse</label>
            <div className="flex items-end gap-2">
              <textarea
                id="clarification-reply"
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                maxLength={1200}
                rows={2}
                disabled={assistantLoading}
                placeholder="Répondez en une fois à la ou aux questions ci-dessus…"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                className="auth-input min-h-16 flex-1 resize-none rounded-xl px-3 py-2.5 text-sm leading-5 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50"
              />
              <Button type="submit" aria-label="Envoyer votre réponse" disabled={!draft.trim() || assistantLoading} className="size-10 shrink-0 bg-primary text-primary-foreground  hover:bg-primary/90">
                {assistantLoading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Send aria-hidden="true" className="size-4" />}
              </Button>
            </div>
          </form>
        ) : null}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onPause} className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground">Je reviens plus tard</Button>
        </div>
      </CardContent>
      <CardFooter className="flex-col-reverse gap-2 border-t border-border bg-card/80 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft data-icon="inline-start" />
          Modifier ma demande
        </Button>
        {readyToConfirm && summary ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Button type="button" variant="outline" onClick={onAddMoreDetail} className="border-white/10 bg-transparent text-slate-200 hover:bg-white/[0.04]">Corriger</Button>
            <Button type="button" onClick={onContinue} className="h-10 bg-primary px-4 text-primary-foreground hover:bg-primary/90">
              C’est correct
              <ArrowRight data-icon="inline-end" />
            </Button>
          </div>
        ) : null}
      </CardFooter>
    </Card>
  )
}

function PauseConfirmation() {
  return (
    <Card className="motion-enter rounded-2xl border border-slate-200/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-10 text-center sm:px-10 sm:py-14">
        <CheckCircle2 aria-hidden="true" className="size-9 text-primary" />
        <p className="max-w-md text-sm leading-6 text-muted-foreground">Votre demande est enregistrée. Vous la retrouverez dans Mes demandes pour la reprendre.</p>
        <Button render={<Link href="/client" />} className="bg-primary text-primary-foreground hover:bg-primary/90">Retour à Mes demandes</Button>
      </CardContent>
    </Card>
  )
}

function SummaryFields({ summary, className = '' }: { summary: string; className?: string }) {
  return <p className={`whitespace-pre-line text-sm leading-6 text-foreground ${className}`}>{summary}</p>
}

function ReviewStep({
  category,
  summary,
  profile,
  email,
  submitError,
  isSubmitting,
  niveau,
  consent,
  onConsentChange,
  onBack,
  onSubmit,
}: {
  category: string | null
  summary: string
  profile: Profile
  email: string | null
  submitError: string | null
  isSubmitting: boolean
  niveau: 1 | 2
  consent: boolean
  onConsentChange: (value: boolean) => void
  onBack: () => void
  onSubmit: () => void
}) {
  const needsConsent = niveau === 1
  const fullName = [profile.prenom, profile.nom].filter(Boolean).join(' ') || 'Nom non renseigné'

  return (
    <Card className="motion-enter rounded-2xl border border-slate-200/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <CardHeader className="pb-1">
        <p className="text-xs font-medium tracking-[0.14em] text-primary">ÉTAPE 3 · VALIDATION</p>
        <CardTitle className="text-xl text-blue-900">Vérifiez votre demande</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="animate-float rounded-2xl border border-slate-200/60 bg-card p-4 shadow-sm sm:p-5" aria-labelledby="request-summary-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="request-summary-heading" className="flex items-center gap-2 font-semibold text-blue-900"><Ticket aria-hidden="true" className="size-4 text-primary" />Votre demande</h2>
          </div>
          <SummaryFields summary={summary} className="mt-4" />
          {category?.trim() ? <p className="mt-4 border-t border-border pt-3 text-sm text-muted-foreground">Catégorie : <span className="font-medium text-foreground">{category.trim()}</span></p> : null}
        </section>

        <section className="rounded-2xl border border-slate-200/60 bg-card p-4 shadow-sm sm:p-5" aria-labelledby="requester-heading">
          <h2 id="requester-heading" className="font-medium text-white">Vos coordonnées</h2>
          <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <div><dt className="text-xs text-slate-500">Nom</dt><dd className="mt-1 text-sm text-slate-300">{fullName}</dd></div>
            <div><dt className="text-xs text-slate-500">Identifiant employé</dt><dd className="mt-1 text-sm text-slate-300">{profile.identifiant_employe || 'Non renseigné'}</dd></div>
            <div><dt className="text-xs text-slate-500">Poste</dt><dd className="mt-1 text-sm text-slate-300">{profile.poste || 'Non renseigné'}</dd></div>
            <div><dt className="text-xs text-slate-500">E-mail</dt><dd className="mt-1 break-all text-sm text-slate-300">{email || 'Non renseigné'}</dd></div>
          </dl>
        </section>
        {needsConsent ? (
          <section className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4 shadow-sm sm:p-5" aria-labelledby="consent-heading">
            <h2 id="consent-heading" className="font-semibold text-blue-900">Intervention automatique sur votre poste</h2>
            <p className="mt-2 text-sm leading-6 text-slate-700">Pour résoudre votre problème, l’agent Tick.AI va prendre la main sur votre ordinateur (ouvrir Microsoft Teams, modifier les réglages, environ 1 minute). Ne touchez pas à votre souris ni à votre clavier pendant l’intervention.</p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-white p-3 text-sm font-medium text-slate-800">
              <input type="checkbox" checked={consent} onChange={(event) => onConsentChange(event.target.checked)} disabled={isSubmitting} className="mt-0.5 size-4 shrink-0 accent-blue-600" />
              J’autorise l’agent Tick.AI à intervenir sur mon poste.
            </label>
          </section>
        ) : null}
        {submitError ? <p role="alert" className="rounded-xl border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-status-danger">{submitError}</p> : null}
      </CardContent>
      <CardFooter className="flex-col-reverse gap-2 border-t border-border bg-card/80 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" onClick={onBack} disabled={isSubmitting} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft data-icon="inline-start" />
          Retour au résumé
        </Button>
        <Button type="button" onClick={onSubmit} disabled={isSubmitting || (needsConsent && !consent)} className="shine-effect h-10 bg-primary px-4 text-primary-foreground hover:bg-primary/90">
          {isSubmitting ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <Check aria-hidden="true" className="size-4" />}
          {isSubmitting ? 'Envoi en cours…' : needsConsent ? 'Valider et lancer l’intervention' : 'Envoyer ma demande'}
        </Button>
      </CardFooter>
    </Card>
  )
}

function ConfirmationStep({ ticket, email, isTestMode }: { ticket: CreatedTicket; email: string | null; isTestMode: boolean }) {
  const number = ticket.numero || `TCK-${ticket.id.slice(0, 8).toUpperCase()}`
  const createdDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(ticket.createdAt))

  return (
    <Card className="motion-enter overflow-hidden rounded-2xl border border-status-success/20 bg-card shadow-sm">
      <div className="h-1 bg-status-success" />
      <CardContent className="px-6 py-10 text-center sm:px-10 sm:py-14">
        <span className="motion-pop mx-auto flex size-14 items-center justify-center rounded-2xl border border-status-success/20 bg-status-success/10 text-status-success">
          <CheckCircle2 aria-hidden="true" className="size-7" />
        </span>
        <p className="mt-6 text-xs font-medium tracking-[0.16em] text-status-success">ÉTAPE 4 · CONFIRMATION</p>
        <h2 className="page-title-gradient mt-3 text-2xl font-semibold sm:text-3xl">Votre ticket a bien été créé.</h2>
        <div className="motion-enter mx-auto mt-5 max-w-xl rounded-2xl border border-slate-200/60 bg-blue-50 p-4 text-left shadow-sm sm:p-5">
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-white text-blue-700">
              <Mail aria-hidden="true" className="size-5" />
            </span>
            <div className="space-y-2">
              {isTestMode ? (
                <p className="text-base font-semibold leading-6 text-slate-800">Mode test : aucun e-mail n’est envoyé. L’adresse associée à votre profil est {email || 'non renseignée'}.</p>
              ) : (
                <>
                  <p className="text-base font-semibold leading-6 text-slate-800">Un e-mail de confirmation vient de vous être envoyé à {email || 'l’adresse e-mail de votre profil'}.</p>
                  <p className="text-sm leading-6 text-slate-700">Vous serez prévenu(e) par e-mail dès que votre demande sera résolue ou prise en charge.</p>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="motion-enter mx-auto mt-7 max-w-sm rounded-2xl border border-slate-200/60 bg-white/70 p-4 text-left shadow-sm">
          <div className="flex items-center justify-between gap-3"><span className="text-sm text-slate-400">Numéro de suivi</span><span className="font-mono text-sm font-semibold text-white">{number}</span></div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3"><span className="text-sm text-slate-400">Créée le</span><span className="text-right text-xs text-slate-300">{createdDate}</span></div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-3"><span className="text-sm text-slate-400">Statut</span><span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-xs text-primary">Validée</span></div>
        </div>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Button render={<Link href={`/client/demandes/${ticket.id}`} />} variant="outline" className="border-white/10 bg-transparent text-slate-200 hover:bg-white/[0.04]">Voir le détail</Button>
          <Button render={<Link href="/client" />} className="bg-primary text-primary-foreground hover:bg-primary/90">Mes demandes<ArrowRight data-icon="inline-end" /></Button>
        </div>
      </CardContent>
    </Card>
  )
}
