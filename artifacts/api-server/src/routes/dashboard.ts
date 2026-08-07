import { Router, type IRouter } from "express";
import {
  getDashboardStats,
  getRecentActivity,
  getAlerts,
} from "../lib/mock-data";

const router: IRouter = Router();

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  res.json(getDashboardStats());
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  res.json(getRecentActivity());
});

router.get("/dashboard/alerts", async (req, res): Promise<void> => {
  res.json(getAlerts());
});

export default router;
