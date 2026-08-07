import { Router, type IRouter } from "express";
import { mockCommits, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/commits", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const repositoryId = String(req.query.repositoryId ?? "");
  const author = String(req.query.author ?? "");
  const risk = String(req.query.risk ?? "");

  let filtered = [...mockCommits];
  if (repositoryId) filtered = filtered.filter((c) => c.repositoryId === repositoryId);
  if (author) filtered = filtered.filter((c) => c.author.toLowerCase().includes(author.toLowerCase()));
  if (risk) filtered = filtered.filter((c) => c.risk === risk);

  res.json(paginate(filtered, page, limit));
});

export default router;
