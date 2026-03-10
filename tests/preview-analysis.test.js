import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLexiconIndex } from "../shared/text-analysis.js";
import { createPreviewAnalysis } from "../shared/preview-analysis.js";

const lexiconEntries = JSON.parse(
  await readFile(new URL("../data/cefr-lexicon.json", import.meta.url), "utf8")
);
const lexiconIndex = createLexiconIndex(lexiconEntries);

test("createPreviewAnalysis returns loading cards immediately for qualifying words", () => {
  const result = createPreviewAnalysis({
    selectionText: "The astonishing result surprised the team.",
    threshold: "B1",
    lexiconIndex
  });

  assert.equal(result.selection_too_long, false);
  assert.ok(result.cards.length > 0);
  assert.equal(result.cards[0].content_source, "loading");
  assert.equal(result.cards[0].definition_simple_en, "Loading meaning...");
  assert.equal(result.cards[0].example_simple_en, "Loading example...");
  assert.equal(result.meta.preview_only, true);
});

test("createPreviewAnalysis stops immediately when the preview selection is too long", () => {
  const longText = "astonishing ".repeat(600);
  const result = createPreviewAnalysis({
    selectionText: longText,
    threshold: "B1",
    lexiconIndex
  });

  assert.equal(result.selection_too_long, true);
  assert.equal(result.message, "Please select a shorter text.");
});
