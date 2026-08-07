import { Router, type IRouter } from "express";
import { mockComponents, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/components", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const repositoryId = String(req.query.repositoryId ?? "");
  const search = String(req.query.search ?? "").toLowerCase();
  const health = String(req.query.health ?? "");

  let filtered = [...mockComponents];
  if (repositoryId) filtered = filtered.filter((c) => c.repositoryId === repositoryId);
  if (search) filtered = filtered.filter((c) => c.name.toLowerCase().includes(search));
  if (health) filtered = filtered.filter((c) => c.health === health);

  res.json(paginate(filtered, page, limit));
});

export default router;
