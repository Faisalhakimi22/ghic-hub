import { Router, type IRouter } from "express";
import { mockIssues, mockIssueDetail, paginate } from "../lib/mock-data";

const router: IRouter = Router();

router.get("/issues", async (req, res): Promise<void> => {
  const page = parseInt(String(req.query.page ?? "1"), 10) || 1;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const search = String(req.query.search ?? "").toLowerCase();
  const repositoryId = String(req.query.repositoryId ?? "");
  const priority = String(req.query.priority ?? "");
  const severity = String(req.query.severity ?? "");
  const status = String(req.query.status ?? "");
  const classification = String(req.query.classification ?? "");
  const assignee = String(req.query.assignee ?? "");
  const aiStatus = String(req.query.aiStatus ?? "");

  let filtered = [...mockIssues];
  if (search) filtered = filtered.filter((i) => i.title.toLowerCase().includes(search) || i.repositoryName.toLowerCase().includes(search));
  if (repositoryId) filtered = filtered.filter((i) => i.repositoryId === repositoryId);
  if (priority) filtered = filtered.filter((i) => i.priority === priority);
  if (severity) filtered = filtered.filter((i) => i.severity === severity);
  if (status) filtered = filtered.filter((i) => i.status === status);
  if (classification) filtered = filtered.filter((i) => i.classification === classification);
  if (assignee) filtered = filtered.filter((i) => i.assignee === assignee);
  if (aiStatus) filtered = filtered.filter((i) => i.aiStatus === aiStatus);

  res.json(paginate(filtered, page, limit));
});

router.get("/issues/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const issue = mockIssues.find((i) => i.id === id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  // Return full detail for first issue, simplified for others
  if (id === "issue-1") {
    res.json(mockIssueDetail);
    return;
  }
  res.json({
    issue,
    executiveSummary: `AI-generated executive summary for issue #${issue.number}. Classification: ${issue.classification}. Confidence: ${Math.round(issue.confidence * 100)}%.`,
    rootCauseAnalysis: `Root cause analysis pending deeper investigation.`,
    regressionSignals: null,
    engineeringImpact: `${issue.priority.charAt(0).toUpperCase() + issue.priority.slice(1)} priority issue affecting ${issue.repositoryName}.`,
    investigationPlan: `Review ${issue.repositoryName} for related changes.`,
    suggestedTests: ["Add regression test covering this scenario"],
    suggestedLabels: [issue.classification, issue.priority],
    suggestedAssignee: issue.assignee,
    missingInformation: null,
    relevantFiles: [],
    relevantFunctions: [],
    relevantComponents: [],
    relatedCommits: [],
    relatedPullRequests: [],
    relatedIssues: [],
    timeline: [
      { id: `tl-${id}-1`, type: "opened", actor: "github", description: "Issue opened", timestamp: issue.createdAt },
    ],
    automationSuggestions: [],
  });
});

router.patch("/issues/:id/bulk-update", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const issue = mockIssues.find((i) => i.id === id);
  if (!issue) {
    res.status(404).json({ error: "Issue not found" });
    return;
  }
  res.json({ ...issue, ...req.body });
});

export default router;
