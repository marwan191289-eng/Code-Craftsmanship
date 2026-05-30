import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, profiles, insertProfileSchema } from "@workspace/db";

const router = Router();

router.get("/profiles", async (req, res) => {
  try {
    const allProfiles = await db.select().from(profiles);
    res.status(200).json(allProfiles);
  } catch {
    res.status(500).json({ message: "Failed to fetch profiles" });
  }
});

router.get("/profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

  try {
    const [profile] = await db.select().from(profiles).where(eq(profiles.id, id));
    if (!profile) return res.status(404).json({ message: "Profile not found" });
    res.status(200).json(profile);
  } catch {
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

router.post("/profiles", async (req, res) => {
  try {
    const parsed = insertProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Validation error" });
    }
    const [newProfile] = await db.insert(profiles).values(parsed.data as any).returning();
    res.status(201).json(newProfile);
  } catch {
    res.status(500).json({ message: "Failed to create profile" });
  }
});

router.put("/profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

  try {
    const parsed = insertProfileSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Validation error" });
    }
    const [updated] = await db.update(profiles).set(parsed.data as any).where(eq(profiles.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Profile not found" });
    res.status(200).json(updated);
  } catch {
    res.status(500).json({ message: "Failed to update profile" });
  }
});

router.delete("/profiles/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });

  try {
    await db.delete(profiles).where(eq(profiles.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ message: "Failed to delete profile" });
  }
});

export default router;
