/**
 * PolicyLens — automated eval runner
 *
 * Runs every scenario in eval/scenarios.json against the REAL running app
 * (POST /api/decode then POST /api/claim), scores each against the expected
 * verdict, and reports the scorecard.
 *
 * Why it calls the live API instead of importing the prompt: an eval must test
 * the shipped product, not a copy of it. If the prompt drifts, this catches it.
 *
 * Usage:
 *   1. npm run dev        (in another terminal)
 *   2. npm run eval
 *
 * Optional: BASE_URL=https://your-app.vercel.app npm run eval
 *
 * Exits with code 1 if any DANGEROUS error is found (said "Likely covered"
 * when the scenario is actually excluded) — this is the ship/no-ship gate.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const DELAY_MS = Number(process.env.EVAL_DELAY_MS || 1500); // stay under free-tier rate limits

// --smoke  -> run only the regression-critical subset (cheap: ~6 calls instead of 24)
// --ids=1,5 -> run specific scenario ids
const ARGS = process.argv.slice(2);
const SMOKE_IDS = [3, 5, 8, 16, 23, 24]; // one per known failure mode + the calibration case
const idsArg = ARGS.find((a) => a.startsWith("--ids="));
const SELECTED_IDS = ARGS.includes("--smoke")
  ? SMOKE_IDS
  : idsArg
  ? idsArg.slice(6).split(",").map((n) => Number(n.trim())).filter(Boolean)
  : null;

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureServer() {
  try {
    const res = await fetch(BASE_URL, { method: "GET" });
    if (!res.ok) throw new Error(`status ${res.status}`);
  } catch (e) {
    console.error(`${C.red}✖ Could not reach ${BASE_URL}${C.reset}`);
    console.error(`  Start the app first:  ${C.bold}npm run dev${C.reset}   (then re-run npm run eval)`);
    process.exit(1);
  }
}

async function decodeSamplePolicy() {
  const pdfPath = path.join(ROOT, "public", "sample-health-policy.pdf");
  const buf = await readFile(pdfPath);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), "sample-health-policy.pdf");

  const res = await fetch(`${BASE_URL}/api/decode`, { method: "POST", body: form });
  const data = await res.json();
  if (!data.ok) throw new Error(`decode failed: ${data.message || data.error} ${data.detail || ""}`);
  return data;
}

async function runScenario(policyText, scenario, attempt = 1) {
  const res = await fetch(`${BASE_URL}/api/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policyText, scenario }),
  });
  const data = await res.json();

  if (!data.ok) {
    const detail = `${data.message || data.error || ""} ${data.detail || ""}`;
    // Retry once on rate limit / transient failure
    const isRateLimit = /rate_limit_exceeded|tokens per day|TPD|429/i.test(detail);
    if (!isRateLimit && attempt < 3 && /timeout|ECONN|fetch failed/i.test(detail)) {
      await sleep(4000 * attempt);
      return runScenario(policyText, scenario, attempt + 1);
    }
    return { error: detail.trim(), rateLimited: isRateLimit };
  }
  return data;
}

function pad(s, n) {
  s = String(s ?? "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n);
}

async function main() {
  console.log(`\n${C.bold}PolicyLens — Claim-Readiness eval${C.reset}`);
  console.log(`${C.dim}target: ${BASE_URL}${C.reset}\n`);

  await ensureServer();

  const allScenarios = JSON.parse(await readFile(path.join(__dirname, "scenarios.json"), "utf8"));
  const scenarios = SELECTED_IDS
    ? allScenarios.filter((s) => SELECTED_IDS.includes(s.id))
    : allScenarios;

  if (SELECTED_IDS) {
    console.log(
      `${C.yellow}SUBSET RUN — scenarios ${SELECTED_IDS.join(", ")} (${scenarios.length} of ${allScenarios.length}).`
    );
    console.log(`Use this to check for regressions cheaply; it is NOT a full score.${C.reset}\n`);
  }

  process.stdout.write("Decoding sample policy… ");
  const decoded = await decodeSamplePolicy();
  console.log(`${C.green}ok${C.reset} (${decoded.numPages} pages)\n`);

  console.log(
    `${C.dim}${pad("ID", 4)}${pad("CATEGORY", 15)}${pad("EXPECTED", 15)}${pad("ACTUAL", 15)}RESULT${C.reset}`
  );
  console.log(`${C.dim}${"─".repeat(66)}${C.reset}`);

  const results = [];
  let aborted = null;
  for (const s of scenarios) {
    const out = await runScenario(decoded.policyText, s.scenario);
    if (out.rateLimited) {
      aborted = out.error;
      console.log(`\n${C.yellow}${C.bold}⚠ Rate limit hit at scenario #${s.id} — stopping.${C.reset}`);
      console.log(`${C.dim}${(out.error || "").slice(0, 220)}${C.reset}`);
      console.log(`${C.yellow}Scenarios #${s.id}–#${scenarios[scenarios.length - 1].id} were NOT RUN. This run is incomplete —`);
      console.log(`don't compare it to a full run. Wait for the quota to reset, then re-run.${C.reset}`);
      break;
    }
    const actual = out.error ? "ERROR" : out.verdict;
    const pass = actual === s.expected;
    const dangerous = s.expected === "Not covered" && actual === "Likely covered";

    results.push({
      ...s,
      actual,
      confidence: out.confidence || null,
      summary: out.summary || null,
      citedClauses: (out.reasoning || []).map((r) => r.clause).filter(Boolean),
      rejectionRisks: (out.rejection_risks || []).map((r) => r.risk),
      pass,
      dangerous,
      error: out.error || null,
    });

    const mark = actual === "ERROR"
      ? `${C.yellow}SKIP (api error)${C.reset}`
      : dangerous
      ? `${C.red}${C.bold}DANGEROUS${C.reset}`
      : pass
      ? `${C.green}PASS${C.reset}`
      : `${C.red}FAIL${C.reset}`;
    console.log(`${pad(s.id, 4)}${pad(s.category, 15)}${pad(s.expected, 15)}${pad(actual, 15)}${mark}`);

    await sleep(DELAY_MS);
  }

  // ---- scorecard ----
  const scored = results.filter((r) => r.actual !== "ERROR");
  const passed = results.filter((r) => r.pass).length;
  const dangerous = results.filter((r) => r.dangerous);
  const errors = results.filter((r) => r.actual === "ERROR");
  const rate = (n, d) => (d ? ((n / d) * 100).toFixed(1) + "%" : "—");

  console.log(`\n${C.bold}Scorecard${C.reset}`);
  console.log(`  Scenarios attempted ${results.length} of ${scenarios.length}`);
  if (aborted || results.length < scenarios.length) {
    console.log(`  ${C.yellow}INCOMPLETE RUN — not comparable to a full 24-scenario run${C.reset}`);
  }
  console.log(`  Passed              ${passed}  (${rate(passed, scored.length)})`);
  console.log(`  Failed              ${scored.length - passed}`);
  if (errors.length) console.log(`  ${C.yellow}API errors          ${errors.length}${C.reset}`);
  const dangerColor = dangerous.length ? C.red + C.bold : C.green;
  console.log(
    `  ${dangerColor}Dangerous errors    ${dangerous.length}  (${rate(dangerous.length, scored.length)})  target 0%${C.reset}`
  );

  // by category
  console.log(`\n${C.bold}By category${C.reset}`);
  const cats = [...new Set(results.map((r) => r.category))];
  for (const cat of cats) {
    const rows = results.filter((r) => r.category === cat);
    const p = rows.filter((r) => r.pass).length;
    console.log(`  ${pad(cat, 16)}${p}/${rows.length}`);
  }

  if (dangerous.length) {
    console.log(`\n${C.red}${C.bold}⚠ Dangerous errors — fix these before shipping${C.reset}`);
    for (const d of dangerous) {
      console.log(`  #${d.id} ${d.scenario}`);
      console.log(`     ${C.dim}should have caught: ${d.mustCatch} (${d.expectedClause})${C.reset}`);
    }
  }

  const failures = results.filter((r) => !r.pass && !r.dangerous && r.actual !== "ERROR");
  if (failures.length) {
    console.log(`\n${C.yellow}Other mismatches${C.reset}`);
    for (const f of failures) {
      console.log(`  #${f.id} expected ${f.expected} → got ${f.actual}  ${C.dim}${f.scenario}${C.reset}`);
    }
  }

  // ---- write artifacts ----
  const outDir = path.join(__dirname, "results");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  const payload = {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b (default)",
    subset: SELECTED_IDS ? SELECTED_IDS : null,
    complete: !SELECTED_IDS && !aborted && results.length === scenarios.length,
    abortedReason: aborted || null,
    totals: {
      scenarios: results.length,
      scored: scored.length,
      passed,
      failed: scored.length - passed,
      apiErrors: errors.length,
      dangerousErrors: dangerous.length,
      passRate: rate(passed, scored.length),
      dangerousErrorRate: rate(dangerous.length, scored.length),
    },
    results,
  };
  await writeFile(path.join(outDir, `eval-${stamp}.json`), JSON.stringify(payload, null, 2));

  const csv = [
    "id,category,scenario,expected,actual,pass,dangerous,confidence,cited_clauses,summary",
    ...results.map((r) =>
      [
        r.id,
        r.category,
        `"${(r.scenario || "").replace(/"/g, '""')}"`,
        r.expected,
        r.actual,
        r.pass ? "PASS" : "FAIL",
        r.dangerous ? "YES" : "NO",
        r.confidence || "",
        `"${(r.citedClauses || []).join("; ")}"`,
        `"${(r.summary || "").replace(/"/g, '""')}"`,
      ].join(",")
    ),
  ].join("\n");
  await writeFile(path.join(outDir, `eval-${stamp}.csv`), csv);
  // Only a full run updates latest.json, so the headline scorecard is never a partial one.
  if (!SELECTED_IDS) {
    await writeFile(path.join(outDir, "latest.json"), JSON.stringify(payload, null, 2));
  }

  console.log(`\n${C.dim}Saved: eval/results/eval-${stamp}.json  (+ .csv, latest.json)${C.reset}\n`);

  process.exit(dangerous.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n${C.red}Eval run failed:${C.reset}`, e.message);
  process.exit(1);
});
