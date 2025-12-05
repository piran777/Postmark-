export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">
              Postmark
            </span>
            <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 text-xs font-medium text-emerald-300">
              unified mail
            </span>
          </div>
          <span className="text-xs text-slate-400">
            Early prototype – local only, no real email yet
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10 lg:flex-row">
        <section className="flex-1 space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            All your email,
            <span className="text-emerald-300"> one calm inbox.</span>
          </h1>
          <p className="max-w-xl text-sm text-slate-300 sm:text-base">
            Postmark is a unified inbox for people with too many email
            accounts. See Gmail, Outlook and more in one modern dashboard,
            with simple checkboxes to focus on just the accounts you care
            about.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-medium text-slate-950 shadow-sm transition hover:bg-emerald-400"
              type="button"
            >
              Connect accounts (coming soon)
            </button>
            <a
              href="/api/health"
              className="rounded-full border border-slate-700 px-5 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-900"
            >
              Check database connection
            </a>
          </div>

          <div className="mt-8 grid gap-4 text-sm text-slate-200 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Unified inbox
              </div>
              <p className="mt-2 text-sm text-slate-200">
                See all mail in one place, with a clean layout built for focus
                instead of clutter.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Account filters
              </div>
              <p className="mt-2 text-sm text-slate-200">
                Quickly toggle checkboxes to view only Gmail, only Outlook, or
                any combination.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Built for adults
              </div>
              <p className="mt-2 text-sm text-slate-200">
                Large, readable UI and straightforward flows designed for busy
                professionals.
              </p>
            </div>
          </div>
        </section>

        <section className="flex-1 rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Preview
            </div>
            <div className="flex gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2 py-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Connected: database
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex gap-2">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-700 bg-slate-900"
                    defaultChecked
                    disabled
                  />
                  <span>Gmail</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-700 bg-slate-900"
                    defaultChecked
                    disabled
                  />
                  <span>Outlook</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-700 bg-slate-900"
                    disabled
                  />
                  <span>Other</span>
                </label>
              </div>
              <span className="rounded-full border border-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                Prototype view
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5">
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-slate-100">
                    Flight receipts
                  </span>
                  <span className="text-[10px] text-slate-400">
                    from: travel@airline.com · Gmail
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">2m ago</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5">
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-slate-100">
                    Project status – Q2
                  </span>
                  <span className="text-[10px] text-slate-400">
                    from: manager@company.com · Outlook
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">10m ago</span>
              </div>
              <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5">
                <div className="flex flex-col">
                  <span className="text-[11px] font-medium text-slate-100">
                    Weekly summary
                  </span>
                  <span className="text-[10px] text-slate-400">
                    from: updates@service.com · Gmail
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">1h ago</span>
              </div>
            </div>

            <p className="mt-3 text-[10px] text-slate-500">
              This is just a visual prototype. Next steps: wire this up to real
              Gmail/Outlook accounts and let users control which providers are
              shown.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
