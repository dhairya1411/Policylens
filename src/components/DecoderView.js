"use client";

import Citation from "./Citation";

const CARDS = [
  { key: "covered", title: "What's covered", tone: "good", icon: "🛡️" },
  { key: "exclusions", title: "Key exclusions", tone: "bad", icon: "⛔" },
  { key: "waitingPeriods", title: "Waiting periods", tone: "warn", icon: "⏳" },
  { key: "limits", title: "Limits, sub-limits & co-pay", tone: "warn", icon: "₹" },
  { key: "thingsToKnow", title: "5 things to know", tone: "info", icon: "★" },
];

function Item({ item }) {
  return (
    <li className="decode-item">
      <span className="decode-point">{item.point}</span>
      <Citation clause={item.clause} page={item.page} quote={item.quote} />
    </li>
  );
}

export default function DecoderView({ policyName, numPages, sections }) {
  const s = sections || {};
  const excl = (s.exclusions || []).length;
  const wait = (s.waitingPeriods || []).length;

  return (
    <section className="decoder">
      <div className="decoder-head">
        <span className="pill-label">Policy summary</span>
        <h2>{policyName}</h2>
        <p className="muted">
          {numPages} pages · {excl} exclusions · {wait} waiting periods found ·
          {" "}tap any reference to see the exact clause
        </p>
      </div>

      <div className="card-grid">
        {CARDS.map((c) => {
          const items = s[c.key] || [];
          return (
            <div className={`card card-${c.tone}`} key={c.key}>
              <div className="card-top">
                <span className="card-icon">{c.icon}</span>
                <h3>{c.title}</h3>
                <span className="count">{items.length}</span>
              </div>
              {items.length === 0 ? (
                <p className="muted small">Nothing found for this in your policy.</p>
              ) : (
                <ul className="decode-list">
                  {items.map((it, i) => (
                    <Item item={it} key={i} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <p className="disclaimer">
        Guidance only — your insurer makes the final coverage decision. Not legal or medical advice.
      </p>
    </section>
  );
}
