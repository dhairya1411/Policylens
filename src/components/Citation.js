"use client";

import { useState } from "react";

export default function Citation({ clause, page, quote }) {
  const [open, setOpen] = useState(false);
  if (!clause && !page) return null;

  return (
    <span className="citation">
      <button
        type="button"
        className={`citation-chip ${open ? "open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title="Show the exact clause"
      >
        <span className="cite-dot" />
        {clause || "clause"}{page ? ` · p.${page}` : ""}
      </button>
      {open && quote && <span className="citation-quote">&ldquo;{quote}&rdquo;</span>}
    </span>
  );
}
