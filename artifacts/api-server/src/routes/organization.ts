import { Router, type IRouter } from "express";
import { mockOrganization, mockMembers, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/organization", async (req, res): Promise<void> => {
  res.json(mockOrganization);
});

router.get("/organization/members", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const role = String(req.query.role ?? "");
  let filtered = [...mockMembers];
  if (role) filtered = filtered.filter((m) => m.role === role);
  res.json(paginate(filtered, page, 20));
});

router.patch("/organization/members/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const member = mockMembers.find((m) => m.id === id);
  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }
  res.json({ ...member, ...req.body });
});

export default router;
