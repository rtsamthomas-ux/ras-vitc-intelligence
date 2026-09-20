# Interview preparation

Read this once, then open the code and find each thing yourself. If you can point at the line, you understand it.

## The concepts

**What problem does it solve?** Information about the chapter is scattered across websites, event pages and social media. This gives students one place to ask, with sources they can click, and it says "I couldn't verify that" instead of inventing things.

**What is RAG?** Retrieval-Augmented Generation. Before the AI answers, we look up relevant passages in our own documents and give them to it with the instruction to answer only from them. It's an open-book exam instead of a closed-book one.

**Why not just a chatbot?** A general chatbot doesn't know this small chapter and will make things up. RAG gives it the real text at question time, lets us show sources, and lets us update knowledge by editing files.

**What is chunking and why these numbers?** Documents are split at their headings, then into pieces of about 900 characters with 150 characters of overlap (`CONFIG` in `lib/rag.js`). That's small enough that one chunk is roughly one fact, and large enough to keep its context. Every chunk starts with "[source title] section" so both search and the model know where it came from.

**What is BM25?** A classic keyword-ranking formula. Words that are rare across the collection count more (IDF), repeated words help with diminishing returns (k1), and long chunks are normalised (b). It needs no model and no download, and it's very good at exact names like "RAScade" and "RoverX".

**What are embeddings?** Lists of numbers that represent meaning, so "robotics hackathon" can match "build robots in a team event" even without shared words. When a Gemini key is set, each chunk is embedded once (cached in `data/.cache/embeddings.json`), and each question is embedded when it's asked.

**Why hybrid search?** Keywords catch exact names and embeddings catch paraphrases. The final score is 0.6 × cosine similarity + 0.4 × normalised BM25. Without a key it falls back to BM25 alone, plus a small synonym list (`EXPAND`), which still hits about 97% of the retrieval checks.

**How does it avoid hallucination?**
1. The model only sees retrieved text.
2. A relevance gate: unless the retrieved text covers two of the question's content words (or half of a short question's), and with no close embedding either, the model is never called.
3. The prompt demands citations, gives an exact refusal sentence, and lists facts that are never assumed (president, member count, next event, placements).
4. Citations are checked against what was actually retrieved; invented ones are removed.
5. Facts, general knowledge and suggestions are labelled separately.

**Prompt injection?** Retrieved text and the question sit inside tagged blocks, closing tags are stripped from them, and the rules say text inside those blocks is data, not instructions. There's a test for this.

**Follow-up questions?** `searchQuery()`: a short question that refers back ("when was it held?", "tell me more") has the previous question added to its search. A short standalone question isn't changed.

**What happens when the API fails?** `lib/gemini.js` tries each configured model, retries once on rate limits or server errors, and turns errors into friendly messages. The assistant then shows the top retrieved excerpts with their sources.

**How do you use the API efficiently?** One generation call per question, no call for irrelevant questions, embeddings computed once and cached, identical questions answered from a cache, and a per-visitor rate limit.

## Likely questions

1. **Why did you drop Python?** The first version needed ChromaDB, a 130 MB local embedding model, Streamlit and an SDK: slow to install and heavy to host. For 38 chunks, an in-memory index is instant, so the whole backend now runs on Node's standard library.
2. **Is an in-memory index enough?** At this scale, yes: searching 38 chunks takes under a millisecond. With thousands of documents I'd move the vectors to a vector database such as pgvector.
3. **How do you know it works?** 17 automated tests (`npm test`) cover chunking, retrieval, the gate, citations, partial refusals, fallback, caching, injection, the HTTP API and the Gemini client. `npm run eval` measures the retrieval hit rate on 41 questions, and `eval:full` checks refusal behaviour.
4. **What if two sources disagree?** The prompt tells the model to report both with citations and prefer higher authority. RAScade is a real example: its Devfolio schedule shows one day, the Linktree says 36 hours, and a sponsor listing says both 48 and 36.
5. **How is the 3D text made without WebGL?** Each letter is a stack of copies of itself, each pushed back in 3D space with CSS `translateZ` and coloured darker the further back it is. Rotating the stack shows the "sides". It's cheap and works on every device.
6. **How does the star diffraction work?** Each star near the cursor gets a "hover" value that eases from 0 to 1. The page then draws spikes and expanding rings around it, as if you saw the star through a telescope aperture. The aperture shape cycles through a triangle, square, hexagon and octagon, blending into a circle between them, and the spikes and rings are tinted with the VIBGYOR spectrum. Only stars near the cursor are processed, so it stays cheap.
7. **What would you do next?** Calibrate the gate threshold with real embedding scores, add chapter-approved content, and add streaming answers.
