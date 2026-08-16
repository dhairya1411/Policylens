"use client";

/**
 * Auto-playing product demo.
 *
 * Deliberately uses pre-recorded output (captured from a real run against the sample policy)
 * instead of live API calls: the demo must never fail in front of someone, and it must not
 * consume the free-tier quota. Every number and citation below is real.
 */

import { useEffect, useRef, useState } from "react";

const DECODER = [
  { key: "covered", icon: "🛡️", title: "What's covered", tone: "good", items: [
    { point: "In-patient hospitalisation over 24 hours, including room, ICU and surgeon fees", clause: "Section 2.1", page: 1 },
    { point: "Pre-hospitalisation expenses up to 30 days before admission", clause: "Section 2.3", page: 1 },
  ]},
  { key: "excl", icon: "⛔", title: "Key exclusions", tone: "bad", items: [
    { point: "Cosmetic surgery — unless it follows an accident, burn or cancer", clause: "Section 5.2", page: 3 },
    { point: "Admission purely for diagnostics with no active treatment", clause: "Section 5.1", page: 3 },
  ]},
  { key: "wait", icon: "⏳", title: "Waiting periods", tone: "warn", items: [
    { point: "30 days from commencement for all illnesses — accidents exempt", clause: "Section 3.1", page: 2 },
    { point: "36 months of continuous cover before pre-existing diseases are payable", clause: "Section 3.3", page: 2 },
  ]},
  { key: "limits", icon: "₹", title: "Limits & co-pay", tone: "warn", items: [
    { point: "Room rent capped at 1% of sum insured per day", clause: "Section 4.1", page: 2 },
    { point: "10% co-payment on every claim if the insured is over 60", clause: "Section 4.2", page: 2 },
  ]},
];

const SCENARIO = "My father was hospitalised for 2 nights with dengue. The policy started 15 days ago.";

const VERDICT = {
  label: "Not covered",
  tone: "bad",
  icon: "✕",
  summary: "The 30-day initial waiting period has not been completed, and dengue is an illness, not an accident.",
  reasoning: [
    { point: "Inpatient hospitalisation over 24 hours is normally covered", clause: "Section 2.1", page: 1 },
    { point: "But a 30-day initial waiting period applies to all illnesses", clause: "Section 3.1", page: 2 },
    { point: "Policy is 15 days old — 15 < 30, so the waiting period is not met", clause: "Section 3.1", page: 2 },
  ],
  docs: ["Discharge summary", "Final hospital bill", "Diagnostic reports", "Doctor's prescription"],
  risks: [{ risk: "Claim within the initial waiting period will be rejected", clause: "Section 3.1", page: 2 }],
};

const EVAL_ROWS = [
  { v: "v1", label: "Baseline prompt", pass: "79.2%", danger: "1 dangerous error", state: "bad",
    note: "Told a user medicines 75 days after discharge were covered. The policy caps it at 60." },
  { v: "v2", label: "First fix", pass: "—", danger: "1 dangerous error", state: "bad",
    note: "My fix backfired: a sub-limit was allowed to override an unmet waiting period." },
  { v: "v3", label: "Five sequential gates", pass: "91.7%", danger: "0 dangerous errors", state: "good",
    note: "Rule precedence fixed. Caught only because every change re-runs the same 24 scenarios." },
];

// [id, seconds]
const SCENES = [
  ["intro", 5],
  ["upload", 3.5],
  ["decoder", 9],
  ["ask", 4.5],
  ["verdict", 9],
  ["evals", 9],
  ["outro", 5],
];
const TOTAL = SCENES.reduce((n, s) => n + s[1], 0);

