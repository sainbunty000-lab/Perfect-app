import { Router, type IRouter } from "express";
import multer from "multer";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
});

async function extractPdfText(buffer: Buffer): Promise<string> {
  const tmpFile = join(tmpdir(), `parse-${randomBytes(8).toString("hex")}.pdf`);
  try {
    await writeFile(tmpFile, buffer);
    // pdftotext can exit non-zero with warnings but still produce good output
    let stdout = "";
    try {
      const result = await execFileAsync("pdftotext", ["-layout", tmpFile, "-"], {
        maxBuffer: 10 * 1024 * 1024,
      });
      stdout = result.stdout ?? "";
    } catch (err: any) {
      // Even on error, stdout may contain extracted text
      stdout = err?.stdout ?? "";
    }
    return stdout;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

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
      try {
        const { createWorker } = await import("tesseract.js");
        const worker = await createWorker("eng", 1, { logger: () => {} });
        const { data } = await worker.recognize(buffer);
        text = data.text ?? "";
        await worker.terminate();
      } catch {
        text = "";
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

export default router;
