import lexiconEntries from "../data/cefr-lexicon.json" with { type: "json" };

import { createLexiconIndex, extractCandidateSeeds } from "../shared/text-analysis.js";
import { highestCefr, meetsThreshold } from "../shared/cefr.js";
import {
  analyzeCandidatesWithAi,
  isAiConfigured,
  loadWordDetailsWithAi
} from "./openai-provider.js";

const lexiconIndex = createLexiconIndex(lexiconEntries);

const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const MAX_SELECTION_WORDS = 550;
const MAX_SELECTION_CHARACTERS = 3600;
const MAX_AI_CANDIDATES_PER_REQUEST = 20;
const MAX_AI_CANDIDATES_TOTAL = 48;
const defaultAnalysisCache = new Map();

function getDefaultEnv() {
  if (typeof process !== "undefined" && process?.env) {
    return process.env;
  }

  return {};
}

function sanitizeCard(card) {
  return {
    same_context_key: String(card.same_context_key ?? "").trim(),
    surface: String(card.surface ?? "").trim(),
    lemma: String(card.lemma ?? "").trim().toLowerCase(),
    cefr: String(card.cefr ?? "").trim(),
    part_of_speech: String(card.part_of_speech ?? "").trim(),
    definition_simple_en: String(card.definition_simple_en ?? "").trim(),
    example_simple_en: String(card.example_simple_en ?? "").trim()
  };
}

function buildFallbackExample(seed) {
  const sentence = String(seed.sentence ?? "").trim();
  const surface = String(seed.surface ?? "").trim();

  if (!sentence) {
    return `Look at "${surface}" in the text again.`;
  }

  if (!surface) {
    return sentence;
  }

  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const masked = sentence.replace(new RegExp(`\\b${escaped}\\b`, "i"), "_____");
  return masked === sentence ? sentence : masked;
}

function buildOfflineCard(seed, threshold, fallbackReason) {
  const cefr = seed.lexicalCefr && meetsThreshold(seed.lexicalCefr, threshold)
    ? seed.lexicalCefr
    : threshold;
  const partOfSpeech = seed.partOfSpeechHints[0] ?? "word";

  return {
    same_context_key: seed.sameContextKey,
    surface: seed.surface,
    lemma: seed.lemma,
    cefr,
    part_of_speech: partOfSpeech,
    definition_simple_en: fallbackReason === "ai_not_configured"
      ? "Meaning needs AI setup."
      : "Meaning could not load. Try a shorter text.",
    example_simple_en: buildFallbackExample(seed),
    sentence: seed.sentence,
    previous_sentence: seed.previousSentence,
    next_sentence: seed.nextSentence,
    details_loaded: false
  };
}

function resolveFinalCefr(candidate, card) {
  const lexicalBaseline = candidate.missingFromLexicon
    ? null
    : candidate.lexicalCefr;

  if (lexicalBaseline && card.cefr) {
    return highestCefr([lexicalBaseline, card.cefr]) ?? card.cefr;
  }

  return card.cefr || lexicalBaseline || "";
}

function mergeCards(candidates, cards) {
  const byKey = new Map(
    cards
      .map(sanitizeCard)
      .filter((card) => card.same_context_key && card.definition_simple_en)
      .map((card) => [card.same_context_key, card])
  );

  return candidates
    .map((candidate) => {
      const card = byKey.get(candidate.sameContextKey);
      if (!card) {
        return null;
      }

      return {
        ...card,
        cefr: resolveFinalCefr(candidate, card),
        sentence: candidate.sentence,
        previous_sentence: candidate.previousSentence,
        next_sentence: candidate.nextSentence,
        details_loaded: false
      };
    })
    .filter(Boolean);
}

function filterCardsByThreshold(cards, threshold) {
  return cards.filter((card) => meetsThreshold(card.cefr, threshold));
}

function chunkCandidates(candidates, chunkSize) {
  const chunks = [];

  for (let index = 0; index < candidates.length; index += chunkSize) {
    chunks.push(candidates.slice(index, index + chunkSize));
  }

  return chunks;
}

