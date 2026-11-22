// Free LLM provider: Groq (free tier, no credit card).
// Get a key at https://console.groq.com/keys
import Groq from "groq-sdk";

const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

function client() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("MISSING_API_KEY");
  return new Groq({ apiKey });
}

async function complete(system, user) {
  const res = await client().chat.completions.create({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return res.choices?.[0]?.message?.content || "";
}

const HARD_RULES = `
NON-NEGOTIABLE RULES:
1. NO CITATION -> NO CLAIM. Every statement must be grounded in a specific clause from the policy text.
   For each point include the section label (e.g. "Section 3.1"), the page number, and a short verbatim
   "quote" from the policy. If you cannot ground a statement, do NOT include it.
2. Use ONLY the policy text provided. Never use outside knowledge about "typical" policies.
3. Be exclusion-first: actively check exclusions, waiting periods, sub-limits and co-pay before deciding.
   These cause claim rejections, so surface them prominently.
4. Plain language a non-expert can understand.
5. Guidance only - not a coverage guarantee, not legal or medical advice.
Always respond with a single valid JSON object and nothing else.
`;

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("NO_JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function decodePolicy(taggedText) {
  const system = `You are PolicyLens, an assistant that explains health insurance policies.
${HARD_RULES}

First decide whether the document is actually a health insurance policy. If it is clearly NOT
(e.g. a motor/life/travel policy, an invoice, or unrelated), return {"isHealthPolicy": false}.

Otherwise return JSON with this exact shape:
{
  "isHealthPolicy": true,
  "policyName": "string (best guess of the policy/product name)",
  "sections": {
    "covered":        [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }],
    "exclusions":     [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }],
    "waitingPeriods": [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }],
    "limits":         [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }],
    "thingsToKnow":   [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }]
  }
}
"limits" covers sub-limits, room-rent caps and co-payment. "thingsToKnow" = the 5 most important
things this policyholder should remember.`;

  const user = `POLICY TEXT (page-tagged):\n${taggedText}`;
  return extractJson(await complete(system, user));
}

export async function checkClaim(taggedText, scenario) {
  const system = `You are PolicyLens' Claim-Readiness Checker for health insurance.
${HARD_RULES}

DECISION PROCEDURE - follow these steps in order before answering:

STEP 1 - COVERING CLAUSE: find the clause that would cover this situation.

STEP 2 - TIME WINDOWS (do the arithmetic): list every time window that could apply - initial
waiting period, specific-illness wait, pre-existing-disease wait, maternity wait, pre-hospitalisation
window, post-hospitalisation window. If the scenario states a duration or policy age AND the policy
states a number, you MUST COMPARE THE TWO NUMBERS and decide.
  Example: "75 days after discharge" vs policy "covered up to 60 days after discharge" -> 75 > 60 -> NOT COVERED.
  Example: "tests 20 days before admission" vs policy "up to 30 days before" -> 20 <= 30 -> within the window.
  Example: "delivery, policy 12 months old" vs "maternity after 24 months" -> 12 < 24 -> NOT COVERED.
Never defer a comparison you have the numbers for. Doing the arithmetic is mandatory.

STEP 3 - EXCLUSIONS: check the named exclusions AND their stated exceptions (e.g. cosmetic surgery is
excluded but not when it follows a burn; dental is excluded but not when an accident requires hospitalisation).

STEP 4 - LIMITS: check sub-limits, room-rent caps, co-payment and proportionate deduction.
CRITICAL: a limit, cap, sub-limit, co-pay or proportionate deduction does NOT make a claim "Not covered".
The claim is still covered - only the amount paid is reduced. In that case the verdict stays
"Likely covered" and you put the cap in rejection_risks so the user knows their payout is limited.

VERDICT RULES:
- "Not covered": a stated exclusion applies, OR a time-window comparison in Step 2 fails.
- "Likely covered": a covering clause applies and no exclusion or failed time window. Caps and co-pays
  still mean "Likely covered".
- "Unclear": ONLY when a fact you genuinely need is absent from the scenario (e.g. a waiting period could
  apply but the policy age was never stated). Do NOT return "Unclear" over details that would not change
  the outcome (e.g. the patient's age when no age-based rule is in play, or normal vs caesarean when both
  are past the same waiting period).

Return JSON with this exact shape:
{
  "verdict": "Likely covered" | "Not covered" | "Unclear",
  "confidence": "high" | "medium" | "low",
  "summary": "one plain-language sentence",
  "reasoning": [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }],
  "documents": ["specific documents this claim needs, per the policy"],
  "rejection_risks": [{ "risk": "...", "clause": "Section X.X", "page": N, "quote": "..." }]
}
Set confidence "low" only if you truly cannot decide from the policy text.`;

  const user = `USER SCENARIO:\n${scenario}\n\nPOLICY TEXT (page-tagged):\n${taggedText}`;
  const out = extractJson(await complete(system, user));
  // Server-side calibration guardrail: never present a low-confidence guess as a decision.
  if (out.confidence === "low") out.verdict = "Unclear";
  return out;
}
