import {
  ANALYZE_RESPONSE_SCHEMA,
  DETAILS_RESPONSE_SCHEMA,
  buildAnalyzeInstructions,
  buildDetailsInstructions
} from "../shared/ai-schema.js";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANALYZE_MODEL = "gpt-5.4-mini";
const DEFAULT_DETAILS_MODEL = "gpt-5.4-mini";
const DEFAULT_OPENAI_TIMEOUT_MS = 26000;

function getDefaultEnv() {
  if (typeof process !== "undefined" && process?.env) {
    return process.env;
  }

  return {};
}

function getFetchImpl(fetchImpl) {
  if (fetchImpl) {
    return fetchImpl;
  }

  if (typeof fetch === "function") {
    return fetch;
  }

  throw new Error("Fetch is not available in this runtime");
}

function getStringValue(env, key, fallback = "") {
  const value = env?.[key];

  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

function getResponsesUrl(env) {
  const baseUrl = getStringValue(env, "OPENAI_BASE_URL", DEFAULT_OPENAI_BASE_URL);
  return `${baseUrl.replace(/\/$/, "")}/responses`;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const output = payload.output ?? [];
  for (const item of output) {
    const content = item.content ?? [];
    for (const part of content) {
      if (part.type === "output_text" && typeof part.text === "string" && part.text.trim()) {
        return part.text;
      }
    }
  }

  return "";
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
    }
  };
}

async function callOpenAiJson({
  input,
  instructions,
  schemaName,
  schema,
  model,
  env = getDefaultEnv(),
  fetchImpl,
  timeoutMs = DEFAULT_OPENAI_TIMEOUT_MS,
  maxOutputTokens = 1200
}) {
  const apiKey = getStringValue(env, "OPENAI_API_KEY");

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const requestFetch = getFetchImpl(fetchImpl);
  const { signal, cleanup } = createTimeoutSignal(timeoutMs);

  try {
    const response = await requestFetch(getResponsesUrl(env), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        store: false,
        instructions,
        input: JSON.stringify(input),
        max_output_tokens: maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema
          }
        }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`OpenAI request failed with ${response.status}`);
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);

    if (!outputText) {
      throw new Error("OpenAI response did not include output_text");
    }

    return JSON.parse(outputText);
  } finally {
    cleanup();
  }
}

export function isAiConfigured(env = getDefaultEnv()) {
  return Boolean(getStringValue(env, "OPENAI_API_KEY"));
}

export async function analyzeCandidatesWithAi(
  { threshold, candidates },
  runtime = {}
) {
  const env = runtime.env ?? getDefaultEnv();

  return callOpenAiJson({
    model: getStringValue(
      env,
      "OPENAI_ANALYZE_MODEL",
      getStringValue(env, "OPENAI_MODEL", DEFAULT_ANALYZE_MODEL)
    ),
    instructions: buildAnalyzeInstructions(threshold),
    input: {
      threshold,
      candidates
    },
    schemaName: "cefr_vocabulary_analysis",
    schema: ANALYZE_RESPONSE_SCHEMA,
    env,
    fetchImpl: runtime.fetchImpl,
    timeoutMs: runtime.timeoutMs,
    maxOutputTokens: 1400
  });
}

export async function loadWordDetailsWithAi(
  { surface, lemma, sentence, previousSentence, nextSentence },
  runtime = {}
) {
  const env = runtime.env ?? getDefaultEnv();

  return callOpenAiJson({
    model: getStringValue(
      env,
      "OPENAI_DETAILS_MODEL",
      getStringValue(env, "OPENAI_MODEL", DEFAULT_DETAILS_MODEL)
    ),
    instructions: buildDetailsInstructions(),
    input: {
      surface,
      lemma,
      sentence,
      previous_sentence: previousSentence,
      next_sentence: nextSentence
    },
    schemaName: "cefr_vocabulary_details",
    schema: DETAILS_RESPONSE_SCHEMA,
    env,
    fetchImpl: runtime.fetchImpl,
    timeoutMs: runtime.timeoutMs
  });
}
