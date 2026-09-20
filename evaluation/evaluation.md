# Evaluation

This file explains **how** the system is evaluated. It contains no scores: report numbers only after you've run the scripts yourself.

## What is measured

| Metric | How | Automatic? |
|---|---|---|
| Retrieval hit rate | Does at least one expected source appear in the 5 chunks sent to the model? | yes (`npm run eval`) |
| Relevance gate | Did the gate let answerable questions through? (`gatePassed` in results) | yes |
| Refusal behaviour | Unanswerable questions refused, answerable ones answered | yes (`npm run eval:full`) |
| Source correctness | Every citation is a chunk that was really retrieved (enforced in code, see `resolveCitations`) | yes |
| Answer correctness | Is every stated fact true according to the cited source? (0-2) | by hand |
| Grounding | Is each factual claim cited, with general knowledge and suggestions labelled? (0-2) | by hand |
| Hallucination | Any unsupported fact? (yes/no) | by hand |

## How to run

```bash
npm run eval         # retrieval only, no API calls
npm run eval:full    # also asks Gemini (about 41 requests, paced for the free tier)
```

Both print a summary and save `evaluation/results.json`. For the manual columns, read each answer next to its cited source.

## Question set

41 questions in 10 categories: basic RAS, VIT-specific, events, robotics, AI/ML, beginner guidance, projects, source verification, unanswerable (must refuse) and multi-document. Each has `expected_behavior` (answer, answer_general, answer_conflict or refuse) and `expected_sources`.
