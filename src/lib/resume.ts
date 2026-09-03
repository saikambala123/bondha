/**
 * Resume file → plain text extraction (PDF, DOCX, TXT/MD).
 */
export async function extractResumeText(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<{ text: string; pages: number }> {
  const lower = fileName.toLowerCase();
  const isPdf = mimeType === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx");

  if (isPdf) {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return { text: (result.text || "").trim(), pages: result.pages?.length ?? 0 };
    } finally {
      await parser.destroy();
    }
  }

  if (isDocx) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: (result.value || "").trim(), pages: 0 };
  }

  // Fallback: treat as plain text (txt / md / rtf-lite)
  const text = buffer.toString("utf8").replace(/\u0000/g, "").trim();
  if (!text) throw new Error("Could not extract text — unsupported or empty file");
  return { text, pages: 0 };
}
