"use client";

import { useState } from "react";
import VerdictCard from "./VerdictCard";

const PRESETS = [
  "Planned surgery next month",
  "Hospitalised 2 nights for dengue",
  "Pre-existing diabetes treatment",
  "Cataract surgery",
];

export default function ClaimCheck({ policyText }) {
  const [scenario, setScenario] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  async function run(text) {
    const q = (text ?? scenario).trim();
    if (!q) return;
    setScenario(q);
    setStatus("loading");
    setMessage("");
    setResult(null);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyText, scenario: q }),
      });
      const data = await res.json();
      if (!data.ok) {
        setStatus("error");
        setMessage(data.message || "Could not check this scenario.");
        return;
      }
      setResult(data);
      setStatus("done");
    } catch (e) {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <section className="claim">
      <div className="claim-head">
        <h3>Check a claim</h3>
        <p className="muted">
          Describe your situation in plain words. You&apos;ll get a verdict, the documents you&apos;ll
          need, and the risks that could get a claim rejected — each citing your policy.
        </p>
      </div>

      <div className="claim-input">
        <textarea
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="e.g. My father, 62, was admitted for 3 nights for a heart procedure. Is it covered?"
          rows={3}
        />
        <div className="chips">
          {PRESETS.map((p) => (
            <button key={p} className="chip" onClick={() => run(p)} disabled={status === "loading"}>
              {p}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          onClick={() => run()}
          disabled={status === "loading" || !scenario.trim()}
        >
          {status === "loading" ? "Checking…" : "Check my claim"}
        </button>
      </div>

      {status === "loading" && (
        <div className="state"><div className="spinner" /><p>Reading the clauses that apply…</p></div>
      )}
      {status === "error" && <div className="state state-error"><p>{message}</p></div>}
      {status === "done" && result && <VerdictCard result={result} />}
    </section>
  );
}
