import {
  DEFAULT_SETTINGS,
  getSavedWords,
  getSettings,
  removeSavedWordByKey,
  saveWord,
  setSettings
} from "./shared/storage.js";
import { createLexiconIndex } from "./shared/text-analysis.js";
import { createPreviewAnalysis } from "./shared/preview-analysis.js";

const CONTEXT_MENU_ID = "cefr-reading-assistant-analyze-selection";
const REQUEST_TIMEOUT_MS = Object.freeze({
  analyze: 32000,
  details: 24000
});
let previewLexiconIndexPromise = null;

async function ensureDefaults() {
  const settings = await getSettings();
  await setSettings(settings);
}

async function getPreviewLexiconIndex() {
  if (!previewLexiconIndexPromise) {
    previewLexiconIndexPromise = fetch(chrome.runtime.getURL("data/cefr-lexicon.json"))
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load local lexicon (${response.status})`);
        }

        return response.json();
      })
      .then((entries) => createLexiconIndex(entries))
      .catch((error) => {
        previewLexiconIndexPromise = null;
        throw error;
      });
  }

  return previewLexiconIndexPromise;
}

void getPreviewLexiconIndex().catch(() => {});

async function ensureContextMenu() {
  await chrome.contextMenus.removeAll();
  await chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Analyze selected text",
    contexts: ["selection"]
  });
}

async function postBackend(path, payload) {
  const settings = await getSettings();
  const baseUrl = settings.backendBaseUrl ?? DEFAULT_SETTINGS.backendBaseUrl;
  const timeoutMs = path === "/api/analyze"
    ? REQUEST_TIMEOUT_MS.analyze
    : REQUEST_TIMEOUT_MS.details;
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`Backend request failed with ${response.status}`);
  }

  return response.json();
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await ensureDefaults();
  await ensureContextMenu();
  void getPreviewLexiconIndex().catch(() => {});

  if (reason === "install") {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("pages/dashboard.html#onboarding")
    });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await ensureContextMenu();
  void getPreviewLexiconIndex().catch(() => {});
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "trigger-analysis",
      source: "context-menu"
    });
  } catch {
    // Some pages do not allow content scripts; fail silently here.
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void (async () => {
    switch (message.type) {
      case "get-state": {
        const [settings, savedWords] = await Promise.all([getSettings(), getSavedWords()]);
        sendResponse({
          ok: true,
          settings,
          savedWordKeys: savedWords.map((entry) => entry.saveKey).filter(Boolean),
          savedCount: savedWords.length
        });
        return;
      }

      case "request-analysis": {
        const settings = await getSettings();
        const data = await postBackend("/api/analyze", {
          selectionText: message.selectionText,
          threshold: settings.cefrLevel
        });

        sendResponse({
          ok: true,
          data
        });
        return;
      }

      case "request-analysis-preview": {
        const settings = await getSettings();
        const lexiconIndex = await getPreviewLexiconIndex();
        const data = createPreviewAnalysis({
          selectionText: message.selectionText,
          threshold: settings.cefrLevel,
          lexiconIndex
        });

        sendResponse({
          ok: true,
          data
        });
        return;
      }

      case "request-details": {
        const data = await postBackend("/api/details", message.payload);
        sendResponse({
          ok: true,
          data
        });
        return;
      }

      case "save-word": {
        const saved = await saveWord(message.card);
        sendResponse({
          ok: true,
          data: saved
        });
        return;
      }

      case "unsave-word": {
        const nextWords = await removeSavedWordByKey(message.saveKey);
        sendResponse({
          ok: true,
          data: {
            removed: true,
            savedCount: nextWords.length
          }
        });
        return;
      }

      default:
        sendResponse({
          ok: false,
          error: "Unknown message type"
        });
    }
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  });

  return true;
});
