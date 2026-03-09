import { lowestCefr, meetsThreshold } from "./cefr.js";

const sentenceSegmenter = typeof Intl?.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "sentence" })
  : null;

const wordSegmenter = typeof Intl?.Segmenter === "function"
  ? new Intl.Segmenter("en", { granularity: "word" })
  : null;

const UNKNOWN_STOPWORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "because",
  "before",
  "could",
  "every",
  "from",
  "have",
  "into",
  "just",
  "many",
  "more",
  "most",
  "other",
  "people",
  "should",
  "some",
  "than",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "would"
]);

const AUXILIARY_VERBS = new Set([
  "am",
  "are",
  "be",
  "been",
  "being",
  "can",
  "could",
  "did",
  "do",
  "does",
  "had",
  "has",
  "have",
  "is",
  "may",
  "might",
  "must",
  "should",
  "was",
  "were",
  "will",
  "would"
]);

const PREPOSITIONS = new Set([
  "about",
  "after",
  "before",
  "by",
  "for",
  "from",
  "in",
  "into",
  "of",
  "on",
  "to",
  "with",
  "without"
]);

const OBJECT_STARTERS = new Set([
  "a",
  "an",
  "another",
  "any",
  "each",
  "every",
  "her",
  "his",
  "its",
  "my",
  "no",
  "our",
  "some",
  "that",
  "the",
  "their",
  "these",
  "this",
  "those",
  "your"
]);

const GERUND_TRIGGER_VERBS = new Set([
  "avoid",
  "begin",
  "continue",
  "consider",
  "enjoy",
  "finish",
  "focus",
  "imagine",
  "keep",
  "like",
  "love",
  "prefer",
  "practice",
  "recommend",
  "start",
  "stop",
  "suggest"
]);

const ING_ADVERBIAL_FOLLOWERS = new Set([
  "alone",
  "apart",
  "away",
  "back",
  "here",
  "independently",
  "outside",
  "there",
  "together"
]);

const IRREGULAR_LEMMAS = Object.freeze({
  better: "good",
  best: "good",
  bought: "buy",
  brought: "bring",
  children: "child",
  did: "do",
  done: "do",
  feet: "foot",
  felt: "feel",
  found: "find",
  gave: "give",
  gone: "go",
  had: "have",
  has: "have",
  kept: "keep",
  knew: "know",
  known: "know",
  left: "leave",
  made: "make",
  men: "man",
  mice: "mouse",
  paid: "pay",
  people: "person",
  ran: "run",
  said: "say",
  seen: "see",
  sent: "send",
  taken: "take",
  teeth: "tooth",
  thought: "think",
  told: "tell",
  went: "go",
  women: "woman",
  worse: "bad",
  worst: "bad",
  written: "write",
  wrote: "write"
});

export function createLexiconIndex(entries) {
  const byNormalizedForm = new Map();

  for (const entry of entries) {
    for (const form of entry.normalizedForms) {
      const bucket = byNormalizedForm.get(form) ?? [];
      bucket.push(entry);
      byNormalizedForm.set(form, bucket);
    }
  }

  return {
    entries,
    byNormalizedForm
  };
}

export function normalizeToken(token) {
  return token
    .toLowerCase()
    .replaceAll("’", "'")
    .replaceAll("`", "'")
    .replace(/^[^a-z]+|[^a-z]+$/g, "")
    .replace(/'+/g, "'");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stripPossessive(token) {
  if (token.endsWith("'s")) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s'")) {
    return token.slice(0, -1);
  }

  return token;
}

