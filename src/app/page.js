"use client";

import { useState, useRef } from "react";
import DecoderView from "@/components/DecoderView";
import ClaimCheck from "@/components/ClaimCheck";

export default function Home() {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);

  async function decode(file) {
    setStatus("loading");
    setMessage("");
    setDetail("");
    setResult(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/decode", { method: "POST", body });
      const data = await res.json();
      if (!data.ok) {
        setStatus("error");
        setMessage(data.message || "Could not read this policy.");
        setDetail(data.detail || "");
        return;
      }
      setResult(data);
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (file) decode(file);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) decode(file);
  }

  async function trySample() {
    setStatus("loading");
    setMessage("");
    setDetail("");
    try {
      const res = await fetch("/sample-health-policy.pdf");
      const blob = await res.blob();
      const file = new File([blob], "sample-health-policy.pdf", { type: "application/pdf" });
      decode(file);
    } catch (e) {
      setStatus("error");
      setMessage("Could not load the sample policy.");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setMessage("");
    setDetail("");
  }

  const showResult = status === "done" && result;

  return (
    <div className="page">
      <nav className="nav">
        <div className="nav-inner">
          <button className="brand" onClick={reset}>
            <span className="logo">◎</span> PolicyLens
          </button>
          {showResult ? (
            <button className="btn btn-ghost btn-sm" onClick={reset}>↺ Analyze another policy</button>
          ) : (
            <span className="nav-tag">Free · cites every clause</span>
          )}
        </div>
      </nav>

      <main className="wrap">
        {!showResult && status !== "loading" && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="badge">Health insurance · plain English</span>
                <h1>Know what your health policy <span className="hl">actually covers</span> — before you claim.</h1>
                <p className="sub">
                  Upload your policy and get the exclusions, waiting periods and limits that trip people
                  up. Then ask about your exact situation — every answer cites the clause in <em>your</em>
                  {" "}document.
                </p>
                <ul className="trust">
                  <li>🔒 Processed in-session, never stored</li>
                  <li>◎ Every point cites a real clause</li>
                  <li>✦ Free to use</li>
                </ul>
              </div>

              <aside className="preview" aria-hidden="true">
                <div className="pv-head v-good"><span className="pv-ic">✓</span> Likely covered</div>
                <div className="pv-body">
                  <p className="pv-line">Inpatient hospitalisation &gt;24 hrs is covered
                    <span className="pv-cite">Section 2.1 · p.1</span>
                  </p>
                  <p className="pv-line pv-warn">30-day initial waiting period may apply
                    <span className="pv-cite">Section 3.1 · p.2</span>
                  </p>
                  <div className="pv-docs">
                    <span>Discharge summary</span><span>Final bill</span><span>Reports</span>
                  </div>
                </div>
              </aside>
            </section>

            <section
              className={`dropzone ${dragging ? "drag" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
            >
              <div className="dz-icon">⬆</div>
              <p className="dz-title">Drop your policy PDF here, or click to browse</p>
              <p className="dz-sub">PDF only · health insurance</p>
              <div className="dz-actions">
                <span className="btn btn-primary">Choose file</span>
                <button
                  className="btn btn-ghost"
                  onClick={(e) => { e.stopPropagation(); trySample(); }}
                >
                  Try a sample policy
                </button>
              </div>
              <input ref={fileRef} type="file" accept="application/pdf" onChange={onFile} hidden />
            </section>

            {status === "error" && (
              <div className="state state-error">
                <p>{message}</p>
                {detail && <code className="err-detail">{detail}</code>}
                <button className="btn btn-ghost btn-sm" onClick={reset}>Dismiss</button>
              </div>
            )}

            <section className="how">
              <div className="how-step"><span className="how-n">1</span><b>Upload</b><p>Your health policy PDF — stays in your session.</p></div>
              <div className="how-step"><span className="how-n">2</span><b>Understand</b><p>Coverage, exclusions & waiting periods in plain English.</p></div>
              <div className="how-step"><span className="how-n">3</span><b>Check a claim</b><p>Ask your scenario, get a cited verdict + document list.</p></div>
            </section>
          </>
        )}

        {status === "loading" && (
          <div className="state loading-state">
            <div className="spinner" />
            <p>Reading your policy…</p>
            <span className="muted small">Extracting clauses and grounding every point</span>
          </div>
        )}

        {showResult && (
          <>
            <DecoderView
              policyName={result.policyName}
              numPages={result.numPages}
              sections={result.sections}
            />
            <ClaimCheck policyText={result.policyText} />
          </>
        )}
      </main>

      <footer className="foot">
        <span>PolicyLens · MLP</span>
        <span>Guidance only — not legal or medical advice.</span>
      </footer>
    </div>
  );
}
