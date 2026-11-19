type PageSkeletonProps = {
  variant?: 'client-list' | 'support-list' | 'detail'
}

export function PageSkeleton({ variant = 'client-list' }: PageSkeletonProps) {
  const isSupportList = variant === 'support-list'
  const isDetail = variant === 'detail'
  const rowCount = isDetail ? 1 : 4

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 sm:px-8" role="status" aria-label="Chargement de la page">
      <span className="sr-only">Chargement de la page…</span>
      <header aria-hidden="true" className="-mx-5 flex min-h-16 items-center justify-between border-b border-slate-200/60 px-5 sm:-mx-8 sm:px-8">
        <div className="skeleton-pulse h-5 w-28 rounded-full bg-slate-200" />
        <div className="skeleton-pulse h-9 w-24 rounded-xl bg-slate-200" />
      </header>
      <section aria-hidden="true" className="pb-16 pt-10 sm:pt-14">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div className="w-full max-w-sm">
            <div className="skeleton-pulse h-3 w-32 rounded-full bg-blue-100" />
            <div className="skeleton-pulse mt-4 h-8 w-3/4 rounded-full bg-slate-200" />
            <div className="skeleton-pulse mt-3 h-4 w-full rounded-full bg-slate-100" />
          </div>
          {!isDetail ? <div className="skeleton-pulse hidden h-11 w-40 rounded-xl bg-blue-100 sm:block" /> : null}
        </div>
        {isSupportList ? <div className="mb-8 grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="skeleton-pulse h-28 rounded-2xl border border-slate-200/60 bg-card shadow-sm" />)}</div> : null}
        {isDetail ? (
          <div className="skeleton-pulse rounded-2xl border border-slate-200/60 bg-card p-5 shadow-sm sm:p-7">
            <div className="h-5 w-40 rounded-full bg-slate-200" />
            <div className="mt-6 h-3 w-full rounded-full bg-slate-100" />
            <div className="mt-3 h-3 w-5/6 rounded-full bg-slate-100" />
            <div className="mt-3 h-3 w-2/3 rounded-full bg-slate-100" />
            <div className="mt-8 h-20 rounded-2xl bg-slate-100" />
          </div>
        ) : (
          <div className="grid gap-3">
            {Array.from({ length: rowCount }, (_, item) => <div key={item} className="skeleton-pulse rounded-2xl border border-slate-200/60 bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4"><div className="h-4 w-28 rounded-full bg-slate-200" /><div className="h-6 w-20 rounded-full bg-blue-100" /></div>
              <div className="mt-5 h-4 w-3/4 rounded-full bg-slate-200" />
              <div className="mt-4 h-2 w-full rounded-full bg-slate-100" />
              <div className="mt-5 h-3 w-24 rounded-full bg-slate-100" />
            </div>)}
          </div>
        )}
      </section>
    </main>
  )
}
