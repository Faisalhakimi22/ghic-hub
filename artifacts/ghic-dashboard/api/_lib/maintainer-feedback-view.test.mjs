import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const source = new URL("../../src/components/maintainer-feedback.tsx", import.meta.url);

async function render({ role = "owner", analysisId = "1", history = { data: { items: [], analysisId: "1" } }, mutation = {} } = {}) {
  const bundle = await build({
    stdin: { contents: await readFile(source, "utf8"), sourcefile: source.pathname, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", logLevel: "silent",
    plugins: [{ name: "offline-feedback-fixtures", setup(builder) {
      builder.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({ path: require.resolve(args.path), external: true }));
      builder.onResolve({ filter: /^@\/lib\// }, (args) => ({ path: args.path, namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({ loader: "js", contents:
        args.path.endsWith("account")
          ? `export const useCurrentAccount = () => ({data: {role: ${JSON.stringify(role)}}});
             export const useDashboardDate = () => value => value;`
          : `export const useIssueFeedback = () => (${JSON.stringify(history)});
             export const useSaveIssueFeedback = () => ({reset(){}, mutate(){}, ...${JSON.stringify(mutation)}});`,
      }));
    } }],
  });
  const module = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, module, module.exports);
  return renderToStaticMarkup(React.createElement(module.exports.MaintainerFeedback, { id: "a~repo~1", analysisId, onReload() {} }));
}

test("maintainer review renders real empty state and accessible decision controls", async () => {
  const html = await render();
  assert.match(html, /No maintainer decisions yet/);
  assert.match(html, /type="radio"/);
  assert.match(html, /Correct classification/);
  assert.match(html, /Save decision/);
  assert.match(html, /maxLength="1000"/);
});

for (const role of ["member", "viewer"]) {
  test(`${role} can read decisions but has no write controls`, async () => {
    const html = await render({ role });
    assert.doesNotMatch(html, /<form|Save decision/);
    assert.match(html, /An owner or admin/);
  });
}

test("stale analysis requires reload instead of applying a decision to unseen analysis", async () => {
  const html = await render({ history: { data: { items: [], analysisId: "2" } } });
  assert.doesNotMatch(html, /<form|Save decision/);
  assert.match(html, /Reload issue/);
});

test("an issue without a completed analysis cannot be reviewed", async () => {
  const html = await render({ analysisId: null, history: { data: { items: [], analysisId: null } } });
  assert.doesNotMatch(html, /<form|Save decision/);
  assert.match(html, /No completed analysis/);
});

test("history escapes maintainer text and identifies earlier analyses", async () => {
  const html = await render({ history: { data: { analysisId: "1", items: [{
    id: "3", analysisId: "0", decision: "rejected", classification: null,
    reason: '<script>alert("fixture")</script>', actor: "Alice", createdAt: "2026-09-22",
  }] } } });
  assert.match(html, /Earlier analysis/);
  assert.match(html, /Recommendation rejected/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test("history errors offer retry without pretending history is empty", async () => {
  const html = await render({ history: { isError: true } });
  assert.match(html, /Decisions could not be loaded/);
  assert.match(html, /Retry/);
  assert.doesNotMatch(html, /No maintainer decisions yet/);
  assert.match(html, /disabled/);
});

test("pending and successful decisions have honest submission states", async () => {
  assert.match(await render({ mutation: { isPending: true } }), /Saving\.\.\./);
  const saved = await render({ mutation: { isSuccess: true } });
  assert.match(saved, /Decision recorded/);
  assert.match(saved, /type="submit" disabled/);
});
