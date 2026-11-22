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
  if (start === -1) throw new Error("NO_JSON");
  // Take the FIRST complete JSON object. Some models append a second object or trailing
  // text, which made a naive first-"{"-to-last-"}" slice fail to parse.
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return JSON.parse(raw.slice(start, i + 1));
  }
  throw new Error("NO_JSON");
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

DECISION PROCEDURE - work through these gates IN ORDER. A later gate can never overturn an
earlier gate's rejection.

GATE 1 - COVERING CLAUSE: find the clause that would cover this situation. If nothing covers it,
the verdict is "Not covered".

GATE 2 - WAITING PERIODS (policy age vs required wait):
2a. Identify which waiting period applies to THIS condition: initial wait, specific-illness wait,
    pre-existing-disease wait, or maternity wait.
2b. CHECK FOR AN EXCEPTION FIRST. Waiting periods have carve-outs - for example an initial waiting
    period typically does not apply to hospitalisation caused by an ACCIDENT. If the policy states an
    exception and the scenario matches it, that waiting period does NOT bar the claim; move on.
    Example: "broke a leg in an accident, policy 10 days old" -> initial wait excludes accidents ->
    the wait does not apply -> continue to Gate 3.
2c. If no exception applies, COMPARE THE POLICY AGE AGAINST THE REQUIRED WAIT and decide:
    Example: "cataract, policy 18 months old" vs "24-month specific-illness wait" -> 18 < 24 -> NOT COVERED.
    Example: "delivery, policy 12 months old" vs "maternity after 24 months" -> 12 < 24 -> NOT COVERED.
    If policy age >= required wait, the wait is satisfied; continue.
    If the scenario never states the policy age and a condition-specific wait (specific illness,
    pre-existing disease or maternity) could apply -> "Unclear".
2d. PRE-EXISTING DISEASE: a condition the person already had when the policy started is pre-existing.
    Chronic, ongoing conditions (diabetes, hypertension, thyroid, asthma, heart disease...) are under
    continuous treatment or medical advice, so treatment/advice WAS recommended within any look-back
    window before the policy - they ARE pre-existing even if first diagnosed longer ago than the
    look-back period. Never use the look-back period to argue an ongoing condition is not pre-existing.
    Example: "diabetic for 5 years, policy 12 months old, 36-month PED wait" -> diabetes pre-dates the
    policy -> pre-existing -> 12 < 36 -> NOT COVERED.
    Complications of a pre-existing condition fall under the same pre-existing wait.
2e. GENERIC INITIAL WAIT: if the ONLY wait that could apply is the general initial waiting period
    (e.g. 30 days for all illnesses) and the scenario does not mention the policy age, assume it has
    passed - do NOT return "Unclear" for this alone. Continue to Gate 3 and list the initial wait in
    rejection_risks. (If the scenario DOES state a policy age, compare it as in 2c.)
2f. USE ONLY THE FACTS GIVEN - DO NOT INVENT HYPOTHETICALS. Apply the pre-existing-disease wait only
    if the scenario says or clearly implies the condition existed before the policy started (e.g.
    "diabetic for 5 years", "had this since before buying the policy"). Apply a specific-illness wait
    only if the scenario names an illness on the policy's list. If the scenario gives no such fact,
    do NOT speculate that the condition "might be pre-existing" - not in the verdict, the reasoning
    or rejection_risks. Judge the claim on the facts stated.
    Example: "inpatient Ayurvedic treatment at a recognised hospital" -> AYUSH clause covers it, no
    pre-existing fact stated, no listed illness -> "Likely covered".

GATE 3 - TIME WINDOWS ON EXPENSES: pre-hospitalisation and post-hospitalisation windows.
Compare the stated duration against the policy's number and decide.
    Example: "medicines 75 days after discharge" vs "up to 60 days after discharge" -> 75 > 60 -> NOT COVERED.
    Example: "tests 20 days before admission" vs "up to 30 days before" -> 20 <= 30 -> within window.
Never defer a comparison when you have both numbers.

GATE 4 - EXCLUSIONS: check the named exclusions AND their stated exceptions (cosmetic surgery is
excluded but not after a burn; dental is excluded but not when an accident requires hospitalisation).

GATE 5 - LIMITS (only reached if Gates 1-4 all passed): sub-limits, room-rent caps, co-payment,
proportionate deduction.
CRITICAL: a limit, cap, sub-limit, co-pay or proportionate deduction does NOT make a claim "Not covered" -
the claim is covered and only the amount paid is reduced. Verdict stays "Likely covered" and the cap goes
into rejection_risks.
EQUALLY CRITICAL: this rule applies ONLY to claims that already passed Gates 2, 3 and 4. Never use the
existence of a sub-limit to argue that a claim blocked by a waiting period, a time window or an exclusion
is somehow covered.

VERDICT RULES:
- "Not covered": no covering clause, OR a waiting period fails at Gate 2, OR a time window fails at
  Gate 3, OR an exclusion applies at Gate 4.
- "Likely covered": a covering clause applies and Gates 2-4 all passed. Caps and co-pays still mean
  "Likely covered".
- SAFETY ASYMMETRY: wrongly saying "Likely covered" sends someone to file a claim that gets rejected;
  wrongly saying "Not covered" costs them a phone call. If you suspect a waiting period or exclusion
  may block the claim, the verdict must NOT be "Likely covered".
- "Unclear": ONLY when a fact you genuinely need is missing (e.g. a waiting period could apply but the
  policy age was never stated). Do NOT return "Unclear" over details that would not change the outcome.

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
  // Safety guardrail: a "Likely covered" verdict must not carry a pre-existing-disease or
  // condition-specific waiting-period risk the model itself flagged. Downgrade to "Unclear".
  if (out.verdict === "Likely covered") {
    const risks = (out.rejection_risks || []).map((r) => (typeof r === "string" ? r : r?.risk || "")).join(" ");
    const wait = "(pre-?existing|specific[- ]illness|maternity)";
    const hedge = "\\b(could|may|might|if|unless|possibly)\\b";
    const flagged = new RegExp(`${wait}[^.]*${hedge}|${hedge}[^.]*${wait}`, "i");
    if (flagged.test(risks)) {
      out.verdict = "Unclear";
      out.confidence = "low";
    }
  }
  return out;
}
