import {
  createReadStream,
  createWriteStream,
  existsSync,
} from 'node:fs';
import { chmod, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createBrotliDecompress } from 'node:zlib';
import type { Writable } from 'node:stream';

const MINIMUM_EXECUTABLE_SIZE = 100 * 1024 * 1024;

/**
 * Extracts only the Chromium executable. The upstream serverless helper also
 * extracts a font tarball with ownership metadata, which is incompatible with
 * some restricted desktop/test filesystems.
 */
export async function resolveBundledChromiumExecutable(): Promise<string> {
  const destination = join(tmpdir(), 'sticker-generator-chromium');
  const require = createRequire(import.meta.url);
  const packageEntry = require.resolve('@sparticuz/chromium');
  const binDirectory = join(
    dirname(dirname(dirname(packageEntry))),
    'bin',
  );
  await ensureSwiftShader(require, binDirectory);

  if (await isUsableExecutable(destination)) {
    return destination;
  }

  const compressed = join(binDirectory, 'chromium.br');
  if (!existsSync(compressed)) {
    throw new Error('Встроенный архив Chromium не найден.');
  }

  const temporary = `${destination}.${process.pid}.tmp`;
  await decompressBrotli(compressed, temporary);
  await chmod(temporary, 0o700);
  await rename(temporary, destination);

  if (!(await isUsableExecutable(destination))) {
    throw new Error('Не удалось распаковать встроенный Chromium.');
  }
  return destination;
}

async function ensureSwiftShader(
  require: NodeJS.Require,
  binDirectory: string,
): Promise<void> {
  const library = join(tmpdir(), 'libGLESv2.so');
  if (existsSync(library)) {
    return;
  }
  const tarFs = require('tar-fs') as {
    extract(
      path: string,
      options: { chown: boolean },
    ): Writable;
  };
  await extractBrotliTar(
    join(binDirectory, 'swiftshader.tar.br'),
    tmpdir(),
    tarFs,
  );
}

async function isUsableExecutable(path: string): Promise<boolean> {
  try {
    return (await stat(path)).size >= MINIMUM_EXECUTABLE_SIZE;
  } catch {
    return false;
  }
}

async function decompressBrotli(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(sourcePath, {
      highWaterMark: 4 * 1024 * 1024,
    });
    const decompressor = createBrotliDecompress({
      chunkSize: 2 * 1024 * 1024,
    });
    const destination = createWriteStream(destinationPath, { mode: 0o700 });

    const fail = (error: Error) => reject(error);
    source.once('error', fail);
    decompressor.once('error', fail);
    destination.once('error', fail);
    destination.once('close', resolve);
    source.pipe(decompressor).pipe(destination);
  });
}

async function extractBrotliTar(
  sourcePath: string,
  destinationPath: string,
  tarFs: {
    extract(path: string, options: { chown: boolean }): Writable;
  },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const source = createReadStream(sourcePath);
    const decompressor = createBrotliDecompress({
      chunkSize: 2 * 1024 * 1024,
    });
    const destination = tarFs.extract(destinationPath, { chown: false });
    const fail = (error: Error) => reject(error);

    source.once('error', fail);
    decompressor.once('error', fail);
    destination.once('error', fail);
    destination.once('finish', resolve);
    source.pipe(decompressor).pipe(destination);
  });
}
