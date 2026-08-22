import { database, transaction, resolveWorkspace } from "./db.mjs";
import { createHash, randomBytes } from "node:crypto";
import {
  fetchGitHubUserById,
  fetchInstallation,
  githubAppConfigured,
  listInstallationRepositories,
  verifyOrgMembership,
} from "./github-app.mjs";

/**
 * Collaborators, injectable so the authorization rules can be tested
 * against contrived GitHub responses. Production always uses the real
 * ones; the parameter exists for tests, not for callers, and nothing
 * reachable from an HTTP route passes it.
 */
const REAL = {
  database,
  transaction,
  resolveWorkspace,
  fetchInstallation,
  fetchGitHubUserById,
  githubAppConfigured,
  listInstallationRepositories,
  verifyOrgMembership,
};

export const GITHUB_APP_SLUG =
  process.env.GHIC_GITHUB_APP_SLUG || "ghic-github-issue-intelligence";
const INSTALLATION_INTENT_TTL_MS = 10 * 60 * 1000;

async function workspaceForViewer(viewer, deps) {
  if (viewer?.workspaceId) return viewer.workspaceId;
  if (!viewer?.id || typeof deps.resolveWorkspace !== "function") {
    throw Object.assign(new Error("Active workspace membership is required."), {
      status: 403,
      code: "workspace_access_denied",
    });
  }
  const workspace = await deps.resolveWorkspace(viewer.id);
  if (!workspace?.id) {
    throw Object.assign(new Error("Active workspace membership is required."), {
      status: 403,
      code: "workspace_access_denied",
    });
  }
  return workspace.id;
}

async function workspaceForInstallation(installationId, workspaceId, deps) {
  const q = await deps.database();
  const rows = await q`
    SELECT workspace_id, connection_status, revoked_at
    FROM ghic_github_installations
    WHERE installation_id = ${installationId}`;
  if (!rows.length || !rows[0].workspace_id) {
    throw Object.assign(new Error("GitHub installation is not connected to a workspace."), {
      status: 404,
      code: "installation_not_connected",
    });
  }
  const authoritative = String(rows[0].workspace_id);
  if (rows[0].revoked_at || rows[0].connection_status !== "connected") {
    throw Object.assign(new Error("GitHub installation is not actively connected."), {
      status: 409,
      code: "installation_not_connected",
    });
  }
  if (workspaceId && String(workspaceId) !== authoritative) {
    throw Object.assign(new Error("Installation does not belong to this workspace."), {
      status: 403,
      code: "workspace_ownership_mismatch",
    });
  }
  return authoritative;
}

function hashState(state) {
  return createHash("sha256").update(state).digest("hex");
}

