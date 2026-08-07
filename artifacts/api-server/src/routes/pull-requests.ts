import { Router, type IRouter } from "express";
import { mockPullRequests, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/pull-requests", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const repositoryId = String(req.query.repositoryId ?? "");
  const status = String(req.query.status ?? "");
  const author = String(req.query.author ?? "");
  const risk = String(req.query.risk ?? "");

  let filtered = [...mockPullRequests];
  if (repositoryId) filtered = filtered.filter((p) => p.repositoryId === repositoryId);
  if (status) filtered = filtered.filter((p) => p.status === status);
  if (author) filtered = filtered.filter((p) => p.author.toLowerCase().includes(author.toLowerCase()));
  if (risk) filtered = filtered.filter((p) => p.risk === risk);

  res.json(paginate(filtered, page, limit));
});

export default router;
