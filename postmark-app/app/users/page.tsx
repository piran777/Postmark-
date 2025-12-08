"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type Account = {
  id: string;
  provider: string;
  emailAddress: string;
};

type User = {
  id: string;
  email: string;
  createdAt: string;
  accounts: Account[];
  savedViews?: Array<{
    name: string;
    domain: string;
    providers: string[];
  }>;
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accountBusy, setAccountBusy] = useState<string | null>(null);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("Saved view");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const PROVIDERS = ["Gmail", "Outlook", "Other"] as const;
  type Provider = (typeof PROVIDERS)[number];
  const [filterDomain, setFilterDomain] = useState("");
  const [activeProviders, setActiveProviders] = useState<Provider[]>([
    "Gmail",
    "Outlook",
    "Other",
  ]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [healthStatus, setHealthStatus] = useState<
    "ok" | "error" | "loading"
  >("loading");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  async function loadUsers(showToast = false) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterDomain) params.set("domain", filterDomain);
      if (searchTerm) params.set("search", searchTerm);
      if (
        activeProviders.length &&
        activeProviders.length !== PROVIDERS.length
      ) {
        params.set("providers", activeProviders.join(","));
      }
      params.set("sort", sortOrder);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await fetch(`/api/users?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Failed to load users (${res.status})`);
      }
      const data = await res.json();
      setUsers(data.items as User[]);
      setTotal(data.total ?? 0);
      if (!selectedUserId && data.items?.[0]) {
        setSelectedUserId(data.items[0].id);
      }
      if (showToast) toast.success("Users refreshed");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to load users right now."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadHealth() {
    try {
      setHealthStatus("loading");
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json();
      setHealthStatus(data?.status === "ok" ? "ok" : "error");
    } catch {
      setHealthStatus("error");
    }
  }

  useEffect(() => {
    loadUsers();
    loadHealth();
  }, []);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterDomain, searchTerm, activeProviders, sortOrder, page]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not create user.");
      }
      setEmail("");
      toast.success("User created");
      await loadUsers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not create user right now."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleAccount(
    userId: string,
    provider: string,
    enable: boolean,
    userEmail: string
  ) {
    setAccountBusy(`${userId}-${provider}`);
    try {
      const res = await fetch("/api/accounts", {
        method: enable ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          provider,
          emailAddress: userEmail,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Account toggle failed.");
      }
      toast.success(
        enable
          ? `${provider} connected for ${userEmail}`
          : `${provider} disconnected for ${userEmail}`
      );
      await loadUsers();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Unable to toggle account."
      );
    } finally {
      setAccountBusy(null);
    }
  }

  function applySavedView(view: {
    name: string;
    domain: string;
    providers: string[];
  }) {
    setFilterDomain(view.domain ?? "");
    setActiveProviders(
      (view.providers as Provider[]).filter((p) =>
        PROVIDERS.includes(p as Provider)
      )
    );
  }

  async function saveView() {
    if (!selectedUserId) {
      toast.error("Select a user to save the view.");
      return;
    }
    const userId = selectedUserId;
    const view = {
      name: viewName?.trim() || "Saved view",
      domain: filterDomain,
      providers: activeProviders,
    };
    try {
      setSavingView(true);
      const res = await fetch("/api/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, view }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not save view.");
      }
      toast.success("View saved");
      await loadUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save view.");
    } finally {
      setSavingView(false);
    }
  }

  function toggleProvider(provider: Provider) {
    const exists = activeProviders.includes(provider);
    if (exists) {
      setActiveProviders(activeProviders.filter((p) => p !== provider));
    } else {
      setActiveProviders([...activeProviders, provider]);
    }
  }

  function clearFilters() {
    setFilterDomain("");
    setActiveProviders(PROVIDERS.slice() as Provider[]);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tracking-tight">
              Postmark
            </span>
            <Badge tone="success" soft className="uppercase">
              users
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Badge tone={healthStatus === "ok" ? "success" : "neutral"} soft>
              {healthStatus === "loading"
                ? "Checking..."
                : healthStatus === "ok"
                ? "API/DB: OK"
                : "API/DB: Error"}
            </Badge>
            <span>Prototype admin: manage users & accounts</span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface/60 p-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
              <p className="text-sm text-muted">
                Create test users and see their connected accounts. Filters are
                client-side for now; saved views persist.
              </p>
            </div>
            <Button
              onClick={() => loadUsers(true)}
              variant="secondary"
              size="sm"
              disabled={loading}
              type="button"
            >
              Refresh
            </Button>
          </div>

          <Card className="border-border bg-surface">
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  required
                  placeholder="user@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting ? "Creating..." : "Create user"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border bg-surface">
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Filters & saved views
                </div>
                <button
                  onClick={clearFilters}
                  className="text-xs text-muted underline-offset-4 hover:text-primary hover:underline"
                  type="button"
                >
                  Clear
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex-1">
                  <Label>Domain filter</Label>
                  <Input
                    type="text"
                    value={filterDomain}
                    onChange={(e) => setFilterDomain(e.target.value)}
                    placeholder="e.g. company.com"
                  />
                </div>
                <div className="flex-1">
                  <Label>Search (email or account)</Label>
                  <Input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search users..."
                  />
                </div>
                <div className="flex-1">
                  <Label>View name</Label>
                  <Input
                    type="text"
                    value={viewName}
                    onChange={(e) => setViewName(e.target.value)}
                    placeholder="e.g. Clients only"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-muted">
                {PROVIDERS.map((provider) => (
                  <label
                    key={provider}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-strong px-2 py-1"
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-border bg-surface"
                      checked={activeProviders.includes(provider)}
                      onChange={() => toggleProvider(provider)}
                    />
                    <span>{provider}</span>
                  </label>
                ))}
              </div>

              <div className="text-[11px] text-muted">
                Showing users with providers:{" "}
                {activeProviders.length === PROVIDERS.length
                  ? "any"
                  : activeProviders.join(", ")}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <span>Sort:</span>
                  <select
                    value={sortOrder}
                    onChange={(e) =>
                      setSortOrder(e.target.value as "newest" | "oldest")
                    }
                    className="rounded-md border border-border bg-surface px-2 py-1 text-foreground"
                  >
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1 text-sm text-muted sm:flex-row sm:items-center sm:gap-2">
                  <span>Save for:</span>
                  <select
                    value={selectedUserId ?? ""}
                    onChange={(e) =>
                      setSelectedUserId(e.target.value || null)
                    }
                    className="rounded-md border border-border bg-surface px-2 py-1 text-foreground"
                  >
                    <option value="">Choose user</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  onClick={saveView}
                  disabled={savingView}
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  {savingView ? "Saving..." : "Save view"}
                </Button>
              </div>

              <div className="flex items-center gap-3 text-xs text-muted">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 1 || loading}
                  onClick={() => setPage(Math.max(1, page - 1))}
                >
                  Prev
                </Button>
                <span>
                  Page {page} · Showing {users.length} of {total || users.length}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={users.length + (page - 1) * pageSize >= total}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border bg-surface">
            <CardHeader className="border-border/60">
              <CardTitle className="flex items-center justify-between text-xs uppercase tracking-wide text-muted">
                <span>Existing users</span>
                <span className="text-muted">
                  {loading
                    ? "Loading..."
                    : `${users.length} shown of ${total || users.length}`}
                </span>
              </CardTitle>
            </CardHeader>

            {loading ? (
              <CardContent className="space-y-3">
                {[0, 1].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse space-y-3 rounded-xl border border-border/60 bg-surface-strong px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="h-4 w-40 rounded bg-border/60" />
                      <div className="h-4 w-16 rounded bg-border/60" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {[0, 1, 2].map((j) => (
                        <div
                          key={j}
                          className="h-12 rounded-lg border border-border/60 bg-border/30"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            ) : users.length === 0 && total === 0 ? (
              <CardContent className="text-sm text-muted">
                No users yet. Add one above to get started.
              </CardContent>
            ) : users.length === 0 ? (
              <CardContent className="text-sm text-muted">
                No users match the current filters. Try clearing filters or search.
              </CardContent>
            ) : (
              <CardContent className="divide-y divide-border/70">
                {users.map((user) => (
                  <div key={user.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {user.email}
                        </div>
                        <div className="text-xs text-muted">
                          Created {new Date(user.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge tone="info">
                        {user.accounts.length} connected
                      </Badge>
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      {PROVIDERS.map((provider) => {
                        const connected = user.accounts.some(
                          (acc) =>
                            acc.provider.toLowerCase() === provider.toLowerCase()
                        );
                        return (
                          <div
                            key={provider}
                            className="flex items-center justify-between rounded-lg border border-border/70 bg-surface-strong px-3 py-2 text-sm"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">
                                {provider}
                              </span>
                              <span className="text-xs text-muted">
                                {connected ? "Connected" : "Not connected"}
                              </span>
                            </div>
                            <Switch
                              checked={connected}
                              disabled={accountBusy === `${user.id}-${provider}`}
                              onCheckedChange={(val) =>
                                toggleAccount(user.id, provider, val, user.email)
                              }
                              aria-label={`Toggle ${provider} for ${user.email}`}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {user.accounts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                        {user.accounts.map((acc) => (
                          <span
                            key={acc.id}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-strong px-2 py-1 text-foreground/80"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {acc.provider} · {acc.emailAddress}
                          </span>
                        ))}
                      </div>
                    )}

                    {user.savedViews && user.savedViews.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                        {user.savedViews.map((view) => (
                          <button
                            key={`${user.id}-${view.name}`}
                            onClick={() => applySavedView(view)}
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-strong px-2 py-1 text-foreground/80 transition hover:border-primary hover:text-primary"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                            {view.name}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-2 text-[11px] text-muted">
                        No saved views for this user yet.
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        </section>
      </main>
    </div>
  );
}


