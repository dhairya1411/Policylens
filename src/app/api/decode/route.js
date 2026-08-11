import { NextResponse } from "next/server";
import { extractPolicyPdf } from "@/lib/pdf";
import { decodePolicy } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ ok: false, error: "no_file" }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf") {
      return NextResponse.json({ ok: false, error: "not_pdf" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extracted = await extractPolicyPdf(buffer);

    if (extracted.looksScanned) {
      return NextResponse.json({
        ok: false,
        error: "scanned",
        message:
          "This looks like a scanned copy with little readable text. Results would be unreliable — please upload a digital PDF of the policy.",
      });
    }

    const decoded = await decodePolicy(extracted.taggedText);

    if (!decoded.isHealthPolicy) {
      return NextResponse.json({
        ok: false,
        error: "not_health",
        message:
          "This doesn't look like a health insurance policy. PolicyLens currently supports health policies only.",
      });
    }

    return NextResponse.json({
      ok: true,
      policyName: decoded.policyName || "Your health policy",
      numPages: extracted.numPages,
      sections: decoded.sections,
      policyText: extracted.taggedText,
    });
  } catch (err) {
    if (err.message === "MISSING_API_KEY") {
      return NextResponse.json(
        { ok: false, error: "no_api_key", message: "Server is missing GROQ_API_KEY. Add it to .env.local (free key at console.groq.com/keys)." },
        { status: 500 }
      );
    }
    console.error("decode error:", err);
    return NextResponse.json(
      { ok: false, error: "server", message: "Something went wrong reading the policy. Please try again.", detail: (err && err.message) || String(err) },
      { status: 500 }
    );
  }
}
