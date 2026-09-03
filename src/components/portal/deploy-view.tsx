"use client";

/**
 * Deploy view — copy-paste guide for shipping ApplyPilot to Vercel
 * with MongoDB Atlas + Gemini API key.
 */
import { useState } from "react";
import { Rocket, Copy, CheckCircle2, Database, KeyRound, Triangle, Globe } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const ENV_SNIPPET = `# .env / Vercel Environment Variables
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/applypilot?retryWrites=true&w=majority
GEMINI_API_KEY=AIza...your-google-ai-studio-key
# optional overrides
GEMINI_MODEL=gemini-2.5-flash`;

const CLI_SNIPPET = `# from the project root
npm i -g vercel
vercel            # link the project
vercel env add MONGODB_URI production
vercel env add GEMINI_API_KEY production
vercel --prod     # ship it`;

export function DeployView({ aiProvider }: { aiProvider: string }) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard blocked — copy manually");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Rocket className="size-5 text-primary" /> Deploy to Vercel
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          ApplyPilot is Vercel-native: Next.js App Router API routes, MongoDB via connection string,
          Gemini via REST. No servers, no custom database.
        </p>
      </div>

        <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-primary" /> 1 · MongoDB Atlas
            </CardTitle>
            <CardDescription>Free M0 cluster is enough to start</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>1. Create a cluster at mongodb.com/atlas and a database named <code className="font-mono text-foreground">applypilot</code>.</p>
            <p>2. Create a database user and add <code className="font-mono text-foreground">0.0.0.0/0</code> to network access (Vercel uses dynamic IPs).</p>
            <p>3. Copy the SRV connection string — it becomes <code className="font-mono text-foreground">MONGODB_URI</code>.</p>
            <p className="flex items-center gap-1.5 text-foreground">
              <CheckCircle2 className="size-4 text-primary shrink-0" />
              This sandbox preview already runs real MongoDB in-memory; Atlas replaces it in production.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4 text-primary" /> 2 · Gemini API key
            </CardTitle>
            <CardDescription>Google AI Studio — free tier works</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>1. Open aistudio.google.com → <b>Get API key</b> → create key.</p>
            <p>2. Add it as <code className="font-mono text-foreground">GEMINI_API_KEY</code>.</p>
            <p className="flex items-start gap-1.5">
              <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
              <span>
                With a key set, resume parsing and field mapping run on{" "}
                <Badge variant="outline" className="border-primary/40 text-primary mx-1">Google Gemini</Badge>
                — the built-in fallback engine stays as automatic resilience. Currently active:{" "}
                <Badge variant="outline" className={aiProvider === "gemini" ? "border-primary/40 text-primary mx-1" : "mx-1"}>
                  {aiProvider === "gemini" ? "Gemini" : "fallback (no key set)"}
                </Badge>
              </span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Triangle className="size-4 text-primary" /> 3 · Deploy
            </CardTitle>
            <CardDescription>Dashboard or CLI — both take ~2 minutes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Snippet title="Dashboard flow" code={"1. Push this repo to GitHub\n2. vercel.com/new → import the repo\n3. Add MONGODB_URI + GEMINI_API_KEY in project env settings\n4. Deploy"} />
            <Snippet title="CLI flow" code={CLI_SNIPPET} onCopy={() => copy(CLI_SNIPPET, "CLI commands")} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Globe className="size-4 text-primary" /> 4 · Point the extension at production
            </CardTitle>
            <CardDescription>Works with the same extension bundle</CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>1. Create an API key on your deployed portal (Extension tab).</p>
            <p>2. In the extension popup, replace the portal URL with <code className="font-mono text-foreground">https://your-app.vercel.app</code>.</p>
            <p>3. Paste the key → Connect. Autofill now runs against production MongoDB + Gemini.</p>
            <p className="flex items-center gap-1.5 text-foreground">
              <CheckCircle2 className="size-4 text-primary shrink-0" />
              CORS is pre-configured for extension origins and the session API is cookie-based.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment reference</CardTitle>
          <CardDescription>Everything the app reads from the environment</CardDescription>
        </CardHeader>
        <CardContent>
          <Snippet
            title=".env"
            code={ENV_SNIPPET}
            onCopy={() => copy(ENV_SNIPPET, "Environment variables")}
          />
          <p className="text-xs text-muted-foreground mt-3">
            <code className="font-mono">GEMINI_API_KEY</code> (or <code className="font-mono">GOOGLE_API_KEY</code>) — enables Gemini.
            Without it the Z.ai fallback engine handles parsing so the app never breaks.
            <code className="font-mono"> GEMINI_MODEL</code> — defaults to <code className="font-mono">gemini-2.5-flash</code>.
            <code className="font-mono"> MONGODB_URI</code> — Atlas SRV string; omitting it boots in-memory MongoDB for local preview.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Snippet({ title, code, onCopy }: { title: string; code: string; onCopy?: () => void }) {
  return (
    <div className="rounded-lg border border-border/70 bg-black/40 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
        <span className="text-xs text-muted-foreground">{title}</span>
        {onCopy && (
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Copy ${title}`} onClick={onCopy}>
            <Copy className="size-3.5" />
          </Button>
        )}
      </div>
      <pre className="ap-scroll overflow-x-auto p-3 text-xs font-mono leading-relaxed text-foreground/90 whitespace-pre">
        {code}
      </pre>
    </div>
  );
}
