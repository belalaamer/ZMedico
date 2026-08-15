import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthorization } from "@/lib/authz/useAuthorization";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Copy, Download, RefreshCw, Trash2, ShieldAlert } from "lucide-react";
import SettingsLayout from "./SettingsLayout";

type QARoleKey =
  | "admin"
  | "manager"
  | "accountant"
  | "receptionist"
  | "doctor"
  | "nurse"
  | "hr"
  | "staff";

type QAAccount = {
  key: QARoleKey;
  email: string;
  role: QARoleKey;
  envPrefix: string;
  requiresBranch: boolean;
};

const ACCOUNTS: QAAccount[] = [
  { key: "admin", email: "qa.admin@qa.local", role: "admin", envPrefix: "TEST_ADMIN", requiresBranch: false },
  { key: "manager", email: "qa.manager@qa.local", role: "manager", envPrefix: "TEST_MANAGER", requiresBranch: true },
  { key: "accountant", email: "qa.accountant@qa.local", role: "accountant", envPrefix: "TEST_ACCOUNTANT", requiresBranch: true },
  { key: "receptionist", email: "qa.receptionist@qa.local", role: "receptionist", envPrefix: "TEST_RECEPTIONIST", requiresBranch: true },
  { key: "doctor", email: "qa.doctor@qa.local", role: "doctor", envPrefix: "TEST_DOCTOR", requiresBranch: true },
  { key: "nurse", email: "qa.nurse@qa.local", role: "nurse", envPrefix: "TEST_NURSE", requiresBranch: true },
  { key: "hr", email: "qa.hr@qa.local", role: "hr", envPrefix: "TEST_HR", requiresBranch: true },
  { key: "staff", email: "qa.staff@qa.local", role: "staff", envPrefix: "TEST_STAFF", requiresBranch: true },
];

type ExistingMap = Record<string, { id: string; email: string } | null>;
type CredMap = Record<string, { email: string; password: string } | undefined>;

