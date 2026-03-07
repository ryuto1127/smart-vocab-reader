import {
  DEFAULT_SETTINGS,
  getSavedWords,
  getSettings,
  removeSavedWordByKey,
  saveWord,
  setSettings
} from "./shared/storage.js";

const CONTEXT_MENU_ID = "cefr-reading-assistant-analyze-selection";
const REQUEST_TIMEOUT_MS = Object.freeze({
  analyze: 22000,
  details: 22000
});

async function ensureDefaults() {
  const settings = await getSettings();
  await setSettings(settings);
}

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

  if (reason === "install") {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("pages/dashboard.html#onboarding")
    });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await ensureContextMenu();
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
