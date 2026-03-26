import { Router, type IRouter, type Request, type Response } from "express";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

const RAILWAY_URL = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : "https://perfect-app-production.up.railway.app";

function getPublicDir(): string {
  return path.resolve(process.cwd(), "public");
}

router.get("/manifest", (req: Request, res: Response) => {
  const platform = (req.headers["expo-platform"] as string) || "android";
  const publicDir = getPublicDir();
  const manifestPath = path.join(publicDir, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.status(404).json({ error: "Manifest not found" });
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  // Rewrite bundle URL to Railway
  if (manifest.launchAsset?.url) {
    const url = new URL(manifest.launchAsset.url);
    manifest.launchAsset.url = `${RAILWAY_URL}${url.pathname}`;
  }

  if (manifest.assets) {
    manifest.assets = manifest.assets.map((asset: { url?: string }) => {
      if (asset.url) {
        try {
          const url = new URL(asset.url);
          asset.url = `${RAILWAY_URL}${url.pathname}`;
        } catch {}
      }
      return asset;
    });
  }

  res.json(manifest);
});

// Landing page for QR code
router.get("/", (_req: Request, res: Response) => {
  const url = RAILWAY_URL.replace("https://", "exp://");
  res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Dhanush Financial App</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: Arial, sans-serif; background: #080F1E; color: white; text-align: center; padding: 40px 20px; }
h1 { color: #D4A853; }
p { color: #5B8DB8; font-size: 18px; }
.url { background: #15202F; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; word-break: break-all; color: #2E6DAB; margin: 20px 0; }
</style>
</head>
<body>
<h1>Dhanush Financial</h1>
<p>Open in Expo Go using this URL:</p>
<div class="url">${url}</div>
<p>Or paste in Expo Go → Enter URL manually</p>
</body>
</html>`);
});

export default router;
