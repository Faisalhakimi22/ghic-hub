import { Router, type IRouter } from "express";
import { mockApiKeys } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/api-keys", async (req, res): Promise<void> => {
  res.json(mockApiKeys);
});

router.post("/api-keys", async (req, res): Promise<void> => {
  const newKey = {
    id: `ak-${Date.now()}`,
    name: req.body.name || "New API Key",
    prefix: "ghic_new_",
    scopes: req.body.scopes || ["read:issues"],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    expiresAt: req.body.expiresAt || null,
    rateLimit: req.body.rateLimit || 1000,
    usageCount: 0,
  };
  res.status(201).json(newKey);
});

router.delete("/api-keys/:id", async (req, res): Promise<void> => {
  res.json({ success: true, message: "API key deleted" });
});

export default router;
