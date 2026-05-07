"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { X, ChevronRight, ChevronLeft, Sparkles, BookOpen } from "lucide-react";

interface TourStep {
  id: string;
  href: string;
  title: string;
  tag: string;
  body: string;
  engine?: string;
  engineColor?: string;
}

const STEPS: TourStep[] = [
  {
    id: "welcome",
    href: "/",
    title: "Welcome to Rate Me",
    tag: "START",
    body: "AI-powered sales performance intelligence — built on the COSMIC scoring pipeline. This tour walks through every section and explains what the engine is doing under the hood.",
  },
  {
    id: "overview",
    href: "/",
    title: "Overview Dashboard",
    tag: "DASHBOARD",
    engine: "QUASAR",
    engineColor: "text-[#dc2626]",
    body: "Live composite scores for every rep, team averages, and the signal feed. The QUASAR engine re-scores on every new session — what you see here is always current.",
  },
  {
    id: "reps",
    href: "/reps",
    title: "Rep Roster",
    tag: "REPS",
    engine: "QUASAR",
    engineColor: "text-[#dc2626]",
    body: "Full rep list ranked by QUASAR score. The confidence band tells you how much session data backs each number. Low confidence = needs more calls in the system before the score firms up.",
  },
  {
    id: "rep-profile",
    href: "/reps/rep-1",
    title: "Rep Profile",
    tag: "REP DETAIL",
    engine: "QUASAR + NEBULA",
    engineColor: "text-[#dc2626]",
    body: "The circular gauge is the composite score. Below it: 4 QUASAR dimensions (Call Efficiency, Engagement, Conversion, Activity), a full score history timeline, and every session with sentiment scoring from NEBULA.",
  },
  {
    id: "team",
    href: "/team",
    title: "Team Workbench",
    tag: "TEAMS",
    engine: "QUASAR",
    engineColor: "text-[#dc2626]",
    body: "Individual QUASAR scores roll up to team aggregates. Spot which teams are accelerating vs. stalling, and click any rep to drill in without losing context.",
  },
  {
    id: "alerts",
    href: "/alerts",
    title: "Signal Inbox",
    tag: "ALERTS",
    engine: "PULSAR",
    engineColor: "text-[#dc2626]",
    body: "PULSAR watches every incoming session for anomalies. Three signal types: SCORE_DROP (coach now), ANOMALY (unusual pattern — worth reviewing), MILESTONE (rep crossed a threshold — celebrate it). Fires before your manager notices.",
  },
  {
    id: "benchmarks",
    href: "/benchmarks",
    title: "Benchmark Lab",
    tag: "BENCHMARKS",
    engine: "AURORA",
    engineColor: "text-green-400",
    body: "Define what 'Excellent', 'Good', and 'Needs Improvement' mean for your team. AURORA calibrates QUASAR against your benchmarks — not generic industry averages. Change a threshold, scores re-tier immediately.",
  },
  {
    id: "recruiter",
    href: "/recruiter",
    title: "Recruiter Intelligence",
    tag: "HIRING",
    engine: "QUASAR",
    engineColor: "text-[#dc2626]",
    body: "The same QUASAR model that scores your active reps predicts how a candidate will perform before they start. Compare candidates head-to-head against your top performers — see exactly where the gap is.",
  },
  {
    id: "trust",
    href: "/trust",
    title: "Trust & Provenance",
    tag: "GOVERNANCE",
    engine: "COSMIC",
    engineColor: "text-[#0f172a]",
    body: "Every score is traceable. The Trust layer shows which data sources fed each calculation, when they synced, and the governance rules COSMIC operates under. Full audit trail — no black boxes.",
  },
  {
    id: "done",
    href: "/",
    title: "You're set.",
    tag: "DONE",
    body: "That's the full platform. Every score, signal, and benchmark is powered by the COSMIC engine — deterministic, auditable, and always live. Questions? Hit the Support link in the sidebar.",
  },
];

const STORAGE_KEY = "rateme_tour_dismissed";

