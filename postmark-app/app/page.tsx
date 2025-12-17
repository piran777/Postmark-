import { Button, AnchorButton } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const inboxItems = [
  {
    title: "Flight receipts",
    from: "travel@airline.com · Gmail",
    time: "2m ago",
  },
  {
    title: "Project status – Q2",
    from: "manager@company.com · Outlook",
    time: "10m ago",
  },
  {
    title: "Weekly summary",
    from: "updates@service.com · Gmail",
    time: "1h ago",
  },
];

const highlights = [
  {
    title: "Unified inbox",
    body: "See all mail in one place, with a calm layout built for focus instead of clutter.",
  },
  {
    title: "Account filters",
    body: "Quick toggles to view only Gmail, only Outlook, or any combination.",
  },
  {
    title: "Built for adults",
    body: "Large, readable UI and straightforward flows designed for busy professionals.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">
              Postmark
            </span>
            <Badge tone="success" soft className="uppercase">
              unified mail
            </Badge>
          </div>
          <span className="text-xs text-muted">
            Early prototype – local only, no real email yet
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:gap-10 sm:px-6 lg:flex-row">
        <section className="flex-1 space-y-5">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted">
              Modern minimal inbox
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              All your email,{" "}
              <span className="text-primary">one calm inbox.</span>
          </h1>
            <p className="max-w-xl text-base text-muted">
              Postmark is a unified inbox for people with too many email
              accounts. See Gmail, Outlook and more in one modern dashboard,
              with simple checkboxes to focus on just the accounts you care
              about.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button size="lg" className="w-full sm:w-auto">
              Connect accounts (coming soon)
            </Button>
            <AnchorButton
              size="lg"
              href="/api/health"
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              Check database connection
            </AnchorButton>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-3">
            {highlights.map((item) => (
              <Card
                key={item.title}
                className="border-border bg-surface-strong/80"
              >
                <CardContent className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {item.title}
                  </div>
                  <p className="text-sm text-foreground/90">{item.body}</p>
                </CardContent>
              </Card>
            ))}
        </div>
        </section>

        <section className="flex-1">
          <Card className="bg-surface-strong/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xs uppercase tracking-wide text-muted">
                Preview
                <Badge tone="success" soft>
                  Connected: database
                </Badge>
              </CardTitle>
              <Badge className="text-[10px] uppercase">Prototype view</Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-foreground/90">
              <div className="flex items-center gap-3 text-xs text-muted">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-border bg-surface"
                    defaultChecked
                    disabled
                  />
                  <span>Gmail</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-border bg-surface"
                    defaultChecked
                    disabled
                  />
                  <span>Outlook</span>
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-border bg-surface"
                    disabled
                  />
                  <span>Other</span>
                </label>
              </div>

              <div className="space-y-2">
                {inboxItems.map((item) => (
                  <div
                    key={item.title}
                    className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2.5"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {item.title}
                      </span>
                      <span className="text-[11px] text-muted">{item.from}</span>
                    </div>
                    <span className="text-[11px] text-muted">{item.time}</span>
                  </div>
                ))}
        </div>

              <p className="text-[11px] text-muted">
                This is a visual prototype. Next: wire to real Gmail/Outlook and
                let users control which providers are shown.
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
