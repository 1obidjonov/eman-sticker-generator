import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsService } from '../src/main/services/SettingsService.js';
import { DEFAULT_APP_SETTINGS } from '../src/shared/ipc-contract.js';

describe('SettingsService', () => {
  let workspace: string;
  let settingsPath: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), 'sticker-settings-'));
    settingsPath = join(workspace, 'profile', 'settings.json');
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it('creates a complete settings file with safe defaults', async () => {
    const service = new SettingsService(settingsPath);

    expect(await service.initialize()).toEqual(DEFAULT_APP_SETTINGS);
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(
      DEFAULT_APP_SETTINGS,
    );
  });

  it('persists validated updates and returns defensive copies', async () => {
    const service = new SettingsService(settingsPath);
    await service.initialize();

    const updated = await service.update({
      theme: 'dark',
      defaultExportFormats: ['svg', 'png', 'svg'],
      generationConcurrency: 7,
      browserExecutablePath: '  /opt/chrome/chrome  ',
    });

    expect(updated).toMatchObject({
      theme: 'dark',
      defaultExportFormats: ['svg', 'png'],
      generationConcurrency: 7,
      browserExecutablePath: '/opt/chrome/chrome',
    });
    updated.theme = 'light';

    const reloaded = new SettingsService(settingsPath);
    await reloaded.initialize();
    expect(reloaded.get().theme).toBe('dark');
  });

  it('rejects unknown or unsafe settings', async () => {
    const service = new SettingsService(settingsPath);
    await service.initialize();

    await expect(
      service.update({ generationConcurrency: 0 }),
    ).rejects.toThrow('от 1 до 8');
    await expect(
      service.update({ unexpected: true } as never),
    ).rejects.toThrow('Неизвестная настройка');
  });

  it('repairs a partial or outdated settings file', async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({
        theme: 'dark',
        jpgQuality: 500,
        compactPreviews: true,
      }),
      { encoding: 'utf8', flag: 'w' },
    ).catch(async () => {
      const service = new SettingsService(settingsPath);
      await service.initialize();
      await writeFile(
        settingsPath,
        JSON.stringify({
          theme: 'dark',
          jpgQuality: 500,
          compactPreviews: true,
        }),
        'utf8',
      );
    });

    const service = new SettingsService(settingsPath);
    const settings = await service.initialize();

    expect(settings.theme).toBe('dark');
    expect(settings.jpgQuality).toBe(DEFAULT_APP_SETTINGS.jpgQuality);
    expect(settings.compactPreviews).toBe(true);
    expect(settings.schemaVersion).toBe(1);
  });

  it('recovers from malformed JSON without exposing a broken state', async () => {
    const service = new SettingsService(settingsPath);
    await service.initialize();
    await writeFile(settingsPath, '{broken json', 'utf8');

    const recovered = new SettingsService(settingsPath);
    expect(await recovered.initialize()).toEqual(DEFAULT_APP_SETTINGS);
    expect(JSON.parse(await readFile(settingsPath, 'utf8'))).toEqual(
      DEFAULT_APP_SETTINGS,
    );
  });
});
