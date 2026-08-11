// Server-side PDF text extraction with per-page text (page numbers power the citations).
//
// Uses `unpdf` rather than `pdf-parse`: pdf-parse bundles a 2018-era pdf.js build that
// assumes a normal Node filesystem and fails inside Vercel's serverless runtime with
// "bad XRef entry" even on a byte-perfect PDF. unpdf ships a serverless-safe pdf.js build.
import { extractText, getDocumentProxy } from "unpdf";

export async function extractPolicyPdf(buffer) {
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });

  const pageTexts = Array.isArray(text) ? text : [text];
  const perPage = pageTexts.map((t, i) => ({ page: i + 1, text: (t || "").trim() }));
  const totalChars = perPage.reduce((n, p) => n + p.text.length, 0);

  // Build a page-tagged document the model can cite from.
  const taggedText = perPage
    .map((p) => `\n===== PAGE ${p.page} =====\n${p.text}`)
    .join("\n");

  return {
    numPages: totalPages || perPage.length,
    pages: perPage,
    taggedText,
    // Heuristic: digital PDFs have plenty of extractable text; scanned ones have almost none.
    looksScanned: totalChars < 200,
  };
}
