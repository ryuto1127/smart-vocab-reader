const LAST_UPDATED = "March 7, 2026";

function htmlDocument({ title, body }) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7efe4;
        --panel: rgba(255, 252, 247, 0.92);
        --ink: #1f2925;
        --muted: #5f6d63;
        --accent: #cf6629;
        --line: rgba(31, 41, 37, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(207, 102, 41, 0.10), transparent 30%),
          linear-gradient(180deg, #f9f2e8 0%, #efe3d1 100%);
      }

      main {
        width: min(760px, calc(100vw - 32px));
        margin: 48px auto;
        padding: 32px;
        border: 1px solid var(--line);
        border-radius: 28px;
        background: var(--panel);
        box-shadow: 0 20px 60px rgba(24, 24, 19, 0.10);
      }

      h1,
      h2 {
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        line-height: 1.1;
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 6vw, 3.4rem);
      }

      h2 {
        margin: 28px 0 10px;
        font-size: 1.4rem;
      }

      p,
      li {
        line-height: 1.65;
        color: var(--ink);
        font-size: 1rem;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        letter-spacing: 0.18em;
        font-size: 0.78rem;
        font-weight: 700;
        text-transform: uppercase;
      }

      .lede {
        margin: 0;
        color: var(--muted);
        font-size: 1.08rem;
      }

      .pill {
        display: inline-block;
        margin-top: 16px;
        padding: 8px 12px;
        border-radius: 999px;
        background: rgba(207, 102, 41, 0.12);
        color: var(--accent);
        font-weight: 700;
      }

      a {
        color: var(--accent);
      }

      ul {
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <main>
      ${body}
    </main>
  </body>
</html>`;
}

export function renderLandingPage() {
  return htmlDocument({
    title: "CEFR Reading Assistant API",
    body: `
      <p class="eyebrow">CEFR Reading Assistant</p>
      <h1>Worker API is live</h1>
      <p class="lede">This service powers inline vocabulary analysis for the CEFR Reading Assistant Chrome extension.</p>
      <p class="pill">Privacy policy: <a href="/privacy">/privacy</a></p>
      <h2>Available routes</h2>
      <ul>
        <li><code>GET /health</code> for a health check</li>
        <li><code>POST /api/analyze</code> for vocabulary analysis</li>
        <li><code>POST /api/details</code> for on-demand synonyms and collocations</li>
      </ul>
    `
  });
}

export function renderPrivacyPolicyPage() {
  return htmlDocument({
    title: "CEFR Reading Assistant Privacy Policy",
    body: `
      <p class="eyebrow">Privacy Policy</p>
      <h1>CEFR Reading Assistant</h1>
      <p class="lede">Last updated: ${LAST_UPDATED}</p>

      <h2>What we process</h2>
      <p>The extension may process text you select on a webpage, nearby sentence context, your CEFR setting, reading-mode preference, and words you choose to save for review.</p>

      <h2>How we use the data</h2>
      <p>We use selected text only to analyze difficult vocabulary, generate simple meanings and examples, show inline vocabulary cards, and support saved-word review features.</p>

      <h2>Where data is stored</h2>
      <ul>
        <li>Settings and saved words are stored locally in Chrome.</li>
        <li>Selected text may be sent to the extension backend hosted on Cloudflare Workers.</li>
        <li>The backend may send selected text and sentence context to OpenAI to generate structured vocabulary analysis.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell your data.</li>
        <li>We do not use your data for advertising.</li>
        <li>We do not use your data for creditworthiness, lending, or insurance decisions.</li>
        <li>We do not require an account for the current version.</li>
      </ul>

      <h2>Data retention</h2>
      <p>Saved words remain in local Chrome storage until you remove them or uninstall the extension. Backend request retention depends on operational logging and provider policies.</p>

      <h2>Third-party services</h2>
      <p>This product uses Cloudflare Workers for backend hosting and OpenAI for vocabulary analysis.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Turn Reading mode on or off at any time.</li>
        <li>Choose what text to select for analysis.</li>
        <li>Remove saved words from the dashboard.</li>
        <li>Uninstall the extension to stop all processing.</li>
      </ul>

      <h2>Contact</h2>
      <p>ryuto.2007.11.27@gmail.com</p>
    `
  });
}
