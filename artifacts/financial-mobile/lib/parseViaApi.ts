/**
 * Sends a document file to the API server for server-side text extraction.
 * Supports PDF, Excel (.xlsx/.xls), Images (JPEG/PNG) — all converted to text.
 * TXT/CSV are read locally without hitting the server.
 */

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "http://localhost:3000";
}

export type ParseFormat = "pdf" | "excel" | "image" | "text" | "unknown";

export interface ParseResult {
  text: string;
  format: ParseFormat;
}

function detectLocalFormat(name: string, mimeType?: string): ParseFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".png") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".tiff") ||
    (mimeType?.startsWith("image/") ?? false)
  )
    return "image";
  return "text";
}

/**
 * Upload a file to the parse endpoint and get back extracted text.
 * For TXT/CSV, reads locally.
 * For PDF/Excel/Image, uploads to /api/parse-document.
 */
export async function parseFileViaApi(
  uri: string,
  name: string,
  mimeType?: string
): Promise<ParseResult> {
  const fmt = detectLocalFormat(name, mimeType);

  // TXT / CSV — read locally, no network needed
  if (fmt === "text") {
    const response = await fetch(uri);
    const text = await response.text();
    return { text, format: "text" };
  }

  // PDF / Excel / Image — send to API server
  const base = getApiBase();
  const formData = new FormData();

  // React Native fetch supports uri blobs
  const fileBlob = {
    uri,
    name,
    type: mimeType ?? getMimeType(fmt),
  } as unknown as Blob;

  formData.append("file", fileBlob);

  const resp = await fetch(`${base}/api/parse-document`, {
    method: "POST",
    body: formData,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Parse failed");
  }

  const data = await resp.json();
  return {
    text: data.text ?? "",
    format: (data.format as ParseFormat) ?? fmt,
  };
}

function getMimeType(fmt: ParseFormat): string {
  if (fmt === "pdf") return "application/pdf";
  if (fmt === "excel")
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "image/jpeg";
}

export const FORMAT_LABEL: Record<ParseFormat, string> = {
  pdf: "PDF Document",
  excel: "Excel Spreadsheet",
  image: "Scanned Image (OCR)",
  text: "Text / CSV",
  unknown: "Unknown",
};