export function createAnalysisService(runtime = {}) {
  const cache = runtime.cache ?? defaultAnalysisCache;
  const now = runtime.now ?? (() => Date.now());
  const env = runtime.env ?? getDefaultEnv();
  const fetchImpl = runtime.fetchImpl;
  const aiTimeoutMs = runtime.aiTimeoutMs;
  const analyzeCandidatesWithAiImpl = runtime.analyzeCandidatesWithAiImpl ?? analyzeCandidatesWithAi;
  const loadWordDetailsWithAiImpl = runtime.loadWordDetailsWithAiImpl ?? loadWordDetailsWithAi;
  const isAiConfiguredImpl = runtime.isAiConfiguredImpl ?? isAiConfigured;

  function getCacheValue(key) {
    const cached = cache.get(key);

    if (!cached) {
      return null;
    }

    if (now() - cached.createdAt > CACHE_TTL_MS) {
      cache.delete(key);
      return null;
    }

    return cached.value;
  }

  function setCacheValue(key, value) {
    cache.set(key, {
      createdAt: now(),
      value
    });
  }

  async function analyzeSelection({ selectionText, threshold }) {
    const cacheKey = JSON.stringify({ selectionText, threshold });
    const cached = getCacheValue(cacheKey);

    if (cached) {
      return cached;
    }

    if (selectionText.length > MAX_SELECTION_CHARACTERS) {
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
      maxWords: MAX_SELECTION_WORDS
    });

    if (localAnalysis.selectionTooLong) {
      return {
        selection_too_long: true,
        message: "Please select a shorter text.",
        cards: []
      };
    }

    if (localAnalysis.candidates.length === 0) {
      return {
        selection_too_long: false,
        cards: []
      };
    }

    if (localAnalysis.candidates.length > MAX_AI_CANDIDATES_TOTAL) {
      return {
        selection_too_long: true,
        message: "There are too many difficult words in this selection. Try a shorter text or choose a higher CEFR level.",
        cards: []
      };
    }

    let cards;
    let usedAi = false;
    let fallbackReason = null;

    if (isAiConfiguredImpl(env)) {
      try {
        const candidateBatches = chunkCandidates(localAnalysis.candidates, MAX_AI_CANDIDATES_PER_REQUEST);
        const responses = await Promise.all(
          candidateBatches.map((candidates) => analyzeCandidatesWithAiImpl(
            {
              threshold,
              selectionText,
              candidates
            },
            {
              env,
              fetchImpl,
              timeoutMs: aiTimeoutMs
            }
          ))
        );
        const mergedResponseCards = responses.flatMap((response) => response.cards ?? []);

        cards = filterCardsByThreshold(
          mergeCards(localAnalysis.candidates, mergedResponseCards),
          threshold
        );
        usedAi = true;
      } catch {
        fallbackReason = "ai_temporarily_unavailable";
        cards = localAnalysis.candidates.map((candidate) => buildOfflineCard(candidate, threshold, fallbackReason));
      }
    } else {
      fallbackReason = "ai_not_configured";
      cards = localAnalysis.candidates.map((candidate) => buildOfflineCard(candidate, threshold, fallbackReason));
    }

    const result = {
      selection_too_long: false,
      cards,
      meta: {
        used_ai: usedAi,
        candidate_count: localAnalysis.candidates.length,
        batch_count: Math.ceil(localAnalysis.candidates.length / MAX_AI_CANDIDATES_PER_REQUEST),
        fallback_reason: fallbackReason
      }
    };

    if (usedAi || fallbackReason === "ai_not_configured") {
      setCacheValue(cacheKey, result);
    }

    return result;
  }

  async function loadWordDetails(payload) {
    if (!isAiConfiguredImpl(env)) {
      return {
        surface: payload.surface,
        lemma: payload.lemma,
        synonyms: [],
        collocations: []
      };
    }

    try {
      return await loadWordDetailsWithAiImpl(payload, {
        env,
        fetchImpl,
        timeoutMs: aiTimeoutMs
      });
    } catch {
      return {
        surface: payload.surface,
        lemma: payload.lemma,
        synonyms: [],
        collocations: []
      };
    }
  }

  return {
    analyzeSelection,
    loadWordDetails
  };
}

const defaultService = createAnalysisService();

export const analyzeSelection = defaultService.analyzeSelection;
export const loadWordDetails = defaultService.loadWordDetails;
