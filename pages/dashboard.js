import {
  getSavedWords,
  getSettings,
  removeSavedWord,
  setSettings
} from "../shared/storage.js";

const tabButtons = [...document.querySelectorAll(".tab-button")];
const panels = [...document.querySelectorAll(".panel")];
const savedCount = document.querySelector("#saved-count");
const savedList = document.querySelector("#saved-list");
const settingsCefrLevel = document.querySelector("#settings-cefr-level");
const onboardingCefrLevel = document.querySelector("#onboarding-cefr-level");
const finishOnboardingButton = document.querySelector("#finish-onboarding");
const turnReadingOnButton = document.querySelector("#turn-reading-on");
const reviewEmpty = document.querySelector("#review-empty");
const reviewCard = document.querySelector("#review-card");
const reviewFront = document.querySelector("#review-front");
const reviewBack = document.querySelector("#review-back");
const reviewPrompt = document.querySelector("#review-prompt");
const reviewDefinition = document.querySelector("#review-definition");
const reviewExample = document.querySelector("#review-example");
const reviewCefr = document.querySelector("#review-cefr");
const flipCardButton = document.querySelector("#flip-card");
const nextCardButton = document.querySelector("#next-card");

const state = {
  activePanel: "saved",
  savedWords: [],
  settings: null,
  reviewCard: null,
  reviewRevealed: false
};

function formatSavedDate(value) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function setActivePanel(panelId) {
  state.activePanel = panelId;
  window.location.hash = panelId;

  for (const button of tabButtons) {
    button.dataset.active = String(button.dataset.panel === panelId);
  }

  for (const panel of panels) {
    panel.dataset.active = String(panel.id === `panel-${panelId}`);
  }
}

function chooseRandomCard() {
  if (!state.savedWords.length) {
    state.reviewCard = null;
    return;
  }

  if (state.savedWords.length === 1) {
    state.reviewCard = state.savedWords[0];
    return;
  }

  const currentId = state.reviewCard?.id;
  const options = state.savedWords.filter((card) => card.id !== currentId);
  state.reviewCard = options[Math.floor(Math.random() * options.length)];
}

function renderSavedWords() {
  savedCount.textContent = `${state.savedWords.length} saved ${state.savedWords.length === 1 ? "word" : "words"}`;

  if (!state.savedWords.length) {
    savedList.innerHTML = `<div class="empty-state">No saved words yet. Save one from the reading bubble first.</div>`;
    return;
  }

  savedList.innerHTML = state.savedWords.map((entry) => `
    <article class="saved-card">
      <div class="saved-head">
        <div class="saved-headline">
          <h3 class="saved-surface">${entry.surface ?? entry.lemma}</h3>
          <span class="badge">${entry.cefr}</span>
        </div>
        <button class="saved-remove" type="button" data-remove-id="${entry.id}">Remove</button>
      </div>
      <p class="saved-meta">${entry.lemma} · ${entry.part_of_speech ?? "word"} · saved ${formatSavedDate(entry.savedAt)}</p>
      <p>${entry.definition_simple_en}</p>
      <p class="saved-example">${entry.example_simple_en}</p>
    </article>
  `).join("");
}

function renderReviewCard() {
  if (!state.savedWords.length || !state.reviewCard) {
    reviewEmpty.hidden = false;
    reviewCard.hidden = true;
    return;
  }

  reviewEmpty.hidden = true;
  reviewCard.hidden = false;
  reviewFront.textContent = state.reviewCard.surface ?? state.reviewCard.lemma;
  reviewDefinition.textContent = state.reviewCard.review_definition_en ?? state.reviewCard.definition_simple_en;
  reviewExample.textContent = state.reviewCard.review_example_en ?? state.reviewCard.example_simple_en;
  reviewCefr.textContent = state.reviewCard.cefr;
  reviewBack.hidden = !state.reviewRevealed;
  reviewPrompt.hidden = state.reviewRevealed;
  flipCardButton.textContent = state.reviewRevealed ? "Hide meaning" : "Show meaning";
}

async function hydrate() {
  const [settings, savedWords] = await Promise.all([getSettings(), getSavedWords()]);
  state.settings = settings;
  state.savedWords = savedWords;
  state.reviewRevealed = false;
  settingsCefrLevel.value = settings.cefrLevel;
  onboardingCefrLevel.value = settings.cefrLevel;
  chooseRandomCard();
  renderSavedWords();
  renderReviewCard();

  const requestedPanel = window.location.hash.replace("#", "");
  const defaultPanel = settings.onboardingCompleted ? "saved" : "onboarding";
  setActivePanel(requestedPanel || defaultPanel);
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActivePanel(button.dataset.panel);
  });
});

savedList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-id]");

  if (!button) {
    return;
  }

  await removeSavedWord(button.dataset.removeId);
  state.savedWords = await getSavedWords();

  if (state.reviewCard && !state.savedWords.find((entry) => entry.id === state.reviewCard.id)) {
    state.reviewCard = null;
  }

  chooseRandomCard();
  renderSavedWords();
  renderReviewCard();
});

settingsCefrLevel.addEventListener("change", async (event) => {
  const next = await setSettings({
    cefrLevel: event.target.value
  });
  state.settings = next;
  onboardingCefrLevel.value = next.cefrLevel;
});

finishOnboardingButton.addEventListener("click", async () => {
  state.settings = await setSettings({
    cefrLevel: onboardingCefrLevel.value,
    onboardingCompleted: true
  });
  settingsCefrLevel.value = state.settings.cefrLevel;
  setActivePanel("saved");
});

turnReadingOnButton.addEventListener("click", async () => {
  state.settings = await setSettings({
    cefrLevel: onboardingCefrLevel.value,
    onboardingCompleted: true,
    readingMode: true
  });
  settingsCefrLevel.value = state.settings.cefrLevel;
  setActivePanel("saved");
});

flipCardButton.addEventListener("click", () => {
  state.reviewRevealed = !state.reviewRevealed;
  renderReviewCard();
});

nextCardButton.addEventListener("click", () => {
  chooseRandomCard();
  state.reviewRevealed = false;
  renderReviewCard();
});

chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local" || (!changes.savedWords && !changes.settings)) {
    return;
  }

  await hydrate();
});

void hydrate();
