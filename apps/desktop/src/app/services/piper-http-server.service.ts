import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { app } from 'electron';
import { ChildProcess, spawn, execFile } from 'child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'fs';
import { createServer } from 'net';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_VOICE = 'en_US-lessac-medium';
const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_POLL_MS = 500;
/** Fixed high port avoids clashing with a user Piper on :5000. */
const PREFERRED_PORT = 18765;

export type PiperThreadCap = 'auto' | '1' | '2' | '4';

export function normalizePiperThreadCap(
  value?: string | null,
): PiperThreadCap {
  if (value === '1' || value === '2' || value === '4') {
    return value;
  }
  return 'auto';
}

type RuntimeJson = {
  pythonRelative?: string;
  defaultVoice?: string;
};

@Injectable()
export class PiperHttpServerService implements OnModuleDestroy {
  private readonly logger = new Logger(PiperHttpServerService.name);
  private child: ChildProcess | null = null;
  private baseUrl: string | null = null;
  private starting: Promise<string | null> | null = null;
  private intentionalStop = false;
  private currentThreadCap: PiperThreadCap | null = null;

  isSupportedPlatform(): boolean {
    return process.platform === 'win32' || process.platform === 'linux';
  }

  isRunning(): boolean {
    return this.child != null && this.child.exitCode == null && this.baseUrl != null;
  }

  getBaseUrl(): string | null {
    return this.isRunning() ? this.baseUrl : null;
  }

  getVoicesDirectory(): string {
    return join(app.getPath('userData'), 'piper', 'voices');
  }

