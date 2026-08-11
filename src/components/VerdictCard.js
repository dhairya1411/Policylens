"use client";

import Citation from "./Citation";

const VERDICT_META = {
  "Likely covered": { cls: "v-good", icon: "✓", label: "Likely covered" },
  "Not covered": { cls: "v-bad", icon: "✕", label: "Not covered" },
  Unclear: { cls: "v-warn", icon: "?", label: "Unclear — confirm with insurer" },
};

export default function VerdictCard({ result }) {
  const meta = VERDICT_META[result.verdict] || VERDICT_META.Unclear;
  const reasoning = result.reasoning || [];
  const documents = result.documents || [];
  const risks = result.rejection_risks || [];

  return (
    <div className="verdict">
      <div className={`verdict-head ${meta.cls}`}>
        <span className="verdict-icon">{meta.icon}</span>
        <div>
          <div className="verdict-label">{meta.label}</div>
          {result.summary && <div className="verdict-summary">{result.summary}</div>}
        </div>
        {result.confidence && (
          <span className="confidence">confidence: {result.confidence}</span>
        )}
      </div>

      <div className="verdict-body">
        {reasoning.length > 0 && (
          <div className="vblock">
            <h4>Why</h4>
            <ul className="vlist">
              {reasoning.map((r, i) => (
                <li key={i}>
                  <span>{r.point}</span>
                  <Citation clause={r.clause} page={r.page} quote={r.quote} />
                </li>
              ))}
            </ul>
          </div>
        )}

        {documents.length > 0 && (
          <div className="vblock">
            <h4>Documents you&apos;ll need</h4>
            <ul className="doclist">
              {documents.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </div>
        )}

        {risks.length > 0 && (
          <div className="vblock">
            <h4>Top rejection risks</h4>
            <ul className="vlist risks">
              {risks.map((r, i) => (
                <li key={i}>
                  <span>{r.risk}</span>
                  <Citation clause={r.clause} page={r.page} quote={r.quote} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <p className="disclaimer">
        Guidance only — your insurer makes the final coverage decision. Not legal or medical advice.
      </p>
    </div>
  );
}
