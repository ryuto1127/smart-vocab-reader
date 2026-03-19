# CEFR Reading Assistant

A Chrome Extension MVP for English learners who want hard-word help without leaving the page. The extension watches selected text, filters for vocabulary at or above the learner's CEFR level, shows cards in a small bubble near the selection, and lets the learner save words for later review.

## What is in this repo

- `manifest.json`, `background.js`, `content-script.js`, `popup.*`, `pages/*`
  - A no-build Manifest V3 extension shell.
- `backend/*`
  - Runtime-agnostic analysis and OpenAI integration modules used by the Worker.
- `worker/index.js`, `wrangler.toml`
  - A Cloudflare Worker API for analysis and on-demand details.
- `shared/*`
  - CEFR utilities, storage helpers, and vocabulary extraction logic.
- `data/cefr-lexicon.json`
  - Parsed Oxford 3000/5000 source data from the supplied PDFs.
- `scripts/generate_cefr_lexicon.swift`
  - One-step PDFKit parser for regenerating the lexicon locally on macOS.
- `scripts/set-extension-backend.mjs`
  - One-step release helper to stamp the deployed Worker URL into the extension.
- `tests/*`
  - Baseline tests for token normalization, candidate extraction, and Worker routing.

## Stack decision

- Extension: Chrome Manifest V3, browser-native HTML/CSS/JS
- Backend: Cloudflare Worker with Wrangler
- Storage: `chrome.storage.local`
- Parsing: Swift + PDFKit for the Oxford PDFs
- AI integration: OpenAI Responses API with strict JSON schema output

This stack is intentionally thin. The MVP optimizes for low latency, easy inspection, and minimal moving parts over framework weight.

## Vocabulary pipeline

1. The content script captures the selected text.
2. The background worker sends the selection to the Cloudflare Worker API.
3. The backend tokenizes and segments text with `Intl.Segmenter`.
4. It lemmatizes candidates heuristically and checks them against the Oxford CEFR lexicon first.
5. It sends only shortlisted candidates plus a previous/current/next sentence window to the AI layer.
6. The AI returns strict JSON cards with contextual CEFR, part of speech, A1-A2 definition, and A1-A2 example sentence.
7. The extension shows the cards in order of appearance and can save them locally.

## Current MVP behavior

- First-use onboarding page
- Global reading-mode toggle from the popup
- Right-click context menu trigger
- Bubble UI near selected text
- CEFR threshold filtering
- Local saved-word bank
- Random flashcard review
- On-demand synonym/collocation fetch
- Offline fallback cards when `OPENAI_API_KEY` is not set

## Local development

1. Regenerate the CEFR lexicon if needed:

```bash
npm run generate:lexicon
```

2. Install dependencies:

```bash
npm install
```

3. Configure local Worker secrets:

```bash
cp .dev.vars.example .dev.vars
```

4. Add your OpenAI key to `.dev.vars`.

5. Start the local Worker:

```bash
npm run start:backend
```

This serves the API at `http://localhost:8787`, which matches the extension default in [shared/runtime-config.js](/Users/ryuto/Documents/Smart%20Vocab%20Reader/shared/runtime-config.js).

6. In Chrome, open `chrome://extensions`, enable Developer mode, and load this project root as an unpacked extension.

7. The first install opens `pages/dashboard.html#onboarding`. Choose the CEFR level there or later from the popup/settings page.

## Publish workflow

1. Log in to Cloudflare:

```bash
npx wrangler login
```

2. Set the OpenAI secret in Cloudflare:

```bash
npx wrangler secret put OPENAI_API_KEY
```

3. Deploy the Worker:

```bash
npm run deploy:worker
```

4. Copy the deployed Worker URL, then stamp it into the extension:

```bash
npm run configure:backend -- https://your-worker-subdomain.workers.dev
```

That command updates [shared/runtime-config.js](/Users/ryuto/Documents/Smart%20Vocab%20Reader/shared/runtime-config.js) and adds the deployed origin to [manifest.json](/Users/ryuto/Documents/Smart%20Vocab%20Reader/manifest.json) host permissions.

5. Reload the unpacked extension locally and test against the deployed Worker.

6. When it is stable, package the extension directory for Chrome Web Store submission.

## AI configuration

- Default analyze/details model: `gpt-5.4-mini`
- Local development API URL: `http://localhost:8787`
- Deployed API URL: your `workers.dev` endpoint after running `npm run configure:backend -- ...`
- If no API key is present, the backend still returns cards using the local CEFR shortlist, but the definitions/examples are placeholder fallback text.

The OpenAI integration is built around strict JSON-schema output with the Responses API:

- [Structured outputs](https://platform.openai.com/docs/guides/structured-outputs)
- [Responses API](https://platform.openai.com/docs/api-reference/responses)

## Quality checks

Run the baseline tests with:

```bash
npm test
```

## Parsed CEFR data

`data/cefr-lexicon.json` currently contains 5,304 parsed entries across A1 to C1 from the supplied Oxford PDFs. Entries preserve:

- source term
- normalized lookup forms
- CEFR level
- part-of-speech hints
- source list (`oxford3000` or `oxford5000`)

## Future cloud sync and billing path

The current storage and backend split leaves a clean upgrade path:

1. Add user auth to the backend.
2. Move saved words from `chrome.storage.local` to a cloud store with a local cache.
3. Add usage metering and request logs on the Worker side.
4. Introduce per-user API keys, quotas, and plan enforcement.
5. Keep the extension API contract stable so the frontend does not need a major rewrite.
