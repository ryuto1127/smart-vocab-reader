import { CEFR_LEVELS } from "./cefr.js";

export const ANALYZE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          same_context_key: { type: "string", minLength: 1 },
          surface: { type: "string", minLength: 1 },
          lemma: { type: "string", minLength: 1 },
          cefr: { type: "string", enum: CEFR_LEVELS },
          part_of_speech: { type: "string", minLength: 1 },
          definition_simple_en: { type: "string", minLength: 1 },
          example_simple_en: { type: "string", minLength: 1 }
        },
        required: [
          "same_context_key",
          "surface",
          "lemma",
          "cefr",
          "part_of_speech",
          "definition_simple_en",
          "example_simple_en"
        ]
      }
    }
  },
  required: ["cards"]
};

export const DETAILS_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    surface: { type: "string", minLength: 1 },
    lemma: { type: "string", minLength: 1 },
    synonyms: {
      type: "array",
      items: { type: "string", minLength: 1 }
    },
    collocations: {
      type: "array",
      items: { type: "string", minLength: 1 }
    }
  },
  required: ["surface", "lemma", "synonyms", "collocations"]
};

export function buildAnalyzeInstructions(threshold) {
  return [
    "You are a CEFR vocabulary assistant for English learners.",
    "Return strict JSON only.",
    `Only keep words whose final contextual CEFR is ${threshold} or above.`,
    "When lexical_cefr is provided, treat it as a strong baseline for the word's difficulty.",
    "Do not flatten every result to the user's threshold. If a word is clearly C1 or C2, keep that higher level.",
    "Omit named entities, abbreviations, and words that are not useful vocabulary cards.",
    "Use the sentence plus previous and next sentence to understand the meaning.",
    "Definitions and example sentences must use A1-A2 English only.",
    "Make each definition a little fuller than a dictionary label.",
    "A definition may use one or two short sentences when needed.",
    "Explain the main idea of the word and, when helpful, how it works in this context.",
    "Example sentences must be short, natural, and different from the source sentence.",
    "Keep the order from the input candidates."
  ].join(" ");
}

export function buildDetailsInstructions() {
  return [
    "You are a CEFR vocabulary assistant for English learners.",
    "Return strict JSON only.",
    "Give up to 4 simple synonyms and up to 4 common collocations that fit the current context.",
    "Avoid rare, poetic, or advanced alternatives unless the context strongly requires them."
  ].join(" ");
}
