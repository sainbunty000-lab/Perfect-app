/**
 * Sends documents to the API server for server-side text extraction + structured parsing.
 * The /api/parse-financial endpoint returns fully structured financial fields
 * so the mobile app never has to do regex work itself — 100% server-side accuracy.
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

export type DocType = "balance_sheet" | "profit_loss" | "banking" | "gstr" | "itr";

export interface FinancialParseResult<T = Record<string, unknown>> extends ParseResult {
  fields: T;
}

function detectLocalFormat(name: string, mimeType?: string): ParseFormat {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType === "application/pdf") return "pdf";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) return "excel";
  if (
    lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") ||
    lower.endsWith(".webp") || lower.endsWith(".tiff") || (mimeType?.startsWith("image/") ?? false)
  ) return "image";
  return "text";
}

function getMimeType(fmt: ParseFormat): string {
  if (fmt === "pdf") return "application/pdf";
  if (fmt === "excel") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "image/jpeg";
}

/** Raw text extraction — used when you just need the text, not structured fields */
export async function parseFileViaApi(uri: string, name: string, mimeType?: string): Promise<ParseResult> {
  const fmt = detectLocalFormat(name, mimeType);
  if (fmt === "text") {
    const response = await fetch(uri);
    const text = await response.text();
    return { text, format: "text" };
  }
  const base = getApiBase();
  const formData = new FormData();
  formData.append("file", { uri, name, type: mimeType ?? getMimeType(fmt) } as unknown as Blob);
  const resp = await fetch(`${base}/api/parse-document`, { method: "POST", body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Parse failed");
  }
  const data = await resp.json();
  return { text: data.text ?? "", format: (data.format as ParseFormat) ?? fmt };
}

/**
 * Parse a financial document and return structured fields + raw text.
 * The server runs the full position-aware parser — same quality as the web app.
 *
 * @param uri     Local file URI from DocumentPicker
 * @param name    File name (used for format detection)
 * @param mimeType  MIME type (optional)
 * @param docType   What kind of document: balance_sheet | profit_loss | banking | gstr | itr
 */
export async function parseFinancialDocument<T = Record<string, unknown>>(
  uri: string,
  name: string,
  mimeType: string | undefined,
  docType: DocType,
): Promise<FinancialParseResult<T>> {
  const fmt = detectLocalFormat(name, mimeType);

  // Plain text / CSV — send to server for structured parsing too (banking CSV)
  const base = getApiBase();
  const formData = new FormData();
  formData.append("file", { uri, name, type: mimeType ?? getMimeType(fmt) } as unknown as Blob);
  formData.append("docType", docType);

  const resp = await fetch(`${base}/api/parse-financial`, { method: "POST", body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Financial parse failed");
  }

  const data = await resp.json();
  return {
    text:   data.text ?? "",
    format: (data.format as ParseFormat) ?? fmt,
    fields: (data.fields ?? {}) as T,
  };
}

export const FORMAT_LABEL: Record<ParseFormat, string> = {
  pdf:     "PDF Document",
  excel:   "Excel Spreadsheet",
  image:   "Scanned Image (OCR)",
  text:    "Text / CSV",
  unknown: "Unknown",
};
