import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, profiles, insertProfileSchema } from "@workspace/db";

const router = Router();

router.get("/profiles", async (_req, res) => {
  try {
    const allProfiles = await db.select().from(profiles);
    res.status(200).json(allProfiles);
  } catch (err) {
    console.error("Failed to fetch profiles:", err);
    res.status(500).json({ message: "Failed to fetch profiles" });
  }
});

router.get("/profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID" });
    return;
  }

  try {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    if (!profile) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }
    res.status(200).json(profile);
  } catch (err) {
    console.error("Failed to fetch profile:", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

router.post("/profiles", async (req, res) => {
  try {
    const parsed = insertProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ message: firstError?.message ?? "Validation error" });
      return;
    }
    const [newProfile] = await db.insert(profiles).values(parsed.data as any).returning();
    res.status(201).json(newProfile);
  } catch (err) {
    console.error("Failed to create profile:", err);
    res.status(500).json({ message: "Failed to create profile" });
  }
});

router.put("/profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID" });
    return;
  }

  try {
    const parsed = insertProfileSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ message: firstError?.message ?? "Validation error" });
      return;
    }
    const [updated] = await db.update(profiles).set(parsed.data as any).where(eq(profiles.id, id)).returning();
    if (!updated) {
      res.status(404).json({ message: "Profile not found" });
      return;
    }
    res.status(200).json(updated);
  } catch (err) {
    console.error("Failed to update profile:", err);
    res.status(500).json({ message: "Failed to update profile" });
  }
});

router.delete("/profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ message: "Invalid ID" });
    return;
  }

  try {
    await db.delete(profiles).where(eq(profiles.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("Failed to delete profile:", err);
    res.status(500).json({ message: "Failed to delete profile" });
  }
});

export default router;
