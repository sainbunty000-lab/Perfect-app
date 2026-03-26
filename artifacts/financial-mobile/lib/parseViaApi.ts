/**
 * Sends documents to the API server for server-side text extraction + structured parsing.
 * Handles both web (blob: URLs) and native (file: URIs) correctly.
 */

import { Platform } from "react-native";
import { normalizeFields } from "./fieldMapper";

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
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv")) return "excel";
  if (
    lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") ||
    lower.endsWith(".webp") || lower.endsWith(".tiff") || (mimeType?.startsWith("image/") ?? false)
  ) return "image";
  return "text";
}

function getMimeType(name: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream") return mimeType;
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".tiff")) return "image/tiff";
  return "application/octet-stream";
}

/**
 * Appends the file to FormData correctly for both web and native platforms.
 *
 * - Web:    uri is a blob: URL → fetch it → get real Blob → append Blob
 * - Native: uri is a file:// path → use {uri,name,type} object (RN FormData trick)
 */
async function appendFileToForm(
  formData: FormData,
  uri: string,
  name: string,
  mimeType: string,
): Promise<void> {
  if (Platform.OS === "web") {
    // On web the URI is a blob: or data: URL — fetch the actual bytes
    const response = await fetch(uri);
    if (!response.ok) throw new Error("Could not read the selected file.");
    const blob = await response.blob();
    formData.append("file", blob, name);
  } else {
    // React Native native — the {uri,name,type} object is special FormData magic
    formData.append("file", { uri, name, type: mimeType } as unknown as Blob);
  }
}

/**
 * Parse a financial document and return structured fields + raw text.
 */
export async function parseFinancialDocument<T = Record<string, unknown>>(
  uri: string,
  name: string,
  mimeType: string | undefined,
  docType: DocType,
): Promise<FinancialParseResult<T>> {
  const resolvedMime = getMimeType(name, mimeType);
  const fmt          = detectLocalFormat(name, resolvedMime);
  const base         = getApiBase();

  const formData = new FormData();
  await appendFileToForm(formData, uri, name, resolvedMime);
  formData.append("docType", docType);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);
  let resp: Response;
  try {
    resp = await fetch(`${base}/api/parse-financial`, {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timeout);
    if (e?.name === "AbortError") throw new Error("Request timed out. Please try again.");
    throw e;
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).message ?? `Server error ${resp.status}`);
  }

  const data = await resp.json();
  const rawFields  = (data.fields ?? {}) as Record<string, unknown>;
  const normalized = normalizeFields(rawFields as Record<string, any>, docType);
  return {
    text:   data.text   ?? "",
    format: (data.format as ParseFormat) ?? fmt,
    fields: normalized as T,
  };
}

/** Raw text extraction — used when you just need the text, not structured fields */
export async function parseFileViaApi(uri: string, name: string, mimeType?: string): Promise<ParseResult> {
  const fmt = detectLocalFormat(name, mimeType);
  if (fmt === "text") {
    const response = await fetch(uri);
    const text = await response.text();
    return { text, format: "text" };
  }
  const resolvedMime = getMimeType(name, mimeType);
  const base = getApiBase();
  const formData = new FormData();
  await appendFileToForm(formData, uri, name, resolvedMime);

  const resp = await fetch(`${base}/api/parse-document`, { method: "POST", body: formData });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as any).message ?? "Parse failed");
  }
  const data = await resp.json();
  return { text: data.text ?? "", format: (data.format as ParseFormat) ?? fmt };
}

export const FORMAT_LABEL: Record<ParseFormat, string> = {
  pdf:     "PDF Document",
  excel:   "Excel / CSV",
  image:   "Scanned Image (OCR)",
  text:    "Text / CSV",
  unknown: "Unknown",
};
