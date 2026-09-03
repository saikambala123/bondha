"use client";

/**
 * Applications view — history of extension autofill sessions with the
 * errors the validator detected and the AI auto-repairs it applied.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Briefcase, CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw,
  ExternalLink, Clock, ListChecks, Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { timeAgo, type FillSession } from "@/lib/portal-types";

export function ApplicationsView() {
  const [sessions, setSessions] = useState<FillSession[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      } else {
        toast.error("Could not load sessions");
      }
    } catch {
      toast.error("Could not load sessions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="size-5 text-primary" /> Application history
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Every autofill session reported by the extension — fields filled, validation errors detected, AI repairs applied.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading && !sessions ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : !sessions || sessions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-14 text-center">
            <ListChecks className="size-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No fill sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Install the extension, open a job application on Workday / Greenhouse / any ATS, and press the
              ApplyPilot button — sessions will appear here in real time.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sessions.map((s) => {
            const hostname = safeHost(s.url);
            const errorCount = s.errors?.length ?? 0;
            const clean = errorCount === 0 && s.status !== "failed";
            return (
              <Card key={s._id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={clean
                            ? "border-primary/40 text-primary bg-primary/10"
                            : "border-amber-500/40 text-amber-400 bg-amber-500/10"}
                        >
                          {s.platform}
                        </Badge>
                        <span className="truncate max-w-md">{hostname}</span>
                      </CardTitle>
                      <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
                        <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {timeAgo(s.startedAt)}</span>
                        <span>{s.filledCount}/{s.fieldCount} fields filled</span>
                        <span className="inline-flex items-center gap-1">
                          {clean ? <ShieldCheck className="size-3 text-primary" /> : <AlertTriangle className="size-3 text-amber-400" />}
                          {clean ? "no errors detected" : `${errorCount} issue${errorCount === 1 ? "" : "s"} detected`}
                        </span>
                        {s.fixes?.length > 0 && (
                          <span className="inline-flex items-center gap-1"><Wrench className="size-3 text-primary" /> {s.fixes.length} auto-repair{s.fixes.length === 1 ? "" : "s"}</span>
                        )}
                        {(s.durationMs ?? 0) > 0 && <span>{(s.durationMs / 1000).toFixed(1)}s</span>}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="capitalize">{s.status}</Badge>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer" aria-label="Open application page">
                          <Button variant="ghost" size="icon" className="size-8">
                            <ExternalLink className="size-3.5" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {(errorCount > 0 || s.skipped?.length > 0 || s.fixes?.length > 0) && (
                  <CardContent className="pt-0 space-y-3">
                    <Separator />
                    {errorCount > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide mb-2">
                          Detected issues
                        </p>
                        <ul className="space-y-1.5">
                          {s.errors.map((e, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm rounded-md bg-amber-500/5 border border-amber-500/20 px-3 py-2">
                              <AlertTriangle className="size-3.5 mt-0.5 text-amber-400 shrink-0" />
                              <span className="min-w-0">
                                {e.fieldLabel && <span className="font-medium">{e.fieldLabel}: </span>}
                                {e.message}
                                {e.source && <span className="text-muted-foreground"> ({e.source})</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.fixes?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-2">
                          AI auto-repairs
                        </p>
                        <ul className="space-y-1.5">
                          {s.fixes.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm rounded-md bg-primary/5 border border-primary/20 px-3 py-2">
                              <Wrench className="size-3.5 mt-0.5 text-primary shrink-0" />
                              <span>
                                <span className="font-medium">{f.fieldLabel}</span> — corrected value applied
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {s.skipped?.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                          Skipped fields
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.skipped.map((sk, i) => (
                            <Badge key={i} variant="secondary" className="font-normal">
                              {sk.label || "field"}{sk.reason ? ` — ${sk.reason}` : ""}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url || "unknown";
  }
}
