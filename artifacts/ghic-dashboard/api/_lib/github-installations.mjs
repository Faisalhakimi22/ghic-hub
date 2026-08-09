import { database } from "./db.mjs";
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
  fetchInstallation,
  fetchGitHubUserById,
  githubAppConfigured,
  listInstallationRepositories,
  verifyOrgMembership,
};

export const GITHUB_APP_SLUG =
  process.env.GHIC_GITHUB_APP_SLUG || "ghic-github-issue-intelligence";

export function githubInstallUrl() {
  return `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new`;
}

export async function getGitHubConnectionSummary(deps = REAL) {
  const q = await deps.database();
  const rows = await q`
    SELECT
      installation_id,
      account_login,
      account_type,
      repository_selection,
      connected_at,
      revoked_at,
      (SELECT count(*)::int FROM ghic_github_repositories r
       WHERE r.installation_id = ghic_github_installations.installation_id
         AND r.active = true) AS repository_count
    FROM ghic_github_installations
    WHERE revoked_at IS NULL
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
    })),
  };
}

function assertViewerMayConnect(viewer) {
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
 * This only applies to personal (User) installations, where "the account
 * owner" is exactly one person and a second claimant is therefore an
 * invariant violation worth surfacing. Organization installations are
 * deliberately allowed to transfer between claimants: every caller that
 * reaches here has already proved active admin membership of that org via
 * GitHub, so a second org admin re-running setup is a legitimate action,
 * not a conflict. Blocking it would strand an organization whose original
 * connector left.
 *
 * Re-connecting the same installation as the same actor is a no-op upsert,
 * which is what makes a duplicate installation idempotent rather than an
 * error.
 */
async function assertInstallationNotLinkedToOtherActor(
  q,
  installationId,
  viewer,
  installation,
) {
  if (String(installation?.account?.type || "") !== "User") return;
  const existing = await q`
    SELECT connected_by_firebase_uid, connected_by_github_id, revoked_at
    FROM ghic_github_installations
    WHERE installation_id = ${installationId}`;
  if (!existing.length || existing[0].revoked_at) return;
  const row = existing[0];
  if (
    row.connected_by_firebase_uid !== viewer.id &&
    row.connected_by_github_id &&
    row.connected_by_github_id !== String(viewer.githubId)
  ) {
    throw Object.assign(
      new Error(
        "This GitHub installation is already linked to another GHIC workspace member.",
      ),
      { status: 409, code: "installation_already_linked" },
    );
  }
}

export async function completeGitHubInstallation(
  viewer,
  input = {},
  deps = REAL,
) {
  if (!deps.githubAppConfigured()) {
    throw Object.assign(new Error("GitHub App credentials are not configured."), {
      status: 503,
      code: "github_app_not_configured",
    });
  }

  const setupAction = String(input.setupAction || input.setup_action || "").toLowerCase();
  if (setupAction === "cancel") {
    return { ok: true, cancelled: true, available: true };
  }

  const installationId = Number(input.installationId ?? input.installation_id);
  if (!Number.isFinite(installationId) || installationId <= 0) {
    throw Object.assign(new Error("installationId is required."), {
      status: 400,
      code: "installation_id_required",
    });
  }

  assertViewerMayConnect(viewer);

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

  await q`
    INSERT INTO ghic_github_installations (
      installation_id, account_login, account_type, account_github_id,
      repository_selection, connected_by_firebase_uid, connected_by_github_id,
      updated_at, revoked_at
    ) VALUES (
      ${installationId},
      ${String(account.login || "")},
      ${String(account.type || "")},
      ${account.id == null ? null : Number(account.id)},
      ${installation.repository_selection || null},
      ${viewer.id},
      ${String(viewer.githubId)},
      now(),
      NULL
    )
    ON CONFLICT (installation_id) DO UPDATE SET
      account_login = EXCLUDED.account_login,
      account_type = EXCLUDED.account_type,
      account_github_id = EXCLUDED.account_github_id,
      repository_selection = EXCLUDED.repository_selection,
      connected_by_firebase_uid = EXCLUDED.connected_by_firebase_uid,
      connected_by_github_id = EXCLUDED.connected_by_github_id,
      updated_at = now(),
      revoked_at = NULL`;

  const repoNames = repos.map((repo) => String(repo.full_name || "")).filter(Boolean);
  if (repoNames.length) {
    await q`
      UPDATE ghic_github_repositories
      SET active = false, removed_at = now(), updated_at = now()
      WHERE installation_id = ${installationId}
        AND repo_full_name <> ALL(${repoNames}::text[])`;
  } else {
    await q`
      UPDATE ghic_github_repositories
      SET active = false, removed_at = now(), updated_at = now()
      WHERE installation_id = ${installationId}`;
  }

  for (const repo of repos) {
    const fullName = String(repo.full_name || "");
    if (!fullName) continue;
    await q`
      INSERT INTO ghic_github_repositories (
        repo_full_name, installation_id, github_repo_id, private,
        default_branch, html_url, active, updated_at, removed_at
      ) VALUES (
        ${fullName},
        ${installationId},
        ${repo.id == null ? null : Number(repo.id)},
        ${Boolean(repo.private)},
        ${repo.default_branch || null},
        ${repo.html_url || null},
        true,
        now(),
        NULL
      )
      ON CONFLICT (repo_full_name) DO UPDATE SET
        installation_id = EXCLUDED.installation_id,
        github_repo_id = EXCLUDED.github_repo_id,
        private = EXCLUDED.private,
        default_branch = EXCLUDED.default_branch,
        html_url = EXCLUDED.html_url,
        active = true,
        updated_at = now(),
        removed_at = NULL`;
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

  const q = await deps.database();
  const existing = await q`
    SELECT installation_id FROM ghic_github_installations
    WHERE installation_id = ${installationId} AND revoked_at IS NULL`;
  if (!existing.length) {
    throw Object.assign(
      new Error("That installation is not connected to this workspace."),
      { status: 404, code: "installation_not_connected" },
    );
  }

  try {
    return await completeGitHubInstallation(viewer, { installationId }, deps);
  } catch (error) {
    if (error.code === "installation_not_found") {
      await markInstallationRevoked(installationId, deps);
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

export async function markInstallationRevoked(installationId, deps = REAL) {
  const q = await deps.database();
  await q`
    UPDATE ghic_github_installations
    SET revoked_at = now(), updated_at = now()
    WHERE installation_id = ${installationId}`;
  await q`
    UPDATE ghic_github_repositories
    SET active = false, removed_at = now(), updated_at = now()
    WHERE installation_id = ${installationId}`;
}

export async function syncInstallationRepositories(installationId, repos) {
  const q = await database();
  const names = repos.map((r) => String(r.full_name || "")).filter(Boolean);
  if (names.length) {
    await q`
      UPDATE ghic_github_repositories
      SET active = false, removed_at = now(), updated_at = now()
      WHERE installation_id = ${installationId}
        AND repo_full_name <> ALL(${names}::text[])`;
  }
  for (const repo of repos) {
    const fullName = String(repo.full_name || "");
    if (!fullName) continue;
    await q`
      INSERT INTO ghic_github_repositories (
        repo_full_name, installation_id, github_repo_id, private,
        default_branch, html_url, active, updated_at, removed_at
      ) VALUES (
        ${fullName},
        ${installationId},
        ${repo.id == null ? null : Number(repo.id)},
        ${Boolean(repo.private)},
        ${repo.default_branch || null},
        ${repo.html_url || null},
        true,
        now(),
        NULL
      )
      ON CONFLICT (repo_full_name) DO UPDATE SET
        installation_id = EXCLUDED.installation_id,
        github_repo_id = EXCLUDED.github_repo_id,
        private = EXCLUDED.private,
        default_branch = EXCLUDED.default_branch,
        html_url = EXCLUDED.html_url,
        active = true,
        updated_at = now(),
        removed_at = NULL`;
  }
}

export async function deactivateRepository(fullName) {
  const q = await database();
  await q`
    UPDATE ghic_github_repositories
    SET active = false, removed_at = now(), updated_at = now()
    WHERE repo_full_name = ${fullName}`;
}
