import { extractCandidateSeeds } from "./text-analysis.js";

export const PREVIEW_MAX_SELECTION_WORDS = 550;
export const PREVIEW_MAX_SELECTION_CHARACTERS = 3600;
export const PREVIEW_MAX_CANDIDATES_TOTAL = 48;
export const PREVIEW_BATCH_SIZE = 20;

export function buildPreviewCard(candidate, threshold) {
  return {
    same_context_key: candidate.sameContextKey,
    surface: candidate.surface,
    lemma: candidate.lemma,
    cefr: candidate.lexicalCefr ?? threshold,
    part_of_speech: candidate.partOfSpeechHints[0] ?? "word",
    definition_simple_en: "Loading meaning...",
    example_simple_en: "Loading example...",
    sentence: candidate.sentence,
    previous_sentence: candidate.previousSentence,
    next_sentence: candidate.nextSentence,
    details_loaded: false,
    content_source: "loading"
  };
}

export function createPreviewAnalysis({ selectionText, threshold, lexiconIndex }) {
  if (selectionText.length > PREVIEW_MAX_SELECTION_CHARACTERS) {
    return {
      selection_too_long: true,
      message: "Please select a shorter text.",
      cards: []
    };
  }

  const localAnalysis = extractCandidateSeeds({
    text: selectionText,
    threshold,
    lexiconIndex,
    maxWords: PREVIEW_MAX_SELECTION_WORDS
  });

  if (localAnalysis.selectionTooLong) {
    return {
      selection_too_long: true,
      message: "Please select a shorter text.",
      cards: []
    };
  }

  if (localAnalysis.candidates.length > PREVIEW_MAX_CANDIDATES_TOTAL) {
    return {
      selection_too_long: true,
      message: "There are too many difficult words in this selection. Try a shorter text or choose a higher CEFR level.",
      cards: []
    };
  }

  return {
    selection_too_long: false,
    cards: localAnalysis.candidates.map((candidate) => buildPreviewCard(candidate, threshold)),
    meta: {
      used_ai: false,
      candidate_count: localAnalysis.candidates.length,
      batch_count: Math.ceil(localAnalysis.candidates.length / PREVIEW_BATCH_SIZE),
      fallback_reason: null,
      preview_only: true
    }
  };
}
