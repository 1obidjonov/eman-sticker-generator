import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

export type ApplicationLogLevel = 'info' | 'warn' | 'error';

export interface ApplicationLogRecord {
  timestamp: string;
  level: ApplicationLogLevel;
  event: string;
  details?: Record<string, unknown>;
}

export class ApplicationLogger {
  private readonly currentPath: string;
  private readonly previousPath: string;
  private writeSequence: Promise<void> = Promise.resolve();
  private initialized = false;

  constructor(
    private readonly logsDirectory: string,
    private readonly maximumBytes = 2 * 1024 * 1024,
  ) {
    if (
      !Number.isInteger(maximumBytes) ||
      maximumBytes < 256 ||
      maximumBytes > 100 * 1024 * 1024
    ) {
      throw new Error('Некорректный максимальный размер журнала.');
    }
    this.currentPath = join(logsDirectory, 'application.log');
    this.previousPath = join(logsDirectory, 'application.previous.log');
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await mkdir(this.logsDirectory, { recursive: true });
    await this.rotateIfNeeded();
    this.initialized = true;
  }

  info(event: string, details?: Record<string, unknown>): Promise<void> {
    return this.write('info', event, details);
  }

  warn(event: string, details?: Record<string, unknown>): Promise<void> {
    return this.write('warn', event, details);
  }

  error(event: string, details?: Record<string, unknown>): Promise<void> {
    return this.write('error', event, details);
  }

  async flush(): Promise<void> {
    await this.writeSequence;
  }

  getDirectory(): string {
    return this.logsDirectory;
  }

  async listFiles(): Promise<string[]> {
    await this.initialize();
    const paths = [this.currentPath, this.previousPath];
    const existing: string[] = [];
    for (const path of paths) {
      if ((await fileSize(path)) > 0) {
        existing.push(path);
      }
    }
    return existing;
  }

  private async write(
    level: ApplicationLogLevel,
    event: string,
    details?: Record<string, unknown>,
  ): Promise<void> {
    const record: ApplicationLogRecord = {
      timestamp: new Date().toISOString(),
      level,
      event: normalizeEvent(event),
      ...(details ? { details: sanitizeDetails(details) } : {}),
    };

    const operation = this.writeSequence.then(async () => {
      await this.initialize();
      const line = `${JSON.stringify(record)}\n`;
      await this.rotateIfNeeded(Buffer.byteLength(line));
      await appendFile(
        this.currentPath,
        line,
        'utf8',
      );
    });
    this.writeSequence = operation.catch(() => undefined);
    await operation;
  }

  private async rotateIfNeeded(incomingBytes = 0): Promise<void> {
    const currentBytes = await fileSize(this.currentPath);
    if (
      currentBytes === 0 ||
      currentBytes + incomingBytes < this.maximumBytes
    ) {
      return;
    }
    await rm(this.previousPath, { force: true });
    await rename(this.currentPath, this.previousPath);
  }
}

export function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { message: String(error) };
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function normalizeEvent(value: string): string {
  const normalized = value.trim().replace(/\s+/g, '.').slice(0, 120);
  return normalized || 'application.event';
}

function sanitizeDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(details, 0) as Record<string, unknown>;
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > 5) {
    return '[maximum depth]';
  }
  if (typeof value === 'string') {
    return value.length > 4_000 ? `${value.slice(0, 4_000)}…` : value;
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeValue(item, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [
          key,
          isSensitiveKey(key)
            ? '[redacted]'
            : sanitizeValue(item, depth + 1),
        ]),
    );
  }
  return String(value);
}

function isSensitiveKey(key: string): boolean {
  return /password|passwd|token|secret|authorization|cookie|api.?key/i.test(
    key,
  );
}
