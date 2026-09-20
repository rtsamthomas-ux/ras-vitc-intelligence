// Evaluation: `npm run eval` (retrieval only, no API calls) or `npm run eval:full` (also asks Gemini).
// Writes evaluation/results.json and prints a summary. Grade answer correctness by hand from results.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSources, chunkDocs, Index, Assistant, loadOrBuildEmbeddings } from "../lib/rag.js";
import { createGemini } from "../lib/gemini.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.existsSync(path.join(ROOT, ".env")) ? fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/) : []) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const full = process.argv.includes("--full");
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, "evaluation", "questions.json"), "utf8"));
const chunks = chunkDocs(loadSources(path.join(ROOT, "data")));
const index = new Index(chunks);
const llm = createGemini();

if (llm.available()) {
  try {
    const { vectors } = await loadOrBuildEmbeddings(chunks, llm, path.join(ROOT, "data", ".cache", "embeddings.json"));
    index.attachEmbeddings(vectors);
  } catch (e) { console.log(`(embeddings unavailable: ${e.userMessage || e.message}; keyword search only)`); }
}
if (full && !llm.available()) { console.log("--full needs GEMINI_API_KEY in .env"); process.exit(1); }

const embedQuery = index.vectors ? async (q) => (await llm.embed([q], "query"))[0] : null;
const bot = new Assistant(index, llm);
const rows = [];
for (const q of questions) {
  const r = await index.retrieve(q.question, [], embedQuery);
  const got = r.chunks.map((c) => c.meta.id);
  const row = { id: q.id, category: q.category, question: q.question, expected: q.expected_behavior,
    hit: q.expected_sources.length ? q.expected_sources.some((s) => got.includes(s)) : null, gatePassed: r.relevant, retrieved: got };
  if (full) {
    const a = await bot.ask(q.question);
    Object.assign(row, { answer: a.text, refused: !!a.refused, cited: (a.sources || []).map((s) => s.id), model: a.model, error: a.error });
    row.refusalOk = q.expected_behavior === "refuse" ? row.refused : !row.refused;
    await new Promise((res) => setTimeout(res, 1200)); // stay well under free-tier rate limits
  }
  rows.push(row);
  console.log(`${q.id.padEnd(4)} ${row.hit === null ? " n/a" : row.hit ? " hit" : "MISS"}  ${q.question}${full ? `  -> ${row.refused ? "refused" : "answered"}` : ""}`);
}

const withSources = rows.filter((r) => r.hit !== null);
const summary = {
  mode: index.vectors ? "hybrid" : "keyword",
  retrievalHitRate: +(withSources.filter((r) => r.hit).length / withSources.length).toFixed(3),
  questions: rows.length,
  ...(full ? { refusalBehaviourCorrect: +(rows.filter((r) => r.refusalOk).length / rows.length).toFixed(3) } : {}),
};
fs.writeFileSync(path.join(ROOT, "evaluation", "results.json"), JSON.stringify({ summary, rows }, null, 2));
console.log("\n", summary, "\nSaved evaluation/results.json");
