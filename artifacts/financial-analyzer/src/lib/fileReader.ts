/**
 * Universal file reader — converts any uploaded document to plain text
 * Supports: PDF, Excel (.xlsx/.xls), Images (JPEG/PNG), TXT, CSV
 *
 * PDF  → pdfjs-dist (client-side, no server needed)
 * Excel → SheetJS (converts all sheets to CSV-style text)
 * Image → Tesseract.js OCR (WebAssembly, offline)
 * TXT/CSV → native File.text()
 */

// ─── PDF ─────────────────────────────────────────────────────────────────────
async function extractFromPDF(file: File): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");

  // Use the locally bundled worker — avoids CDN version mismatch issues
  if (!GlobalWorkerOptions.workerSrc) {
    GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).href;
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Reconstruct lines from text items
    // Items have x/y positions — group by approximate y coordinate
    const items = content.items as Array<{
      str: string;
      transform: number[];
      height: number;
    }>;

    const lineMap = new Map<number, string[]>();
    for (const item of items) {
      const y = Math.round(item.transform[5]); // y position
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y)!.push(item.str);
    }

    // Sort lines top-to-bottom (descending y in PDF coords = ascending in text)
    const sortedYs = [...lineMap.keys()].sort((a, b) => b - a);
    const pageText = sortedYs
      .map((y) => lineMap.get(y)!.join(" ").trim())
      .filter(Boolean)
      .join("\n");

    pages.push(pageText);
  }

  return pages.join("\n\n--- Page Break ---\n\n");
}

// ─── Excel ────────────────────────────────────────────────────────────────────
async function extractFromExcel(file: File): Promise<string> {
  const XLSX = await import("xlsx");
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Convert to CSV-style text — preserves column alignment
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv.trim()) {
      parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
    }
  }
  return parts.join("\n\n");
}

// ─── Image OCR ────────────────────────────────────────────────────────────────
async function extractFromImage(file: File): Promise<string> {
  const Tesseract = await import("tesseract.js");

  // createWorker varies slightly between tesseract.js v4 and v5
  const { createWorker } = Tesseract;
  const worker = await createWorker("eng", 1, {
    logger: () => {}, // suppress progress logs
  });

  try {
    const { data } = await worker.recognize(file);
    return data.text;
  } finally {
    await worker.terminate();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────
export type SupportedFormat =
  | "pdf"
  | "excel"
  | "image"
  | "text"
  | "unsupported";

export function detectFormat(file: File): SupportedFormat {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "excel";
  if (
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".webp") ||
    name.endsWith(".tiff") ||
    name.endsWith(".bmp")
  )
    return "image";
  if (
    name.endsWith(".txt") ||
    name.endsWith(".csv") ||
    name.endsWith(".tsv") ||
    name.endsWith(".text")
  )
    return "text";
  // Try by MIME type as fallback
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf") return "pdf";
  if (file.type.includes("spreadsheet") || file.type.includes("excel"))
    return "excel";
  return "text"; // attempt plain text as final fallback
}

/**
 * Extract plain text from any supported document.
 * Returns the extracted text string.
 * Throws on parsing failure.
 */
export async function extractTextFromFile(file: File): Promise<string> {
  const format = detectFormat(file);

  switch (format) {
    case "pdf":
      return extractFromPDF(file);
    case "excel":
      return extractFromExcel(file);
    case "image":
      return extractFromImage(file);
    case "text":
    default:
      return file.text();
  }
}

export const FORMAT_LABELS: Record<SupportedFormat, string> = {
  pdf: "PDF Document",
  excel: "Excel Spreadsheet",
  image: "Scanned Image (OCR)",
  text: "Text / CSV",
  unsupported: "Unsupported",
};

export const ACCEPTED_EXTENSIONS =
  ".pdf,.xlsx,.xls,.jpg,.jpeg,.png,.webp,.tiff,.bmp,.txt,.csv";
