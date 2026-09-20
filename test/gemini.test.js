// The Gemini client, tested against a fake fetch (no network).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGemini } from "../lib/gemini.js";

function withFetch(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body), key: opts.headers["x-goog-api-key"] }); return handler(url, calls.length); };
  return fn(calls).finally(() => (globalThis.fetch = real));
}
const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

test("skips a retired model and answers with the next one", () =>
  withFetch((url) => url.includes("old-model") ? reply(404, { error: { status: "NOT_FOUND" } })
    : reply(200, { candidates: [{ content: { parts: [{ text: "Hello [S1]" }] } }] }), async (calls) => {
    const g = createGemini({ apiKey: "k", models: ["old-model", "new-model"] });
    const out = await g.generate("sys", "prompt");
    assert.deepEqual(out, { text: "Hello [S1]", model: "new-model" });
    assert.equal(calls[1].body.systemInstruction.parts[0].text, "sys");
    assert.equal(calls[1].key, "k");
  }));

test("a bad key becomes a friendly error", () =>
  withFetch(() => reply(400, { error: { message: "API key not valid" } }), async () => {
    const g = createGemini({ apiKey: "bad", models: ["m"] });
    await assert.rejects(g.generate("s", "p"), (e) => e.kind === "invalid_key" && /GEMINI_API_KEY/.test(e.userMessage));
  }));

test("the placeholder key from .env.example counts as no key", () => {
  assert.equal(createGemini({ apiKey: "your_key_here" }).available(), false);
});

test("batch embeddings send one request for many texts", () =>
  withFetch(() => reply(200, { embeddings: [{ values: [1, 0] }, { values: [0, 1] }] }), async (calls) => {
    const g = createGemini({ apiKey: "k", embedModel: "gemini-embedding-2" });
    const v = await g.embed(["a", "b"], "document");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].body.requests.length, 2);
    assert.deepEqual(v, [[1, 0], [0, 1]]);
  }));
