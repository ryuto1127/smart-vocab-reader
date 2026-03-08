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
  assert.ok(result.cards.every((card) => card.content_source === "fallback"));
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
    cache: new Map(),
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

test("analyzeSelection does not reject a moderate passage just because it creates more than one AI batch", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const selectionText = `Thrilled by this sudden increase in sales, the company decided to formally implement the programme. In 1963 the "Women's Delivery Sales Network" - now known as the Yakult Lady system - was formally established.

Yakult Ladies are easy to spot in the community. In their blue uniforms with signature red plaid trim, they've become almost as recognisable as the Yakult bottles themselves. They're often seen whizzing about their neighbourhoods on bikes, motorbikes, on foot or by car, making multiple deliveries each day. Most of them are self-employed, offering flexibility that attracts women balancing work and family.`;
  const result = await analyzeSelection({
    selectionText,
    threshold: "B1"
  });

  if (previousKey !== undefined) {
    process.env.OPENAI_API_KEY = previousKey;
  }

  assert.equal(result.selection_too_long, false);
  assert.equal(result.meta.candidate_count, 24);
  assert.equal(result.meta.batch_count, 2);
  assert.ok(result.cards.length > 0);
});

test("analysis service keeps higher-level lexicon words even when the AI omits them", async () => {
  const service = createAnalysisService({
    cache: new Map(),
    env: {
      OPENAI_API_KEY: "test-key"
    },
    isAiConfiguredImpl: () => true,
    analyzeCandidatesWithAiImpl: async ({ candidates }) => ({
      cards: candidates
        .filter((candidate) => candidate.lemma === "framework")
        .map((candidate) => ({
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
    threshold: "B1"
  });

  assert.equal(result.selection_too_long, false);
  assert.equal(result.meta.fallback_reason, "ai_partial_results");
  assert.deepEqual(
    result.cards.map((card) => `${card.lemma}:${card.cefr}`),
    ["abolish:C1", "policy:B1", "accordance:C1", "framework:B2"]
  );
});

test("analysis service keeps successful AI batches when another batch fails", async () => {
  let batchIndex = 0;
  const service = createAnalysisService({
    cache: new Map(),
    env: {
      OPENAI_API_KEY: "test-key"
    },
    isAiConfiguredImpl: () => true,
    analyzeCandidatesWithAiImpl: async ({ candidates }) => {
      batchIndex += 1;

      if (batchIndex === 2) {
        throw new Error("Timed out");
      }

      return {
        cards: candidates.map((candidate) => ({
          same_context_key: candidate.sameContextKey,
          surface: candidate.surface,
          lemma: candidate.lemma,
          cefr: candidate.lexicalCefr ?? "B1",
          part_of_speech: candidate.partOfSpeechHints[0] ?? "word",
          definition_simple_en: "AI meaning loaded.",
          example_simple_en: "AI example loaded."
        }))
      };
    }
  });

  const selectionText = `Thrilled by this sudden increase in sales, the company decided to formally implement the programme. In 1963 the "Women's Delivery Sales Network" - now known as the Yakult Lady system - was formally established.

Yakult Ladies are easy to spot in the community. In their blue uniforms with signature red plaid trim, they've become almost as recognisable as the Yakult bottles themselves. They're often seen whizzing about their neighbourhoods on bikes, motorbikes, on foot or by car, making multiple deliveries each day. Most of them are self-employed, offering flexibility that attracts women balancing work and family.`;
  const result = await service.analyzeSelection({
    selectionText,
    threshold: "B1"
  });

  assert.equal(result.selection_too_long, false);
  assert.equal(result.meta.fallback_reason, "ai_partial_results");
  assert.ok(result.cards.some((card) => card.content_source === "ai"));
  assert.ok(result.cards.some((card) => card.content_source === "fallback"));
  assert.ok(result.cards.some((card) => card.definition_simple_en === "AI meaning loaded."));
  assert.ok(result.cards.some((card) => card.definition_simple_en === "Meaning could not load for this word right now."));
});
