import { requireRole } from "./auth.mjs";
import { database, requireWorkspaceContext } from "./db.mjs";

export const FEEDBACK_CLASSIFICATIONS = [
  "bug", "feature", "question", "docs", "duplicate", "performance", "security", "other",
];

function fail(message, status = 400, code = "invalid_feedback") {
  throw Object.assign(new Error(message), { status, code });
}

export function parseIssueIdentifier(value) {
  const id = String(value || "");
  const separator = id.lastIndexOf("~");
  let repo;
  try { repo = decodeURIComponent(id.slice(0, separator).replace(/~/g, "/")); }
  catch { fail("Issue identifier is invalid."); }
  const rawNumber = id.slice(separator + 1);
  const number = Number(rawNumber);
  if (separator < 1 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)
    || !/^[1-9][0-9]*$/.test(rawNumber) || !Number.isSafeInteger(number)
    || number > 2147483647) fail("Issue identifier is invalid.");
  return { repo, number };
}

export function validateFeedback(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("Feedback is required.");
  const allowed = new Set(["requestId", "analysisId", "decision", "classification", "reason"]);
  if (Object.keys(input).some((key) => !allowed.has(key))) fail("Unexpected feedback field.");
  const { requestId, analysisId, decision } = input;
  if (typeof requestId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
    fail("A valid feedback request identifier is required.");
  }
  if (typeof analysisId !== "string" || !/^[1-9][0-9]{0,18}$/.test(analysisId)
    || BigInt(analysisId) > 9223372036854775807n) fail("A valid analysis identifier is required.");
  if (!["accepted", "rejected", "corrected"].includes(decision)) fail("Choose a feedback decision.");
  const classification = input.classification ?? null;
  if (decision === "corrected" ? !FEEDBACK_CLASSIFICATIONS.includes(classification) : classification !== null) {
    fail("Choose a supported corrected classification, only for a correction.");
  }
  if (input.reason != null && typeof input.reason !== "string") fail("Reason must be text.");
  const reason = (input.reason || "").trim();
  if (reason.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(reason)) fail("Reason must be at most 1,000 characters of plain text.");
  if (/-----BEGIN|(?:postgres(?:ql)?|mysql):\/\/|\b(?:gh[pousr]_[A-Za-z0-9]+|github_pat_|sk-(?:or-|proj-)?|npg_|Bearer\s+[A-Za-z0-9])/i.test(reason)) {
    fail("Remove credentials or tokens from the reason before saving.");
  }
  return { requestId: requestId.toLowerCase(), analysisId, decision, classification, reason };
}

