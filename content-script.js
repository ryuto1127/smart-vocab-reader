(function () {
  const STYLE_TEXT = `
    :host {
      all: initial;
    }

    * {
      box-sizing: border-box;
    }

    .bubble {
      width: min(380px, calc(100vw - 24px));
      max-height: min(70vh, 520px);
      overflow: hidden;
      border: 1px solid rgba(33, 41, 37, 0.12);
      border-radius: 22px;
      background:
        linear-gradient(180deg, rgba(255, 252, 247, 0.96) 0%, rgba(246, 238, 226, 0.96) 100%);
      box-shadow: 0 26px 60px rgba(24, 24, 19, 0.18);
      color: #1f2925;
      font-family: "Avenir Next", "Segoe UI", sans-serif;
      backdrop-filter: blur(14px);
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 14px 16px 12px;
      border-bottom: 1px solid rgba(33, 41, 37, 0.08);
    }

    .header-copy {
      min-width: 0;
    }

    .eyebrow {
      margin: 0 0 2px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: #657066;
    }

    .title {
      margin: 0;
      font-size: 16px;
      font-family: "Iowan Old Style", "Palatino Linotype", serif;
    }

    .close-button {
      border: none;
      width: 34px;
      height: 34px;
      border-radius: 999px;
      color: #1f2925;
      background: rgba(31, 41, 37, 0.08);
      cursor: pointer;
      font: inherit;
      font-size: 18px;
    }

    .content {
      display: grid;
      gap: 12px;
      padding: 14px;
      max-height: calc(min(70vh, 520px) - 64px);
      overflow: auto;
    }

    .status {
      padding: 18px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.7);
      color: #5d665d;
      line-height: 1.5;
    }

    .notice {
      padding: 12px 14px;
      border-radius: 14px;
      background: rgba(218, 111, 59, 0.1);
      color: #8e4924;
      font-size: 13px;
      line-height: 1.45;
    }

    .card {
      display: grid;
      gap: 14px;
      padding: 14px;
      border: 1px solid rgba(33, 41, 37, 0.08);
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.76);
    }

    .card-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      align-items: center;
    }

    .word {
      margin: 0;
      font-size: 24px;
      font-family: "Iowan Old Style", "Palatino Linotype", serif;
    }

    .meta {
      margin: 0;
      color: #657066;
      font-size: 12px;
      line-height: 1.5;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .source-chip {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      background: rgba(218, 111, 59, 0.12);
      color: #9d5128;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .source-chip[data-mode="loading"] {
      background: rgba(73, 106, 181, 0.12);
      color: #496ab5;
    }

    .card-panels {
      display: grid;
      gap: 10px;
    }

    .card-panel {
      display: grid;
      gap: 6px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid rgba(33, 41, 37, 0.08);
      background: rgba(247, 241, 233, 0.7);
    }

    .card-panel-example {
      background: rgba(255, 255, 255, 0.88);
    }

    .section-label {
      margin: 0;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #657066;
    }

    .meaning-copy,
    .example-copy {
      margin: 0;
      line-height: 1.55;
    }

    .meaning-copy {
      font-size: 15px;
      color: #27312d;
    }

    .example-copy {
      font-size: 14px;
      color: #4a5a50;
      font-style: italic;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 46px;
      padding: 4px 10px;
      border-radius: 999px;
      background: rgba(220, 108, 53, 0.14);
      color: #b04b1f;
      font-size: 11px;
      font-weight: 700;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .primary,
    .secondary {
      border-radius: 999px;
      font: inherit;
      cursor: pointer;
      padding: 10px 12px;
    }

    .primary {
      border: none;
      color: white;
      background: linear-gradient(135deg, #da6f3b 0%, #aa461a 100%);
    }

    .secondary {
      border: 1px solid rgba(33, 41, 37, 0.12);
      color: #1f2925;
      background: transparent;
    }

    .primary[disabled],
    .secondary[disabled] {
      opacity: 0.56;
      cursor: default;
    }

    .details {
      display: grid;
      gap: 6px;
      padding-top: 8px;
      border-top: 1px solid rgba(33, 41, 37, 0.08);
      color: #5d665d;
      font-size: 13px;
      line-height: 1.45;
    }
  `;

  const state = {
    settings: {
      readingMode: false,
      cefrLevel: "B1"
    },
    savedWordKeys: [],
    bubbleHost: null,
    shadowRoot: null,
    currentRunId: 0,
    currentRange: null,
    currentCards: [],
    currentMeta: null
  };

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        resolve(response);
      });
    });
  }

  function normalizeKeyPart(value) {
    return String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function getSaveKey(card) {
    const lemma = normalizeKeyPart(card.lemma ?? card.surface);
    const sentence = normalizeKeyPart(card.sentence ?? card.example_simple_en);
    const definition = normalizeKeyPart(card.definition_simple_en);
    return [lemma, sentence || definition].join("::");
  }

  function getSelectionInfo() {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const text = selection.toString().trim();
    if (!text) {
      return null;
    }

    const range = selection.getRangeAt(0).cloneRange();
    const rect = range.getBoundingClientRect();

    if (!rect || (!rect.width && !rect.height)) {
      return null;
    }

    return {
      text,
      range,
      rect
    };
  }

  function ensureBubbleHost() {
    if (state.bubbleHost) {
      return;
    }

    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.inset = "0 auto auto 0";
    host.style.zIndex = "2147483647";
    host.style.pointerEvents = "auto";

    const shadow = host.attachShadow({ mode: "open" });
    document.documentElement.appendChild(host);

    state.bubbleHost = host;
    state.shadowRoot = shadow;
  }

  function closeBubble() {
    if (state.bubbleHost) {
      state.bubbleHost.remove();
      state.bubbleHost = null;
      state.shadowRoot = null;
      state.currentRange = null;
      state.currentCards = [];
    }
  }

  function escapeHtml(value) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;");
  }

  function getRenderableCards(cards = state.currentCards) {
    return cards.filter((card) => card.content_source !== "fallback");
  }

  function cardMarkup(card) {
    const saveKey = getSaveKey(card);
    const isSaved = state.savedWordKeys.includes(saveKey);
    const isLoadingCard = card.content_source === "loading";
    const meaningCopy = isLoadingCard ? "Loading meaning..." : card.definition_simple_en;
    const exampleCopy = isLoadingCard ? "Loading example..." : card.example_simple_en;

    return `
      <article class="card" data-card-key="${escapeHtml(card.same_context_key)}">
        <div class="card-head">
          <div>
            <h3 class="word">${escapeHtml(card.surface)}</h3>
            <div class="meta-row">
              <p class="meta">${escapeHtml(card.lemma)} · ${escapeHtml(card.part_of_speech)}</p>
              ${isLoadingCard ? `<span class="source-chip" data-mode="loading">Loading</span>` : ""}
            </div>
          </div>
          <span class="badge">${escapeHtml(card.cefr)}</span>
        </div>
        <div class="card-panels">
          <section class="card-panel">
            <p class="section-label">Meaning</p>
            <p class="meaning-copy">${escapeHtml(meaningCopy)}</p>
          </section>
          <section class="card-panel card-panel-example">
            <p class="section-label">Example</p>
            <p class="example-copy">${escapeHtml(exampleCopy)}</p>
          </section>
        </div>
        <div class="actions">
          <button class="primary" type="button" data-action="save" data-card-key="${escapeHtml(card.same_context_key)}" ${isLoadingCard ? "disabled" : ""}>${isSaved ? "Unsave word" : "Save word"}</button>
          <button class="secondary" type="button" data-action="details" data-card-key="${escapeHtml(card.same_context_key)}" ${(card.details_loaded || isLoadingCard) ? "disabled" : ""}>${card.details_loaded ? "More loaded" : "More"}</button>
        </div>
        ${card.details_loaded ? `
          <div class="details">
            <div><strong>Synonyms:</strong> ${card.synonyms?.length ? escapeHtml(card.synonyms.join(", ")) : "None"}</div>
            <div><strong>Collocations:</strong> ${card.collocations?.length ? escapeHtml(card.collocations.join(", ")) : "None"}</div>
          </div>
        ` : ""}
      </article>
    `;
  }

  function renderBubble(status) {
    ensureBubbleHost();

    let content = "";

    if (status.kind === "loading") {
      content = `<div class="status">Looking for words that may be hard at your level…</div>`;
    } else if (status.kind === "error") {
      content = `<div class="status">Could not analyze this text. Please try again.</div>`;
    } else if (status.kind === "message") {
      content = `<div class="status">${escapeHtml(status.message)}</div>`;
    } else {
      content = getRenderableCards().map(cardMarkup).join("");
    }

    state.shadowRoot.innerHTML = `
      <style>${STYLE_TEXT}</style>
      <div class="bubble">
        <div class="header">
          <div class="header-copy">
            <p class="eyebrow">Reading mode</p>
            <p class="title">Words at ${escapeHtml(state.settings.cefrLevel)} and above</p>
          </div>
          <button class="close-button" type="button" aria-label="Close">×</button>
        </div>
        <div class="content">${content}</div>
      </div>
    `;

    state.shadowRoot.querySelector(".close-button").addEventListener("click", closeBubble);
    state.shadowRoot.querySelectorAll("[data-action='save']").forEach((button) => {
      button.addEventListener("click", onSaveCard);
    });
    state.shadowRoot.querySelectorAll("[data-action='details']").forEach((button) => {
      button.addEventListener("click", onLoadDetails);
    });

    positionBubble();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function getRectOverlapArea(first, second) {
    const overlapWidth = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
    const overlapHeight = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    return overlapWidth * overlapHeight;
  }

  function getRectDistance(first, second) {
    const horizontalGap = Math.max(0, Math.max(second.left - first.right, first.left - second.right));
    const verticalGap = Math.max(0, Math.max(second.top - first.bottom, first.top - second.bottom));
    return horizontalGap + verticalGap;
  }

  function positionBubble() {
    if (!state.bubbleHost || !state.shadowRoot) {
      return;
    }

    const rect = state.currentRange?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const bubble = state.shadowRoot.querySelector(".bubble");
    if (!bubble) {
      return;
    }

    const bubbleRect = bubble.getBoundingClientRect();
    const padding = 12;
    const gap = 16;
    const maxTop = Math.max(padding, window.innerHeight - bubbleRect.height - padding);
    const maxLeft = Math.max(padding, window.innerWidth - bubbleRect.width - padding);
    const selectionRect = {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left
    };

    const candidates = [
      { top: rect.top, left: rect.right + gap, priority: 0 },
      { top: rect.top + (rect.height - bubbleRect.height) / 2, left: rect.right + gap, priority: 1 },
      { top: rect.top, left: rect.left - bubbleRect.width - gap, priority: 2 },
      { top: rect.top + (rect.height - bubbleRect.height) / 2, left: rect.left - bubbleRect.width - gap, priority: 3 },
      { top: rect.bottom + gap, left: rect.left, priority: 4 },
      { top: rect.bottom + gap, left: rect.left + (rect.width - bubbleRect.width) / 2, priority: 5 },
      { top: rect.top - bubbleRect.height - gap, left: rect.left, priority: 6 },
      { top: rect.top - bubbleRect.height - gap, left: rect.left + (rect.width - bubbleRect.width) / 2, priority: 7 }
    ];

    const bestCandidate = candidates
      .map((candidate) => {
        const top = clamp(candidate.top, padding, maxTop);
        const left = clamp(candidate.left, padding, maxLeft);
        const placedBubble = {
          top,
          right: left + bubbleRect.width,
          bottom: top + bubbleRect.height,
          left
        };

        return {
          ...candidate,
          top,
          left,
          overlapArea: getRectOverlapArea(placedBubble, selectionRect),
          distance: getRectDistance(placedBubble, selectionRect)
        };
      })
      .sort((first, second) => {
        if (first.overlapArea !== second.overlapArea) {
          return first.overlapArea - second.overlapArea;
        }

        if (first.distance !== second.distance) {
          return first.distance - second.distance;
        }

        return first.priority - second.priority;
      })[0];

    if (!bestCandidate) {
      return;
    }

    state.bubbleHost.style.top = `${bestCandidate.top}px`;
    state.bubbleHost.style.left = `${bestCandidate.left}px`;
  }

  function eventIsInsideBubble(event) {
    if (!state.bubbleHost) {
      return false;
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(state.bubbleHost) || state.bubbleHost.contains(event.target);
  }

  function syncSaveButtons() {
    if (!state.shadowRoot) {
      return;
    }

    state.shadowRoot.querySelectorAll("[data-action='save']").forEach((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      const key = button.dataset.cardKey;
      const card = state.currentCards.find((item) => item.same_context_key === key);

      if (!card) {
        return;
      }

      if (card.content_source === "loading") {
        button.disabled = true;
        button.textContent = "Loading…";
        return;
      }

      const isSaved = state.savedWordKeys.includes(getSaveKey(card));
      button.disabled = false;
      button.textContent = isSaved ? "Unsave word" : "Save word";
    });
  }

  async function onSaveCard(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const key = button.dataset.cardKey;
    const card = state.currentCards.find((item) => item.same_context_key === key);

    if (!card || card.content_source === "loading") {
      return;
    }

    const saveKey = getSaveKey(card);
    const isSaved = state.savedWordKeys.includes(saveKey);

    button.disabled = true;
    button.textContent = isSaved ? "Removing…" : "Saving…";

    const response = await sendMessage(
      isSaved
        ? {
            type: "unsave-word",
            saveKey
          }
        : {
            type: "save-word",
            card
          }
    ).catch(() => ({ ok: false }));

    if (!response?.ok) {
      syncSaveButtons();
      return;
    }

    if (isSaved) {
      state.savedWordKeys = state.savedWordKeys.filter((entry) => entry !== saveKey);
    } else if (!state.savedWordKeys.includes(response.data.saveKey ?? saveKey)) {
      state.savedWordKeys = [...state.savedWordKeys, response.data.saveKey ?? saveKey];
    }

    syncSaveButtons();
  }

  async function onLoadDetails(event) {
    const button = event.currentTarget;
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const key = button.dataset.cardKey;
    const card = state.currentCards.find((item) => item.same_context_key === key);

    if (!card) {
      return;
    }

    button.disabled = true;
    button.textContent = "Loading…";

    const response = await sendMessage({
      type: "request-details",
      payload: {
        surface: card.surface,
        lemma: card.lemma,
        sentence: card.sentence,
        previousSentence: card.previous_sentence,
        nextSentence: card.next_sentence
      }
    }).catch(() => ({ ok: false }));

    if (!response?.ok) {
      button.disabled = false;
      button.textContent = "More";
      return;
    }

    Object.assign(card, response.data, {
      details_loaded: true
    });
    renderBubble({ kind: "results" });
  }

  async function triggerAnalysis() {
    const selection = getSelectionInfo();

    if (!selection) {
      closeBubble();
      return;
    }

    const runId = ++state.currentRunId;
    state.currentRange = selection.range;
    renderBubble({ kind: "loading" });

    const previewPromise = sendMessage({
      type: "request-analysis-preview",
      selectionText: selection.text
    }).catch(() => ({ ok: false }));

    const responsePromise = sendMessage({
      type: "request-analysis",
      selectionText: selection.text
    }).catch(() => ({ ok: false }));

    const previewResponse = await previewPromise;

    if (runId !== state.currentRunId) {
      return;
    }

    if (previewResponse?.ok) {
      if (previewResponse.data.selection_too_long) {
        renderBubble({
          kind: "message",
          message: previewResponse.data.message || "Please select a shorter text."
        });
        return;
      }

      state.currentCards = previewResponse.data.cards ?? [];
      state.currentMeta = previewResponse.data.meta ?? null;

      if (state.currentCards.length) {
        renderBubble({ kind: "results" });
      }
    }

    const response = await responsePromise;

    if (runId !== state.currentRunId) {
      return;
    }

    if (!response?.ok) {
      renderBubble({ kind: "error" });
      return;
    }

    if (response.data.selection_too_long) {
      renderBubble({
        kind: "message",
        message: response.data.message || "Please select a shorter text."
      });
      return;
    }

    state.currentCards = getRenderableCards(response.data.cards ?? []);
    state.currentMeta = response.data.meta ?? null;

    if (!state.currentCards.length) {
      renderBubble({
        kind: "message",
        message: state.currentMeta?.fallback_reason
          ? "Could not load meanings for this selection. Please try again."
          : "No words at or above your level in this selection."
      });
      return;
    }

    renderBubble({ kind: "results" });
  }

  function handleSelectionMouseUp(event) {
    if (event.button !== 0 || !state.settings.readingMode) {
      return;
    }

    if (eventIsInsideBubble(event)) {
      return;
    }

    window.setTimeout(() => {
      void triggerAnalysis();
    }, 20);
  }

  function handleDocumentClick(event) {
    if (!state.bubbleHost) {
      return;
    }

    if (eventIsInsideBubble(event)) {
      return;
    }

    closeBubble();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "trigger-analysis") {
      void triggerAnalysis();
      sendResponse({ ok: true });
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
      return;
    }

    if (changes.settings) {
      state.settings = {
        ...state.settings,
        ...changes.settings.newValue
      };
    }

    if (changes.savedWords) {
      state.savedWordKeys = (changes.savedWords.newValue ?? [])
        .map((entry) => entry.saveKey)
        .filter(Boolean);

      syncSaveButtons();
    }
  });

  async function init() {
    const response = await sendMessage({
      type: "get-state"
    }).catch(() => null);

    if (response?.ok) {
      state.settings = response.settings;
      state.savedWordKeys = response.savedWordKeys ?? [];
    }

    document.addEventListener("mouseup", handleSelectionMouseUp, true);
    document.addEventListener("mousedown", handleDocumentClick, true);
    document.addEventListener("keyup", (event) => {
      if (event.key === "Escape") {
        closeBubble();
      }
    });
    window.addEventListener("scroll", positionBubble, true);
    window.addEventListener("resize", positionBubble);
  }

  void init();
})();
