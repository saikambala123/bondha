"use client";

import { motion } from "framer-motion";
import {
  FileText, Zap, ShieldAlert, Wrench, Gauge, ArrowRight, Upload,
  Bot, CheckCircle2, AlertTriangle, Activity as ActivityIcon, Sparkles,
} from "lucide-react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo, type StatsResponse } from "@/lib/portal-types";
import type { TabId } from "@/components/portal/tab-types";

interface Props {
  stats: StatsResponse | null;
  health: { ok: boolean; aiProvider: string; geminiConfigured: boolean } | null;
  onNavigate: (tab: TabId) => void;
  onRefresh: () => void;
}

const KPIS = [
  { key: "fieldsDetected", label: "Fields detected", icon: FileText, hint: "Across all fill sessions" },
  { key: "fieldsFilled", label: "Fields auto-filled", icon: Zap, hint: "Filled by the AI engine" },
  { key: "errorsDetected", label: "Errors detected", icon: ShieldAlert, hint: "Caught by the validator" },
  { key: "autoFixes", label: "Auto-repairs", icon: Wrench, hint: "Fields fixed after detection" },
] as const;

export function DashboardView({ stats, health, onNavigate, onRefresh }: Props) {
  return (
    <div className="space-y-6">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-2xl border border-border/70 ap-grid-bg"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent" aria-hidden />
        <div className="relative p-6 sm:p-10">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 gap-1.5">
              <Bot className="size-3.5" />
              {health?.geminiConfigured ? "Gemini 2.5 Flash live" : "AI engine ready (fallback mode)"}
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground gap-1.5">
              <CheckCircle2 className="size-3.5 text-primary" /> MongoDB connected
            </Badge>
          </div>
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight max-w-2xl">
            Autofill any job application with AI —{" "}
            <span className="text-primary">and catch every error before you hit submit.</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground max-w-2xl">
            Upload a resume, connect the Chrome extension, and ApplyPilot maps your profile onto
            Workday, Greenhouse, Lever, Ashby, Taleo, iCIMS and generic ATS forms — validating email,
            phone, required fields and platform error banners in real time.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => onNavigate("resume")} className="gap-2">
              <Upload className="size-4" /> Upload resume
            </Button>
            <Button variant="outline" onClick={() => onNavigate("extension")} className="gap-2">
              Get the extension <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </motion.section>

      {/* KPI cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-label="Key metrics">
        {KPIS.map(({ key, label, icon: Icon, hint }, i) => (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.3 }}
          >
            <Card className="hover:border-primary/30 transition-colors">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5 text-xs">
                  <Icon className="size-3.5 text-primary" /> {label}
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">
                  {stats ? stats.kpis[key].toLocaleString() : <Skeleton className="h-8 w-16" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-[11px] text-muted-foreground">{hint}</CardContent>
            </Card>
          </motion.div>
        ))}
      </section>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Fill success gauge + setup checklist */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Gauge className="size-4 text-primary" /> Fill success rate
              </CardTitle>
              <CardDescription>
                {stats?.kpis.fieldsDetected
                  ? `${stats.kpis.fieldsFilled} of ${stats.kpis.fieldsDetected} detected fields filled`
                  : "Run your first autofill session to see metrics"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {stats ? (
                <>
                  <div className="text-4xl font-bold tabular-nums text-primary">
                    {stats.kpis.successRate}%
                  </div>
                  <Progress value={stats.kpis.successRate} className="mt-3 h-2.5" />
                </>
              ) : (
                <Skeleton className="h-16 w-full" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Setup checklist</CardTitle>
              <CardDescription>Three steps to fully hands-off applications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <SetupStep
                done={stats?.hasProfile}
                n={1}
                label="Upload & parse a resume"
                action="Go to Resume"
                onAction={() => onNavigate("resume")}
              />
              <SetupStep
                done={(stats?.keyCount ?? 0) > 0}
                n={2}
                label="Create an extension API key"
                action="Go to Extension"
                onAction={() => onNavigate("extension")}
              />
              <SetupStep
                done={(stats?.sessionCount ?? 0) > 0}
                n={3}
                label="Run your first AI autofill"
                action="See Applications"
                onAction={() => onNavigate("applications")}
              />
            </CardContent>
          </Card>
        </div>

        {/* Activity feed */}
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon className="size-4 text-primary" /> Live activity
              </CardTitle>
              <CardDescription>Resume parses, autofill sessions and error reports</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={onRefresh} className="gap-1.5">
              <Sparkles className="size-3.5" /> Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : stats.activity.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                <Bot className="size-10 mx-auto mb-3 opacity-30" />
                Nothing yet — upload a resume to kick things off.
              </div>
            ) : (
              <ul className="space-y-2 max-h-[420px] overflow-y-auto ap-scroll pr-1">
                {stats.activity.map((item) => (
                  <li
                    key={item._id}
                    className="flex items-start gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5"
                  >
                    <span className="mt-0.5">
                      {item.type === "fill_session" ? (
                        item.message.includes("no errors") ? (
                          <CheckCircle2 className="size-4 text-primary" />
                        ) : (
                          <AlertTriangle className="size-4 text-amber-400" />
                        )
                      ) : item.type === "resume_parsed" ? (
                        <FileText className="size-4 text-primary" />
                      ) : (
                        <Bot className="size-4 text-muted-foreground" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug">{item.message}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {item.type.replace(/_/g, " ")} · {timeAgo(item.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SetupStep({
  done, n, label, action, onAction,
}: {
  done?: boolean;
  n: number;
  label: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          done
            ? "grid place-items-center size-7 rounded-full bg-primary/15 border border-primary/40 text-primary"
            : "grid place-items-center size-7 rounded-full border border-border text-muted-foreground text-xs"
        }
      >
        {done ? <CheckCircle2 className="size-4" /> : n}
      </span>
      <p className="flex-1 text-sm">{label}</p>
      {!done && (
        <Button size="sm" variant="ghost" className="text-primary gap-1" onClick={onAction}>
          {action} <ArrowRight className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
