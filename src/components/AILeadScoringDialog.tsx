import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Target, CheckCircle, AlertCircle } from "lucide-react";

import { callGemini, hasGeminiKey } from "@/lib/gemini";

interface Lead {
  id: string;
  company_name?: string;
  email?: string;
  phone?: string;
  industry?: string;
  priority?: string;
  software_category?: string;
  [key: string]: unknown;
}

interface ScoreResult {
  id: string;
  score: number;
  reason: string;
  company_name: string;
}

interface AILeadScoringDialogProps {
  open: boolean;
  onClose: () => void;
  leads: Lead[];
  onScoresApplied: (scores: Record<string, number>) => void;
}

type Step = "confirm" | "scoring" | "results";

const getScoreColor = (score: number) => {
  if (score >= 80) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-rose-100 text-rose-800 border-rose-200";
};

const getScoreDot = (score: number) => {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-rose-500";
};

export default function AILeadScoringDialog({
  open,
  onClose,
  leads,
  onScoresApplied,
}: AILeadScoringDialogProps) {
  const [step, setStep] = useState<Step>("confirm");
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ScoreResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setStep("confirm");
      setProgress(0);
      setResults([]);
      setError(null);
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [open]);

  const startProgress = () => {
    setProgress(0);
    const start = Date.now();
    const duration = 5000; // 5 seconds to reach 90%
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min(90, Math.floor((elapsed / duration) * 90));
      setProgress(pct);
      if (pct >= 90) {
        if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      }
    }, 100);
  };

  const scoreLeads = async () => {
    if (!hasGeminiKey()) {
      setError(
        "Gemini API key not configured. Add VITE_GEMINI_API_KEY to your .env file and to your Vercel environment variables."
      );
      return;
    }

    setStep("scoring");
    setError(null);
    startProgress();

    const batch = leads.slice(0, 50);

    const leadsPayload = batch.map((l) => ({
      id: l.id,
      company_name: l.company_name || "",
      industry: l.industry || "",
      email: l.email || "",
      phone: l.phone || "",
      priority: l.priority || "medium",
      software_category: l.software_category || "",
    }));

    const prompt = `You are an expert B2B sales scoring engine. Rank how likely each lead is to convert.

Score each lead from 1 to 100 based on these rules:
- Data completeness: non-empty email = +10, non-empty phone = +10, known industry = +8
- Company name quality: specific meaningful names = +10, generic/vague names = +0 to +5
- Priority: urgent = +20, high = +10, medium = 0, low = -10
- Industry looks like a strong commercial buyer (established sector, has budget) = +10 to +25
- Base score starts at 40

Leads to score:
${JSON.stringify(leadsPayload, null, 2)}

Return ONLY a valid JSON array (no markdown, no explanation). Each element must have:
- id: string (same as input)
- score: number (1-100)
- reason: string (one concise sentence explaining the score)

JSON array only, starting with [ and ending with ]`;

    try {
      const rawText = await callGemini(prompt, {
        temperature: 0.2,
        maxOutputTokens: 8192,
      });

      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

      const jsonStr = rawText
        .replace(/^```json\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      let scored: { id: string; score: number; reason: string }[];
      try {
        scored = JSON.parse(jsonStr);
      } catch {
        throw new Error("Gemini returned invalid JSON. Please try again.");
      }

      if (!Array.isArray(scored)) {
        throw new Error("Gemini response was not a JSON array.");
      }

      // Merge with company names and sort descending
      const enriched: ScoreResult[] = scored.map((s) => {
        const lead = leads.find((l) => l.id === s.id);
        return {
          id: s.id,
          score: Math.max(1, Math.min(100, Math.round(s.score))),
          reason: s.reason,
          company_name: lead?.company_name || s.id,
        };
      });

      enriched.sort((a, b) => b.score - a.score);

      setProgress(100);
      setResults(enriched);
      setStep("results");
    } catch (err: unknown) {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      setStep("confirm");
    }
  };

  const handleApply = () => {
    const scoreMap: Record<string, number> = {};
    results.forEach((r) => {
      scoreMap[r.id] = r.score;
    });
    onScoresApplied(scoreMap);
    onClose();
  };

  const batchSize = Math.min(leads.length, 50);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Target className="w-5 h-5 text-violet-600" />
            AI Lead Scoring
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1: Confirm */}
        {step === "confirm" && (
          <div className="flex flex-col gap-5 py-4">
            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="rounded-xl bg-violet-50 border border-violet-200 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-violet-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-base">
                    Score {batchSize} lead{batchSize !== 1 ? "s" : ""} with Gemini AI
                  </p>
                  <p className="text-sm text-slate-500">
                    {leads.length > 50
                      ? `First 50 of ${leads.length} leads will be scored in this batch.`
                      : "All your leads will be analyzed in one batch."}
                  </p>
                </div>
              </div>
              <ul className="text-sm text-slate-600 space-y-1 pl-1">
                <li>• Industry fit for blockchain ERP (manufacturing, logistics, finance)</li>
                <li>• Company name quality and specificity</li>
                <li>• Contact completeness (email +10, phone +10)</li>
                <li>• Priority level (urgent +20, high +10, low -10)</li>
                <li>• Blockchain ERP software category (+15)</li>
              </ul>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={scoreLeads}
                disabled={leads.length === 0}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Score with AI
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* STEP 2: Progress */}
        {step === "scoring" && (
          <div className="flex flex-col items-center gap-6 py-10">
            <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center animate-pulse">
              <Sparkles className="w-8 h-8 text-violet-600" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-900 text-base mb-1">
                Gemini is scoring your leads…
              </p>
              <p className="text-sm text-slate-500">
                Analyzing {batchSize} leads for blockchain ERP fit
              </p>
            </div>
            <div className="w-full max-w-sm">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Results */}
        {step === "results" && (
          <div className="flex flex-col gap-4 min-h-0">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span>
                Scored <strong>{results.length}</strong> leads — sorted by score
              </span>
              <div className="ml-auto flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                  80+ Strong
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                  50–79 Moderate
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                  &lt;50 Weak
                </span>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg" style={{ maxHeight: "380px" }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
                  <tr>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500 w-10">#</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500">Company</th>
                    <th className="text-center py-2 px-3 text-xs font-semibold text-slate-500 w-20">Score</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-slate-500">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 text-xs text-slate-400 font-medium">{i + 1}</td>
                      <td className="py-2 px-3">
                        <span className="text-xs font-medium text-slate-900">{r.company_name}</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-semibold ${getScoreColor(r.score)}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${getScoreDot(r.score)}`} />
                          {r.score}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-xs text-slate-500 max-w-xs">{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Discard
              </Button>
              <Button
                onClick={handleApply}
                className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Apply Scores
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
