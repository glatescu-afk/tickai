const steps = ['Demande', 'Détail', 'Validation', 'Confirmation'] as const

export function ProgressSteps({ step }: { step: 1 | 2 | 3 | 4 }) {
  const progress = ((step - 1) / (steps.length - 1)) * 100

  return (
    <div aria-label="Progression de la demande" className="w-full">
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={step}
        aria-valuetext={`Étape ${step} sur ${steps.length} : ${steps[step - 1]}`}
        className="relative h-1 rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-2">
        {steps.map((label, index) => {
          const currentStep = index + 1
          const complete = currentStep <= step
          return (
            <li key={label} aria-current={currentStep === step ? 'step' : undefined} className={`text-center text-[11px] sm:text-xs ${complete ? 'font-medium text-primary' : 'text-slate-500'}`}>
              <span className={`mb-1.5 mx-auto flex size-6 items-center justify-center rounded-full border text-[10px] ${complete ? 'border-primary/40 bg-primary/10 text-primary' : 'border-slate-200 bg-white text-muted-foreground'}`}>{currentStep}</span>
              {label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
