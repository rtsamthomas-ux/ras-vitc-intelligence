// RAS-VITC Intelligence — web server. Zero dependencies: `npm run dev` or `node server.js`.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { loadSources, chunkDocs, Index, Assistant, loadOrBuildEmbeddings } from "./lib/rag.js";
import { createGemini } from "./lib/gemini.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
loadEnv(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT) || 8000;
const RATE_LIMIT = Number(process.env.RATE_LIMIT_PER_MINUTE) || 12;
const PUBLIC = path.join(ROOT, "public");

// Sample questions shown three at a time (the shuffle button picks another three).
export const QUESTIONS = [
  "What is IEEE RAS?",
  "What does RAS VIT Chennai do?",
  "Tell me about HackVerse.",
  "Is RAS VIT Chennai recruiting?",
  "How long is RAScade?",
  "What is RoverX?",
  "When was the IoT in Robotics session held?",
  "I'm a first-year CSE student. How can I get started?",
  "What is the current RAS president?",
  "Suggest a beginner robotics project.",
  "What is the difference between robotics and automation?",
  "Which RAS events were part of TechnoVIT?",
];

// ------------------------------------------------------------------ build the assistant
export async function createApp({ llm = createGemini(), dataDir = path.join(ROOT, "data"), embeddings = true } = {}) {
  const chunks = chunkDocs(loadSources(dataDir));
  const index = new Index(chunks);
  const assistant = new Assistant(index, llm);
  const state = { chunks: chunks.length, sources: new Set(chunks.map((c) => c.meta.id)).size, retrieval: "keyword (BM25)", note: "" };

  // Semantic search is optional: embed the chunks once (cached on disk), keyword search works meanwhile.
  if (embeddings && llm.available() && llm.embed) {
    loadOrBuildEmbeddings(chunks, llm, path.join(dataDir, ".cache", "embeddings.json"))
      .then(({ vectors, embedded }) => {
        index.attachEmbeddings(vectors);
        state.retrieval = "hybrid (BM25 + Gemini embeddings)";
        console.log(`[rag] embeddings ready (${embedded ? `${embedded} new` : "all cached"})`);
      })
      .catch((e) => {
        state.note = "Embeddings unavailable, using keyword search only.";
        console.warn(`[rag] embeddings skipped: ${e.userMessage || e.message}`);
      });
  }
  return { assistant, state, handler: makeHandler(assistant, state, llm) };
}

// ------------------------------------------------------------------ HTTP
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon", ".json": "application/json" };
const hits = new Map();

function makeHandler(assistant, state, llm) {
  return async (req, res) => {
    const url = new URL(req.url, "http://x");
    try {
      if (url.pathname === "/api/status" && req.method === "GET") {
        return json(res, 200, { ...state, llm: llm.available() });
      }
      if (url.pathname === "/api/questions" && req.method === "GET") {
        return json(res, 200, { questions: QUESTIONS });
      }
      if (url.pathname === "/api/ask" && req.method === "POST") {
        if (limited(req)) return json(res, 429, { error: "You're asking very quickly. Please wait a few seconds." });
        const body = await readJson(req);
        const question = String(body.question || "").trim();
        if (!question || question.length > 600) return json(res, 400, { error: "Ask a question of up to 600 characters." });
        const history = (Array.isArray(body.history) ? body.history : [])
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
        return json(res, 200, await assistant.ask(question, history));
      }
      if (url.pathname.startsWith("/api/")) return json(res, 404, { error: "Not found." });
      if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { error: "Method not allowed." });
      return serveStatic(req, res, url.pathname);
    } catch (e) {
      console.error("[server]", e);
      return json(res, e.status || 500, { error: e.status ? e.message : "Something went wrong on the server." });
    }
  };
}

function limited(req) {
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "?").split(",")[0].trim();
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT;
}

function readJson(req) {
  // Some hosts (Vercel) parse the body and consume the stream before we see the request.
  if (req.body !== undefined && req.body !== null) {
    try { return Promise.resolve(typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body); }
    catch { return Promise.reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); }
  }
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 20000) { reject(Object.assign(new Error("Request too large."), { status: 413 })); req.destroy(); }
    });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { reject(Object.assign(new Error("Invalid JSON."), { status: 400 })); } });
  });
}

function json(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}

const gzCache = new Map();
function serveStatic(req, res, pathname) {
  const rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!(file + path.sep).startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  const ext = path.extname(file);
  const headers = { "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" || !process.env.PORT ? "no-cache" : "public, max-age=86400" };
  let body = fs.readFileSync(file);
  if (/\.(html|js|css|svg|json)$/.test(ext) && /gzip/.test(req.headers["accept-encoding"] || "")) {
    const key = `${file}:${fs.statSync(file).mtimeMs}`;
    if (!gzCache.has(key)) gzCache.set(key, zlib.gzipSync(body));
    body = gzCache.get(key);
    headers["Content-Encoding"] = "gzip";
  }
  headers["Content-Length"] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : body);
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#") && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ------------------------------------------------------------------ start
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { handler, state } = await createApp();
  http.createServer(handler).listen(PORT, () => {
    console.log(`\n  IEEE RAS Intelligence  →  http://localhost:${PORT}`);
    console.log(`  ${state.chunks} chunks from ${state.sources} sources · Gemini ${process.env.GEMINI_API_KEY ? "on" : "OFF (add GEMINI_API_KEY to .env)"}\n`);
  });
}