export default function QAIdentities() {
  const { authz, loading: roleLoading } = useAuthorization();
  const isAdmin = authz.isSuperAdmin();
  const [existing, setExisting] = useState<ExistingMap>({});
  const [creds, setCreds] = useState<CredMap>({});
  const [branchId, setBranchId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const emails = ACCOUNTS.map((a) => a.email);
    const [{ data: profiles }, { data: branches }] = await Promise.all([
      (supabase as any).from("profiles").select("id,email").in("email", emails),
      (supabase as any).from("branches").select("id").eq("is_active", true).order("created_at").limit(1),
    ]);
    const map: ExistingMap = {};
    ACCOUNTS.forEach((a) => {
      const hit = (profiles ?? []).find((p: any) => (p.email ?? "").toLowerCase() === a.email);
      map[a.email] = hit ? { id: hit.id, email: hit.email } : null;
    });
    setExisting(map);
    setBranchId(branches?.[0]?.id ?? null);
    setLoading(false);
  };

  useEffect(() => {
    if (!roleLoading && isAdmin) void load();
  }, [roleLoading, isAdmin]);

  const envText = useMemo(() => {
    return ACCOUNTS.map((a) => {
      const c = creds[a.email];
      if (!c) return `# ${a.envPrefix}_EMAIL / ${a.envPrefix}_PASSWORD not available in this session`;
      return `${a.envPrefix}_EMAIL=${c.email}\n${a.envPrefix}_PASSWORD=${c.password}`;
    }).join("\n\n") + "\n";
  }, [creds]);

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/settings/general" replace />;

  const provisionOne = async (acc: QAAccount) => {
    if (existing[acc.email]) return;
    if (acc.requiresBranch && !branchId) {
      toast.error("No active branch available for role-scoped QA users");
      return;
    }
    setBusy(acc.email);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: acc.email,
        full_name: `QA ${acc.role}`,
        role: acc.role,
        branch_id: acc.requiresBranch ? branchId : undefined,
      },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    const info = data as { email: string; password?: string };
    if (!info.password) {
      toast.error(`Provisioned ${acc.email}, but no login password was returned`);
      await load();
      return;
    }
    setCreds((c) => ({ ...c, [acc.email]: { email: info.email, password: info.password } }));
    toast.success(`Provisioned ${acc.email}`);
    await load();
  };

  const provisionAll = async () => {
    for (const acc of ACCOUNTS) {
      // eslint-disable-next-line no-await-in-loop
      await provisionOne(acc);
    }
  };

  const resetOne = async (acc: QAAccount) => {
    const target = existing[acc.email];
    if (!target) return;
    setBusy(acc.email);
    const { data, error } = await supabase.functions.invoke("admin-reset-password", {
      body: { user_id: target.id },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    const info = data as { email: string; password?: string };
    if (!info.password) {
      toast.error(`Reset ${acc.email}, but no login password was returned`);
      return;
    }
    setCreds((c) => ({ ...c, [acc.email]: { email: info.email ?? acc.email, password: info.password } }));
    toast.success(`Reset password for ${acc.email}`);
  };

  const deleteAll = async () => {
    if (!confirm("Delete ALL QA users (emails starting with 'qa.')? This cannot be undone.")) return;
    const targets = ACCOUNTS
      .map((acc) => ({ acc, target: existing[acc.email] }))
      .filter(({ acc, target }) => Boolean(target) && acc.email.startsWith("qa."));
    if (!targets.length) {
      toast.info("No QA users to delete");
      return;
    }

    setBusy("delete-all");
    const results = await Promise.all(targets.map(async ({ acc, target }) => {
      try {
        const { data, error } = await supabase.functions.invoke("admin-delete-user", {
          body: { user_id: target!.id },
        });
        const message = (data as any)?.error ?? error?.message;
        return { email: acc.email, ok: !message, message };
      } catch (error) {
        return { email: acc.email, ok: false, message: error instanceof Error ? error.message : "Request failed" };
      }
    }));
    setBusy(null);
    setCreds({});
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      failed.forEach((r) => toast.error(`${r.email}: ${r.message ?? "Failed"}`));
      toast.warning(`Deleted ${results.length - failed.length} QA users; ${failed.length} failed`);
    } else {
      toast.success(`Deleted ${results.length} QA users`);
    }
    await load();
  };

  const copy = async (text: string, label = "Copied") => {
    try { await navigator.clipboard.writeText(text); toast.success(label); }
    catch { toast.error("Copy failed"); }
  };

  const anyCreds = Object.values(creds).some(Boolean);

  const downloadEnv = () => {
    const blob = new Blob([envText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "qa_credentials.txt"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SettingsLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">QA Identities</h1>
            <p className="text-sm text-muted-foreground">
              Provision the eight canonical QA users consumed by the Settings Shadow QA Playwright suite.
              Passwords are shown once and never persisted server-side.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={provisionAll} disabled={loading || !!busy}>Provision QA Identities</Button>
              <Button variant="destructive" onClick={deleteAll} disabled={loading || !!busy} aria-busy={busy === "delete-all"}>
              <Trash2 className="size-4 mr-1" /> {busy === "delete-all" ? "Deleting QA Users…" : "Delete QA Users"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm flex gap-2">
          <ShieldAlert className="size-4 mt-0.5 shrink-0" />
          <div>
            Displayed passwords are shown only in this browser session. Copy or download them now — they cannot be
            retrieved later. Use <span className="font-mono">Reset Password</span> to mint a new one.
          </div>
        </div>

        <div className="grid gap-3">
          {ACCOUNTS.map((acc) => {
            const ex = existing[acc.email];
            const cred = creds[acc.email];
            return (
              <Card key={acc.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      <span className="font-mono">{acc.email}</span>{" "}
                      <span className="text-xs uppercase tracking-wide text-muted-foreground ml-2">{acc.role}</span>
                    </span>
                    <span className={"text-xs " + (ex ? "text-emerald-600" : "text-muted-foreground")}>
                      {ex ? "Already exists" : "Not provisioned"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {!ex && (
                      <Button size="sm" onClick={() => provisionOne(acc)} disabled={busy === acc.email}>
                        Provision
                      </Button>
                    )}
                    {ex && (
                      <Button size="sm" variant="outline" onClick={() => resetOne(acc)} disabled={busy === acc.email}>
                        <RefreshCw className="size-4 mr-1" /> Reset Password
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => copy(acc.email, "Email copied")}>
                      <Copy className="size-4 mr-1" /> Copy Email
                    </Button>
                    {cred && (
                      <>
                        <Button size="sm" variant="ghost" onClick={() => copy(cred.password, "Password copied")}>
                          <Copy className="size-4 mr-1" /> Copy Password
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            copy(
                              `${acc.envPrefix}_EMAIL=${cred.email}\n${acc.envPrefix}_PASSWORD=${cred.password}`,
                              "All copied",
                            )
                          }
                        >
                          <Copy className="size-4 mr-1" /> Copy All
                        </Button>
                      </>
                    )}
                  </div>
                  {cred && (
                    <pre className="text-xs bg-muted rounded p-2 overflow-x-auto font-mono">
{`${acc.envPrefix}_EMAIL=${cred.email}
${acc.envPrefix}_PASSWORD=${cred.password}`}
                    </pre>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>Export</span>
              <Button size="sm" onClick={downloadEnv} disabled={!anyCreds}>
                <Download className="size-4 mr-1" /> Download qa_credentials.txt
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted rounded p-2 overflow-x-auto font-mono whitespace-pre">{envText}</pre>
            <p className="text-xs text-muted-foreground mt-2">
              Only passwords minted in this browser session are included. Missing accounts are shown as comments —
              use <span className="font-mono">Reset Password</span> above to include them.
            </p>
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}