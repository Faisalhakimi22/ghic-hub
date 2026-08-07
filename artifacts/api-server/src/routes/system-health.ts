import { Router, type IRouter } from "express";
import { mockSystemHealth } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/system-health", async (req, res): Promise<void> => {
  res.json(mockSystemHealth);
});

export default router;