  getBundledRuntimeRoot(): string | null {
    if (!this.isSupportedPlatform()) {
      return null;
    }

    const platformDir = this.hostPlatformDir();
    if (!platformDir) {
      return null;
    }

    if (app.isPackaged) {
      const packaged = join(process.resourcesPath || '', 'piper');
      if (existsSync(packaged)) {
        return packaged;
      }
      return null;
    }

    // Dev: repo vendor/piper/<platform>
    // Compiled main lives at dist/apps/desktop → three levels up is repo root.
    const candidates = [
      join(process.cwd(), 'vendor', 'piper', platformDir),
      join(__dirname, '..', '..', '..', 'vendor', 'piper', platformDir),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  hasBundledRuntime(): boolean {
    const root = this.getBundledRuntimeRoot();
    if (!root) {
      return false;
    }
    return existsSync(this.resolvePythonExe(root));
  }

  /**
   * Start the managed Piper HTTP server if the bundled runtime is available.
   * Restarts the child when the CPU thread cap differs from the running process.
   * Returns the base URL, or null if unavailable.
   */
  async ensureStarted(threadCap?: string | null): Promise<string | null> {
    const cap = normalizePiperThreadCap(threadCap);
    if (this.isRunning()) {
      if (this.currentThreadCap === cap) {
        return this.baseUrl;
      }
      this.logger.log('Restarting managed Piper due to thread cap change', {
        from: this.currentThreadCap,
        to: cap,
      });
      await this.stop();
    }
    if (this.starting) {
      return this.starting;
    }
    this.starting = this.startInternal(cap).finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    const child = this.child;
    this.child = null;
    this.baseUrl = null;
    this.currentThreadCap = null;

    if (!child || child.exitCode != null) {
      this.intentionalStop = false;
      return;
    }

    const pid = child.pid;
    try {
      if (process.platform === 'win32' && pid) {
        await execFileAsync('taskkill', ['/pid', String(pid), '/t', '/f']).catch(
          () => undefined,
        );
      } else {
        child.kill('SIGTERM');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            try {
              child.kill('SIGKILL');
            } catch {
              // ignore
            }
            resolve();
          }, 3000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    } finally {
      this.intentionalStop = false;
      this.logger.log('Managed Piper HTTP server stopped');
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private async startInternal(threadCap: PiperThreadCap): Promise<string | null> {
    if (!this.isSupportedPlatform()) {
      this.logger.log('Bundled Piper not supported on this platform');
      return null;
    }

    const runtimeRoot = this.getBundledRuntimeRoot();
    if (!runtimeRoot) {
      this.logger.log('Bundled Piper runtime not found');
      return null;
    }

    const pythonExe = this.resolvePythonExe(runtimeRoot);
    if (!existsSync(pythonExe)) {
      this.logger.warn(`Bundled Python not found at ${pythonExe}`);
      return null;
    }

    const voicesDir = this.getVoicesDirectory();
    this.seedDefaultVoice(runtimeRoot, voicesDir);

    const defaultVoice =
      this.readRuntimeJson(runtimeRoot)?.defaultVoice || DEFAULT_VOICE;
    const modelPath = join(voicesDir, `${defaultVoice}.onnx`);
    if (!existsSync(modelPath)) {
      this.logger.warn(`Default Piper voice missing at ${modelPath}`);
      return null;
    }

    const port = await this.findAvailablePort(PREFERRED_PORT);
    const wrapperPath = this.resolveWrapperPath(runtimeRoot);
    const serverArgs = [
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '-m',
      defaultVoice,
      '--data-dir',
      voicesDir,
      '--download-dir',
      voicesDir,
    ];
    const args = wrapperPath
      ? [wrapperPath, ...serverArgs]
      : ['-m', 'piper.http_server', ...serverArgs];

    if (!wrapperPath) {
      this.logger.warn(
        'Piper HTTP wrapper not found; starting piper.http_server without thread cap or alignment patches',
      );
    }

    this.intentionalStop = false;
    this.logger.log('Starting managed Piper HTTP server', {
      pythonExe,
      port,
      voicesDir,
      defaultVoice,
      threadCap,
      wrapperPath,
    });

    const child = spawn(pythonExe, args, {
      cwd: voicesDir,
      env: this.cleanedEnv(threadCap),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child = child;

    child.stdout?.on('data', (chunk: Buffer) => {
      this.logger.debug(`[piper] ${chunk.toString().trimEnd()}`);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      this.logger.debug(`[piper:err] ${chunk.toString().trimEnd()}`);
    });
    child.on('exit', (code, signal) => {
      if (!this.intentionalStop) {
        this.logger.warn(`Managed Piper exited unexpectedly`, { code, signal });
      }
      if (this.child === child) {
        this.child = null;
        this.baseUrl = null;
        this.currentThreadCap = null;
      }
    });
    child.on('error', (err) => {
      this.logger.error('Failed to spawn managed Piper', err);
      if (this.child === child) {
        this.child = null;
        this.baseUrl = null;
        this.currentThreadCap = null;
      }
    });

    const url = `http://127.0.0.1:${port}`;
    const healthy = await this.waitForHealth(url, child);
    if (!healthy) {
      await this.stop();
      this.logger.error('Managed Piper failed health check');
      return null;
    }

    this.baseUrl = url;
    this.currentThreadCap = threadCap;
    this.logger.log(`Managed Piper ready at ${url}`, { threadCap });
    return url;
  }

  /**
   * Wrapper must live outside asar so Python can execute it.
   * Packaged: extraResources copies it next to the runtime.
   * Dev: fall back to the repo scripts/ copy.
   */
  private resolveWrapperPath(runtimeRoot: string): string | null {
    const candidates = [join(runtimeRoot, 'piper_http_server_wrapper.py')];
    if (app.isPackaged) {
      candidates.push(
        join(process.resourcesPath || '', 'piper', 'piper_http_server_wrapper.py'),
      );
    } else {
      candidates.push(
        join(process.cwd(), 'scripts', 'piper_http_server_wrapper.py'),
        join(__dirname, '..', '..', '..', 'scripts', 'piper_http_server_wrapper.py'),
      );
    }
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  /**
   * vendor/piper/<os>-<arch> folder name, matching electron-builder ${os}-${arch}
   * and scripts/prepare-piper-runtime.mjs targets.
   */
  private hostPlatformDir(): string | null {
    if (process.platform === 'win32' && process.arch === 'x64') {
      return 'win-x64';
    }
    if (process.platform === 'linux' && process.arch === 'x64') {
      return 'linux-x64';
    }
    if (process.platform === 'linux' && process.arch === 'arm64') {
      return 'linux-arm64';
    }
    return null;
  }

  private resolvePythonExe(runtimeRoot: string): string {
    const runtime = this.readRuntimeJson(runtimeRoot);
    if (runtime?.pythonRelative) {
      return join(runtimeRoot, ...runtime.pythonRelative.split('/'));
    }
    if (process.platform === 'win32') {
      return join(runtimeRoot, 'python', 'python.exe');
    }
    return join(runtimeRoot, 'python', 'bin', 'python3');
  }

  private readRuntimeJson(runtimeRoot: string): RuntimeJson | null {
    const path = join(runtimeRoot, 'runtime.json');
    if (!existsSync(path)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(path, 'utf8')) as RuntimeJson;
    } catch (err) {
      this.logger.warn(`Failed to read runtime.json at ${path}`, err as Error);
      return null;
    }
  }

  private seedDefaultVoice(runtimeRoot: string, voicesDir: string): void {
    mkdirSync(voicesDir, { recursive: true });
    const bundledVoices = join(runtimeRoot, 'voices');
    for (const file of [
      `${DEFAULT_VOICE}.onnx`,
      `${DEFAULT_VOICE}.onnx.json`,
    ]) {
      const dest = join(voicesDir, file);
      const src = join(bundledVoices, file);
      if (!existsSync(dest) && existsSync(src)) {
        copyFileSync(src, dest);
        this.logger.log(`Seeded Piper voice file ${file} -> ${voicesDir}`);
      }
    }
  }

  private cleanedEnv(threadCap: PiperThreadCap): NodeJS.ProcessEnv {
    const env = { ...process.env };
    delete env.PYTHONPATH;
    delete env.PYTHONHOME;
    delete env.VIRTUAL_ENV;
    // Avoid inheriting a venv that could shadow the bundled packages.
    env.SPEAKMANAGER_PIPER_THREADS = threadCap === 'auto' ? '0' : threadCap;
    return env;
  }

  private findAvailablePort(preferred: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tryListen = (port: number, allowFallback: boolean) => {
        const server = createServer();
        server.unref();
        server.on('error', (err: NodeJS.ErrnoException) => {
          if (allowFallback && err.code === 'EADDRINUSE') {
            tryListen(0, false);
            return;
          }
          reject(err);
        });
        server.listen(port, '127.0.0.1', () => {
          const address = server.address();
          server.close(() => {
            if (address && typeof address === 'object') {
              resolve(address.port);
            } else {
              reject(new Error('Failed to determine free port'));
            }
          });
        });
      };
      tryListen(preferred, true);
    });
  }

  private async waitForHealth(
    url: string,
    child: ChildProcess,
  ): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (child.exitCode != null) {
        return false;
      }
      try {
        const res = await fetch(`${url}/voices`);
        if (res.ok) {
          return true;
        }
      } catch {
        // still starting
      }
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
    }
    return false;
  }
}
