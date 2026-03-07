# Chrome Web Store Privacy Answers

## Single Purpose

Help English learners understand difficult words in selected webpage text by showing simple inline vocabulary support.

## Permission Justifications

- `storage`
  Save the user’s CEFR level, reading mode state, onboarding completion, and saved vocabulary locally in Chrome.

- `contextMenus`
  Add a right-click action so the user can analyze selected text without opening the popup.

- `tabs`
  Open the onboarding page and saved words dashboard from the popup and first-run flow.

- Host permissions
  Read the user’s selected text on webpages and send that selected text to the configured backend API for vocabulary analysis.

## Data Handling Answers

- User data collected
  Selected text, nearby sentence context, extension settings, and saved vocabulary entries.

- Is the data sold?
  No.

- Is the data used for advertising?
  No.

- Is the data used for creditworthiness or lending decisions?
  No.

- Is the data handled only to provide the extension’s core feature?
  Yes.

## Remote Code

Answer `No` unless you later add any system that downloads and executes remote JavaScript inside the extension itself.

Calling your own backend or an AI API is not remote code execution in the extension package.
