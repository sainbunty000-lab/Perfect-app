import { Router, type IRouter } from "express";
import multer from "multer";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
});

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
      // pdf-parse is CJS — dynamic import works with esbuild bundle
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      text = result.text ?? "";
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
