"use client";

/**
 * Extension view — API key management + install/setup instructions
 * + supported platforms matrix.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Puzzle, Plus, Copy, Trash2, KeyRound, Download, CheckCircle2,
  Chrome, Link2, ShieldCheck, Loader2, Eye, EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { timeAgo, type KeyInfo } from "@/lib/portal-types";

const PLATFORMS = [
  { name: "Workday", match: "myworkdayjobs.com / wd*.myworkday.com", level: "deep" },
  { name: "Greenhouse", match: "boards.greenhouse.io / job-boards", level: "deep" },
  { name: "Lever", match: "jobs.lever.co", level: "deep" },
  { name: "Ashby", match: "jobs.ashbyhq.com", level: "deep" },
  { name: "SmartRecruiters", match: "careers.smartrecruiters.com", level: "deep" },
  { name: "Oracle Taleo", match: "*.taleo.net", level: "smart" },
  { name: "iCIMS", match: "*.icims.com / jobs2web", level: "smart" },
  { name: "SAP SuccessFactors", match: "career*.successfactors.com", level: "smart" },
  { name: "BambooHR / Jobvite / LinkedIn / Indeed", match: "generic form AI", level: "smart" },
];

export function ExtensionView({ onKeysChanged }: { onKeysChanged: () => void }) {
  const [keys, setKeys] = useState<KeyInfo[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setKeys(data.keys);
      }
    } catch {
      toast.error("Could not load API keys");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const createKey = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create key");
      await load();
      onKeysChanged();
      setRevealed((r) => ({ ...r, [String(data.key._id)]: true }));
      toast.success("API key created", { description: "Copy it now and paste it into the extension popup." });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setCreating(false);
    }
  };

  const revokeKey = async (id: string) => {
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Revoke failed");
      await load();
      onKeysChanged();
      toast.success("Key revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revoke failed");
    }
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked — select and copy manually");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Puzzle className="size-5 text-primary" /> Chrome extension
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          The extension watches any job application form, maps your profile onto it with AI, and reports
          validation errors back to this portal.
        </p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* API keys */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-primary" /> API keys
            </CardTitle>
            <CardDescription>
              Keys authenticate the extension to this portal. Stored as SHA-256 hashes in MongoDB.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <Button onClick={createKey} disabled={creating} className="gap-2">
                {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create key
              </Button>
              <span className="text-xs text-muted-foreground">Up to 5 active keys</span>
            </div>

            {!keys ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : keys.length === 0 ? (
              <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-4 py-6 text-center">
                No keys yet — create one to connect the extension.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last used</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((k) => {
                    const id = String(k._id);
                    const shown = revealed[id];
                    return (
                      <TableRow key={id} className={k.revoked ? "opacity-40" : undefined}>
                        <TableCell className="font-mono text-xs max-w-[220px]">
                          <span className="flex items-center gap-1.5">
                            <button
                              onClick={() => setRevealed((r) => ({ ...r, [id]: !r[id] }))}
                              aria-label={shown ? "Hide key" : "Reveal key"}
                            >
                              {shown ? <EyeOff className="size-3.5 text-muted-foreground" /> : <Eye className="size-3.5 text-muted-foreground" />}
                            </button>
                            <span className="truncate">
                              {shown || k.revoked
                                ? k.key
                                : `${k.key.slice(0, 12)}${"•".repeat(12)}${k.key.slice(-4)}`}
                            </span>
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{timeAgo(k.createdAt)}</TableCell>
                        <TableCell className="text-xs">{k.lastUsedAt ? timeAgo(k.lastUsedAt) : "never"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {!k.revoked && (
                              <>
                                <Button size="icon" variant="ghost" className="size-8" aria-label="Copy key" onClick={() => copy(k.key, "Key")}>
                                  <Copy className="size-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="size-8 text-destructive" aria-label="Revoke key" onClick={() => revokeKey(id)}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </>
                            )}
                            {k.revoked && <Badge variant="secondary">revoked</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Install steps */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Chrome className="size-4 text-primary" /> Install in 4 steps
            </CardTitle>
            <CardDescription>Manifest V3 · Chrome, Edge, Brave, Arc</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <Step n={1} title="Download the bundle">
              <Button size="sm" variant="outline" className="gap-2 mt-2" asChild>
                <a href="/extension.zip" download>
                  <Download className="size-3.5" /> Download extension.zip
                </a>
              </Button>
              <p className="text-xs text-muted-foreground mt-1.5">
                Or grab it from this portal at <code className="font-mono">{typeof location !== "undefined" ? location.origin + "/extension.zip" : "/extension.zip"}</code> and unzip it.
              </p>
            </Step>
            <Step n={2} title="Load unpacked">
              <p className="text-xs text-muted-foreground mt-1">
                Open <code className="font-mono">chrome://extensions</code> → enable <b>Developer mode</b> →
                <b> Load unpacked</b> → select the unzipped folder.
              </p>
            </Step>
            <Step n={3} title="Connect to this portal">
              <p className="text-xs text-muted-foreground mt-1">
                Click the ApplyPilot icon → paste the portal URL and one of your API keys → <b>Connect</b>.
              </p>
            </Step>
            <Step n={4} title="Autofill any application">
              <p className="text-xs text-muted-foreground mt-1">
                Open a job application → press the floating <b>AI Autofill</b> button → review the
                validation report before you submit.
              </p>
            </Step>
          </CardContent>
        </Card>
      </div>

      {/* Platforms */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" /> Supported platforms
          </CardTitle>
          <CardDescription>
            <span className="inline-flex items-center gap-1"><Badge variant="outline" className="border-primary/40 text-primary mr-1">deep</Badge> platform-aware selectors ·
            <Badge variant="outline" className="ml-1">smart</Badge> generic AI field mapping</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PLATFORMS.map((p) => (
              <div key={p.name} className="rounded-lg border border-border/60 bg-secondary/30 px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <Link2 className="size-3.5 text-primary" /> {p.name}
                  </p>
                  <Badge variant="outline" className={p.level === "deep" ? "border-primary/40 text-primary" : "text-muted-foreground"}>
                    {p.level}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">{p.match}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-primary" />
            Any other site with a plain HTML form still works via generic AI mapping — the extension
            classifies every input, select and textarea.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="grid place-items-center size-6 shrink-0 rounded-full bg-primary/15 border border-primary/40 text-primary text-xs font-semibold">
        {n}
      </span>
      <div className="min-w-0">
        <p className="font-medium leading-6">{title}</p>
        {children}
      </div>
    </div>
  );
}
