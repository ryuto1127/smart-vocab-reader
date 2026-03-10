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
const MAX_AI_CANDIDATES_PER_REQUEST = 8;
const RETRY_AI_CANDIDATES_PER_REQUEST = 4;
const MAX_AI_CANDIDATES_TOTAL = 48;
const defaultAnalysisCache = new Map();
const defaultCardCache = new Map();

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
    example_simple_en: String(card.example_simple_en ?? "").trim(),
    content_source: String(card.content_source ?? "ai").trim() || "ai"
  };
}

function normalizeCacheText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function buildCardCacheKey(candidate, threshold) {
  return JSON.stringify({
    threshold,
    lemma: normalizeCacheText(candidate.lemma),
    sentence: normalizeCacheText(candidate.sentence),
    previous_sentence: normalizeCacheText(candidate.previousSentence),
    next_sentence: normalizeCacheText(candidate.nextSentence)
  });
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
  let definition = "Meaning could not load right now.";

  if (fallbackReason === "ai_not_configured") {
    definition = "Meaning needs AI setup.";
  } else if (fallbackReason === "ai_partial_results") {
    definition = "Meaning could not load for this word right now.";
  } else if (fallbackReason === "ai_temporarily_unavailable") {
    definition = "Meaning could not load right now. Please try again.";
  }

  return {
    same_context_key: seed.sameContextKey,
    surface: seed.surface,
    lemma: seed.lemma,
    cefr,
    part_of_speech: partOfSpeech,
    definition_simple_en: definition,
    example_simple_en: buildFallbackExample(seed),
    sentence: seed.sentence,
    previous_sentence: seed.previousSentence,
    next_sentence: seed.nextSentence,
    details_loaded: false,
    content_source: "fallback"
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

function mergeCards(candidates, cards, threshold, fallbackReasonForMissing = null) {
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
        if (!candidate.missingFromLexicon && meetsThreshold(candidate.lexicalCefr, threshold)) {
          return buildOfflineCard(
            candidate,
            threshold,
            fallbackReasonForMissing ?? "ai_temporarily_unavailable"
          );
        }

        return null;
      }

      return {
        ...card,
        cefr: resolveFinalCefr(candidate, card),
        sentence: candidate.sentence,
        previous_sentence: candidate.previousSentence,
        next_sentence: candidate.nextSentence,
        details_loaded: false,
        content_source: card.content_source || "ai"
      };
    })
    .filter(Boolean);
}