export default function Demo() {
  const [t, setT] = useState(0);          // elapsed seconds
  const [playing, setPlaying] = useState(true);
  const raf = useRef(null);
  const last = useRef(null);

  useEffect(() => {
    function tick(now) {
      if (last.current == null) last.current = now;
      const dt = (now - last.current) / 1000;
      last.current = now;
      if (playing) {
        setT((prev) => (prev + dt >= TOTAL ? TOTAL : prev + dt));
      }
      raf.current = requestAnimationFrame(tick);
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing]);

  // which scene are we in, and how far into it
  let acc = 0, sceneId = "intro", sceneT = 0, sceneLen = 1, sceneIdx = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const [id, len] = SCENES[i];
    if (t < acc + len || i === SCENES.length - 1) {
      sceneId = id; sceneT = t - acc; sceneLen = len; sceneIdx = i; break;
    }
    acc += len;
  }
  const done = t >= TOTAL;

  const restart = () => { setT(0); setPlaying(true); };
  const jump = (i) => {
    let s = 0;
    for (let k = 0; k < i; k++) s += SCENES[k][1];
    setT(s); setPlaying(true);
  };

  // typing effect for the scenario
  const typed = sceneId === "ask"
    ? SCENARIO.slice(0, Math.floor((sceneT / 2.6) * SCENARIO.length))
    : SCENARIO;

  return (
    <div className="demo-page">
      <div className="demo-shell">
        <div className="demo-topbar">
          <div className="demo-brand"><span className="logo">◎</span> PolicyLens</div>
          <span className="demo-badge">Auto-playing demo · no setup needed</span>
          <a className="demo-live" href="/">Open the real app →</a>
        </div>

        <div className="demo-stage">
          {/* 1 — problem */}
          {sceneId === "intro" && (
            <div className="scene center">
              <p className="kicker fade-1">The problem</p>
              <h1 className="fade-2">
                People find out what their health policy <em>doesn&apos;t</em> cover
                at the hospital counter.
              </h1>
              <p className="lede fade-3">
                The information was never hidden — it&apos;s in the 40-page PDF they already own.
                They just can&apos;t read it.
              </p>
              <p className="stamp fade-4">PolicyLens makes that document answer one question.</p>
            </div>
          )}

          {/* 2 — upload */}
          {sceneId === "upload" && (
            <div className="scene center">
              <div className="drop-mock">
                <div className="file-chip pop">
                  <span className="file-ic">PDF</span>
                  <div>
                    <div className="file-name">SecureHealth-policy.pdf</div>
                    <div className="file-meta">3 pages · processed in-session, never stored</div>
                  </div>
                </div>
                <div className="reading">
                  <span className="spin" />
                  Reading your policy — extracting clauses and page numbers…
                </div>
              </div>
            </div>
          )}

          {/* 3 — decoder */}
          {sceneId === "decoder" && (
            <div className="scene">
              <p className="kicker">Step 1 — the policy, in plain English</p>
              <div className="grid2">
                {DECODER.map((c, i) => (
                  <div
                    key={c.key}
                    className={`dcard t-${c.tone}`}
                    style={{ animationDelay: `${i * 0.5}s` }}
                  >
                    <div className="dhead">
                      <span className="dicon">{c.icon}</span>
                      <b>{c.title}</b>
                    </div>
                    {c.items.map((it, j) => (
                      <div className="dline" key={j}>
                        <span>{it.point}</span>
                        <span className="cite">{it.clause} · p.{it.page}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
              <p className="foot-note">
                Every line carries the clause and page it came from. No citation → the line is never shown.
              </p>
            </div>
          )}

          {/* 4 — ask */}
          {sceneId === "ask" && (
            <div className="scene center">
              <p className="kicker">Step 2 — ask about a real situation</p>
              <div className="ask-box">
                <span className="ask-text">{typed}<span className="caret" /></span>
              </div>
              <div className="chips">
                <span>Planned surgery</span><span>Pre-existing condition</span><span>Cataract</span>
              </div>
            </div>
          )}

          {/* 5 — verdict */}
          {sceneId === "verdict" && (
            <div className="scene">
              <div className="verdict pop">
                <div className={`vhead v-${VERDICT.tone}`}>
                  <span className="vic">{VERDICT.icon}</span>
                  <div>
                    <div className="vlabel">{VERDICT.label}</div>
                    <div className="vsum">{VERDICT.summary}</div>
                  </div>
                  <span className="vconf">confidence: high</span>
                </div>
                <div className="vbody">
                  <div className="vcol">
                    <h4>Why</h4>
                    {VERDICT.reasoning.map((r, i) => (
                      <div className="vline" key={i} style={{ animationDelay: `${0.5 + i * 0.7}s` }}>
                        <span>{r.point}</span>
                        <span className="cite">{r.clause} · p.{r.page}</span>
                      </div>
                    ))}
                  </div>
                  <div className="vcol">
                    <h4>Documents you&apos;ll need</h4>
                    {VERDICT.docs.map((d, i) => (
                      <div className="vdoc" key={i} style={{ animationDelay: `${1.4 + i * 0.35}s` }}>▢ {d}</div>
                    ))}
                    <h4 style={{ marginTop: 16 }}>Rejection risk</h4>
                    {VERDICT.risks.map((r, i) => (
                      <div className="vrisk" key={i} style={{ animationDelay: "2.6s" }}>
                        ⚠ {r.risk} <span className="cite">{r.clause} · p.{r.page}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6 — evals */}
          {sceneId === "evals" && (
            <div className="scene">
              <p className="kicker">The part that isn&apos;t the demo</p>
              <h2 className="ehead">
                Saying &ldquo;covered&rdquo; when it&apos;s excluded sends someone to file a claim that gets
                rejected. So that became the metric.
              </h2>
              <div className="etable">
                {EVAL_ROWS.map((r, i) => (
                  <div className={`erow ${r.state}`} key={r.v} style={{ animationDelay: `${0.6 + i * 1.5}s` }}>
                    <span className="ev">{r.v}</span>
                    <span className="elabel">{r.label}</span>
                    <span className="epass">{r.pass}</span>
                    <span className="edanger">{r.danger}</span>
                    <span className="enote">{r.note}</span>
                  </div>
                ))}
              </div>
              <p className="foot-note">
                24 clause-grounded scenarios, re-run on every prompt change. The suite fails the build
                if a single dangerous error appears.
              </p>
            </div>
          )}

          {/* 7 — outro */}
          {sceneId === "outro" && (
            <div className="scene center">
              <p className="kicker fade-1">PolicyLens</p>
              <h1 className="fade-2">Built the product. Then built the thing that proves it works.</h1>
              <div className="ostats fade-3">
                <div><b>24</b><span>eval scenarios</span></div>
                <div><b>0</b><span>dangerous errors</span></div>
                <div><b>91.7%</b><span>pass rate</span></div>
                <div><b>100%</b><span>answers cited</span></div>
              </div>
              <div className="obtns fade-4">
                <a className="obtn primary" href="/">Try it yourself</a>
                <a className="obtn" href="https://github.com/dhairya1411/Policylens" target="_blank" rel="noopener">See the eval suite</a>
              </div>
            </div>
          )}
        </div>

        {/* controls */}
        <div className="demo-controls">
          <button className="ctl" onClick={() => (done ? restart() : setPlaying((p) => !p))}>
            {done ? "↻ Replay" : playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          <div className="track">
            {SCENES.map(([id, len], i) => (
              <button
                key={id}
                className={`seg ${i === sceneIdx ? "active" : ""} ${i < sceneIdx ? "past" : ""}`}
                style={{ flex: len }}
                onClick={() => jump(i)}
                title={id}
              >
                <span
                  className="fill"
                  style={{ width: i < sceneIdx ? "100%" : i === sceneIdx ? `${(sceneT / sceneLen) * 100}%` : "0%" }}
                />
              </button>
            ))}
          </div>
          <span className="clock">
            {String(Math.floor(t)).padStart(2, "0")}s / {Math.round(TOTAL)}s
          </span>
        </div>
      </div>
    </div>
  );
}
