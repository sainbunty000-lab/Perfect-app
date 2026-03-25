import { Router, type IRouter } from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const geminiBaseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
const geminiApiKey  = process.env.AI_INTEGRATIONS_GEMINI_API_KEY ?? "placeholder";

const ai = new GoogleGenAI({
  apiKey: geminiApiKey,
  ...(geminiBaseUrl ? { httpOptions: { apiVersion: "", baseUrl: geminiBaseUrl } } : {}),
});

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

    if (pageResponses.length < 5) break;
  }

  return allTexts.join("\n\n");
}

// ── Extract raw text from any file format ─────────────────────────────────────
// PDFs → always Google Vision (handles both digital and scanned)
// Images → Google Vision
// Excel/CSV → XLSX library (cell-accurate)

async function extractRawText(
  buffer: Buffer,
  mimetype: string,
  filename: string,
): Promise<{ text: string; format: string }> {
  const fn = filename.toLowerCase();

  const isPdf   = fn.endsWith(".pdf") || mimetype === "application/pdf";
  const isExcel = fn.endsWith(".xlsx") || fn.endsWith(".xls") ||
                  mimetype.includes("spreadsheet") || mimetype.includes("excel");
  const isImage = mimetype.startsWith("image/") ||
                  /\.(jpg|jpeg|png|webp|tiff|bmp)$/.test(fn);

  if (isPdf) {
    const text = await visionOcrPdf(buffer);
    return { text, format: "pdf" };
  }

  if (isExcel) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const sn of wb.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sn], { blankrows: false });
      if (csv.trim()) parts.push(`--- Sheet: ${sn} ---\n${csv}`);
    }
    return { text: parts.join("\n\n"), format: "excel" };
  }

  if (isImage) {
    const text = await visionOcrImage(buffer, mimetype || "image/jpeg");
    return { text, format: "image" };
  }

  return { text: buffer.toString("utf-8"), format: "text" };
}

// ── Gemini AI field extraction ────────────────────────────────────────────────
// Replaces all regex parsing. Gemini understands Indian financial document
// formats, layouts, terminology, and number conventions natively.

type DocType = "balance_sheet" | "profit_loss" | "banking" | "gstr" | "itr";

function buildFieldSchema(docType: DocType): string {
  switch (docType) {
    case "balance_sheet":
      return `{
  "totalCurrentAssets": number | null,
  "totalCurrentLiabilities": number | null,
  "inventory": number | null,
  "debtors": number | null,
  "cashAndBank": number | null,
  "fixedAssets": number | null,
  "totalAssets": number | null,
  "netWorth": number | null,
  "longTermLoans": number | null,
  "shortTermLoans": number | null,
  "bankOD": number | null,
  "sundryCreditors": number | null,
  "otherCurrentLiabilities": number | null,
  "investments": number | null,
  "loansAndAdvances": number | null,
  "totalLiabilities": number | null
}`;

    case "profit_loss":
      return `{
  "grossSales": number | null,
  "netSales": number | null,
  "costOfGoodsSold": number | null,
  "grossProfit": number | null,
  "operatingExpenses": number | null,
  "EBITDA": number | null,
  "depreciation": number | null,
  "EBIT": number | null,
  "interestExpenses": number | null,
  "netProfit": number | null,
  "otherIncome": number | null,
  "totalIncome": number | null,
  "totalExpenses": number | null,
  "tax": number | null
}`;

    case "banking":
      return `{
  "bankName": string | null,
  "accountType": string | null,
  "sanctionedLimit": number | null,
  "outstandingBalance": number | null,
  "utilization": number | null,
  "dpValue": number | null,
  "securityValue": number | null,
  "creditRating": string | null,
  "interestRate": number | null,
  "tenure": string | null,
  "emiAmount": number | null,
  "npaStatus": string | null,
  "overdraftLimit": number | null,
  "cashCreditLimit": number | null,
  "termLoanOutstanding": number | null
}`;

    case "gstr":
      return `{
  "gstinNumber": string | null,
  "filingPeriod": string | null,
  "totalTaxableValue": number | null,
  "totalIGST": number | null,
  "totalCGST": number | null,
  "totalSGST": number | null,
  "totalTax": number | null,
  "totalInvoices": number | null,
  "b2bTaxableValue": number | null,
  "b2cTaxableValue": number | null,
  "exportValue": number | null,
  "inputTaxCredit": number | null,
  "netTaxPayable": number | null
}`;

    case "itr":
      return `{
  "assessmentYear": string | null,
  "panNumber": string | null,
  "grossTotalIncome": number | null,
  "deductions": number | null,
  "netTaxableIncome": number | null,
  "taxPayable": number | null,
  "taxPaid": number | null,
  "refundAmount": number | null,
  "salaryIncome": number | null,
  "businessIncome": number | null,
  "capitalGains": number | null,
  "otherIncome": number | null,
  "housePropertyIncome": number | null
}`;
  }
}

