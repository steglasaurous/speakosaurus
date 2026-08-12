#!/usr/bin/env node
/**
 * Download python-build-standalone, install piper-tts[http], and fetch the
 * default Piper voice into vendor/piper/<platform>/.
 *
 * Usage:
 *   node scripts/prepare-piper-runtime.mjs
 *   node scripts/prepare-piper-runtime.mjs --target win-x64
 *   node scripts/prepare-piper-runtime.mjs --target linux-x64
 *   node scripts/prepare-piper-runtime.mjs --target all
 */

import { spawnSync } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const VENDOR_ROOT = join(ROOT, 'vendor', 'piper');

const PBS_TAG = '20260807';
const PBS_VERSION = '3.12.13';
const PBS_BASE = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}`;

const DEFAULT_VOICE = 'en_US-lessac-medium';
const VOICE_BASE =
  'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium';

const TARGETS = {
  'win-x64': {
    asset: `cpython-${PBS_VERSION}+${PBS_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`,
    pythonRel: join('python', 'python.exe'),
    canRunOnHost: process.platform === 'win32',
  },
  'linux-x64': {
    asset: `cpython-${PBS_VERSION}+${PBS_TAG}-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz`,
    pythonRel: join('python', 'bin', 'python3'),
    canRunOnHost: process.platform === 'linux',
  },
};

function parseTargets() {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const idx = args.indexOf('--target');
  let value = idx >= 0 ? args[idx + 1] : null;
  if (!value) {
    const positional = args.find((a) => !a.startsWith('-'));
    value = positional || null;
  }
  if (!value || value === 'host') {
    if (process.platform === 'win32') return ['win-x64'];
    if (process.platform === 'linux') return ['linux-x64'];
    throw new Error(
      `Unsupported host platform ${process.platform}. Use --target win-x64|linux-x64|all`,
    );
  }
  if (value === 'all') return Object.keys(TARGETS);
  if (!(value in TARGETS)) {
    throw new Error(`Unknown target "${value}". Use win-x64, linux-x64, or all.`);
  }
  return [value];
}

async function download(url, dest) {
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  await pipeline(res.body, createWriteStream(dest));
}

function extractTarGz(archive, destDir) {
  mkdirSync(destDir, { recursive: true });
  console.log(`Extracting ${archive} -> ${destDir}`);
  // Windows 10+ and Linux both ship a tar that understands gzip.
  execFileSync('tar', ['-xzf', archive, '-C', destDir], { stdio: 'inherit' });
}

function run(command, args, opts = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...opts,
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${command} ${args.join(' ')}`);
  }
}

async function ensureVoice(voicesDir) {
  mkdirSync(voicesDir, { recursive: true });
  const onnx = join(voicesDir, `${DEFAULT_VOICE}.onnx`);
  const json = join(voicesDir, `${DEFAULT_VOICE}.onnx.json`);
  if (!existsSync(onnx)) {
    await download(`${VOICE_BASE}/${DEFAULT_VOICE}.onnx`, onnx);
  } else {
    console.log(`Voice already present: ${onnx}`);
  }
  if (!existsSync(json)) {
    await download(`${VOICE_BASE}/${DEFAULT_VOICE}.onnx.json`, json);
  } else {
    console.log(`Voice config already present: ${json}`);
  }
}

async function prepareTarget(targetName) {
  const target = TARGETS[targetName];
  const outDir = join(VENDOR_ROOT, targetName);
  const pythonDir = join(outDir, 'python');
  const voicesDir = join(outDir, 'voices');
  const pythonExe = join(outDir, target.pythonRel);

  console.log(`\n=== Preparing ${targetName} ===`);
  mkdirSync(outDir, { recursive: true });

  if (!existsSync(pythonExe)) {
    const archiveName = target.asset;
    const archivePath = join(tmpdir(), archiveName);
    await download(`${PBS_BASE}/${archiveName}`, archivePath);

    if (existsSync(pythonDir)) {
      rmSync(pythonDir, { recursive: true, force: true });
    }
    // install_only tarballs extract a top-level "python/" directory.
    extractTarGz(archivePath, outDir);
    try {
      rmSync(archivePath, { force: true });
    } catch {
      // ignore cleanup failures
    }
  } else {
    console.log(`Python already present: ${pythonExe}`);
  }

  if (!existsSync(pythonExe)) {
    throw new Error(`Python executable not found after extract: ${pythonExe}`);
  }

  await ensureVoice(voicesDir);

  if (target.canRunOnHost) {
    run(pythonExe, ['-m', 'ensurepip', '--upgrade']);
    run(pythonExe, [
      '-m',
      'pip',
      'install',
      '--upgrade',
      'pip',
      'wheel',
      'setuptools',
    ]);
    run(pythonExe, ['-m', 'pip', 'install', '--upgrade', 'piper-tts[http]']);
  } else {
    console.warn(
      `Skipping pip install for ${targetName}: bundled Python cannot run on this host (${process.platform}).`,
    );
    console.warn(
      `Re-run this script on ${targetName} (or in CI for that OS) to install piper-tts[http].`,
    );
  }

  const runtime = {
    target: targetName,
    pythonRelative: target.pythonRel.replace(/\\/g, '/'),
    defaultVoice: DEFAULT_VOICE,
    pbsTag: PBS_TAG,
    pythonVersion: PBS_VERSION,
    preparedAt: new Date().toISOString(),
    piperInstalled: target.canRunOnHost,
  };
  writeFileSync(join(outDir, 'runtime.json'), JSON.stringify(runtime, null, 2));
  console.log(`Wrote ${join(outDir, 'runtime.json')}`);
}

async function main() {
  const targets = parseTargets();
  for (const t of targets) {
    await prepareTarget(t);
  }
  console.log('\nDone. vendor/piper is ready.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
