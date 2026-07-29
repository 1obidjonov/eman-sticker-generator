import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ApplicationLogger } from '../src/main/services/ApplicationLogger.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe('ApplicationLogger', () => {
  it('writes ordered JSON lines and redacts secrets', async () => {
    const directory = await temporaryDirectory();
    const logger = new ApplicationLogger(directory);

    await Promise.all([
      logger.info(' application start ', {
        sequence: 1,
        apiToken: 'must-not-leak',
      }),
      logger.warn('browser launch', {
        sequence: 2,
        nested: { password: 'must-not-leak' },
      }),
    ]);
    await logger.flush();

    const records = (await readFile(join(directory, 'application.log'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.event)).toEqual([
      'application.start',
      'browser.launch',
    ]);
    expect(JSON.stringify(records)).not.toContain('must-not-leak');
    expect(records[0]).toMatchObject({
      level: 'info',
      details: { sequence: 1, apiToken: '[redacted]' },
    });
  });

  it('rotates the current journal without losing the newest record', async () => {
    const directory = await temporaryDirectory();
    const logger = new ApplicationLogger(directory, 256);

    await logger.info('large.first', { payload: 'a'.repeat(170) });
    await logger.info('large.second', { payload: 'b'.repeat(170) });

    const previous = await readFile(
      join(directory, 'application.previous.log'),
      'utf8',
    );
    const current = await readFile(
      join(directory, 'application.log'),
      'utf8',
    );

    expect(previous).toContain('large.first');
    expect(current).toContain('large.second');
    expect(await logger.listFiles()).toHaveLength(2);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sticker-logs-'));
  temporaryDirectories.push(directory);
  return directory;
}
