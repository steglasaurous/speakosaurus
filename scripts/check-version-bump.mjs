#!/usr/bin/env node
/**
 * Fail unless package.json version is strictly greater than the base ref's version.
 *
 * Usage:
 *   node scripts/check-version-bump.mjs
 *   node scripts/check-version-bump.mjs --base main
 *   node scripts/check-version-bump.mjs --base-ref origin/main
 *   node scripts/check-version-bump.mjs --base-ref <sha>
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const args = argv.slice(2);
  let baseRef = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base-ref' && args[i + 1]) {
      baseRef = args[++i];
    } else if (args[i] === '--base' && args[i + 1]) {
      baseRef = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(
        'Usage: node scripts/check-version-bump.mjs [--base main | --base-ref <ref>]',
      );
      process.exit(0);
    }
  }
  return { baseRef: baseRef || 'origin/main' };
}

function parseSemver(version) {
  if (typeof version !== 'string' || !version.trim()) {
    throw new Error(`Missing or empty version: ${JSON.stringify(version)}`);
  }
  const cleaned = version.trim().replace(/^v/, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(
      `Expected semver x.y.z, got ${JSON.stringify(version)}`,
    );
  }
  return {
    raw: cleaned,
    parts: [Number(match[1]), Number(match[2]), Number(match[3])],
  };
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a.parts[i] > b.parts[i]) return 1;
    if (a.parts[i] < b.parts[i]) return -1;
  }
  return 0;
}

function readLocalVersion() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return parseSemver(pkg.version);
}

function readBaseVersion(baseRef) {
  let json;
  try {
    json = execFileSync('git', ['show', `${baseRef}:package.json`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch (err) {
    throw new Error(
      `Could not read package.json from ${baseRef}. Fetch the base branch first (e.g. git fetch origin main).\n${err.message}`,
    );
  }
  const pkg = JSON.parse(json);
  return parseSemver(pkg.version);
}

function main() {
  const { baseRef } = parseArgs(process.argv);
  const current = readLocalVersion();
  const base = readBaseVersion(baseRef);

  if (compareSemver(current, base) <= 0) {
    console.error(
      `Version bump required before merging to main.\n` +
        `  current: ${current.raw}\n` +
        `  ${baseRef}: ${base.raw}\n` +
        `Bump "version" in package.json to a higher semver (e.g. patch +1).`,
    );
    process.exit(1);
  }

  console.log(
    `Version OK: ${current.raw} > ${base.raw} (${baseRef})`,
  );
}

try {
  main();
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
