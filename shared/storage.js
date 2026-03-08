import { DEFAULT_BACKEND_BASE_URL } from "./runtime-config.js";

export const STORAGE_KEYS = Object.freeze({
  settings: "settings",
  savedWords: "savedWords"
});

export const DEFAULT_SETTINGS = Object.freeze({
  cefrLevel: "B1",
  readingMode: false,
  onboardingCompleted: false,
  backendBaseUrl: DEFAULT_BACKEND_BASE_URL
});

const PLACEHOLDER_DEFINITIONS = new Set([
  "This word may be hard in this text.",
  "A word that may be hard in this text."
]);
const PLACEHOLDER_EXAMPLE_PATTERN = /^I saw ".*" in this text\.$/;
const LOCAL_BACKEND_URLS = new Set([
  "http://localhost:8787",
  "http://127.0.0.1:8787"
]);

function normalizeTextKeyPart(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function buildSavedWordKey(card) {
  const lemma = normalizeTextKeyPart(card.lemma ?? card.surface);
  const sentence = normalizeTextKeyPart(card.sentence ?? card.example_simple_en);
  const definition = normalizeTextKeyPart(card.definition_simple_en);

  return [lemma, sentence || definition].join("::");
}

export function hasPlaceholderDefinition(card) {
  return PLACEHOLDER_DEFINITIONS.has(String(card.definition_simple_en ?? "").trim());
}

export function hasPlaceholderExample(card) {
  return PLACEHOLDER_EXAMPLE_PATTERN.test(String(card.example_simple_en ?? "").trim());
}

export function buildReviewExample(card) {
  const sentence = String(card.sentence ?? "").trim();
  const surface = String(card.surface ?? "").trim();

  if (!sentence) {
    if (!hasPlaceholderExample(card)) {
      return String(card.example_simple_en ?? "").trim();
    }

    return "Save this word again from the reading bubble to keep the real sentence here.";
  }

  if (!surface) {
    return sentence;
  }

  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const masked = sentence.replace(new RegExp(`\\b${escaped}\\b`, "i"), "_____");
  return masked === sentence ? sentence : masked;
}

export function buildSavedDefinition(card) {
  const rawDefinition = String(card.definition_simple_en ?? "").trim();
  if (rawDefinition && !hasPlaceholderDefinition(card)) {
    return rawDefinition;
  }

  const partOfSpeech = String(card.part_of_speech ?? "word").trim();
  return `Use the example to remember how this ${partOfSpeech} works in context.`;
}

export function buildSavedExample(card) {
  if (!hasPlaceholderExample(card)) {
    return String(card.example_simple_en ?? "").trim();
  }

  const sentence = String(card.sentence ?? "").trim();
  return sentence || buildReviewExample(card);
}

export function buildReviewDefinition(card) {
  if (!hasPlaceholderDefinition(card)) {
    return String(card.definition_simple_en ?? "").trim();
  }

  if (String(card.sentence ?? "").trim()) {
    const partOfSpeech = String(card.part_of_speech ?? "word").trim();
    return `Use the sentence to remember what this ${partOfSpeech} means in this context.`;
  }

  return "This saved card was made before a real meaning was stored. Save it again from the reading bubble to upgrade it.";
}

function normalizeSavedWord(entry) {
  const normalized = {
    ...entry,
    saveKey: entry.saveKey ?? buildSavedWordKey(entry) ?? entry.fingerprint ?? entry.id,
    sentence: String(entry.sentence ?? "").trim(),
    previous_sentence: String(entry.previous_sentence ?? "").trim(),
    next_sentence: String(entry.next_sentence ?? "").trim(),
    content_source: entry.content_source ?? (hasPlaceholderDefinition(entry) ? "fallback" : "ai")
  };

  normalized.review_example_en = entry.review_example_en ?? buildReviewExample(normalized);
  normalized.review_definition_en = entry.review_definition_en ?? buildReviewDefinition(normalized);

  return normalized;
}

function getStorageArea() {
  return chrome.storage.local;
}

function shouldUseConfiguredBackendUrl(storedBackendBaseUrl) {
  const storedValue = String(storedBackendBaseUrl ?? "").trim();

  if (!storedValue || !LOCAL_BACKEND_URLS.has(storedValue)) {
    return false;
  }

  return !LOCAL_BACKEND_URLS.has(DEFAULT_BACKEND_BASE_URL);
}

export async function getSettings() {
  const data = await getStorageArea().get({
    [STORAGE_KEYS.settings]: DEFAULT_SETTINGS
  });

  const storedSettings = data[STORAGE_KEYS.settings] ?? {};
  const migratedBackendBaseUrl = shouldUseConfiguredBackendUrl(storedSettings.backendBaseUrl)
    ? DEFAULT_BACKEND_BASE_URL
    : storedSettings.backendBaseUrl;

  return {
    ...DEFAULT_SETTINGS,
    ...storedSettings,
    backendBaseUrl: migratedBackendBaseUrl ?? DEFAULT_BACKEND_BASE_URL
  };
}

export async function setSettings(partialSettings) {
  const current = await getSettings();
  const next = {
    ...current,
    ...partialSettings
  };

  await getStorageArea().set({
    [STORAGE_KEYS.settings]: next
  });

  return next;
}

export async function getSavedWords() {
  const data = await getStorageArea().get({
    [STORAGE_KEYS.savedWords]: []
  });

  return (data[STORAGE_KEYS.savedWords] ?? []).map(normalizeSavedWord);
}

export async function saveWord(card) {
  const savedWords = await getSavedWords();
  const saveKey = buildSavedWordKey(card);
  const existing = savedWords.find((entry) => entry.saveKey === saveKey);

  if (existing) {
    return existing;
  }

  const nextEntry = {
    id: crypto.randomUUID(),
    lemma: card.lemma,
    surface: card.surface,
    cefr: card.cefr,
    part_of_speech: card.part_of_speech,
    definition_simple_en: buildSavedDefinition(card),
    example_simple_en: buildSavedExample(card),
    review_definition_en: buildReviewDefinition(card),
    review_example_en: buildReviewExample(card),
    raw_definition_simple_en: String(card.definition_simple_en ?? "").trim(),
    raw_example_simple_en: String(card.example_simple_en ?? "").trim(),
    sentence: String(card.sentence ?? "").trim(),
    previous_sentence: String(card.previous_sentence ?? "").trim(),
    next_sentence: String(card.next_sentence ?? "").trim(),
    content_source: card.content_source === "fallback" || hasPlaceholderDefinition(card) ? "fallback" : "ai",
    savedAt: new Date().toISOString(),
    saveKey
  };

  await getStorageArea().set({
    [STORAGE_KEYS.savedWords]: [nextEntry, ...savedWords]
  });

  return nextEntry;
}

export async function removeSavedWord(id) {
  const savedWords = await getSavedWords();
  const nextWords = savedWords.filter((entry) => entry.id !== id);

  await getStorageArea().set({
    [STORAGE_KEYS.savedWords]: nextWords
  });

  return nextWords;
}

export async function removeSavedWordByKey(saveKey) {
  const savedWords = await getSavedWords();
  const nextWords = savedWords.filter((entry) => entry.saveKey !== saveKey);

  await getStorageArea().set({
    [STORAGE_KEYS.savedWords]: nextWords
  });

  return nextWords;
}
