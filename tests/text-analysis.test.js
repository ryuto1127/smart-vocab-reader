import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createLexiconIndex, extractCandidateSeeds, lemmaCandidates } from "../shared/text-analysis.js";
import {
  buildReviewDefinition,
  buildReviewExample,
  buildSavedWordKey
} from "../shared/storage.js";

const lexiconEntries = JSON.parse(
  await readFile(new URL("../data/cefr-lexicon.json", import.meta.url), "utf8")
);
const lexiconIndex = createLexiconIndex(lexiconEntries);

test("lemmaCandidates normalizes common inflections", () => {
  const candidates = lemmaCandidates("running");
  assert.ok(candidates.includes("run"));
});

test("lemmaCandidates catches short -ing forms like going", () => {
  const candidates = lemmaCandidates("going");
  assert.ok(candidates.includes("go"));
});

test("extractCandidateSeeds keeps words at or above the CEFR threshold", () => {
  const result = extractCandidateSeeds({
    text: "The astonishing result surprised the team.",
    threshold: "B1",
    lexiconIndex
  });

  assert.equal(result.selectionTooLong, false);
  assert.ok(result.candidates.some((candidate) => candidate.lemma === "astonishing"));
});

test("extractCandidateSeeds deduplicates repeated words in the same sentence", () => {
  const result = extractCandidateSeeds({
    text: "The astonishing plan was astonishing to everyone.",
    threshold: "B1",
    lexiconIndex
  });

  const astonishingCards = result.candidates.filter((candidate) => candidate.lemma === "astonishing");
  assert.equal(astonishingCards.length, 1);
});

test("extractCandidateSeeds includes plausible unknown words for AI estimation", () => {
  const result = extractCandidateSeeds({
    text: "The bioluminescent waves lit the beach at night.",
    threshold: "B1",
    lexiconIndex
  });

  assert.ok(result.candidates.some((candidate) => candidate.lemma === "bioluminescent"));
});

test("extractCandidateSeeds avoids easy ambiguous matches below the threshold", () => {
  const result = extractCandidateSeeds({
    text: "He added that the island's leadership is negotiating a deal and he was going to put Marco Rubio over there and we'll see how that works out.",
    threshold: "A2",
    lexiconIndex
  });

  const lemmas = result.candidates.map((candidate) => candidate.lemma);

  assert.ok(!lemmas.includes("add"));
  assert.ok(!lemmas.includes("that"));
  assert.ok(!lemmas.includes("go"));
  assert.ok(!lemmas.includes("we'll"));
  assert.ok(lemmas.includes("leadership"));
  assert.ok(lemmas.includes("negotiate"));
});

test("extractCandidateSeeds does not force -ed words onto unrelated noun lemmas", () => {
  const result = extractCandidateSeeds({
    text: "She bought a potted plant for the kitchen window.",
    threshold: "B1",
    lexiconIndex
  });

  const potted = result.candidates.find((candidate) => candidate.surface.toLowerCase() === "potted");
  assert.ok(potted);
  assert.equal(potted.lemma, "potted");
  assert.equal(potted.missingFromLexicon, true);
});

test("extractCandidateSeeds still maps real past-tense verbs to their base lemma", () => {
  const result = extractCandidateSeeds({
    text: "The company implemented the programme last year.",
    threshold: "B1",
    lexiconIndex
  });

  const implemented = result.candidates.find((candidate) => candidate.surface.toLowerCase() === "implemented");
  assert.ok(implemented);
  assert.equal(implemented.lemma, "implement");
  assert.equal(implemented.missingFromLexicon, false);
});

test("extractCandidateSeeds stops on very long selections", () => {
  const longText = Array.from({ length: 600 }, () => "astonishing").join(" ");
  const result = extractCandidateSeeds({
    text: longText,
    threshold: "B1",
    lexiconIndex
  });

  assert.equal(result.selectionTooLong, true);
});

test("review fallback uses the saved sentence instead of placeholder example text", () => {
  const card = {
    lemma: "leadership",
    surface: "leadership",
    part_of_speech: "noun",
    definition_simple_en: "A word that may be hard in this text.",
    example_simple_en: "I saw \"leadership\" in this text.",
    sentence: "The leadership is negotiating a deal."
  };

  assert.equal(buildSavedWordKey(card), "leadership::the leadership is negotiating a deal.");
  assert.equal(buildReviewExample(card), "The _____ is negotiating a deal.");
  assert.equal(
    buildReviewDefinition(card),
    "Use the sentence to remember what this noun means in this context."
  );
});
