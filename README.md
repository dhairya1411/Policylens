# PolicyLens

Upload a **health insurance policy PDF** → get a plain-language breakdown (what's covered, exclusions,
waiting periods, sub-limits/co-pay, "5 things to know"), with **every point citing the exact clause**
from your own document. A Claim-Readiness Check (M2) tells you whether a real situation is likely
covered, what documents you'll need, and the top rejection risks.

Built with Next.js + Groq (free tier, no credit card). No hand-written product logic beyond prompts and glue.
**No paid services** — the LLM runs on Groq's free tier (no credit card required).

## Setup

```bash
npm install
cp .env.example .env.local     # then add your free key
npm run dev                    # http://localhost:3000
```

Add your **free** Groq API key to `.env.local`:

```
GROQ_API_KEY=...
GROQ_MODEL=llama-3.3-70b-versatile   # optional override
```

Get a free key (no credit card) at https://console.groq.com/keys — sign in with Google,
click "Create API key", paste it in. Free tier limits (generous free limits) are plenty for this app.

## Try it instantly

Click **"Try a sample policy"** on the landing page — a synthetic health policy
(`public/sample-health-policy.pdf`) is bundled so you can demo with zero setup.

## How it works

1. `src/lib/pdf.js` — extracts per-page text from the PDF (page numbers power citations).
2. `src/lib/llm.js` — sends the page-tagged text to Groq with strict rules:
   **no citation → no claim**, use only the policy text, be exclusion-first.
3. `src/app/api/decode/route.js` — orchestrates extract → validate (is it a health policy? scanned?) → decode.
4. UI renders structured cards; tap any clause reference to reveal the exact quote.

## Guardrails baked in

- Every statement must cite a clause + page + verbatim quote, or it's dropped.
- Rejects non-health and scanned documents with a clear message.
- Persistent "guidance only, not legal/medical advice" disclaimer.
- Policies are processed in-session and never stored.

## Evals (quality gate)

The product's riskiest failure is telling someone a claim is **covered** when the policy actually
excludes it — they'd file and get rejected. So quality is measured, not eyeballed.

`eval/PolicyLens_Eval_Set.xlsx` holds 24 scenarios with known-correct answers, every one grounded in
a real clause of the bundled sample policy (waiting periods, PED, sub-limits, co-pay, exclusions and
their exceptions, plus one deliberately ambiguous case that must return "Unclear").

Run them automatically against the live app:

```bash
npm run dev          # terminal 1
npm run eval         # terminal 2
```

The runner calls the real `/api/decode` and `/api/claim` endpoints (not a copy of the prompt, so
prompt drift is caught), prints a scorecard, and writes `eval/results/eval-<timestamp>.json` + `.csv`.

**North-star metric: dangerous-error rate — expected "Not covered" but got "Likely covered". Target 0%.**
The script exits with code 1 if any dangerous error is found, so it doubles as a ship/no-ship gate.

Point it at a deployed build with `BASE_URL=https://your-app.vercel.app npm run eval`.

## Roadmap

- **M1 (done):** Decoder + citations.
- **M2:** Claim-Readiness Check (scenario → verdict + documents + rejection risks).
- **M3 (done):** Eval set + automated eval runner.
- **M4:** Deploy + real-user feedback capture.
