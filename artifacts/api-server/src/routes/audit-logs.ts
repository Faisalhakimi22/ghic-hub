import { Router, type IRouter } from "express";
import { mockAuditLogs, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/audit-logs", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const user = String(req.query.user ?? "").toLowerCase();
  const action = String(req.query.action ?? "").toLowerCase();
  const repositoryId = String(req.query.repositoryId ?? "");

  let filtered = [...mockAuditLogs];
  if (user) filtered = filtered.filter((l) => l.user.toLowerCase().includes(user));
  if (action) filtered = filtered.filter((l) => l.action.toLowerCase().includes(action));

  res.json(paginate(filtered, page, limit));
});

export default router;
