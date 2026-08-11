// Free LLM provider: Groq (free tier, no credit card).
// Get a key at https://console.groq.com/keys
import Groq from "groq-sdk";

const MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

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

The user describes a real situation. Decide whether it is LIKELY covered under THIS policy, being
strictly exclusion-first. IMPORTANT CALIBRATION RULE: if the clauses do not decisively resolve the
scenario, or key facts are missing (e.g. policy age vs waiting period), you MUST return verdict
"Unclear" with confidence "low" - never guess "Likely covered".

Return JSON with this exact shape:
{
  "verdict": "Likely covered" | "Not covered" | "Unclear",
  "confidence": "high" | "medium" | "low",
  "summary": "one plain-language sentence",
  "reasoning": [{ "point": "...", "clause": "Section X.X", "page": N, "quote": "..." }],
  "documents": ["specific documents this claim needs, per the policy"],
  "rejection_risks": [{ "risk": "...", "clause": "Section X.X", "page": N, "quote": "..." }]
}
If confidence is "low" or nothing grounds the answer, force verdict = "Unclear".`;

  const user = `USER SCENARIO:\n${scenario}\n\nPOLICY TEXT (page-tagged):\n${taggedText}`;
  const out = extractJson(await complete(system, user));
  if (out.confidence === "low") out.verdict = "Unclear";
  return out;
}