function shapeFeedback(row) {
  return {
    id: String(row.id), analysisId: String(row.data.analysis_id),
    decision: row.data.decision, classification: row.data.classification || null,
    reason: row.data.reason || "", actor: row.data.actor_name || "Workspace maintainer",
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function readIssueFeedback(viewer, issueId, { getDatabase = database } = {}) {
  const workspaceId = requireWorkspaceContext(viewer.workspaceId);
  const { repo, number } = parseIssueIdentifier(issueId);
  const q = await getDatabase();
  const rows = await q(`
    SELECT l.id::text AS id, l.data, l.created_at FROM ghic_ledger l
    WHERE l.workspace_id = $1 AND l.data->>'type' = 'maintainer_feedback'
      AND l.data->>'repo' = $2 AND l.data->>'number' = $3
      AND EXISTS (SELECT 1 FROM ghic_workspace_members m
                  WHERE m.workspace_id = $1 AND m.firebase_uid = $4)
    ORDER BY l.id DESC LIMIT 20`, [workspaceId, repo, String(number), viewer.id]);
  const analyses = await q(`SELECT id::text AS id, data->>'analysis_status' AS status
    FROM ghic_ledger WHERE workspace_id = $1 AND data->>'repo' = $2
      AND data->>'number' = $3 AND data->>'type' = 'analysis'
      AND EXISTS (SELECT 1 FROM ghic_workspace_members WHERE workspace_id = $1 AND firebase_uid = $4)
    ORDER BY ghic_ledger.id DESC LIMIT 1`, [workspaceId, repo, String(number), viewer.id]);
  return { items: rows.map(shapeFeedback), analysisId: analyses[0]?.status === "complete" ? analyses[0].id : null };
}

/** Append a human decision, never rewrite an analysis or mutate GitHub. */
export async function saveIssueFeedback(viewer, issueId, input, { getDatabase = database } = {}) {
  requireRole(viewer, "admin");
  const workspaceId = requireWorkspaceContext(viewer.workspaceId);
  const { repo, number } = parseIssueIdentifier(issueId);
  const feedback = validateFeedback(input);
  const q = await getDatabase();
  const args = [workspaceId, viewer.id, repo, String(number)];
  const [, results] = await q.transaction([
    // Serialize retries across processes; the token is scoped to tenant + actor.
    q("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      JSON.stringify(["ghic-feedback", workspaceId, viewer.id, feedback.requestId]),
    ]),
    q(`WITH members AS MATERIALIZED (
       SELECT firebase_uid, role FROM ghic_workspace_members
       WHERE workspace_id = $1 AND firebase_uid = $2 FOR SHARE
     ), repositories AS MATERIALIZED (
       SELECT r.installation_id, r.workspace_id, r.repo_full_name FROM ghic_github_repositories r
       JOIN ghic_github_installations i ON i.installation_id = r.installation_id
         AND i.workspace_id = r.workspace_id
       WHERE r.workspace_id = $1 AND r.repo_full_name = $3 AND r.active
         AND i.connection_status = 'connected' AND i.revoked_at IS NULL
       FOR SHARE OF r, i
     ), analyses AS MATERIALIZED (
       SELECT id, data->>'analysis_status' AS status FROM ghic_ledger
       WHERE workspace_id = $1 AND data->>'repo' = $3 AND data->>'number' = $4
         AND data->>'type' = 'analysis'
       ORDER BY id DESC LIMIT 1 FOR SHARE
     ), existing AS MATERIALIZED (
       SELECT id::text AS id, data, created_at FROM ghic_ledger
       WHERE workspace_id = $1 AND data->>'type' = 'maintainer_feedback'
         AND data->>'actor_uid' = $2 AND data->>'request_id' = $5
       ORDER BY ghic_ledger.id DESC LIMIT 1
     ), inserted AS (
       INSERT INTO ghic_ledger (workspace_id, data)
       SELECT r.workspace_id, jsonb_build_object(
         'type', 'maintainer_feedback', 'repo', r.repo_full_name, 'number', $4::text::int,
         'workspace_id', r.workspace_id, 'installation_id', r.installation_id,
         'actor_uid', m.firebase_uid, 'actor_name', $10::text,
         'analysis_id', a.id::text, 'request_id', $5::text,
         'decision', $7::text, 'classification', $8::text, 'reason', $9::text,
         'at', extract(epoch FROM now()))
       FROM members m CROSS JOIN repositories r CROSS JOIN analyses a
       WHERE m.role IN ('owner', 'admin') AND a.status = 'complete' AND a.id::text = $6
         AND NOT EXISTS (SELECT 1 FROM existing)
       RETURNING id::text AS id, data, created_at
     )
     SELECT EXISTS (SELECT 1 FROM members WHERE role IN ('owner', 'admin')) AS permitted,
       EXISTS (SELECT 1 FROM repositories) AS connected,
       EXISTS (SELECT 1 FROM analyses) AS analyzed,
       (SELECT row_to_json(existing) FROM existing) AS existing,
       (SELECT row_to_json(inserted) FROM inserted) AS inserted`, [...args, feedback.requestId, feedback.analysisId,
      feedback.decision, feedback.classification, feedback.reason, String(viewer.name || "Workspace maintainer").slice(0, 120)]),
  ]);
  const result = results[0];
  if (!result?.permitted) {
    fail("Current workspace admin or owner membership is required.", 403, "forbidden");
  }
  if (!result.connected) fail("An active repository connection in this workspace is required.", 409, "repository_connection_required");
  if (result.existing) {
    const event = result.existing.data;
    if (event.repo !== repo || event.number !== number || event.analysis_id !== feedback.analysisId
      || event.decision !== feedback.decision || (event.classification || null) !== feedback.classification
      || (event.reason || "") !== feedback.reason) fail("This request identifier was already used for different feedback.", 409, "feedback_conflict");
    return { feedback: shapeFeedback(result.existing), replayed: true };
  }
  if (!result.analyzed) fail("No completed analysis was found for this issue.", 404, "analysis_not_found");
  if (!result.inserted) fail("The analysis changed. Reload the issue before saving feedback.", 409, "analysis_changed");
  return { feedback: shapeFeedback(result.inserted), replayed: false };
}
