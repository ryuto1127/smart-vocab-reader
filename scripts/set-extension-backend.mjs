import { readFile, writeFile } from "node:fs/promises";

const runtimeConfigUrl = new URL("../shared/runtime-config.js", import.meta.url);
const manifestUrl = new URL("../manifest.json", import.meta.url);

const input = process.argv[2];

if (!input) {
  console.error("Usage: npm run configure:backend -- https://your-worker-subdomain.workers.dev");
  process.exit(1);
}

let parsedUrl;

try {
  parsedUrl = new URL(input);
} catch {
  console.error("Backend URL must be a valid absolute URL.");
  process.exit(1);
}

const isLocalhost = parsedUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsedUrl.hostname);

if (!isLocalhost && parsedUrl.protocol !== "https:") {
  console.error("Backend URL must use https unless it is localhost for local development.");
  process.exit(1);
}

const normalizedBaseUrl = parsedUrl.origin;
const runtimeConfigSource = `export const DEFAULT_BACKEND_BASE_URL = "${normalizedBaseUrl}";\n`;

const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
const hostPermissions = new Set(manifest.host_permissions ?? []);

hostPermissions.add("http://localhost:8787/*");
hostPermissions.add("http://127.0.0.1:8787/*");
hostPermissions.add("https://*.workers.dev/*");
hostPermissions.add(`${normalizedBaseUrl}/*`);

manifest.host_permissions = [...hostPermissions].sort();

await writeFile(runtimeConfigUrl, runtimeConfigSource);
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Configured extension backend URL: ${normalizedBaseUrl}`);
