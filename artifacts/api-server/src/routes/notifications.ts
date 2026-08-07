import { Router, type IRouter } from "express";
import { mockNotifications, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const unreadOnly = req.query.unreadOnly === "true";
  const type = String(req.query.type ?? "");

  let filtered = [...mockNotifications];
  if (unreadOnly) filtered = filtered.filter((n) => !n.read);
  if (type) filtered = filtered.filter((n) => n.type === type);

  const paged = paginate(filtered, page, limit);
  res.json({ ...paged, unread: mockNotifications.filter((n) => !n.read).length });
});

router.post("/notifications/:id/read", async (req, res): Promise<void> => {
  res.json({ success: true, message: "Notification marked as read" });
});

export default router;
