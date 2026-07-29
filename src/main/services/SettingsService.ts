import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type ExportFormat,
  type ThemePreference,
} from '../../shared/ipc-contract.js';

const THEMES = new Set<ThemePreference>(['system', 'light', 'dark']);
const FORMATS = new Set<ExportFormat>(['svg', 'png', 'jpg']);
const SETTING_KEYS = new Set<keyof AppSettings>([
  'schemaVersion',
  'theme',
  'defaultExportFormats',
  'defaultExportScale',
  'jpgQuality',
  'revealAfterExport',
  'generationConcurrency',
  'parserTimeoutSeconds',
  'browserExecutablePath',
  'compactPreviews',
  'reduceMotion',
]);

export class SettingsService {
  private settings: AppSettings = structuredClone(DEFAULT_APP_SETTINGS);

  constructor(private readonly settingsPath: string) {}

  async initialize(): Promise<AppSettings> {
    await mkdir(dirname(this.settingsPath), { recursive: true });
    try {
      const contents = await readFile(this.settingsPath, 'utf8');
      this.settings = normalizeStoredSettings(JSON.parse(contents));
    } catch {
      this.settings = structuredClone(DEFAULT_APP_SETTINGS);
    }
    await this.write();
    return this.get();
  }

  get(): AppSettings {
    return structuredClone(this.settings);
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    assertSettingsPatch(patch);
    this.settings = validateSettings({
      ...this.settings,
      ...structuredClone(patch),
      schemaVersion: 1,
    });
    await this.write();
    return this.get();
  }

  async reset(): Promise<AppSettings> {
    this.settings = structuredClone(DEFAULT_APP_SETTINGS);
    await this.write();
    return this.get();
  }

  private async write(): Promise<void> {
    const temporary = `${this.settingsPath}.tmp`;
    await writeFile(
      temporary,
      `${JSON.stringify(this.settings, null, 2)}\n`,
      'utf8',
    );
    await rename(temporary, this.settingsPath);
  }
}

function normalizeStoredSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return structuredClone(DEFAULT_APP_SETTINGS);
  }
  const candidate = value as Partial<AppSettings>;
  const normalized: AppSettings = {
    ...structuredClone(DEFAULT_APP_SETTINGS),
    ...(THEMES.has(candidate.theme as ThemePreference)
      ? { theme: candidate.theme as ThemePreference }
      : {}),
    ...(isFormatArray(candidate.defaultExportFormats)
      ? {
          defaultExportFormats: uniqueFormats(
            candidate.defaultExportFormats as ExportFormat[],
          ),
        }
      : {}),
    ...(isIntegerInRange(candidate.defaultExportScale, 1, 3)
      ? { defaultExportScale: candidate.defaultExportScale as number }
      : {}),
    ...(isIntegerInRange(candidate.jpgQuality, 40, 100)
      ? { jpgQuality: candidate.jpgQuality as number }
      : {}),
    ...(typeof candidate.revealAfterExport === 'boolean'
      ? { revealAfterExport: candidate.revealAfterExport }
      : {}),
    ...(isIntegerInRange(candidate.generationConcurrency, 1, 8)
      ? { generationConcurrency: candidate.generationConcurrency as number }
      : {}),
    ...(isIntegerInRange(candidate.parserTimeoutSeconds, 10, 90)
      ? { parserTimeoutSeconds: candidate.parserTimeoutSeconds as number }
      : {}),
    ...(isBrowserPath(candidate.browserExecutablePath)
      ? { browserExecutablePath: normalizeBrowserPath(candidate.browserExecutablePath) }
      : {}),
    ...(typeof candidate.compactPreviews === 'boolean'
      ? { compactPreviews: candidate.compactPreviews }
      : {}),
    ...(typeof candidate.reduceMotion === 'boolean'
      ? { reduceMotion: candidate.reduceMotion }
      : {}),
  };
  return normalized;
}

function validateSettings(candidate: AppSettings): AppSettings {
  if (!THEMES.has(candidate.theme)) {
    throw new Error('Выберите светлую, тёмную или системную тему.');
  }
  if (!isFormatArray(candidate.defaultExportFormats)) {
    throw new Error('Выберите хотя бы один формат экспорта.');
  }
  if (!isIntegerInRange(candidate.defaultExportScale, 1, 3)) {
    throw new Error('Масштаб экспорта должен быть от 1× до 3×.');
  }
  if (!isIntegerInRange(candidate.jpgQuality, 40, 100)) {
    throw new Error('Качество JPG должно быть от 40% до 100%.');
  }
  if (!isIntegerInRange(candidate.generationConcurrency, 1, 8)) {
    throw new Error('Количество параллельных задач должно быть от 1 до 8.');
  }
  if (!isIntegerInRange(candidate.parserTimeoutSeconds, 10, 90)) {
    throw new Error('Тайм-аут парсера должен быть от 10 до 90 секунд.');
  }
  if (!isBrowserPath(candidate.browserExecutablePath)) {
    throw new Error('Некорректный путь к Chrome или Chromium.');
  }
  for (const key of [
    'revealAfterExport',
    'compactPreviews',
    'reduceMotion',
  ] as const) {
    if (typeof candidate[key] !== 'boolean') {
      throw new Error('Некорректное логическое значение настройки.');
    }
  }
  return {
    ...structuredClone(candidate),
    schemaVersion: 1,
    defaultExportFormats: uniqueFormats(candidate.defaultExportFormats),
    browserExecutablePath: normalizeBrowserPath(
      candidate.browserExecutablePath,
    ),
  };
}

function assertSettingsPatch(
  patch: Partial<AppSettings>,
): asserts patch is Partial<AppSettings> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Некорректный набор настроек.');
  }
  for (const key of Object.keys(patch)) {
    if (!SETTING_KEYS.has(key as keyof AppSettings) || key === 'schemaVersion') {
      throw new Error(`Неизвестная настройка: ${key}.`);
    }
  }
}

function isFormatArray(value: unknown): value is ExportFormat[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= FORMATS.size &&
    value.every((format) => FORMATS.has(format as ExportFormat))
  );
}

function uniqueFormats(formats: ExportFormat[]): ExportFormat[] {
  return [...new Set(formats)];
}

function isIntegerInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum
  );
}

function isBrowserPath(value: unknown): value is string | null | undefined {
  return (
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.length <= 4_096)
  );
}

function normalizeBrowserPath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  return value.trim() || null;
}
