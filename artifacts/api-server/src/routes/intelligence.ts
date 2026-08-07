import { Router, type IRouter } from "express";
import {
  getIntelligenceSummary,
  getRootCauses,
  getHistoricalPatterns,
  getRiskAnalysis,
  getAnalyticsOverview,
} from "../lib/mock-data";
import { mockDuplicateClusters, mockRegressions, mockAutomationSuggestions, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/intelligence/summary", async (req, res): Promise<void> => {
  res.json(getIntelligenceSummary());
});

router.get("/intelligence/root-causes", async (req, res): Promise<void> => {
  res.json(getRootCauses());
});

router.get("/intelligence/historical-patterns", async (req, res): Promise<void> => {
  res.json(getHistoricalPatterns());
});

router.get("/intelligence/risk-analysis", async (req, res): Promise<void> => {
  res.json(getRiskAnalysis());
});

router.get("/analytics/overview", async (req, res): Promise<void> => {
  const period = String(req.query.period ?? "30d");
  res.json(getAnalyticsOverview(period));
});

router.get("/duplicates", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  res.json(paginate(mockDuplicateClusters, page, 20));
});

router.get("/regressions", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const repositoryId = String(req.query.repositoryId ?? "");
  const status = String(req.query.status ?? "");
  let filtered = [...mockRegressions];
  if (repositoryId) filtered = filtered.filter((r) => r.repositoryId === repositoryId);
  if (status) filtered = filtered.filter((r) => r.investigationStatus === status);
  res.json(paginate(filtered, page, 20));
});

router.get("/automation/suggestions", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const type = String(req.query.type ?? "");
  const status = String(req.query.status ?? "");
  const repositoryId = String(req.query.repositoryId ?? "");
  let filtered = [...mockAutomationSuggestions];
  if (type) filtered = filtered.filter((a) => a.type === type);
  if (status) filtered = filtered.filter((a) => a.status === status);
  if (repositoryId) filtered = filtered.filter((a) => a.repositoryId === repositoryId);
  res.json(paginate(filtered, page, 20));
});

router.post("/automation/suggestions/:id/approve", async (req, res): Promise<void> => {
  res.json({ success: true, message: "Suggestion approved" });
});

router.post("/automation/suggestions/:id/reject", async (req, res): Promise<void> => {
  res.json({ success: true, message: "Suggestion rejected" });
});

export default router;
