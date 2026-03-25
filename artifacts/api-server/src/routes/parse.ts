import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { parseFinancialDocument, type DocType } from "../lib/financialParser";

const execFileAsync = promisify(execFile);
const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// ── Google Cloud Vision API ───────────────────────────────────────────────────

async function visionOcrImage(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");

  const base64 = buffer.toString("base64");
  const resp = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{
          image: { content: base64 },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        }],
      }),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Vision API error ${resp.status}: ${err}`);
  }

  const data = await resp.json() as any;
  return data?.responses?.[0]?.fullTextAnnotation?.text ?? "";
}

async function visionOcrPdf(buffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY not configured");

  const base64 = buffer.toString("base64");
  const allTexts: string[] = [];

  // Vision sync API processes up to 5 PDF pages per request.
  // Loop in 5-page chunks until the API returns fewer pages than requested.
  for (let startPage = 1; startPage <= 100; startPage += 5) {
    const pages = [0, 1, 2, 3, 4].map((k) => startPage + k);

    const resp = await fetch(
      `https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{
            inputConfig: { content: base64, mimeType: "application/pdf" },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
            pages,
          }],
        }),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Vision API error ${resp.status}: ${err}`);
    }

    const data = await resp.json() as any;
    const pageResponses: any[] = data?.responses?.[0]?.responses ?? [];
    if (pageResponses.length === 0) break;

    for (const pr of pageResponses) {
      const t = pr?.fullTextAnnotation?.text ?? "";
      if (t.trim()) allTexts.push(t);
    }

    // Fewer pages returned than requested → we've reached the end
    if (pageResponses.length < 5) break;
  }

  return allTexts.join("\n\n");
}

// ── Local pdftotext (text-based PDFs) ────────────────────────────────────────

async function localPdfToText(buffer: Buffer): Promise<string> {
  const tmpFile = join(tmpdir(), `parse-${randomBytes(8).toString("hex")}.pdf`);
  try {
    await writeFile(tmpFile, buffer);
    let stdout = "";
    try {
      const result = await execFileAsync("pdftotext", ["-layout", tmpFile, "-"], {
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout ?? "";
    } catch (err: any) {
      stdout = err?.stdout ?? "";
    }
    return stdout;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

// ── Main PDF extraction strategy ──────────────────────────────────────────────
// 1. Try pdftotext (fast, great for digital PDFs)
// 2. If result is thin (< 120 meaningful chars) → scanned PDF → use Vision API

async function extractPdfText(buffer: Buffer): Promise<string> {
  const localText = await localPdfToText(buffer);

  // If pdftotext extracted enough text, use it
  const meaningful = localText.replace(/\s+/g, " ").trim();
  if (meaningful.length >= 120) return localText;

  // Otherwise fall back to Google Cloud Vision (handles scanned / image PDFs)
  try {
    return await visionOcrPdf(buffer);
  } catch (visionErr) {
    // Vision failed — return whatever local extraction we got
    return localText;
  }
}

// ── Route ─────────────────────────────────────────────────────────────────────

router.post("/parse-document", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const { buffer, mimetype, originalname } = req.file;
  const filename = (originalname ?? "").toLowerCase();

  try {
    let text = "";
    let format = "text";

    const isPdf =
      filename.endsWith(".pdf") || mimetype === "application/pdf";
    const isExcel =
      filename.endsWith(".xlsx") ||
      filename.endsWith(".xls") ||
      mimetype.includes("spreadsheet") ||
      mimetype.includes("excel");
    const isImage =
      mimetype.startsWith("image/") ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".jpeg") ||
      filename.endsWith(".png") ||
      filename.endsWith(".webp") ||
      filename.endsWith(".tiff") ||
      filename.endsWith(".bmp");

    if (isPdf) {
      format = "pdf";
      text = await extractPdfText(buffer);

    } else if (isExcel) {
      format = "excel";
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        if (csv.trim()) parts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
      }
      text = parts.join("\n\n");

    } else if (isImage) {
      format = "image";
      // Always use Vision API for images — far more accurate than Tesseract
      try {
        text = await visionOcrImage(buffer, mimetype || "image/jpeg");
      } catch {
        // Fallback to local Tesseract if Vision fails
        try {
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng", 1, { logger: () => {} });
          const { data } = await worker.recognize(buffer);
          text = data.text ?? "";
          await worker.terminate();
        } catch {
          text = "";
        }
      }

    } else {
      format = "text";
      text = buffer.toString("utf-8");
    }

    res.json({ text, format });
  } catch (err) {
    req.log.error({ err }, "parse-document failed");
    res.status(500).json({ message: "Failed to parse document" });
  }
});

// ── /api/parse-financial ──────────────────────────────────────────────────────
// Accepts a file + docType, extracts text, then runs the structured parser.
// Returns { text, format, fields } — fields is fully structured financial data.

router.post("/parse-financial", upload.single("file"), async (req, res) => {
  if (!req.file) { res.status(400).json({ message: "No file uploaded" }); return; }

  const docType = (req.body?.docType ?? "") as DocType;
  const validTypes: DocType[] = ["balance_sheet", "profit_loss", "banking", "gstr", "itr"];
  if (!validTypes.includes(docType)) {
    res.status(400).json({ message: `Invalid docType. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const { buffer, mimetype, originalname } = req.file;
  const filename = (originalname ?? "").toLowerCase();

  try {
    let text = "";
    let format = "text";

    const isPdf   = filename.endsWith(".pdf") || mimetype === "application/pdf";
    const isExcel = filename.endsWith(".xlsx") || filename.endsWith(".xls") || mimetype.includes("spreadsheet") || mimetype.includes("excel");
    const isImage = mimetype.startsWith("image/") || /\.(jpg|jpeg|png|webp|tiff|bmp)$/.test(filename);

    if (isPdf) {
      format = "pdf";
      text = await extractPdfText(buffer);
    } else if (isExcel) {
      format = "excel";
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const sn of wb.SheetNames) {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false });
        if (csv.trim()) parts.push(`--- Sheet: ${sn} ---\n${csv}`);
      }
      text = parts.join("\n\n");
    } else if (isImage) {
      format = "image";
      try { text = await visionOcrImage(buffer, mimetype || "image/jpeg"); }
      catch {
        try {
          const { createWorker } = await import("tesseract.js");
          const worker = await createWorker("eng", 1, { logger: () => {} });
          const { data } = await worker.recognize(buffer);
          text = data.text ?? "";
          await worker.terminate();
        } catch { text = ""; }
      }
    } else {
      format = "text";
      text = buffer.toString("utf-8");
    }

    const fields = parseFinancialDocument(text, docType);
    res.json({ text, format, fields });

  } catch (err) {
    req.log.error({ err }, "parse-financial failed");
    res.status(500).json({ message: "Failed to parse financial document" });
  }
});

export default router;