export function lemmaCandidates(surface) {
  const normalized = normalizeToken(surface);

  if (!normalized) {
    return [];
  }

  const candidates = [normalized, stripPossessive(normalized)];

  if (IRREGULAR_LEMMAS[normalized]) {
    candidates.push(IRREGULAR_LEMMAS[normalized]);
  }

  if (normalized.endsWith("ies") && normalized.length > 4) {
    candidates.push(`${normalized.slice(0, -3)}y`);
  }

  if (normalized.endsWith("ves") && normalized.length > 4) {
    candidates.push(`${normalized.slice(0, -3)}f`);
    candidates.push(`${normalized.slice(0, -3)}fe`);
  }

  if (normalized.endsWith("ing") && normalized.length > 4) {
    const stem = normalized.slice(0, -3);
    candidates.push(stem, `${stem}e`);

    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      candidates.push(stem.slice(0, -1));
    }
  }

  if (normalized.endsWith("ed") && normalized.length > 3) {
    const stem = normalized.slice(0, -2);
    candidates.push(stem, `${stem}e`);

    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      candidates.push(stem.slice(0, -1));
    }
  }

  if (normalized.endsWith("es") && normalized.length > 4) {
    candidates.push(normalized.slice(0, -2));
    candidates.push(normalized.slice(0, -1));
  }

  if (normalized.endsWith("s") && normalized.length > 3 && !normalized.endsWith("ss")) {
    candidates.push(normalized.slice(0, -1));
  }

  return unique(
    candidates
      .map((value) => value.replace(/^[^a-z]+|[^a-z]+$/g, ""))
      .filter((value) => /^[a-z][a-z'-]*$/.test(value))
  );
}

function selectLexiconMatches(lemmaOptions, lexiconIndex) {
  for (const option of lemmaOptions) {
    const entries = lexiconIndex.byNormalizedForm.get(option) ?? [];

    if (entries.length) {
      return {
        selectedLemma: option,
        matchedEntries: entries
      };
    }
  }

  return {
    selectedLemma: lemmaOptions[0] ?? null,
    matchedEntries: []
  };
}

function inferPreferredPartsOfSpeech(surface) {
  const normalized = normalizeToken(surface);

  if (normalized.endsWith("ed") && normalized.length > 3) {
    return new Set(["verb", "adjective"]);
  }

  if (normalized.endsWith("ly") && normalized.length > 3) {
    return new Set(["adverb"]);
  }

  return null;
}

function hasCompatiblePartOfSpeech(entries, preferredPartsOfSpeech) {
  if (!preferredPartsOfSpeech?.size) {
    return entries.length > 0;
  }

  return entries.some((entry) => entry.partsOfSpeech.some((part) => preferredPartsOfSpeech.has(part)));
}

function shouldPreferVerbLemmaForIng(surface, previousNormalized, nextNormalized, previousLemmaOptions = []) {
  const normalized = normalizeToken(surface);

  if (!normalized.endsWith("ing") || normalized.length <= 4) {
    return false;
  }

  if (AUXILIARY_VERBS.has(previousNormalized)) {
    return true;
  }

  if (OBJECT_STARTERS.has(nextNormalized)) {
    return true;
  }

  if (PREPOSITIONS.has(nextNormalized) || ING_ADVERBIAL_FOLLOWERS.has(nextNormalized) || /ly$/.test(nextNormalized)) {
    return true;
  }

  if (previousLemmaOptions.some((option) => GERUND_TRIGGER_VERBS.has(option))) {
    return true;
  }

  return PREPOSITIONS.has(previousNormalized) && OBJECT_STARTERS.has(nextNormalized);
}

function selectLexiconMatchesWithContext(
  surface,
  lemmaOptions,
  lexiconIndex,
  previousNormalized = "",
  nextNormalized = "",
  previousLemmaOptions = []
) {
  const preferredPartsOfSpeech = inferPreferredPartsOfSpeech(surface);
  const fallbackMatch = selectLexiconMatches(lemmaOptions, lexiconIndex);

  if (shouldPreferVerbLemmaForIng(surface, previousNormalized, nextNormalized, previousLemmaOptions)) {
    for (const option of lemmaOptions) {
      if (option === normalizeToken(surface)) {
        continue;
      }

      const entries = lexiconIndex.byNormalizedForm.get(option) ?? [];
      const verbEntries = entries.filter((entry) => entry.partsOfSpeech.includes("verb"));

      if (verbEntries.length) {
        return {
          selectedLemma: option,
          matchedEntries: verbEntries
        };
      }
    }
  }

  if (!preferredPartsOfSpeech) {
    return fallbackMatch;
  }

  for (const option of lemmaOptions) {
    const entries = lexiconIndex.byNormalizedForm.get(option) ?? [];

    if (hasCompatiblePartOfSpeech(entries, preferredPartsOfSpeech)) {
      return {
        selectedLemma: option,
        matchedEntries: entries.filter((entry) => entry.partsOfSpeech.some((part) => preferredPartsOfSpeech.has(part)))
      };
    }
  }

  const exactSurfaceMatch = lexiconIndex.byNormalizedForm.get(normalizeToken(surface)) ?? [];
  if (exactSurfaceMatch.length) {
    return {
      selectedLemma: normalizeToken(surface),
      matchedEntries: exactSurfaceMatch
    };
  }

  if (!hasCompatiblePartOfSpeech(fallbackMatch.matchedEntries, preferredPartsOfSpeech)) {
    return {
      selectedLemma: normalizeToken(surface),
      matchedEntries: []
    };
  }

  return fallbackMatch;
}

export function segmentSentences(text) {
  if (sentenceSegmenter) {
    return Array.from(sentenceSegmenter.segment(text))
      .map((segment, index, segments) => ({
        index,
        text: segment.segment.trim(),
        start: segment.index,
        end: segments[index + 1]?.index ?? text.length
      }))
      .filter((segment) => segment.text);
  }

  const matches = text.matchAll(/[^.!?]+[.!?]?/g);
  return Array.from(matches)
    .map((match, index) => ({
      index,
      text: match[0].trim(),
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length
    }))
    .filter((segment) => segment.text);
}

export function segmentWords(text) {
  if (wordSegmenter) {
    return Array.from(wordSegmenter.segment(text))
      .filter((segment) => segment.isWordLike)
      .map((segment) => ({
        index: segment.index,
        segment: segment.segment
      }));
  }

  const matches = text.matchAll(/[A-Za-z][A-Za-z'’-]*/g);
  return Array.from(matches).map((match) => ({
    index: match.index ?? 0,
    segment: match[0]
  }));
}

function findSentenceIndex(sentences, wordIndex) {
  for (const sentence of sentences) {
    if (wordIndex >= sentence.start && wordIndex < sentence.end) {
      return sentence.index;
    }
  }

  return 0;
}

function isLikelyNamedEntity(surface, sentenceStart) {
  const first = surface[0];

  if (!first) {
    return false;
  }

  if (/^[A-Z]{2,}$/.test(surface)) {
    return true;
  }

  return !sentenceStart && first === first.toUpperCase() && first !== first.toLowerCase();
}

function shouldSendUnknownWord({ surface, normalized, sentenceStart }) {
  if (normalized.length < 5) {
    return false;
  }

  if (normalized.includes("'")) {
    return false;
  }

  if (UNKNOWN_STOPWORDS.has(normalized)) {
    return false;
  }

  if (isLikelyNamedEntity(surface, sentenceStart)) {
    return false;
  }

  return /^[a-z][a-z'-]*$/.test(normalized);
}

export function extractCandidateSeeds({
  text,
  threshold,
  lexiconIndex,
  maxWords = 350
}) {
  const words = segmentWords(text);

  if (words.length > maxWords) {
    return {
      selectionTooLong: true,
      wordCount: words.length,
      candidates: []
    };
  }

  const sentences = segmentSentences(text);
  const seen = new Set();
  const candidates = [];

  for (const [wordPosition, word] of words.entries()) {
    const normalized = normalizeToken(word.segment);

    if (!normalized || /[0-9]/.test(normalized)) {
      continue;
    }

    const sentenceIndex = findSentenceIndex(sentences, word.index);
    const currentSentence = sentences[sentenceIndex];
    const sentenceStart = currentSentence
      ? word.index <= currentSentence.start + 1
      : false;

    const lemmaOptions = lemmaCandidates(word.segment);
    const previousNormalized = normalizeToken(words[wordPosition - 1]?.segment ?? "");
    const nextNormalized = normalizeToken(words[wordPosition + 1]?.segment ?? "");
    const previousLemmaOptions = lemmaCandidates(words[wordPosition - 1]?.segment ?? "");
    const { selectedLemma, matchedEntries } = selectLexiconMatchesWithContext(
      word.segment,
      lemmaOptions,
      lexiconIndex,
      previousNormalized,
      nextNormalized,
      previousLemmaOptions
    );
    const matchedLevels = unique(matchedEntries.map((entry) => entry.cefr));
    const lexicalCefr = lowestCefr(matchedLevels);
    const lemma = selectedLemma
      ?? normalized;

    const sameContextKey = `${lemma}:${sentenceIndex}`;
    if (seen.has(sameContextKey)) {
      continue;
    }

    const missingFromLexicon = matchedEntries.length === 0;
    const shouldAnalyze = missingFromLexicon
      ? shouldSendUnknownWord({
          surface: word.segment,
          normalized,
          sentenceStart
        })
      : meetsThreshold(lexicalCefr, threshold);

    if (!shouldAnalyze) {
      continue;
    }

    seen.add(sameContextKey);
    candidates.push({
      surface: word.segment,
      lemma,
      lexicalCefr,
      lexicalCefrOptions: matchedLevels,
      partOfSpeechHints: unique(matchedEntries.flatMap((entry) => entry.partsOfSpeech)).slice(0, 4),
      matchedEntries: matchedEntries.slice(0, 4).map((entry) => ({
        term: entry.term,
        cefr: entry.cefr,
        partsOfSpeech: entry.partsOfSpeech
      })),
      sentence: currentSentence?.text ?? text.trim(),
      previousSentence: sentences[sentenceIndex - 1]?.text ?? "",
      nextSentence: sentences[sentenceIndex + 1]?.text ?? "",
      sameContextKey,
      missingFromLexicon
    });
  }

  return {
    selectionTooLong: false,
    wordCount: words.length,
    candidates
  };
}
