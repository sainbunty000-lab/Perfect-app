if (!process.env.DATABASE_URL) {
  const alt = process.env.DATABASE_PRIVATE_URL
    || process.env.DATABASE_PUBLIC_URL
    || process.env.RAILWAY_DATABASE_URL;
  if (alt) {
    process.env.DATABASE_URL = alt;
  }
}

if (!process.env.PORT) {
  process.env.PORT = "8080";
}

await import("./dist/index.mjs");
