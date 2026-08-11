import { NextResponse } from "next/server";
import { checkClaim } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const { policyText, scenario } = await request.json();
    if (!policyText || !scenario || !scenario.trim()) {
      return NextResponse.json({ ok: false, error: "bad_input", message: "Missing policy or scenario." }, { status: 400 });
    }

    const result = await checkClaim(policyText, scenario.trim());
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err.message === "MISSING_API_KEY") {
      return NextResponse.json(
        { ok: false, error: "no_api_key", message: "Server is missing GROQ_API_KEY. Add it to .env.local (free key at console.groq.com/keys)." },
        { status: 500 }
      );
    }
    console.error("claim error:", err);
    return NextResponse.json(
      { ok: false, error: "server", message: "Something went wrong checking this scenario. Please try again.", detail: (err && err.message) || String(err) },
      { status: 500 }
    );
  }
}
