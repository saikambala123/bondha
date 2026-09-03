"use client";

/**
 * ApplyPilot — main portal shell.
 * Single-page app: Dashboard / Resume & Profile / Applications / Extension / Deploy.
 */
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, LayoutDashboard, FileText, Briefcase, Puzzle, Rocket,
  Loader2, Zap, CheckCircle2, ShieldCheck, Database, Github,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DashboardView } from "@/components/portal/dashboard-view";
import { ResumeProfileView } from "@/components/portal/resume-profile-view";
import { ApplicationsView } from "@/components/portal/applications-view";
import { ExtensionView } from "@/components/portal/extension-view";
import { DeployView } from "@/components/portal/deploy-view";
import type { StatsResponse } from "@/lib/portal-types";

type TabId = "dashboard" | "resume" | "applications" | "extension" | "deploy";

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "resume", label: "Resume & Profile", icon: FileText },
  { id: "applications", label: "Applications", icon: Briefcase },
  { id: "extension", label: "Extension", icon: Puzzle },
  { id: "deploy", label: "Deploy", icon: Rocket },
];

export default function Home() {
  const [tab, setTab] = useState<TabId>("dashboard");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; aiProvider: string; geminiConfigured: boolean } | null>(null);
  const [booting, setBooting] = useState(true);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      if (res.ok) setStats(await res.json());
    } catch {
      // network hiccup — keep previous data
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [hRes] = await Promise.all([fetch("/api/health", { cache: "no-store" }), refreshStats()]);
        if (hRes.ok) setHealth(await hRes.json());
      } catch {
        toast.error("Could not reach the API — is the server running?");
      } finally {
        setBooting(false);
      }
    })();
  }, [refreshStats]);

  const goto = (t: TabId) => {
    setTab(t);
    if (t !== "resume") refreshStats();
  };

  return (
    <div className="relative min-h-screen flex flex-col">
      <div className="ap-glow" aria-hidden />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => goto("dashboard")}
            className="flex items-center gap-2.5 group shrink-0"
            aria-label="ApplyPilot home"
          >
            <span className="relative grid place-items-center size-9 rounded-xl bg-primary/15 border border-primary/30">
              <Zap className="size-5 text-primary" />
              <span className="absolute inset-0 rounded-xl bg-primary/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </span>
            <span className="text-left leading-tight">
              <span className="block font-semibold tracking-tight text-[15px]">
                Apply<span className="text-primary">Pilot</span>
              </span>
              <span className="block text-[10px] uppercase tracking-widest text-muted-foreground">
                AI Autofill for Job Apps
              </span>
            </span>
          </button>

          <nav className="hidden md:flex items-center gap-1 mx-auto" aria-label="Primary">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => goto(id)}
                aria-current={tab === id ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors",
                  tab === id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/70",
                )}
              >
                <Icon className="size-4" />
                {label}
                {tab === id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-primary/10 border border-primary/20"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
              </button>
            ))}
          </nav>

          <div className="ml-auto md:ml-0 flex items-center gap-2">
            {health && (
              <span
                className={cn(
                  "hidden sm:inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
                  health.ok
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/40 bg-destructive/10 text-destructive",
                )}
              >
                {health.ok ? <CheckCircle2 className="size-3.5" /> : <Loader2 className="size-3.5 animate-spin" />}
                {health.ok ? (health.geminiConfigured ? "Gemini API connected" : "AI engine: sandbox fallback") : "API offline"}
              </span>
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="md:hidden flex overflow-x-auto ap-scroll gap-1 px-3 pb-2" aria-label="Mobile">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => goto(id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium border",
                tab === id
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Main ───────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 w-full mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8">
        {booting ? (
          <div className="grid place-items-center min-h-[50vh]">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm">Connecting to MongoDB & AI engine…</p>
            </div>
          </div>
        ) : (
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            {tab === "dashboard" && (
              <DashboardView stats={stats} health={health} onNavigate={goto} onRefresh={refreshStats} />
            )}
            {tab === "resume" && <ResumeProfileView onSaved={refreshStats} />}
            {tab === "applications" && <ApplicationsView />}
            {tab === "extension" && <ExtensionView onKeysChanged={refreshStats} />}
            {tab === "deploy" && <DeployView aiProvider={stats?.aiProvider ?? "zai-fallback"} />}
          </motion.div>
        )}
      </main>

      {/* ── Footer (sticky) ────────────────────────────────────── */}
      <footer className="relative z-10 mt-auto border-t border-border/60 bg-card/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground pb-[max(1rem,env(safe-area-inset-bottom))]">
          <p className="flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            ApplyPilot — AI auto-fill for Workday, Greenhouse, Lever, Ashby, Taleo, iCIMS & more
          </p>
          <p className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1"><Database className="size-3.5" /> MongoDB backend</span>
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> API-key secured</span>
            <span className="inline-flex items-center gap-1"><Github className="size-3.5" /> Vercel-ready</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
