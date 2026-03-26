import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { casesTable, insertCaseSchema } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/cases", async (req, res) => {
  try {
    const cases = await db.select().from(casesTable).orderBy(casesTable.createdAt);
    res.json(cases);
  } catch (err) {
    req.log.error({ err }, "Failed to list cases");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.post("/cases", async (req, res) => {
  try {
    const parsed = insertCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      req.log.warn({ errors: parsed.error.issues, bodyKeys: Object.keys(req.body || {}) }, "Case validation failed");
      res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
      return;
    }
    const [created] = await db.insert(casesTable).values(parsed.data).returning();
    res.status(201).json(created);
  } catch (err) {
    req.log.error({ err }, "Failed to create case");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/cases/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid ID" });
      return;
    }
    const [found] = await db.select().from(casesTable).where(eq(casesTable.id, id));
    if (!found) {
      res.status(404).json({ message: "Case not found" });
      return;
    }
    res.json(found);
  } catch (err) {
    req.log.error({ err }, "Failed to get case");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.put("/cases/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid ID" });
      return;
    }
    const parsed = insertCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid input", errors: parsed.error.issues });
      return;
    }
    const [updated] = await db
      .update(casesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(casesTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ message: "Case not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update case");
    res.status(500).json({ message: "Internal server error" });
  }
});

router.delete("/cases/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ message: "Invalid ID" });
      return;
    }
    await db.delete(casesTable).where(eq(casesTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "Failed to delete case");
    res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