export function githubInstallUrl(state = "") {
  const url = new URL(`https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`);
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

export async function createGitHubInstallationIntent(viewer, deps = REAL) {
  assertViewerMayConnect(viewer);
  const workspaceId = await workspaceForViewer(viewer, deps);
  const state = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INSTALLATION_INTENT_TTL_MS);
  const q = await deps.database();
  await q`
    INSERT INTO ghic_github_installation_intents
      (state_hash, firebase_uid, workspace_id, expires_at)
    VALUES
      (${hashState(state)}, ${viewer.id}, ${workspaceId}, ${expiresAt.toISOString()})`;
  return {
    ok: true,
    installUrl: githubInstallUrl(state),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getGitHubConnectionSummary(workspaceId, deps = REAL) {
  if (workspaceId && typeof workspaceId === "object") {
    deps = workspaceId;
    workspaceId = null;
  }
  if (!workspaceId) throw Object.assign(new Error("Workspace context is required."), { status: 403 });
  const q = await deps.database();
  const rows = await q`
    SELECT
      installation_id,
      account_login,
      account_type,
      repository_selection,
      connected_at,
      revoked_at,
      connection_status,
      status_reason,
      status_changed_at,
      (SELECT count(*)::int FROM ghic_github_repositories r
       WHERE r.installation_id = ghic_github_installations.installation_id
         AND r.workspace_id = ghic_github_installations.workspace_id
         AND r.active = true
         AND ghic_github_installations.revoked_at IS NULL
         AND ghic_github_installations.connection_status = 'connected') AS repository_count
    FROM ghic_github_installations
    WHERE workspace_id = ${workspaceId}
    ORDER BY updated_at DESC`;
  return {
    configured: deps.githubAppConfigured(),
    installUrl: githubInstallUrl(),
    installations: rows.map((row) => ({
      installationId: Number(row.installation_id),
      accountLogin: row.account_login,
      accountType: row.account_type,
      repositorySelection: row.repository_selection,
      repositoryCount: Number(row.repository_count || 0),
      connectedAt: row.connected_at,
      status: row.revoked_at
        ? "revoked"
        : ["connected", "disconnected", "revoked", "suspended"].includes(
              row.connection_status,
            )
          ? row.connection_status
          : "unauthorized",
      statusReason: row.status_reason || null,
      statusChangedAt: row.status_changed_at || null,
    })),
  };
}

function assertViewerMayConnect(viewer) {
  const role = String(viewer?.workspaceRole || viewer?.role || "").toLowerCase();
  if (role !== "owner" && role !== "admin") {
    throw Object.assign(
      new Error("Connecting or managing GitHub requires the admin or owner role."),
      { status: 403, code: "workspace_role_required" },
    );
  }
  if (!viewer?.githubId) {
    throw Object.assign(
      new Error(
        "Sign in with GitHub so GHIC can verify the App installation belongs to you.",
      ),
      { status: 403, code: "github_identity_required" },
    );
  }
}

async function assertViewerMayManageInstallation(viewer, installation, deps) {
  assertViewerMayConnect(viewer);
  const account = installation.account || {};
  const accountType = String(account.type || "");
  const accountId = account.id != null ? String(account.id) : null;
  const accountLogin = account.login || "";

  if (accountType === "User") {
    if (accountId !== String(viewer.githubId)) {
      throw Object.assign(
        new Error(
          "This GitHub App installation belongs to a different GitHub user.",
        ),
        { status: 403, code: "installation_user_mismatch" },
      );
    }
    return;
  }

  if (accountType === "Organization") {
    const ghUser = await deps.fetchGitHubUserById(viewer.githubId);
    const login = ghUser?.login;
    if (!login) {
      throw Object.assign(
        new Error("GHIC could not resolve your GitHub username."),
        { status: 403, code: "github_identity_required" },
      );
    }
    const allowed = await deps.verifyOrgMembership(
      installation.id,
      accountLogin,
      login,
    );
    if (!allowed) {
      throw Object.assign(
        new Error(
          "You must be an organization admin to connect this installation to GHIC.",
        ),
        { status: 403, code: "installation_org_forbidden" },
      );
    }
    return;
  }

  throw Object.assign(new Error("Unsupported GitHub installation account type."), {
    status: 400,
    code: "installation_account_unsupported",
  });
}

/**
 * Reject an installation that is already claimed by someone else.
 *
 * This is retained as a cheap preflight check for a useful error message.
 * The authoritative check is repeated inside the persistence transaction;
 * the preflight alone is intentionally not a security boundary.
 */
async function assertInstallationNotLinkedToOtherActor(
  q,
  installationId,
  viewer,
  installation,
) {
  const existing = await q`
    SELECT connected_by_firebase_uid, connected_by_github_id, workspace_id, revoked_at
    FROM ghic_github_installations
    WHERE installation_id = ${installationId}`;
  if (!existing.length) return;
  const row = existing[0];
  if (
    row.connected_by_firebase_uid !== viewer.id ||
    row.workspace_id !== viewer.workspaceId ||
    (row.connected_by_github_id &&
      row.connected_by_github_id !== String(viewer.githubId))
  ) {
    throw Object.assign(
      new Error(
        "This GitHub installation is already linked to another GHIC workspace member.",
      ),
      { status: 409, code: "installation_already_linked" },
    );
  }
}

async function readInstallationIntent(viewer, state, workspaceId, deps) {
  const value = String(state || "").trim();
  if (!value) {
    throw Object.assign(new Error("GitHub installation state is required."), {
      status: 400,
      code: "installation_state_required",
    });
  }
  const q = await deps.database();
  const rows = await q`
    SELECT firebase_uid, workspace_id, expires_at, consumed_at, status
    FROM ghic_github_installation_intents
    WHERE state_hash = ${hashState(value)}`;
  if (!rows.length) {
    throw Object.assign(new Error("GitHub installation state is invalid."), {
      status: 400,
      code: "invalid_installation_state",
    });
  }
  const row = rows[0];
  if (row.firebase_uid !== viewer.id || row.workspace_id !== workspaceId) {
    throw Object.assign(new Error("GitHub installation state is not yours."), {
      status: 403,
      code: "installation_state_forbidden",
    });
  }
  if (row.consumed_at || row.status !== "pending") {
    throw Object.assign(new Error("This GitHub installation callback was already used."), {
      status: 409,
      code: "installation_state_replayed",
    });
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error("This GitHub installation callback has expired."), {
      status: 400,
      code: "installation_state_expired",
    });
  }
  return { state: value, stateHash: hashState(value) };
}

async function consumeCancelledIntent(viewer, state, workspaceId, deps) {
  const intent = await readInstallationIntent(viewer, state, workspaceId, deps);
  const consumedAt = new Date().toISOString();
  const q = await deps.database();
  const result = await (deps.transaction || (async (items) => Promise.all(items)))([
    q`
      UPDATE ghic_github_installation_intents
      SET consumed_at = ${consumedAt}, status = 'cancelled'
      WHERE state_hash = ${intent.stateHash}
        AND firebase_uid = ${viewer.id}
        AND workspace_id = ${workspaceId}
        AND consumed_at IS NULL
        AND status = 'pending'
        AND expires_at > now()
      RETURNING state_hash`,
  ]);
  if (!result?.[0]?.length) {
    throw Object.assign(new Error("This GitHub installation callback was already used."), {
      status: 409,
      code: "installation_state_replayed",
    });
  }
  return { ok: true, cancelled: true, available: true };
}

export async function completeGitHubInstallation(
  viewer,
  input = {},
  deps = REAL,
) {
  const setupAction = String(input.setupAction || input.setup_action || "").toLowerCase();
  const state = String(input.state || "").trim();
  const requireIntent = input.requireIntent !== false;
  const workspaceId = await workspaceForViewer(viewer, deps);
  if (setupAction === "cancel") {
    return consumeCancelledIntent(viewer, state, workspaceId, deps);
  }
  assertViewerMayConnect(viewer);
  // An install started from GitHub's own App page arrives with an
  // installation id and no state, because no state was ever minted -- nothing
  // in GHIC initiated it. That is a different situation from a state that is
  // wrong, expired or replayed, and the two must not look alike to the
  // caller: this one is recoverable by connecting from the dashboard, the
  // others are callbacks worth refusing outright.
  //
  // The check below narrows nothing. A caller with no state still cannot
  // link an installation; it only earns a code the UI can act on.
  if (requireIntent && !String(state || "").trim()) {
    const candidateId = Number(input.installationId ?? input.installation_id);
    if (Number.isFinite(candidateId) && candidateId > 0) {
      throw Object.assign(
        new Error(
          "This installation was started on GitHub. Connect from the dashboard to link it to your workspace.",
        ),
        { status: 400, code: "github_initiated_installation" },
      );
    }
  }
  const intent = requireIntent
    ? await readInstallationIntent(viewer, state, workspaceId, deps)
    : null;
  const stateHash = intent?.stateHash || "internal-refresh";
  if (setupAction === "request") {
    const consumedAt = new Date().toISOString();
    const q = await deps.database();
    const result = await (deps.transaction || (async (items) => Promise.all(items)))([
      q`
        UPDATE ghic_github_installation_intents
        SET consumed_at = ${consumedAt}, status = 'requested'
        WHERE state_hash = ${intent.stateHash}
          AND firebase_uid = ${viewer.id}
          AND workspace_id = ${workspaceId}
          AND consumed_at IS NULL
          AND status = 'pending'
          AND expires_at > now()
        RETURNING state_hash`,
    ]);
    if (!result?.[0]?.length) {
      throw Object.assign(new Error("This GitHub installation callback was already used."), {
        status: 409,
        code: "installation_state_replayed",
      });
    }
    return { ok: true, available: true, setupAction: "request" };
  }
  if (!deps.githubAppConfigured()) {
    throw Object.assign(new Error("GitHub App credentials are not configured."), {
      status: 503,
      code: "github_app_not_configured",
    });
  }

  const installationId = Number(input.installationId ?? input.installation_id);
  if (!Number.isFinite(installationId) || installationId <= 0) {
    throw Object.assign(new Error("installationId is required."), {
      status: 400,
      code: "installation_id_required",
    });
  }

  const installation = await deps.fetchInstallation(installationId);
  if (installation.suspended_at) {
    throw Object.assign(new Error("This GitHub App installation is suspended."), {
      status: 403,
      code: "installation_suspended",
    });
  }

  await assertViewerMayManageInstallation(viewer, installation, deps);

  const q = await deps.database();
  await assertInstallationNotLinkedToOtherActor(
    q,
    installationId,
    viewer,
    installation,
  );

  const account = installation.account || {};
  const repos = await deps.listInstallationRepositories(installationId);
  const repoNames = repos.map((repo) => String(repo.full_name || "")).filter(Boolean);
  let repoQueryCount = 0;
  const consumedAt = new Date().toISOString();
  const queries = [q`
    SELECT pg_advisory_xact_lock(hashtextextended(${String(installationId)}, 0))
  `, q`
    SELECT workspace_id, role
    FROM ghic_workspace_members
    WHERE workspace_id = ${workspaceId}
      AND firebase_uid = ${viewer.id}
      AND role IN ('owner', 'admin')
    FOR UPDATE
  `, q`
    SELECT 1 / CASE WHEN EXISTS (
      SELECT 1 FROM ghic_workspace_members
      WHERE workspace_id = ${workspaceId}
        AND firebase_uid = ${viewer.id}
        AND role IN ('owner', 'admin')
    ) THEN 1 ELSE 0 END AS membership_guard
  `, q`
    UPDATE ghic_github_installation_intents
    SET consumed_at = ${consumedAt}, status = 'consumed'
    WHERE ${requireIntent}
      AND state_hash = ${stateHash}
      AND firebase_uid = ${viewer.id}
      AND workspace_id = ${workspaceId}
      AND consumed_at IS NULL
      AND status = 'pending'
      AND expires_at > now()
      AND EXISTS (
        SELECT 1 FROM ghic_workspace_members
        WHERE workspace_id = ${workspaceId}
          AND firebase_uid = ${viewer.id}
          AND role IN ('owner', 'admin')
      )
    RETURNING state_hash
  `, q`
    SELECT 1 / CASE WHEN EXISTS (
      SELECT 1 FROM ghic_github_installations
      WHERE installation_id = ${installationId}
        AND (
          connected_by_firebase_uid <> ${viewer.id}
          OR connected_by_github_id IS DISTINCT FROM ${String(viewer.githubId)}
          OR workspace_id IS DISTINCT FROM ${workspaceId}
        )
    ) THEN 0 ELSE 1 END AS ownership_guard
  `, q`
    SELECT 1 / CASE WHEN EXISTS (
      SELECT 1 FROM ghic_github_repositories
      WHERE repo_full_name = ANY(${repoNames}::text[])
        AND (
          installation_id <> ${installationId}
          OR workspace_id IS DISTINCT FROM ${workspaceId}
        )
    ) THEN 0 ELSE 1 END AS repository_guard
  `, q`
    INSERT INTO ghic_github_installations (
      installation_id, account_login, account_type, account_github_id,
      repository_selection, connected_by_firebase_uid, connected_by_github_id,
      workspace_id, updated_at, revoked_at, connection_status, status_reason, status_changed_at
    ) SELECT
      ${installationId},
      ${String(account.login || "")},
      ${String(account.type || "")},
      ${account.id == null ? null : Number(account.id)},
      ${installation.repository_selection || null},
      ${viewer.id},
      ${String(viewer.githubId)},
      ${workspaceId},
      now(),
      NULL,
      'connected',
      NULL,
      now()
    WHERE EXISTS (
      SELECT 1 FROM ghic_workspace_members
      WHERE workspace_id = ${workspaceId}
        AND firebase_uid = ${viewer.id}
        AND role IN ('owner', 'admin')
    ) AND (
      ${requireIntent} = false OR EXISTS (
        SELECT 1 FROM ghic_github_installation_intents
        WHERE state_hash = ${stateHash}
          AND firebase_uid = ${viewer.id}
          AND workspace_id = ${workspaceId}
          AND consumed_at = ${consumedAt}
          AND status = 'consumed'
      )
    )
    ON CONFLICT (installation_id) DO UPDATE SET
      account_login = EXCLUDED.account_login,
      account_type = EXCLUDED.account_type,
      account_github_id = EXCLUDED.account_github_id,
      repository_selection = EXCLUDED.repository_selection,
      connected_by_firebase_uid = EXCLUDED.connected_by_firebase_uid,
      connected_by_github_id = EXCLUDED.connected_by_github_id,
      workspace_id = EXCLUDED.workspace_id,
      updated_at = now(),
      revoked_at = NULL,
      connection_status = 'connected',
      status_reason = NULL,
      status_changed_at = now()
    WHERE ghic_github_installations.connected_by_firebase_uid = EXCLUDED.connected_by_firebase_uid
      AND ghic_github_installations.connected_by_github_id IS NOT DISTINCT FROM EXCLUDED.connected_by_github_id
      AND ghic_github_installations.workspace_id IS NOT DISTINCT FROM EXCLUDED.workspace_id
    RETURNING installation_id
  `];
  if (repoNames.length) {
    queries.push(q`
      UPDATE ghic_github_repositories
      SET active = false, removed_at = now(), updated_at = now()
      WHERE installation_id = ${installationId}
        AND EXISTS (
          SELECT 1 FROM ghic_github_installations
          WHERE installation_id = ${installationId}
            AND connected_by_firebase_uid = ${viewer.id}
            AND connected_by_github_id IS NOT DISTINCT FROM ${String(viewer.githubId)}
        )
        AND EXISTS (
          SELECT 1 FROM ghic_workspace_members
          WHERE workspace_id = ${workspaceId}
            AND firebase_uid = ${viewer.id}
            AND role IN ('owner', 'admin')
        )
        AND (${requireIntent} = false OR EXISTS (
          SELECT 1 FROM ghic_github_installation_intents
          WHERE state_hash = ${stateHash}
            AND firebase_uid = ${viewer.id}
            AND workspace_id = ${workspaceId}
            AND consumed_at = ${consumedAt}
            AND status = 'consumed'
        ))
        AND repo_full_name <> ALL(${repoNames}::text[])`);
  } else {
    queries.push(q`
      UPDATE ghic_github_repositories
      SET active = false, removed_at = now(), updated_at = now()
      WHERE installation_id = ${installationId}
        AND EXISTS (
          SELECT 1 FROM ghic_github_installations
          WHERE installation_id = ${installationId}
            AND connected_by_firebase_uid = ${viewer.id}
            AND connected_by_github_id IS NOT DISTINCT FROM ${String(viewer.githubId)}
        )
        AND EXISTS (
          SELECT 1 FROM ghic_workspace_members
          WHERE workspace_id = ${workspaceId}
            AND firebase_uid = ${viewer.id}
            AND role IN ('owner', 'admin')
        )
        AND (${requireIntent} = false OR EXISTS (
          SELECT 1 FROM ghic_github_installation_intents
          WHERE state_hash = ${stateHash}
            AND firebase_uid = ${viewer.id}
            AND workspace_id = ${workspaceId}
            AND consumed_at = ${consumedAt}
            AND status = 'consumed'
        ))`);
  }

  for (const repo of repos) {
    const fullName = String(repo.full_name || "");
    if (!fullName) continue;
    repoQueryCount += 1;
    queries.push(q`
      INSERT INTO ghic_github_repositories (
        repo_full_name, installation_id, workspace_id, github_repo_id, private,
        default_branch, html_url, active, updated_at, removed_at
      ) SELECT
        ${fullName},
        ${installationId},
        ${workspaceId},
        ${repo.id == null ? null : Number(repo.id)},
        ${Boolean(repo.private)},
        ${repo.default_branch || null},
        ${repo.html_url || null},
        true,
        now(),
        NULL
      WHERE EXISTS (
        SELECT 1 FROM ghic_workspace_members
        WHERE workspace_id = ${workspaceId}
          AND firebase_uid = ${viewer.id}
          AND role IN ('owner', 'admin')
      ) AND (
        ${requireIntent} = false OR EXISTS (
          SELECT 1 FROM ghic_github_installation_intents
          WHERE state_hash = ${stateHash}
            AND firebase_uid = ${viewer.id}
            AND workspace_id = ${workspaceId}
            AND consumed_at = ${consumedAt}
            AND status = 'consumed'
        )
      )
      ON CONFLICT (repo_full_name) DO UPDATE SET
        installation_id = EXCLUDED.installation_id,
        workspace_id = EXCLUDED.workspace_id,
        github_repo_id = EXCLUDED.github_repo_id,
        private = EXCLUDED.private,
        default_branch = EXCLUDED.default_branch,
        html_url = EXCLUDED.html_url,
        active = true,
        updated_at = now(),
        removed_at = NULL
      WHERE ghic_github_repositories.installation_id = EXCLUDED.installation_id
        AND ghic_github_repositories.workspace_id = EXCLUDED.workspace_id
      RETURNING repo_full_name`);
  }
  const txResult = await (deps.transaction || (async (items) => Promise.all(items)))(queries);
  if (!txResult?.[1]?.length) {
    throw Object.assign(
      new Error("Your workspace membership no longer permits GitHub management."),
      { status: 403, code: "workspace_role_required" },
    );
  }
  if (requireIntent && !txResult?.[3]?.length) {
    throw Object.assign(
      new Error("This GitHub installation callback was already used or expired."),
      { status: 409, code: "installation_state_replayed" },
    );
  }
  if (!txResult?.[6]?.length) {
    throw Object.assign(
      new Error("This GitHub installation is already linked to another claimant."),
      { status: 409, code: "installation_already_linked" },
    );
  }
  // advisory lock, membership lock/guard, intent consume, ownership guards,
  // installation upsert, repository prune, then repository upserts.
  const repoResults = txResult.slice(8, 8 + repoQueryCount);
  if (repoResults.some((result) => !result?.length)) {
    throw Object.assign(
      new Error("One or more repositories are already connected to another installation."),
      { status: 409, code: "repository_already_connected" },
    );
  }

  return {
    ok: true,
    available: true,
    installationId,
    accountLogin: account.login || null,
    accountType: account.type || null,
    repositoryCount: repos.length,
    setupAction: setupAction || "install",
    repositories: repos.map((repo) => ({
      fullName: repo.full_name,
      private: Boolean(repo.private),
      htmlUrl: repo.html_url || null,
    })),
  };
}

/**
 * Re-read a connected installation from GitHub and reconcile Postgres.
 *
 * Webhooks are the primary way removals reach GHIC, but a delivery can be
 * missed while the App is unreachable, and nothing replays it. This is the
 * pull-side repair: it is the only path that can observe an installation
 * that was deleted on GitHub while GHIC was not listening, and it marks it
 * revoked rather than leaving repositories that GHIC can no longer read
 * displayed as connected.
 */
export async function refreshGitHubInstallation(
  viewer,
  installationIdInput,
  deps = REAL,
) {
  const installationId = Number(installationIdInput);
  if (!Number.isFinite(installationId) || installationId <= 0) {
    throw Object.assign(new Error("Installation id is invalid."), {
      status: 400,
      code: "installation_id_required",
    });
  }
  assertViewerMayConnect(viewer);
  const workspaceId = await workspaceForViewer(viewer, deps);

  const q = await deps.database();
  const existing = await q`
    SELECT installation_id FROM ghic_github_installations
    WHERE installation_id = ${installationId}
      AND workspace_id = ${workspaceId}
      AND revoked_at IS NULL
      AND connection_status = 'connected'`;
  if (!existing.length) {
    throw Object.assign(
      new Error("That installation is not connected to this workspace."),
      { status: 404, code: "installation_not_connected" },
    );
  }

  try {
    return await completeGitHubInstallation(
      viewer,
      { installationId, requireIntent: false },
      deps,
    );
  } catch (error) {
    if (error.code === "installation_suspended") {
      await markInstallationSuspended(installationId, workspaceId, deps);
      return {
        ok: true,
        available: true,
        installationId,
        suspended: true,
        repositoryCount: 0,
        repositories: [],
      };
    }
    if (error.code === "installation_not_found") {
      await markInstallationRevoked(installationId, workspaceId, deps);
      return {
        ok: true,
        available: true,
        installationId,
        revoked: true,
        repositoryCount: 0,
        repositories: [],
      };
    }
    throw error;
  }
}

export async function markInstallationRevoked(installationId, workspaceId, deps = REAL) {
  if (!workspaceId) {
    throw Object.assign(new Error("Workspace context is required."), { status: 403 });
  }
  const q = await deps.database();
  await (deps.transaction || (async (items) => Promise.all(items)))([
    q`SELECT pg_advisory_xact_lock(hashtextextended(${String(installationId)}, 0))`,
    q`
    UPDATE ghic_github_installations
    SET revoked_at = now(), connection_status = 'revoked',
        status_reason = 'github_installation_revoked',
        status_changed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId}
      AND workspace_id = ${workspaceId}
      AND connection_status = 'connected'
      AND revoked_at IS NULL`,
    q`
    UPDATE ghic_github_repositories
    SET active = false, removed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId}
      AND workspace_id = ${workspaceId}
      AND EXISTS (
        SELECT 1 FROM ghic_github_installations
        WHERE installation_id = ${installationId}
          AND workspace_id = ${workspaceId}
          AND connection_status = 'revoked'
          AND revoked_at IS NOT NULL
      )`,
  ]);
}

export async function markInstallationSuspended(installationId, workspaceId, deps = REAL) {
  if (!workspaceId) {
    throw Object.assign(new Error("Workspace context is required."), { status: 403 });
  }
  const q = await deps.database();
  await (deps.transaction || (async (items) => Promise.all(items)))([
    q`SELECT pg_advisory_xact_lock(hashtextextended(${String(installationId)}, 0))`,
    q`
    UPDATE ghic_github_installations
    SET connection_status = 'suspended',
        status_reason = 'github_installation_suspended',
        status_changed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId}
      AND workspace_id = ${workspaceId}
      AND connection_status = 'connected'
      AND revoked_at IS NULL`,
    q`
    UPDATE ghic_github_repositories
    SET active = false, removed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId}
      AND workspace_id = ${workspaceId}
      AND EXISTS (
        SELECT 1 FROM ghic_github_installations
        WHERE installation_id = ${installationId}
          AND workspace_id = ${workspaceId}
          AND connection_status = 'suspended'
          AND revoked_at IS NULL
      )`,
  ]);
}

export async function disconnectGitHubInstallation(
  viewer,
  installationIdInput,
  deps = REAL,
) {
  const installationId = Number(installationIdInput);
  if (!Number.isFinite(installationId) || installationId <= 0) {
    throw Object.assign(new Error("Installation id is invalid."), {
      status: 400,
      code: "installation_id_required",
    });
  }
  assertViewerMayConnect(viewer);
  const workspaceId = await workspaceForViewer(viewer, deps);
  const q = await deps.database();
  const rows = await q`
    SELECT installation_id, account_type, account_github_id,
           connected_by_firebase_uid, connected_by_github_id, connection_status
    FROM ghic_github_installations
    WHERE installation_id = ${installationId} AND workspace_id = ${workspaceId}`;
  if (!rows.length) {
    throw Object.assign(new Error("That installation is not connected to GHIC."), {
      status: 404,
      code: "installation_not_connected",
    });
  }
  const row = rows[0];
  const accountType = String(row.account_type || "");
  if (accountType === "User") {
    if (String(row.account_github_id || "") !== String(viewer.githubId)) {
      throw Object.assign(
        new Error("Only the GitHub account owner can disconnect this installation."),
        { status: 403, code: "installation_user_mismatch" },
      );
    }
  } else if (accountType === "Organization") {
    let installation;
    try {
      installation = await deps.fetchInstallation(installationId);
    } catch (error) {
      if (error?.status === 404 || error?.code === "installation_not_found") {
        throw Object.assign(new Error("This GitHub installation no longer exists."), {
          status: 409, code: "installation_revoked",
        });
      }
      throw Object.assign(new Error("GitHub installation verification is unavailable."), {
        status: 502, code: "github_upstream_unavailable", cause: error,
      });
    }
    await assertViewerMayManageInstallation(viewer, installation, deps);
  } else if (row.connected_by_firebase_uid !== viewer.id) {
    throw Object.assign(new Error("You cannot disconnect this GitHub installation."), {
      status: 403,
      code: "installation_forbidden",
    });
  }

  await (deps.transaction || (async (items) => Promise.all(items)))([
    q`SELECT pg_advisory_xact_lock(hashtextextended(${String(installationId)}, 0))`,
    q`
    SELECT workspace_id, role
    FROM ghic_workspace_members
    WHERE workspace_id = ${workspaceId}
      AND firebase_uid = ${viewer.id}
      AND role IN ('owner', 'admin')
    FOR UPDATE`,
    q`
    SELECT 1 / CASE WHEN EXISTS (
      SELECT 1 FROM ghic_workspace_members
      WHERE workspace_id = ${workspaceId}
        AND firebase_uid = ${viewer.id}
        AND role IN ('owner', 'admin')
    ) THEN 1 ELSE 0 END AS membership_guard`,
    q`
    UPDATE ghic_github_installations
    SET connection_status = 'disconnected', status_reason = 'user_disconnected',
        status_changed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId} AND workspace_id = ${workspaceId}
      AND EXISTS (
        SELECT 1 FROM ghic_workspace_members
        WHERE workspace_id = ${workspaceId}
          AND firebase_uid = ${viewer.id}
          AND role IN ('owner', 'admin')
      )`,
    q`
    UPDATE ghic_github_repositories
    SET active = false, removed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId} AND workspace_id = ${workspaceId}
      AND EXISTS (
        SELECT 1 FROM ghic_workspace_members
        WHERE workspace_id = ${workspaceId}
          AND firebase_uid = ${viewer.id}
          AND role IN ('owner', 'admin')
      )`,
  ]);
  return { ok: true, installationId, disconnected: true };
}

export async function syncInstallationRepositories(
  installationId, repos, workspaceId = null, deps = REAL,
) {
  const q = await deps.database();
  workspaceId = await workspaceForInstallation(installationId, workspaceId, deps);
  const names = repos.map((r) => String(r.full_name || "")).filter(Boolean);
  if (names.length) {
    const existing = await q`
      SELECT repo_full_name, installation_id, workspace_id
      FROM ghic_github_repositories
      WHERE repo_full_name = ANY(${names}::text[])`;
    const conflict = existing.find(
      (row) => String(row.installation_id) !== String(installationId)
        || String(row.workspace_id) !== workspaceId,
    );
    if (conflict) {
      throw Object.assign(new Error("Repository is owned by another installation or workspace."), {
        status: 409,
        code: "repository_ownership_conflict",
      });
    }
  }
  const queries = [];
  if (names.length) {
    queries.push(q`
      UPDATE ghic_github_repositories
      SET active = false, removed_at = now(), updated_at = now()
      WHERE installation_id = ${installationId}
        AND workspace_id = ${workspaceId}
        AND repo_full_name <> ALL(${names}::text[])`);
  }
  for (const repo of repos) {
    const fullName = String(repo.full_name || "");
    if (!fullName) continue;
    queries.push(q`
      INSERT INTO ghic_github_repositories (
        repo_full_name, installation_id, workspace_id, github_repo_id, private,
        default_branch, html_url, active, updated_at, removed_at
      ) VALUES (
        ${fullName},
        ${installationId},
        ${workspaceId},
        ${repo.id == null ? null : Number(repo.id)},
        ${Boolean(repo.private)},
        ${repo.default_branch || null},
        ${repo.html_url || null},
        true,
        now(),
        NULL
      )
      ON CONFLICT (repo_full_name) DO UPDATE SET
        github_repo_id = EXCLUDED.github_repo_id,
        private = EXCLUDED.private,
        default_branch = EXCLUDED.default_branch,
        html_url = EXCLUDED.html_url,
        active = true,
        updated_at = now(),
        removed_at = NULL
      WHERE ghic_github_repositories.installation_id = EXCLUDED.installation_id
        AND ghic_github_repositories.workspace_id = EXCLUDED.workspace_id
        `);
  }
  await (deps.transaction || transaction)(queries);
}

export async function deactivateRepository(fullName, workspaceId = null, deps = REAL) {
  const q = await deps.database();
  const rows = await q`
    SELECT r.workspace_id, i.workspace_id AS installation_workspace_id
    FROM ghic_github_repositories r
    JOIN ghic_github_installations i ON i.installation_id = r.installation_id
    WHERE r.repo_full_name = ${fullName}`;
  if (!rows.length || !rows[0].workspace_id ||
      rows[0].workspace_id !== rows[0].installation_workspace_id) {
    throw Object.assign(new Error("Repository is not connected to a consistent workspace."), {
      status: 404,
      code: "repository_not_connected",
    });
  }
  const authoritative = String(rows[0].workspace_id);
  if (workspaceId && String(workspaceId) !== authoritative) {
    throw Object.assign(new Error("Repository does not belong to this workspace."), {
      status: 403,
      code: "workspace_ownership_mismatch",
    });
  }
  await q`
    UPDATE ghic_github_repositories
    SET active = false, removed_at = now(), updated_at = now()
    WHERE repo_full_name = ${fullName} AND workspace_id = ${authoritative}`;
}
