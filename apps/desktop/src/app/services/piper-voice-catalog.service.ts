import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import type { Readable } from 'stream';
import { PiperHttpServerService } from './piper-http-server.service';
import { Voice } from './voice-providers/voice.interface';
import {
  PiperVoiceCatalog,
  catalogVoiceFromId,
  findCatalogEntry,
  mergePiperCatalog,
  piperDownloadTargets,
  stripPiperOnnxSuffix,
} from './piper-voice-catalog.util';

@Injectable()
export class PiperVoiceCatalogService {
  private readonly logger = new Logger(PiperVoiceCatalogService.name);
  private catalogCache: PiperVoiceCatalog | null | undefined;

  constructor(
    private readonly httpService: HttpService,
    private readonly piperHttpServerService: PiperHttpServerService,
  ) {}

  loadCatalog(): PiperVoiceCatalog | null {
    if (this.catalogCache !== undefined) {
      return this.catalogCache;
    }

    const path = this.resolveCatalogPath();
    if (!path) {
      this.logger.warn('piper-voices.json not found; catalog merge skipped');
      this.catalogCache = null;
      return null;
    }

    try {
      const parsed = JSON.parse(
        readFileSync(path, 'utf8'),
      ) as PiperVoiceCatalog;
      this.catalogCache = parsed;
      return parsed;
    } catch (error) {
      this.logger.warn(`Failed to read piper-voices.json at ${path}`, error);
      this.catalogCache = null;
      return null;
    }
  }

  getInstalledVoiceIds(): Set<string> {
    const dir = this.piperHttpServerService.getVoicesDirectory();
    const ids = new Set<string>();
    if (!existsSync(dir)) {
      return ids;
    }

    let files: string[] = [];
    try {
      files = readdirSync(dir);
    } catch (error) {
      this.logger.warn(`Failed to read Piper voices directory ${dir}`, error);
      return ids;
    }

    const fileSet = new Set(files);
    for (const file of files) {
      if (!file.endsWith('.onnx') || file.endsWith('.onnx.json')) {
        continue;
      }
      const id = file.slice(0, -'.onnx'.length);
      if (fileSet.has(`${id}.onnx.json`)) {
        ids.add(id);
      }
    }
    return ids;
  }

  merge(localPiperVoices: Voice[]): Voice[] {
    return mergePiperCatalog(
      localPiperVoices,
      this.loadCatalog(),
      this.getInstalledVoiceIds(),
    );
  }

  async download(voiceId: string): Promise<Voice> {
    const catalog = this.loadCatalog();
    const found = findCatalogEntry(catalog, voiceId);
    if (!found) {
      throw new NotFoundException(
        `Piper catalog has no voice '${voiceId}'`,
      );
    }

    const id = stripPiperOnnxSuffix(voiceId);
    const targets = piperDownloadTargets(id, found.entry.download_urls ?? []);
    const hasOnnx = targets.some((t) => t.kind === 'onnx');
    const hasJson = targets.some((t) => t.kind === 'onnx.json');
    if (!hasOnnx || !hasJson) {
      throw new Error(
        `Piper catalog voice '${id}' is missing .onnx or .onnx.json download URLs`,
      );
    }

    const voicesDir = this.piperHttpServerService.getVoicesDirectory();
    mkdirSync(voicesDir, { recursive: true });

    const temps: string[] = [];
    try {
      for (const target of targets) {
        const dest = join(voicesDir, target.filename);
        const tmp = `${dest}.partial`;
        temps.push(tmp);
        await this.downloadToFile(target.url, tmp);
      }

      for (const target of targets) {
        const dest = join(voicesDir, target.filename);
        const tmp = `${dest}.partial`;
        if (existsSync(dest)) {
          unlinkSync(dest);
        }
        renameSync(tmp, dest);
      }
    } catch (error) {
      for (const tmp of temps) {
        if (existsSync(tmp)) {
          try {
            unlinkSync(tmp);
          } catch {
            // ignore cleanup errors
          }
        }
      }
      throw error;
    }

    this.logger.log(`Downloaded Piper voice ${id} to ${voicesDir}`);
    return catalogVoiceFromId(id, found.source, false);
  }

  private async downloadToFile(url: string, dest: string): Promise<void> {
    this.logger.log(`Downloading Piper voice file ${url}`);
    const response = await this.httpService.axiosRef.get<Readable>(url, {
      responseType: 'stream',
      timeout: 0,
      maxRedirects: 5,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        'User-Agent': 'Speakosaurus',
      },
    });

    const writer = createWriteStream(dest);
    try {
      await pipeline(response.data, writer);
    } catch (error) {
      writer.destroy();
      throw error;
    }
  }

  private resolveCatalogPath(): string | null {
    const candidates = [
      join(__dirname, 'assets', 'piper-voices.json'),
      join(__dirname, '..', 'assets', 'piper-voices.json'),
      join(__dirname, '..', '..', 'assets', 'piper-voices.json'),
      join(__dirname, '..', '..', '..', 'assets', 'piper-voices.json'),
      join(process.cwd(), 'dist', 'apps', 'desktop', 'assets', 'piper-voices.json'),
      join(
        process.cwd(),
        'apps',
        'desktop',
        'src',
        'assets',
        'piper-voices.json',
      ),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }
}
