import { Router, type IRouter } from "express";
import { globalSearch } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/search", async (req, res): Promise<void> => {
  const q = String(req.query.q ?? "");
  res.json(globalSearch(q));
});

export default router;
