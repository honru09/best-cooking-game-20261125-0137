// Midnight Bento Rush — bundle packager for make.fun (Node 22 stdlib only).
// Copies static game files and validated screenshots to the output target,
// enforces deterministic file modes, and emits dossier.json via makefun-game.ts.

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const TARGET_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');
const MIN_SCREENSHOTS = 3;
const MAX_SCREENSHOTS = 4;

const GATE_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: MAX_SCREENSHOTS, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function collectScreenshotFiles(shotsDir: string): string[] {
  if (!existsSync(shotsDir)) return [];
  return readdirSync(shotsDir)
    .filter((entry) => !entry.startsWith('.'))
    .sort()
    .filter((entry) => statSync(join(shotsDir, entry)).isFile());
}

function normalizePermissions(dirPath: string): void {
  chmodSync(dirPath, 0o755);
  const entries = readdirSync(dirPath).sort();
  for (const name of entries) {
    const full = join(dirPath, name);
    const info = statSync(full);
    if (info.isDirectory()) {
      normalizePermissions(full);
    } else if (info.isFile()) {
      chmodSync(full, 0o644);
    }
  }
}

function packageEntry(): void {
  const srcGame = join(REPO_ROOT, 'game');
  const srcShots = join(REPO_ROOT, 'screenshots');

  if (!existsSync(srcGame)) {
    throw new Error(`Missing game directory at ${srcGame}`);
  }

  if (!existsSync(join(srcGame, 'index.html'))) {
    throw new Error(`Missing game entrypoint at ${join(srcGame, 'index.html')}`);
  }

  const shotFiles = collectScreenshotFiles(srcShots);
  if (shotFiles.length < MIN_SCREENSHOTS || shotFiles.length > MAX_SCREENSHOTS) {
    throw new Error(
      `Found ${shotFiles.length} screenshots; expected between ${MIN_SCREENSHOTS} and ${MAX_SCREENSHOTS}`,
    );
  }

  mkdirSync(TARGET_DIR, { recursive: true });
  const dstGame = join(TARGET_DIR, 'game');
  const dstShots = join(TARGET_DIR, 'screenshots');

  cpSync(srcGame, dstGame, { recursive: true, force: true });
  mkdirSync(dstShots, { recursive: true });
  for (const fileName of shotFiles) {
    cpSync(join(srcShots, fileName), join(dstShots, fileName), { force: true });
  }

  normalizePermissions(dstGame);
  normalizePermissions(dstShots);

  const dossierBytes = buildDossier(TARGET_DIR, GATE_LIMITS);
  const dossierPath = join(TARGET_DIR, 'dossier.json');
  writeFileSync(dossierPath, dossierBytes);
  chmodSync(dossierPath, 0o644);
}

packageEntry();
