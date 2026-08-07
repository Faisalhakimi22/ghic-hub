import { Router, type IRouter } from "express";
import {
  mockRepositories,
  getRepositoryAnalytics,
  mockCommits,
  mockPullRequests,
  mockReleases,
  mockComponents,
  paginate,
} from "../lib/mock-data";

const router: IRouter = Router();

router.get("/repositories", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const search = String(req.query.search ?? "").toLowerCase();
  const language = String(req.query.language ?? "").toLowerCase();
  const status = String(req.query.status ?? "").toLowerCase();

  let filtered = mockRepositories;
  if (search) {
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        r.owner.toLowerCase().includes(search) ||
        (r.description ?? "").toLowerCase().includes(search)
    );
  }
  if (language) {
    filtered = filtered.filter((r) =>
      (r.language ?? "").toLowerCase().includes(language)
    );
  }
  if (status) {
    filtered = filtered.filter((r) => r.indexStatus === status);
  }

  res.json(paginate(filtered, page, limit));
});

router.get("/repositories/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const repo = mockRepositories.find((r) => r.id === id);
  if (!repo) {
    res.status(404).json({ error: "Repository not found" });
    return;
  }
  res.json(repo);
});

router.post("/repositories/:id/sync", async (req, res): Promise<void> => {
  res.json({ success: true, message: "Repository sync triggered" });
});

router.post("/repositories/:id/reindex", async (req, res): Promise<void> => {
  res.json({ success: true, message: "Repository reindex triggered" });
});

router.get("/repositories/:id/analytics", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  res.json(getRepositoryAnalytics(id));
});

router.get("/repositories/:id/commits", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const filtered = mockCommits.filter((c) => c.repositoryId === id);
  res.json(paginate(filtered, page, limit));
});

router.get(
  "/repositories/:id/pull-requests",
  async (req, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const status = String(req.query.status ?? "");
    let filtered = mockPullRequests.filter((p) => p.repositoryId === id);
    if (status) filtered = filtered.filter((p) => p.status === status);
    res.json(paginate(filtered, page, 20));
  }
);

router.get("/repositories/:id/releases", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const filtered = mockReleases.filter((r) => r.repositoryId === id);
  res.json(paginate(filtered, page, 20));
});

router.get(
  "/repositories/:id/components",
  async (req, res): Promise<void> => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
    const filtered = mockComponents.filter((c) => c.repositoryId === id);
    res.json(paginate(filtered, page, 20));
  }
);

export default router;
