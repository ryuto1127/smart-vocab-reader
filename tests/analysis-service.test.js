import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSelection, createAnalysisService } from "../backend/analysis-service.js";

test("analyzeSelection asks for a shorter selection when the text is too long", async () => {
  const longText = "astonishing ".repeat(600);
  const result = await analyzeSelection({
    selectionText: longText,
    threshold: "B1"
  });

  assert.equal(result.selection_too_long, true);
  assert.equal(result.message, "Please select a shorter text.");
});

test("fallback cards use sentence-based examples and expose the fallback reason", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await analyzeSelection({
    selectionText: "The nationwide blackout crippled the island.",
    threshold: "B1"
  });

  if (previousKey !== undefined) {
    process.env.OPENAI_API_KEY = previousKey;
  }

  assert.equal(result.selection_too_long, false);
  assert.equal(result.meta.fallback_reason, "ai_not_configured");
  assert.ok(result.cards.length > 0);
  assert.ok(result.cards[0].example_simple_en.length > 0);
  assert.notEqual(result.cards[0].example_simple_en, `I saw "${result.cards[0].surface}" in this text.`);
});

test("analyzeSelection includes words above the chosen threshold, not only exact matches", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const result = await analyzeSelection({
    selectionText: "The government moved to abolish the policy in accordance with the new framework.",
    threshold: "B2"
  });

  if (previousKey !== undefined) {
    process.env.OPENAI_API_KEY = previousKey;
  }

  assert.equal(result.selection_too_long, false);
  assert.deepEqual(
    result.cards.map((card) => `${card.lemma}:${card.cefr}`),
    ["abolish:C1", "accordance:C1", "framework:B2"]
  );
});

test("analysis service keeps higher lexical CEFR instead of flattening everything to the threshold", async () => {
  const service = createAnalysisService({
    env: {
      OPENAI_API_KEY: "test-key"
    },
    isAiConfiguredImpl: () => true,
    analyzeCandidatesWithAiImpl: async ({ candidates }) => ({
      cards: candidates.map((candidate) => ({
        same_context_key: candidate.sameContextKey,
        surface: candidate.surface,
        lemma: candidate.lemma,
        cefr: "B2",
        part_of_speech: candidate.partOfSpeechHints[0] ?? "word",
        definition_simple_en: "a simple meaning",
        example_simple_en: "a simple example"
      }))
    })
  });

  const result = await service.analyzeSelection({
    selectionText: "The government moved to abolish the policy in accordance with the new framework.",
    threshold: "B2"
  });

  assert.equal(result.selection_too_long, false);
  assert.deepEqual(
    result.cards.map((card) => `${card.lemma}:${card.cefr}`),
    ["abolish:C1", "accordance:C1", "framework:B2"]
  );
});
