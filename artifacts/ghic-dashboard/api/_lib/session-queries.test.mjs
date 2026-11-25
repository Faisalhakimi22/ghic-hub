import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const root = fileURLToPath(new URL("../../src/", import.meta.url));
const bundle = await build({
  stdin: { resolveDir: root, loader: "ts", contents: `
    export { createSessionQueryClient } from './lib/session-query-client';
    export { SessionQueries } from './components/session-queries';
    export { setIdentity } from '@/lib/auth';
  ` },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent",
  plugins: [{ name: "session-fixture", setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$|^@tanstack\/react-query$/ }, args => ({ path: require.resolve(args.path), external: true }));
    builder.onResolve({ filter: /^@\/lib\/auth$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ loader: "js", contents:
      "let user = null; export const setIdentity = value => {user = value;}; export const useAuth = () => ({user});" }));
    builder.onResolve({ filter: /^@\/lib\/session-query-client$/ }, () => ({ path: path.join(root, "lib/session-query-client.ts") }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, module, module.exports);
const { createSessionQueryClient, SessionQueries, setIdentity } = module.exports;

test("each identity gets a distinct query and mutation cache", () => {
  const a = createSessionQueryClient();
  const b = createSessionQueryClient();
  try {
    for (const key of [["me"], ["/api/repositories"], ["/api/audit-logs"], ["issue-feedback", "a~repo~1"]]) {
      a.setQueryData(key, { workspaceId: "a", private: "workspace-a-data" });
      assert.equal(b.getQueryData(key), undefined);
    }
    assert.notEqual(a.getMutationCache(), b.getMutationCache());
    assert.notEqual(a.getQueryCache(), b.getQueryCache());
  } finally { a.clear(); b.clear(); }
});

test("actual session boundary keys change synchronously on account switch and logout", () => {
  setIdentity({ uid: "a" });
  const a = SessionQueries({ children: null });
  assert.equal(SessionQueries({ children: null }).key, a.key);
  setIdentity({ uid: "b" });
  const b = SessionQueries({ children: null });
  setIdentity(null);
  const signedOut = SessionQueries({ children: null });
  setIdentity({ uid: "anonymous" });
  const namedAnonymous = SessionQueries({ children: null });
  assert.equal(new Set([a.key, b.key, signedOut.key, namedAnonymous.key]).size, 4);
});

test("a late response from the old identity cannot populate the new client's cache", async () => {
  const a = createSessionQueryClient();
  const b = createSessionQueryClient();
  let complete;
  const pending = a.fetchQuery({ queryKey: ["me"], queryFn: () => new Promise(resolve => { complete = resolve; }) }).catch(() => null);
  a.clear();
  complete({ workspaceId: "a" });
  await pending;
  assert.equal(b.getQueryData(["me"]), undefined);
  assert.equal(a.getQueryData(["me"]), undefined);
  b.clear();
});

test("the application has no module-global product query cache", async () => {
  const app = await readFile(path.join(root, "App.tsx"), "utf8");
  assert.doesNotMatch(app, /new QueryClient/);
  assert.match(app, /<AuthProvider>\s*<SessionQueries>\s*<AppContent/);
  const boundary = await readFile(path.join(root, "components/session-queries.tsx"), "utf8");
  assert.match(boundary, /useState\(createSessionQueryClient\)/);
  assert.match(boundary, /useEffect\(\(\) => \(\) => client\.clear\(\)/);
});
