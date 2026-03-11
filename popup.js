import { getSavedWords, getSettings, setSettings } from "./shared/storage.js";

const toggleButton = document.querySelector("#toggle-reading");
const cefrSelect = document.querySelector("#cefr-level");
const savedSummary = document.querySelector("#saved-summary");
const openDashboardButton = document.querySelector("#open-dashboard");
const openOnboardingButton = document.querySelector("#open-onboarding");

function renderToggle(settings) {
  toggleButton.dataset.active = String(settings.readingMode);
  toggleButton.textContent = settings.readingMode ? "Reading mode is ON" : "Turn reading mode ON";
}

async function hydrate() {
  const [settings, savedWords] = await Promise.all([getSettings(), getSavedWords()]);
  cefrSelect.value = settings.cefrLevel;
  renderToggle(settings);
  savedSummary.textContent = `${savedWords.length} saved ${savedWords.length === 1 ? "word" : "words"}`;
}

toggleButton.addEventListener("click", async (event) => {
  event.preventDefault();
  event.stopPropagation();
  const settings = await getSettings();
  const next = await setSettings({
    readingMode: !settings.readingMode
  });
  renderToggle(next);
});

cefrSelect.addEventListener("change", async (event) => {
  await setSettings({
    cefrLevel: event.target.value
  });
});

openDashboardButton.addEventListener("click", async () => {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("pages/dashboard.html#saved")
  });
});

openOnboardingButton.addEventListener("click", async () => {
  await chrome.tabs.create({
    url: chrome.runtime.getURL("pages/dashboard.html#onboarding")
  });
});

void hydrate();
