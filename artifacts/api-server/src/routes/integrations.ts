import { Router, type IRouter } from "express";
import { mockIntegrations } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/integrations", async (req, res): Promise<void> => {
  res.json(mockIntegrations);
});

router.post("/integrations/:id/toggle", async (req, res): Promise<void> => {
  res.json({ success: true, message: "Integration toggled" });
});

export default router;