export function Tour() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(true); // start hidden until we check storage

  useEffect(() => {
    const wasDismissed = localStorage.getItem(STORAGE_KEY) === "true";
    setDismissed(wasDismissed);
  }, []);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  const navigate = useCallback(
    (toStep: number) => {
      const target = STEPS[toStep];
      if (target.href !== pathname) {
        router.push(target.href);
      }
      setStep(toStep);
    },
    [pathname, router]
  );

  const next = useCallback(() => {
    if (isLast) {
      setOpen(false);
      localStorage.setItem(STORAGE_KEY, "true");
      setDismissed(true);
    } else {
      navigate(step + 1);
    }
  }, [isLast, navigate, step]);

  const prev = useCallback(() => {
    if (!isFirst) navigate(step - 1);
  }, [isFirst, navigate, step]);

  const dismiss = useCallback(() => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }, []);

  const startTour = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setDismissed(false);
    setStep(0);
    setOpen(true);
    if (pathname !== "/") router.push("/");
  }, [pathname, router]);

  // keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, next, prev, dismiss]);

  return (
    <>
      {/* Trigger button — always visible */}
      <button
        onClick={startTour}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[#dc2626] bg-[#fee2e2] hover:bg-[#fecaca] border border-[#fecaca] transition-all"
        title="Take the guided tour"
      >
        <BookOpen size={14} />
        Tour
      </button>

      {/* Tour card */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#f8fafc] backdrop-blur-[2px] z-[90]"
            onClick={dismiss}
          />

          {/* Card */}
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] w-[480px] max-w-[calc(100vw-2rem)]">
            <div className="bg-[#ffffff] border border-[#e5e7eb] rounded-2xl shadow-2xl overflow-hidden">
              {/* Progress bar */}
              <div className="h-1 bg-[#ffffff]">
                <div
                  className="h-full bg-gradient-to-r from-[#dc2626] to-[#dc2626] transition-all duration-300"
                  style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                />
              </div>

              <div className="p-6">
                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-[0.15em] text-[#94a3b8] uppercase">
                      {current.tag}
                    </span>
                    {current.engine && (
                      <>
                        <span className="text-[#475569]/30">·</span>
                        <span className={`text-[10px] font-bold tracking-[0.15em] uppercase ${current.engineColor}`}>
                          {current.engine}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#94a3b8]">
                      {step + 1} / {STEPS.length}
                    </span>
                    <button
                      onClick={dismiss}
                      className="text-[#94a3b8] hover:text-[#0f172a] transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-headline font-bold text-[#0f172a] mb-3">
                  {step === 0 && (
                    <Sparkles size={18} className="inline mr-2 text-[#dc2626]" />
                  )}
                  {current.title}
                </h3>

                {/* Body */}
                <p className="text-sm text-[#475569] leading-relaxed mb-6">
                  {current.body}
                </p>

                {/* Navigation */}
                <div className="flex items-center justify-between">
                  <button
                    onClick={dismiss}
                    className="text-xs text-[#94a3b8] hover:text-[#475569] transition-colors"
                  >
                    Skip tour
                  </button>

                  <div className="flex items-center gap-2">
                    {!isFirst && (
                      <button
                        onClick={prev}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-[#475569] bg-[#ffffff] hover:bg-[#e5e7eb] transition-colors"
                      >
                        <ChevronLeft size={16} />
                        Back
                      </button>
                    )}
                    <button
                      onClick={next}
                      className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium bg-[#dc2626] text-[#ffffff] hover:bg-[#b91c1c] transition-colors"
                    >
                      {isLast ? "Done" : "Next"}
                      {!isLast && <ChevronRight size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Step dots */}
              <div className="flex items-center justify-center gap-1.5 pb-4">
                {STEPS.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(i)}
                    className={`rounded-full transition-all ${
                      i === step
                        ? "w-4 h-1.5 bg-[#dc2626]"
                        : i < step
                        ? "w-1.5 h-1.5 bg-[#fecaca]"
                        : "w-1.5 h-1.5 bg-[#e5e7eb]"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Keyboard hint */}
            <p className="text-center text-[10px] text-[#475569]/30 mt-2">
              ← → arrow keys to navigate · Esc to close
            </p>
          </div>
        </>
      )}
    </>
  );
}