function buildCandidateCard(candidate, card) {
  return {
    ...card,
    same_context_key: candidate.sameContextKey,
    surface: candidate.surface,
    lemma: candidate.lemma,
    cefr: resolveFinalCefr(candidate, card),
    sentence: candidate.sentence,
    previous_sentence: candidate.previousSentence,
    next_sentence: candidate.nextSentence,
    details_loaded: false,
    content_source: card.content_source || "ai"
  };
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

function mergeAiCards(...cardGroups) {
  const byKey = new Map();

  for (const group of cardGroups) {
    for (const card of group.map(sanitizeCard)) {
      if (!card.same_context_key || !card.definition_simple_en) {
        continue;
      }

      byKey.set(card.same_context_key, card);
    }
  }

  return [...byKey.values()];
}

function getMissingCandidates(candidates, cards) {
  const returnedKeys = new Set(
    cards
      .map((card) => sanitizeCard(card).same_context_key)
      .filter(Boolean)
  );

  return candidates.filter((candidate) => !returnedKeys.has(candidate.sameContextKey));
}

export function createAnalysisService(runtime = {}) {
  const cache = runtime.cache ?? defaultAnalysisCache;
  const cardCache = runtime.cardCache ?? defaultCardCache;
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

  function getCardCacheValue(key) {
    const cached = cardCache.get(key);

    if (!cached) {
      return null;
    }

    if (now() - cached.createdAt > CACHE_TTL_MS) {
      cardCache.delete(key);
      return null;
    }

    return cached.value;
  }

  function setCardCacheValue(key, value) {
    cardCache.set(key, {
      createdAt: now(),
      value
    });
  }

  async function analyzeCandidatesOnce(candidates, threshold, chunkSize) {
    const cachedCards = [];
    const uncachedCandidates = [];

    for (const candidate of candidates) {
      const cachedCard = getCardCacheValue(buildCardCacheKey(candidate, threshold));

      if (cachedCard) {
        cachedCards.push(buildCandidateCard(candidate, sanitizeCard(cachedCard)));
      } else {
        uncachedCandidates.push(candidate);
      }
    }

    if (!uncachedCandidates.length) {
      return {
        cards: cachedCards,
        successfulBatchCount: 0,
        batchCount: 0,
        cacheHitCount: cachedCards.length
      };
    }

    const candidateBatches = chunkCandidates(uncachedCandidates, chunkSize);
    const settledResponses = await Promise.allSettled(
      candidateBatches.map((batch) => analyzeCandidatesWithAiImpl(
        {
          threshold,
          candidates: batch
        },
        {
          env,
          fetchImpl,
          timeoutMs: aiTimeoutMs
        }
      ))
    );

    const successfulResponses = settledResponses
      .filter((response) => response.status === "fulfilled")
      .map((response) => response.value);

    const aiCards = successfulResponses.flatMap((response) => response.cards ?? []);
    const byKey = new Map(aiCards.map((card) => [sanitizeCard(card).same_context_key, sanitizeCard(card)]));

    const resolvedAiCards = uncachedCandidates.flatMap((candidate) => {
      const card = byKey.get(candidate.sameContextKey);

      if (!card) {
        return [];
      }

      const resolvedCard = buildCandidateCard(candidate, card);
      setCardCacheValue(buildCardCacheKey(candidate, threshold), resolvedCard);
      return [resolvedCard];
    });

    return {
      cards: [...cachedCards, ...resolvedAiCards],
      successfulBatchCount: successfulResponses.length,
      batchCount: candidateBatches.length,
      cacheHitCount: cachedCards.length
    };
  }

  async function analyzeSelection({ selectionText, threshold, candidateKeys = null }) {
    const normalizedCandidateKeys = Array.isArray(candidateKeys)
      ? [...new Set(candidateKeys.map((key) => String(key ?? "").trim()).filter(Boolean))].sort()
      : null;
    const cacheKey = JSON.stringify({ selectionText, threshold, candidateKeys: normalizedCandidateKeys });
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

    const scopedCandidates = normalizedCandidateKeys?.length
      ? localAnalysis.candidates.filter((candidate) => normalizedCandidateKeys.includes(candidate.sameContextKey))
      : localAnalysis.candidates;

    if (scopedCandidates.length === 0) {
      return {
        selection_too_long: false,
        cards: [],
        meta: {
          used_ai: false,
          candidate_count: 0,
          batch_count: 0,
          fallback_reason: null,
          retry_attempted: false,
          retry_candidate_count: 0,
          card_cache_hits: 0
        }
      };
    }

    if (scopedCandidates.length > MAX_AI_CANDIDATES_TOTAL) {
      return {
        selection_too_long: true,
        message: "There are too many difficult words in this selection. Try a shorter text or choose a higher CEFR level.",
        cards: []
      };
    }

    let cards;
    let usedAi = false;
    let fallbackReason = null;
    let retryAttempted = false;
    let retryCandidateCount = 0;
    let cardCacheHits = 0;

    if (isAiConfiguredImpl(env)) {
      try {
        const firstPass = await analyzeCandidatesOnce(
          scopedCandidates,
          threshold,
          MAX_AI_CANDIDATES_PER_REQUEST
        );
        let mergedResponseCards = firstPass.cards;
        let successfulBatchCount = firstPass.successfulBatchCount;
        cardCacheHits += firstPass.cacheHitCount;
        const missingCandidatesAfterFirstPass = getMissingCandidates(
          scopedCandidates,
          mergedResponseCards
        );

        if (missingCandidatesAfterFirstPass.length) {
          retryAttempted = true;
          retryCandidateCount = missingCandidatesAfterFirstPass.length;
          const retryPass = await analyzeCandidatesOnce(
            missingCandidatesAfterFirstPass,
            threshold,
            RETRY_AI_CANDIDATES_PER_REQUEST
          );
          mergedResponseCards = mergeAiCards(mergedResponseCards, retryPass.cards);
          successfulBatchCount += retryPass.successfulBatchCount;
          cardCacheHits += retryPass.cacheHitCount;
        }

        if (successfulBatchCount === 0 && cardCacheHits === 0) {
          throw new Error("All AI batches failed");
        }

        const unresolvedCandidates = getMissingCandidates(scopedCandidates, mergedResponseCards);
        fallbackReason = unresolvedCandidates.length
          ? "ai_partial_results"
          : null;

        cards = filterCardsByThreshold(
          mergeCards(scopedCandidates, mergedResponseCards, threshold, fallbackReason),
          threshold
        );
        usedAi = true;
      } catch {
        fallbackReason = "ai_temporarily_unavailable";
        cards = scopedCandidates.map((candidate) => buildOfflineCard(candidate, threshold, fallbackReason));
      }
    } else {
      fallbackReason = "ai_not_configured";
      cards = scopedCandidates.map((candidate) => buildOfflineCard(candidate, threshold, fallbackReason));
    }

    const result = {
      selection_too_long: false,
      cards,
      meta: {
        used_ai: usedAi,
        candidate_count: scopedCandidates.length,
        batch_count: Math.ceil(scopedCandidates.length / MAX_AI_CANDIDATES_PER_REQUEST),
        fallback_reason: fallbackReason,
        retry_attempted: retryAttempted,
        retry_candidate_count: retryCandidateCount,
        card_cache_hits: cardCacheHits
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
