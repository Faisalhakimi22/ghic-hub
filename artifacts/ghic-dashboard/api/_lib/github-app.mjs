/**
 * Server-side GitHub App client (JWT → installation token).
 * Credentials never leave this module.
 */
import { readFileSync } from "node:fs";
import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";

const API = "https://api.github.com";
const JWT_LIFETIME_S = 540;
const TOKEN_MARGIN_S = 120;

let _privateKeyPem = null;
let _appId = null;

export function githubAppConfigured() {
  return Boolean(resolveAppId() && resolvePrivateKeyPem());
}

function resolveAppId() {
  if (_appId) return _appId;
  const raw = process.env.GHIC_APP_ID || process.env.GITHUB_APP_ID || "";
  _appId = raw.trim() || null;
  return _appId;
}

function resolvePrivateKeyPem() {
  if (_privateKeyPem) return _privateKeyPem;
  const inline = process.env.GHIC_PRIVATE_KEY || process.env.GITHUB_PRIVATE_KEY || "";
  if (inline.trim()) {
    _privateKeyPem = inline.replace(/\\n/g, "\n");
    return _privateKeyPem;
  }
  const path = process.env.GHIC_PRIVATE_KEY_PATH || process.env.GITHUB_PRIVATE_KEY_PATH || "";
  if (path.trim()) {
    _privateKeyPem = readFileSync(path.trim(), "utf8");
    return _privateKeyPem;
  }
  return null;
}

async function appJwt() {
  const appId = resolveAppId();
  const pem = resolvePrivateKeyPem();
  if (!appId || !pem) {
    const error = new Error("GitHub App credentials are not configured.");
    error.status = 503;
    error.code = "github_app_not_configured";
    throw error;
  }
  const now = Math.floor(Date.now() / 1000);
  const key = createPrivateKey(pem);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt(now - 60)
    .setExpirationTime(now + JWT_LIFETIME_S)
    .setIssuer(appId)
    .sign(key);
}

const installationTokens = new Map();

async function installationToken(installationId) {
  const id = Number(installationId);
  if (!Number.isFinite(id) || id <= 0) {
    throw Object.assign(new Error("Installation id is invalid."), { status: 400 });
  }
  const cached = installationTokens.get(id);
  if (cached && cached.expires - TOKEN_MARGIN_S > Date.now() / 1000) {
    return cached.token;
  }
  const jwt = await appJwt();
  const response = await fetch(`${API}/app/installations/${id}/access_tokens`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (response.status === 404) {
    throw Object.assign(new Error("GitHub installation was not found."), {
      status: 404,
      code: "installation_not_found",
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error("GitHub could not authorize this installation."), {
      status: 502,
      code: "github_api_error",
    });
  }
  const data = await response.json();
  installationTokens.set(id, {
    token: data.token,
    expires: Date.now() / 1000 + 55 * 60,
  });
  return data.token;
}

async function appRequest(path) {
  const jwt = await appJwt();
  const response = await fetch(`${API}${path}`, {
    headers: {
      authorization: `Bearer ${jwt}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    },
  });
  return response;
}

async function installationRequest(path, installationId, init = {}) {
  const token = await installationToken(installationId);
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  return response;
}

export async function fetchInstallation(installationId) {
  const response = await appRequest(`/app/installations/${installationId}`);
  if (response.status === 404) {
    throw Object.assign(new Error("GitHub installation was not found."), {
      status: 404,
      code: "installation_not_found",
    });
  }
  if (!response.ok) {
    throw Object.assign(new Error("GitHub installation lookup failed."), {
      status: 502,
      code: "github_api_error",
    });
  }
  return response.json();
}

export async function fetchGitHubUserById(githubUserId) {
  const response = await appRequest(`/user/${githubUserId}`);
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return response.json();
}

export async function listInstallationRepositories(installationId) {
  const repos = [];
  let page = 1;
  for (;;) {
    const response = await installationRequest(
      `/installation/repositories?per_page=100&page=${page}`,
      installationId,
    );
    if (response.status === 404) {
      throw Object.assign(new Error("GitHub installation was not found."), {
        status: 404,
        code: "installation_not_found",
      });
    }
    if (response.status === 403) {
      throw Object.assign(
        new Error("GHIC cannot access repositories for this installation."),
        { status: 403, code: "installation_forbidden" },
      );
    }
    if (!response.ok) {
      throw Object.assign(new Error("GitHub repository listing failed."), {
        status: 502,
        code: "github_api_error",
      });
    }
    const data = await response.json();
    const batch = Array.isArray(data.repositories) ? data.repositories : [];
    repos.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return repos;
}

export async function verifyOrgMembership(installationId, orgLogin, githubLogin) {
  const response = await installationRequest(
    `/orgs/${encodeURIComponent(orgLogin)}/memberships/${encodeURIComponent(githubLogin)}`,
    installationId,
  );
  if (response.status === 404) return false;
  if (!response.ok) return false;
  const data = await response.json();
  const role = String(data.role || "").toLowerCase();
  const state = String(data.state || "").toLowerCase();
  return state === "active" && (role === "admin" || role === "maintain");
}
