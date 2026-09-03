"use client";

/**
 * Resume & Profile view — upload a resume, watch the AI parse it,
 * then review / edit the structured profile before the extension uses it.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud, FileText, Bot, Loader2, CheckCircle2, AlertCircle,
  Plus, Trash2, Save, X, RefreshCw, PenLine,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  EMPTY_PROFILE,
  type Profile, type ProfileEducation, type ProfileExperience,
} from "@/lib/portal-types";

type Phase = "idle" | "uploading" | "extracting" | "parsing" | "done" | "error";

export function ResumeProfileView({ onSaved }: { onSaved: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [skillInput, setSkillInput] = useState("");
  const [certInput, setCertInput] = useState("");
  const [langInput, setLangInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          setProfile({ ...EMPTY_PROFILE, ...data.profile });
          setPhase("done");
        }
      }
    } catch {
      // ignore — empty state is fine
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setFileName(file.name);
      setPhase("uploading");
      try {
        const body = new FormData();
        body.append("file", file);
        setPhase("extracting");
        // give the UI a beat to paint the step before the heavy request
        await new Promise((r) => setTimeout(r, 120));
        setPhase("parsing");
        const res = await fetch("/api/resume/parse", { method: "POST", body });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Parsing failed");
        setProfile({ ...EMPTY_PROFILE, ...data.profile });
        setProvider(data.provider);
        setPhase("done");
        setDirty(false);
        toast.success(`Resume parsed with ${data.provider === "gemini" ? "Gemini" : "AI engine"}`, {
          description: `${data.profile.fullName || "Candidate"} — ${(data.profile.skills || []).length} skills, ${(data.profile.experience || []).length} roles extracted`,
        });
        onSaved();
      } catch (err) {
        setPhase("error");
        setError(err instanceof Error ? err.message : "Upload failed");
        toast.error("Resume parsing failed", { description: err instanceof Error ? err.message : undefined });
      }
    },
    [onSaved],
  );

  const update = (patch: Partial<Profile>) => {
    setProfile((p) => (p ? { ...p, ...patch } : p));
    setDirty(true);
  };

  const saveProfile = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setProfile({ ...EMPTY_PROFILE, ...data.profile });
      setDirty(false);
      toast.success("Profile saved", { description: "The extension will use this data on your next autofill." });
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="size-4 text-primary" /> AI resume parsing
          </CardTitle>
          <CardDescription>
            PDF, DOCX or TXT up to 8MB. The AI extracts 25+ structured fields — contact info,
            experience, education, skills — and stores them in MongoDB.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {phase === "idle" || phase === "error" ? (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload resume"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-secondary/40"
              }`}
            >
              <UploadCloud className="size-10 mx-auto text-primary mb-3" />
              <p className="font-medium">Drop your resume here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1">
                {phase === "error" ? error : "Gemini reads it end-to-end and builds your autofill profile"}
              </p>
            </div>
          ) : phase !== "done" ? (
            <ParseSteps phase={phase} fileName={fileName} />
          ) : null}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {phase === "done" && profile && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 py-3">
              <CheckCircle2 className="size-4 text-primary" />
              <p className="text-sm flex-1 min-w-0 truncate">
                Active profile: <span className="font-semibold">{profile.fullName || "Unnamed"}</span>
                {fileName && <span className="text-muted-foreground"> — from {fileName}</span>}
              </p>
              {provider && <Badge variant="outline" className="border-primary/30 text-primary">{provider === "gemini" ? "Gemini" : "AI fallback"}</Badge>}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => inputRef.current?.click()}>
                <RefreshCw className="size-3.5" /> Re-parse new file
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Profile editor */}
      {phase === "done" && profile && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <PenLine className="size-4 text-primary" /> Structured profile
              </CardTitle>
              <CardDescription>Review, correct and enrich — the extension fills forms from this</CardDescription>
            </div>
            <Button onClick={saveProfile} disabled={!dirty || saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {dirty ? "Save changes" : "Saved"}
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Contact basics */}
            <section className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" value={profile.fullName} onChange={(v) => update({ fullName: v })} />
              <Field label="Email" type="email" value={profile.email} onChange={(v) => update({ email: v })} />
              <Field label="Phone" type="tel" value={profile.phone} onChange={(v) => update({ phone: v })} />
              <Field label="Location" value={profile.location} onChange={(v) => update({ location: v })} />
              <Field label="Desired role" value={profile.desiredRole} onChange={(v) => update({ desiredRole: v })} />
              <Field label="Work authorization" value={profile.workAuthorization} onChange={(v) => update({ workAuthorization: v })} placeholder="e.g. US Citizen / H1-B / Green card" />
              <Field label="Years of experience" value={profile.yearsOfExperience} onChange={(v) => update({ yearsOfExperience: v })} />
              <Field label="LinkedIn URL" value={profile.links?.linkedin} onChange={(v) => update({ links: { ...profile.links, linkedin: v } })} />
              <Field label="GitHub URL" value={profile.links?.github} onChange={(v) => update({ links: { ...profile.links, github: v } })} />
              <Field label="Portfolio / website" value={profile.links?.portfolio || profile.links?.website} onChange={(v) => update({ links: { ...profile.links, portfolio: v } })} />
            </section>

            <Field label="Professional summary" textarea value={profile.summary} onChange={(v) => update({ summary: v })} />

            <Separator />

            {/* Skills / certs / languages */}
            <section className="grid sm:grid-cols-3 gap-4">
              <TagList
                title="Skills"
                items={profile.skills}
                input={skillInput}
                setInput={setSkillInput}
                onChange={(items) => update({ skills: items })}
              />
              <TagList
                title="Certifications"
                items={profile.certifications}
                input={certInput}
                setInput={setCertInput}
                onChange={(items) => update({ certifications: items })}
              />
              <TagList
                title="Languages"
                items={profile.languages}
                input={langInput}
                setInput={setLangInput}
                onChange={(items) => update({ languages: items })}
              />
            </section>

            <Separator />

            {/* Experience */}
            <section>
              <ArrayHeader
                title="Work experience"
                count={profile.experience.length}
                onAdd={() =>
                  update({
                    experience: [
                      ...profile.experience,
                      { company: "", title: "", location: "", startDate: "", endDate: "", current: false, description: "" },
                    ],
                  })
                }
              />
              <div className="space-y-4">
                {profile.experience.map((exp, i) => (
                  <ExperienceCard
                    key={i}
                    exp={exp}
                    onChange={(next) => {
                      const arr = [...profile.experience];
                      arr[i] = next;
                      update({ experience: arr });
                    }}
                    onRemove={() => update({ experience: profile.experience.filter((_, j) => j !== i) })}
                  />
                ))}
              </div>
            </section>

            {/* Education */}
            <section>
              <ArrayHeader
                title="Education"
                count={profile.education.length}
                onAdd={() =>
                  update({
                    education: [
                      ...profile.education,
                      { degree: "", school: "", field: "", startYear: "", endYear: "", gpa: "" },
                    ],
                  })
                }
              />
              <div className="grid md:grid-cols-2 gap-4">
                {profile.education.map((edu, i) => (
                  <Card key={i} className="bg-secondary/30 border-border/60">
                    <CardContent className="pt-4 space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Field label="Degree" value={edu.degree} onChange={(v) => {
                          const arr = [...profile.education];
                          arr[i] = { ...edu, degree: v };
                          update({ education: arr });
                        }} />
                        <Field label="School" value={edu.school} onChange={(v) => {
                          const arr = [...profile.education];
                          arr[i] = { ...edu, school: v };
                          update({ education: arr });
                        }} />
                        <Field label="Field of study" value={edu.field} onChange={(v) => {
                          const arr = [...profile.education];
                          arr[i] = { ...edu, field: v };
                          update({ education: arr });
                        }} />
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="Start" value={edu.startYear} onChange={(v) => {
                            const arr = [...profile.education];
                            arr[i] = { ...edu, startYear: v };
                            update({ education: arr });
                          }} />
                          <Field label="End" value={edu.endYear} onChange={(v) => {
                            const arr = [...profile.education];
                            arr[i] = { ...edu, endYear: v };
                            update({ education: arr });
                          }} />
                          <Field label="GPA" value={edu.gpa} onChange={(v) => {
                            const arr = [...profile.education];
                            arr[i] = { ...edu, gpa: v };
                            update({ education: arr });
                          }} />
                        </div>
                      </div>
                      <Button
                        size="sm" variant="ghost" className="text-destructive gap-1.5"
                        onClick={() => update({ education: profile.education.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="size-3.5" /> Remove
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </CardContent>
        </Card>
      )}

      {!profile && (phase === "idle" || phase === "error") && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No profile yet — upload a resume above, or the editor will appear here once parsed.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ParseSteps({ phase, fileName }: { phase: Phase; fileName: string | null }) {
  const steps = [
    { key: "uploading", label: "Uploading file to server" },
    { key: "extracting", label: "Extracting raw text (PDF/DOCX)" },
    { key: "parsing", label: "AI reading & structuring your resume" },
  ] as const;
  const activeIdx = steps.findIndex((s) => s.key === phase);
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 px-6 py-8">
      <p className="text-sm font-medium mb-4 flex items-center gap-2">
        <FileText className="size-4 text-primary" /> {fileName || "resume"}
      </p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-center gap-3 text-sm">
            {i < activeIdx || phase === "done" ? (
              <CheckCircle2 className="size-4 text-primary" />
            ) : i === activeIdx ? (
              <Loader2 className="size-4 animate-spin text-primary" />
            ) : (
              <span className="size-4 rounded-full border border-border" />
            )}
            <span className={i === activeIdx ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Field({
  label, value, onChange, type = "text", textarea, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  textarea?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {textarea ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-24" />
      ) : (
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

function ArrayHeader({ title, count, onAdd }: { title: string; count: number; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold">
        {title} <span className="text-muted-foreground font-normal">({count})</span>
      </h3>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={onAdd}>
        <Plus className="size-3.5" /> Add
      </Button>
    </div>
  );
}

function ExperienceCard({
  exp, onChange, onRemove,
}: {
  exp: ProfileExperience;
  onChange: (e: ProfileExperience) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="bg-secondary/30 border-border/60">
      <CardContent className="pt-4 space-y-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Company" value={exp.company} onChange={(v) => onChange({ ...exp, company: v })} />
          <Field label="Job title" value={exp.title} onChange={(v) => onChange({ ...exp, title: v })} />
          <Field label="Location" value={exp.location} onChange={(v) => onChange({ ...exp, location: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Start date" value={exp.startDate} onChange={(v) => onChange({ ...exp, startDate: v })} placeholder="Jan 2020" />
            <Field label="End date" value={exp.endDate} onChange={(v) => onChange({ ...exp, endDate: v })} placeholder={exp.current ? "Present" : "Dec 2022"} />
          </div>
        </div>
        <Field label="What you did" textarea value={exp.description} onChange={(v) => onChange({ ...exp, description: v })} />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={exp.current}
              onChange={(e) => onChange({ ...exp, current: e.target.checked, endDate: e.target.checked ? "Present" : exp.endDate })}
              className="accent-[var(--primary)] size-4"
            />
            Current role
          </label>
          <Button size="sm" variant="ghost" className="text-destructive gap-1.5" onClick={onRemove}>
            <Trash2 className="size-3.5" /> Remove
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TagList({
  title, items, input, setInput, onChange,
}: {
  title: string;
  items: string[];
  input: string;
  setInput: (v: string) => void;
  onChange: (items: string[]) => void;
}) {
  const add = () => {
    const v = input.trim();
    if (!v) return;
    if (!items.includes(v)) onChange([...items, v]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">{title}</Label>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}`}
        />
        <Button size="icon" variant="outline" onClick={add} aria-label={`Add ${title}`}>
          <Plus className="size-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-8 max-h-32 overflow-y-auto ap-scroll">
        {items.length === 0 && <span className="text-xs text-muted-foreground">None yet</span>}
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="gap-1 pr-1">
            {item}
            <button
              onClick={() => onChange(items.filter((i) => i !== item))}
              aria-label={`Remove ${item}`}
              className="rounded-full hover:bg-destructive/20 p-0.5"
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
