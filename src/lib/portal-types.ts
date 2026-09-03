/** Shared client-side types for the ApplyPilot portal. */

export interface ProfileLinks {
  linkedin: string;
  github: string;
  portfolio: string;
  website: string;
}

export interface ProfileEducation {
  degree: string;
  school: string;
  field: string;
  startYear: string;
  endYear: string;
  gpa: string;
}

export interface ProfileExperience {
  company: string;
  title: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

export interface Profile {
  _id?: string;
  fullName: string;
  email: string;
  phone: string;
  location: string;
  links: ProfileLinks;
  summary: string;
  desiredRole: string;
  workAuthorization: string;
  yearsOfExperience: string;
  education: ProfileEducation[];
  experience: ProfileExperience[];
  skills: string[];
  certifications: string[];
  languages: string[];
  source?: string;
  updatedAt?: string;
}

export interface SessionError {
  fieldLabel?: string;
  message?: string;
  severity?: string;
  source?: string;
}

export interface FillSession {
  _id: string;
  url: string;
  platform: string;
  fieldCount: number;
  filledCount: number;
  skipped: Array<{ label?: string; reason?: string }>;
  errors: SessionError[];
  fixes: Array<{ fieldLabel?: string; oldValue?: string; newValue?: string }>;
  status: string;
  durationMs: number;
  startedAt: string;
}

export interface ActivityItem {
  _id: string;
  type: string;
  message: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface StatsResponse {
  hasProfile: boolean;
  profileName: string | null;
  resumeCount: number;
  sessionCount: number;
  keyCount: number;
  aiProvider: "gemini" | "zai-fallback";
  kpis: {
    fieldsDetected: number;
    fieldsFilled: number;
    errorsDetected: number;
    autoFixes: number;
    successRate: number;
  };
  sessions: FillSession[];
  activity: ActivityItem[];
}

export interface KeyInfo {
  _id: string;
  key: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

export const EMPTY_PROFILE: Profile = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  links: { linkedin: "", github: "", portfolio: "", website: "" },
  summary: "",
  desiredRole: "",
  workAuthorization: "",
  yearsOfExperience: "",
  education: [],
  experience: [],
  skills: [],
  certifications: [],
  languages: [],
};

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
