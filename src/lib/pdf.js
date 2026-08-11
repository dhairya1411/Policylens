// Server-side PDF text extraction with per-page text (needed for page citations).
// Uses pdf-parse's pagerender hook to capture each page separately.
import pdf from "pdf-parse/lib/pdf-parse.js";

export async function extractPolicyPdf(buffer) {
  const pages = [];

  function renderPage(pageData) {
    return pageData
      .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
      .then((textContent) => {
        let lastY = null;
        let text = "";
        for (const item of textContent.items) {
          const y = item.transform[5];
          if (lastY !== null && Math.abs(y - lastY) > 1) text += "\n";
          text += item.str;
          lastY = y;
        }
        pages.push(text.trim());
        return text;
      });
  }

  const data = await pdf(buffer, { pagerender: renderPage });

  const perPage = pages.map((text, i) => ({ page: i + 1, text }));
  const totalChars = perPage.reduce((n, p) => n + p.text.length, 0);

  // Build a page-tagged document the model can cite from.
  const taggedText = perPage
    .map((p) => `\n===== PAGE ${p.page} =====\n${p.text}`)
    .join("\n");

  return {
    numPages: data.numpages || perPage.length,
    pages: perPage,
    taggedText,
    // Heuristic: real PDFs have lots of extractable text; scanned/image PDFs have almost none.
    looksScanned: totalChars < 200,
  };
}