function buildGeminiPrompt(text: string, docType: DocType): string {
  const schema = buildFieldSchema(docType);
  const docLabel: Record<DocType, string> = {
    balance_sheet: "Balance Sheet (Schedule VI / IND-AS format, possibly in lakhs or crores)",
    profit_loss:   "Profit & Loss Statement / Trading Account",
    banking:       "Banking Statement / Credit Facility / Sanction Letter",
    gstr:          "GST Return (GSTR-1 / GSTR-3B / GSTR-9)",
    itr:           "Income Tax Return (ITR-1 / ITR-2 / ITR-3 / ITR-4 or Computation Sheet)",
  };

  return `You are an expert Indian financial document parser with deep knowledge of Indian accounting standards (Schedule VI, IND-AS), GST regulations, and Income Tax rules.

DOCUMENT TYPE: ${docLabel[docType]}

TASK: Extract financial values from the document text below and return ONLY a valid JSON object matching the exact schema provided. 

RULES:
1. Return ONLY the JSON object — no explanation, no markdown, no code fences.
2. All monetary values must be plain numbers (not strings). Convert Indian number formats: 1,43,827 → 143827. Convert lakhs/crores if units are stated (e.g. "₹ in Lakhs" means multiply each value by 100000).
3. If a value appears in parentheses like (15,000) it means negative → -15000.
4. If a field is genuinely not present in the document, use null.
5. For percentage fields (utilization, interestRate), return the number only (e.g. 75.5 not "75.5%").
6. Look for these Indian accounting terms:
   - "Sundry Debtors" or "Trade Receivables" = debtors
   - "Closing Stock" or "Stock-in-Trade" or "Inventories" = inventory
   - "Cash & Cash Equivalents" or "Cash and Bank" = cashAndBank
   - "Sundry Creditors" or "Trade Payables" = sundryCreditors
   - "Bank Overdraft" or "CC Account" or "Cash Credit" = bankOD
   - "Secured Loans" or "Term Loans from Banks" = longTermLoans
   - "Net Profit After Tax" or "PAT" = netProfit
   - "Gross Profit" = grossSales minus costOfGoodsSold
   - "EBITDA" = Earnings Before Interest, Tax, Depreciation, Amortisation
   - "Capital Account" or "Partners Capital" or "Equity Share Capital + Reserves" = netWorth
7. The document may be in horizontal (two-column) or vertical layout — handle both correctly.
8. Numbers may use Indian comma formatting: 1,00,000 = 100000 (one lakh).

SCHEMA TO FILL:
${schema}

DOCUMENT TEXT:
${text.slice(0, 15000)}`;
}

async function geminiExtractFields(text: string, docType: DocType): Promise<Record<string, any>> {
  const prompt = buildGeminiPrompt(text, docType);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    config: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  const raw = response.text ?? "{}";

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON from partial response
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return {};
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// /api/parse-document — raw text extraction only (no field parsing)
router.post("/parse-document", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  try {
    const { text, format } = await extractRawText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname ?? "",
    );
    res.json({ text, format });
  } catch (err) {
    req.log.error({ err }, "parse-document failed");
    res.status(500).json({ message: "Failed to parse document" });
  }
});

// /api/parse-financial — full pipeline: Vision OCR → Gemini AI field extraction
router.post("/parse-financial", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const docType = (req.body?.docType ?? "") as DocType;
  const validTypes: DocType[] = ["balance_sheet", "profit_loss", "banking", "gstr", "itr"];
  if (!validTypes.includes(docType)) {
    res.status(400).json({
      message: `Invalid docType. Must be one of: ${validTypes.join(", ")}`,
    });
    return;
  }

  try {
    // Step 1: Extract raw text using Google Vision (or XLSX for Excel)
    const { text, format } = await extractRawText(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname ?? "",
    );

    if (!text.trim()) {
      res.status(422).json({ message: "Could not extract any text from the document. Please ensure the file is readable." });
      return;
    }

    // Step 2: Use Gemini AI to extract structured fields from raw text
    const fields = await geminiExtractFields(text, docType);

    res.json({ text, format, fields });

  } catch (err) {
    req.log.error({ err }, "parse-financial failed");
    res.status(500).json({ message: "Failed to parse financial document" });
  }
});

export default router;
