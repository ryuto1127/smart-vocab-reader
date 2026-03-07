import test from "node:test";
import assert from "node:assert/strict";

import { analyzeSelection } from "../backend/analysis-service.js";

test("analyzeSelection asks for a shorter selection when the text is too long", async () => {
  const longText = "astonishing ".repeat(250);
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
