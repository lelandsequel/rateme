// 30-day recap card. Renders a Recap object as a stacked summary panel.
// Empty arrays collapse — only sections with data render.

import type { Recap } from "@/lib/ai-recap";

interface Props {
  recap: Recap;
  title?: string;
}

export function RecapCard({ recap, title = "30-day recap" }: Props) {
  const sections: Array<{ heading: string; items: string[] }> = [
    { heading: "Top strengths", items: recap.topStrengths },
    { heading: "Top weaknesses", items: recap.topWeaknesses },
    { heading: "Risk flags", items: recap.riskFlags },
    { heading: "Suggested improvements", items: recap.suggestedImprovements },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="bg-[#ffffff] rounded-xl p-6 border border-[#e5e7eb] space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-bold">{title}</h2>
        <span className="text-xs text-[#94a3b8]">
          {recap.source === "openai" ? "Powered by AI" : "Deterministic summary"}
        </span>
      </div>

      <p className="text-[#0f172a]">{recap.performanceSummary}</p>

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <MetaRow label="Frequency" value={recap.frequency} />
        <MetaRow label="Engagement" value={recap.engagementConsistency} />
        <MetaRow label="Response timing" value={recap.responseTiming} />
      </div>

      {sections.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4 pt-2">
          {sections.map((s) => (
            <Section key={s.heading} heading={s.heading} items={s.items} />
          ))}
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#ffffff] rounded-lg p-3 border border-[#e5e7eb]">
      <div className="text-xs uppercase tracking-wider text-[#94a3b8]">{label}</div>
      <div className="mt-1 text-[#475569]">{value}</div>
    </div>
  );
}

function Section({ heading, items }: { heading: string; items: string[] }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[#94a3b8] mb-2">{heading}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-[#0f172a]">
            <span className="text-[#dc2626]">•</span> {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
