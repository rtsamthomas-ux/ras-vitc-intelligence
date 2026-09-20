# Two-minute demo

1. **Open the site.** "The 3D title assembles, then settles at the top. Move the cursor near a star: it shows a diffraction pattern that keeps changing shape, tinted with the spectrum."
2. **Click a sample question**, e.g. *Tell me about HackVerse.* "It retrieves passages first, then Gemini answers only from them. Each number is a citation that opens the real page."
3. **Ask** *What is the current RAS president?* "A normal chatbot would invent a name. The sources don't say, so it refuses."
4. **Ask** *How long is RAScade?* "The sources disagree, and it shows each version with its source."
5. **Shuffle** the sample questions. "The pool covers events, recruitment, getting started and questions it should refuse."
6. **Code, briefly:** `lib/rag.js` is the whole pipeline in one file with no dependencies. `npm test` runs 17 tests.
