import { Router, type IRouter } from "express";
import { mockReleases, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/releases", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const repositoryId = String(req.query.repositoryId ?? "");

  let filtered = [...mockReleases];
  if (repositoryId) filtered = filtered.filter((r) => r.repositoryId === repositoryId);

  res.json(paginate(filtered, page, 20));
});

export default router;
