import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");
const distDir = join(projectRoot, "dist");
const stageDir = join(distDir, "cefr-reading-assistant");

const rootFiles = [
  "manifest.json",
  "background.js",
  "content-script.js",
  "popup.html",
  "popup.css",
  "popup.js"
];

const rootDirs = [
  "pages",
  "shared",
  "assets"
];

async function ensureFileExists(relativePath) {
  await readFile(join(projectRoot, relativePath));
}

async function copyIntoStage(relativePath) {
  const source = join(projectRoot, relativePath);
  const target = join(stageDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await cp(source, target, { recursive: true });
}

async function main() {
  const manifest = JSON.parse(await readFile(join(projectRoot, "manifest.json"), "utf8"));
  const version = manifest.version;
  const zipName = `cefr-reading-assistant-${version}.zip`;
  const zipPath = join(distDir, zipName);

  for (const iconPath of Object.values(manifest.icons ?? {})) {
    await ensureFileExists(iconPath);
  }

  await rm(stageDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await mkdir(stageDir, { recursive: true });

  for (const relativePath of rootFiles) {
    await copyIntoStage(relativePath);
  }

  for (const relativePath of rootDirs) {
    await copyIntoStage(relativePath);
  }

  await execFileAsync(
    "zip",
    ["-q", "-r", "-FS", zipPath, "."],
    { cwd: stageDir }
  );

  console.log(`Created ${zipPath}`);
}

await main();
