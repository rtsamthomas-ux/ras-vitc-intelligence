# RAS-VITC Intelligence

> Ask anything about the IEEE Robotics & Automation Society student chapter at VIT Chennai, and get answers you can check.


An independent student project, not an official IEEE, IEEE RAS or VIT Chennai product.

## What it is

A retrieval-augmented generation (RAG) assistant. It first **retrieves** passages from a curated set of public sources about the chapter, then asks Gemini to answer **only from that evidence**, with numbered citations that link to the real pages. If the sources don't say something (the current president, next month's event, placement numbers), it says it can't verify it instead of guessing.

The interface is a night sky: a 3D "IEEE RAS Intelligence" title flies in and settles at the top, stars pulse beside a glowing moon, and moving the cursor near a star shows a diffraction pattern whose shape keeps changing, tinted with a subtle VIBGYOR spectrum. The cursor is a small cloud that leaves a smoke trail of varied sizes. The only controls are three shuffle-able sample questions and the question bar (press `/` to type, `Esc` to close an answer).

## Run it

Needs **Node.js 18.18 or newer** (nodejs.org). There are **no npm packages to install** and nothing large to download.

```bash
cp .env.example .env        # Windows: copy .env.example .env
# open .env and paste your key from https://aistudio.google.com/apikey
npm run dev                 # http://localhost:8000
```

Without a key the site still runs: search works and it shows the most relevant source excerpts instead of written answers.

| Command | What it does |
|---|---|
| `npm run dev` | Start the site and restart it when server code changes |
| `npm start` | Start the site (for deployment) |
| `npm test` | 17 tests, no network or API key needed |
| `npm run eval` | Retrieval evaluation on 41 questions (no API calls) |
| `npm run eval:full` | Also asks Gemini each question and checks refusals |

## How it works

```
data/documents/*.md ──► heading-aware chunks (~900 chars, 150 overlap, "[title] section" prefix)
                           │
question ─► follow-up? ─► hybrid search: BM25 keywords (+ Gemini embeddings when a key is set)
                           │  at most 2 chunks per source, top 5 kept
                           ▼
                 relevance gate ── nothing relevant ──► refuse, model never called
                 (needs 2 of the question's words in what was retrieved, or half of a short
                  question's, or a close embedding — a cheap filter, not full scope detection)
                           │
                           ▼
       grounded prompt (rules + <retrieved_context> S1..S5 + question) ──► Gemini
                           │
                           ▼
     citations checked: [S#] that were never retrieved are dropped, the rest become [1], [2] links
```

- **`lib/rag.js`**: loading, chunking, BM25, hybrid ranking, the relevance gate, prompts, citation checking, answer cache. About 350 lines, no dependencies.
- **`lib/gemini.js`**: a small REST client for Gemini (answers and embeddings) with model fallback, retries and friendly error messages.
- **`server.js`**: serves `public/` and three endpoints: `GET /api/status`, `GET /api/questions`, `POST /api/ask`.
- **`public/`**: the website (`index.html`, `style.css`, `app.js`). Canvas 2D and CSS 3D, no libraries.
- **`api/[...path].js`**: a thin wrapper so the same server runs as a Vercel function.

### Efficient use of the API

- One Gemini call per question. Questions that share too little with the sources are refused **without** calling the model. This gate is deliberately cheap: an off-topic question whose words happen to appear in the sources still reaches the model, which refuses it under its grounding rules.
- Chunk embeddings are computed **once** (one batch request) and cached in `data/.cache/embeddings.json`. They are recomputed only for chunks whose text changed.
- Identical questions are answered from an in-memory cache. Each visitor is rate-limited (12 questions a minute by default).
- If Gemini fails (rate limit, network, bad key), the user sees the retrieved excerpts with their sources instead of an error.

### Runs smoothly on all devices

The sky is one canvas. The moon, star glow and smoke are painted once into small images and then just drawn each frame; diffraction is only computed for stars near the cursor. The frame loop pauses when the tab is hidden. If the first three seconds run slowly, the page lowers its resolution and detail automatically. It honours "reduce motion", and uses fewer 3D layers and stars on phones.

## Data sources

Listed in `data/sources.json`, with each source's organisation, type, authority (high, medium or low) and the date it was checked. They include the IEEE RAS website, IEEE VIT Chennai, VIT Chennai's RAS pages, the chapter's recruitment site, an IEEE vTools event record, the chapter's Devfolio pages (HackVerse, RAScade), LinkedIn posts and organiser listings. The notes in `data/documents/` paraphrase what each page says.

To add a source, put a `.md` file in `data/documents/`, add an entry to `sources.json`, and restart. Public Instagram posts you can see yourself go in `data/instagram_sources.json`; Instagram is never scraped.

When sources disagree (for example, RAScade's dates and length), the assistant reports each version with its citation instead of picking one.

## Evaluation

`evaluation/questions.json` has 41 questions in 10 categories, each with the expected sources and whether the assistant should answer or refuse. `npm run eval` measures the retrieval hit rate. `npm run eval:full` also measures refusal behaviour and saves every answer to `evaluation/results.json` for grading by hand. See `evaluation/evaluation.md`. Only quote numbers you have measured yourself.

## Deployment (Vercel, free)

`api/[...path].js` wraps the same server as a serverless function; Vercel serves `public/` from its CDN.

1. Push to a public GitHub repo (check that `git status` doesn't show `.env`).
2. On vercel.com choose *Add New → Project* and pick the repo. No build settings to change.
3. Add `GEMINI_API_KEY` under *Settings → Environment Variables*, then deploy.

Run `npm run eval` locally once before you push, with your key in `.env`. That writes
`data/.cache/embeddings.json`, which is committed on purpose: a deployed function can't write to
disk, so without that file the site re-embeds on every cold start and falls back to keyword search.

Any plain Node host works too (Render, Railway, Fly.io, a VPS): run `node server.js` with
`GEMINI_API_KEY` set, no adapter needed.

## Limitations

- It only knows the public sources listed. There are no current office bearers, member counts or upcoming events. For recruitment it only knows what the public page shows.
- Public pages change. Some VIT links have moved since they were checked, and the Sources notes record this.
- AI text can still be wrong. Open the cited source for anything important.
- Questions are sent to Google's Gemini API. The app stores nothing about users.
