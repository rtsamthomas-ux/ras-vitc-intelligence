// Minimal Gemini REST client (uses Node's built-in fetch; no SDK needed).
const API = "https://generativelanguage.googleapis.com/v1beta/models";

const MESSAGES = {
  invalid_key: "The Gemini API key was rejected. Check GEMINI_API_KEY in your .env file.",
  rate_limit: "The Gemini API is rate-limited right now. Wait a minute and try again.",
  server: "The Gemini service is temporarily unavailable. Please try again shortly.",
  network: "Could not reach the Gemini API. Check the internet connection.",
  model_not_found: "None of the configured Gemini models is available. Set GEMINI_MODEL to a current model name.",
  empty: "The AI model returned an empty answer. Please rephrase and try again.",
  unknown: "The AI model could not answer right now. Please try again.",
};

class GeminiError extends Error {
  constructor(kind, detail) {
    super(detail || kind);
    this.kind = kind;
    this.userMessage = MESSAGES[kind] || MESSAGES.unknown;
  }
}

const kindOf = (status, body) => {
  const t = String(body).toLowerCase();
  if (status === 401 || status === 403 || t.includes("api key not valid") || t.includes("api_key_invalid")) return "invalid_key";
  if (status === 429 || t.includes("resource_exhausted") || t.includes("quota")) return "rate_limit";
  if (status === 404 || t.includes("not_found") || t.includes("is not found")) return "model_not_found";
  if (status >= 500) return "server";
  if (status === 400 && t.includes("api key")) return "invalid_key";
  return "unknown";
};

export function createGemini({
  apiKey = process.env.GEMINI_API_KEY,
  models = (process.env.GEMINI_MODEL || "gemini-3.6-flash,gemini-3.5-flash,gemini-3.1-flash-lite").split(",").map((m) => m.trim()).filter(Boolean),
  embedModel = process.env.EMBEDDING_MODEL || "gemini-embedding-2",
  timeoutMs = 30000,
} = {}) {
  if (!apiKey || /your_key|placeholder/i.test(apiKey)) apiKey = ""; // .env.example value = no key
  let working = null; // remember the first model that answers, so later calls skip dead ones

  async function call(url, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new GeminiError(kindOf(res.status, text), `${res.status} ${text.slice(0, 300)}`);
      return JSON.parse(text);
    } catch (e) {
      if (e instanceof GeminiError) throw e;
      throw new GeminiError("network", e.message);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    embedModel,
    available: () => Boolean(apiKey),

    async generate(system, prompt, { maxTokens = 4096 } = {}) {
      if (!apiKey) throw new GeminiError("invalid_key", "missing key");
      const body = {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens }, // Gemini 3 models count their reasoning here, so leave headroom
      };
      const order = working ? [working, ...models.filter((m) => m !== working)] : models;
      let last = "model_not_found";
      for (const model of order) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const data = await call(`${API}/${model}:generateContent`, body);
            const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("").trim();
            if (!text) throw new GeminiError("empty");
            working = model;
            return { text, model };
          } catch (e) {
            last = e.kind || "unknown";
            if (last === "model_not_found") break; // try the next model
            if ((last === "rate_limit" || last === "server" || last === "network") && attempt === 1) {
              await new Promise((r) => setTimeout(r, 1500));
              continue;
            }
            throw e;
          }
        }
      }
      throw new GeminiError(last);
    },

    /** kind: "document" | "query". Returns one vector per text. */
    async embed(texts, kind = "document") {
      if (!apiKey) throw new GeminiError("invalid_key", "missing key");
      const requests = texts.map((t) => ({
        model: `models/${embedModel}`,
        content: { parts: [{ text: kind === "query" ? `task: search result | query: ${t}` : t }] },
        output_dimensionality: 768,
      }));
      const data = await call(`${API}/${embedModel}:batchEmbedContents`, { requests });
      return data.embeddings.map((e) => e.values);
    },
  };
}
