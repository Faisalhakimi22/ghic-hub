import { Router, type IRouter } from "express";
import { mockSettings } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/settings", async (req, res): Promise<void> => {
  res.json(mockSettings);
});

router.patch("/settings", async (req, res): Promise<void> => {
  res.json({ ...mockSettings, ...req.body });
});

export default router;
