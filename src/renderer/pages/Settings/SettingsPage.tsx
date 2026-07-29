import {
  Check,
  CheckCircle2,
  Chrome,
  CircleAlert,
  Cpu,
  Database,
  FileArchive,
  FolderOpen,
  Gauge,
  LifeBuoy,
  LoaderCircle,
  Monitor,
  Moon,
  RotateCcw,
  Settings2,
  ShieldCheck,
  ScrollText,
  Sun,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  AppSettings,
  ExportFormat,
  ThemePreference,
} from '../../../shared/ipc-contract.js';
import { useSettingsStore } from '../../stores/settingsStore.js';

const THEMES: Array<{
  value: ThemePreference;
  title: string;
  description: string;
  icon: typeof Monitor;
}> = [
  {
    value: 'system',
    title: 'Системная',
    description: 'Как в системе',
    icon: Monitor,
  },
  {
    value: 'light',
    title: 'Светлая',
    description: 'Для яркого помещения',
    icon: Sun,
  },
  {
    value: 'dark',
    title: 'Тёмная',
    description: 'Комфортно вечером',
    icon: Moon,
  },
];

const EXPORT_FORMATS: ExportFormat[] = ['svg', 'png', 'jpg'];

export function SettingsPage() {
  const settings = useSettingsStore((state) => state.settings);
  const diagnostics = useSettingsStore((state) => state.diagnostics);
  const lastSupportBundle = useSettingsStore(
    (state) => state.lastSupportBundle,
  );
  const isChecking = useSettingsStore((state) => state.isChecking);
  const isExportingSupport = useSettingsStore(
    (state) => state.isExportingSupport,
  );
  const saveStatus = useSettingsStore((state) => state.saveStatus);
  const error = useSettingsStore((state) => state.error);
  const update = useSettingsStore((state) => state.update);
  const reset = useSettingsStore((state) => state.reset);
  const chooseBrowserExecutable = useSettingsStore(
    (state) => state.chooseBrowserExecutable,
  );
  const loadDiagnostics = useSettingsStore(
    (state) => state.loadDiagnostics,
  );
  const revealDataDirectory = useSettingsStore(
    (state) => state.revealDataDirectory,
  );
  const revealLogsDirectory = useSettingsStore(
    (state) => state.revealLogsDirectory,
  );
  const createSupportBundle = useSettingsStore(
    (state) => state.createSupportBundle,
  );
  const revealSupportBundle = useSettingsStore(
    (state) => state.revealSupportBundle,
  );
  const clearError = useSettingsStore((state) => state.clearError);

  const toggleFormat = (format: ExportFormat) => {
    const selected = settings.defaultExportFormats.includes(format);
    if (selected && settings.defaultExportFormats.length === 1) {
      return;
    }
    void update({
      defaultExportFormats: selected
        ? settings.defaultExportFormats.filter((value) => value !== format)
        : [...settings.defaultExportFormats, format],
    });
  };

  const confirmReset = () => {
    if (
      window.confirm(
        'Вернуть все настройки к значениям по умолчанию? Шаблоны не изменятся.',
      )
    ) {
      void reset();
    }
  };

  return (
    <main className="settings-page page">
      <header className="settings-header">
        <div>
          <div className="eyebrow">Этап 8 · Windows Release Candidate</div>
          <h1>Настройки приложения</h1>
          <p>
            Интерфейс, экспорт и параметры обработки сохраняются автоматически.
          </p>
        </div>
        <div className={`settings-save-state ${saveStatus}`}>
          {saveStatus === 'saving' ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <Check size={16} />
          )}
          {saveStatus === 'saving'
            ? 'Сохраняем…'
            : saveStatus === 'saved'
              ? 'Настройки сохранены'
              : 'Все изменения сохраняются'}
        </div>
      </header>

      {error && (
        <div className="settings-error" role="alert">
          <CircleAlert size={18} />
          <span>{error}</span>
          <button type="button" className="icon-button" onClick={clearError}>
            ×
          </button>
        </div>
      )}

      <div className="settings-layout">
        <div className="settings-column">
          <section className="settings-card">
            <SettingsHeading
              icon={Sun}
              kicker="01 · Интерфейс"
              title="Внешний вид"
              description="Тема меняется сразу во всех разделах."
            />

            <div className="theme-grid">
              {THEMES.map((option) => {
                const Icon = option.icon;
                const selected = settings.theme === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    className={selected ? 'theme-option active' : 'theme-option'}
                    aria-pressed={selected}
                    onClick={() => void update({ theme: option.value })}
                  >
                    <Icon size={19} />
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                    <i>{selected && <Check size={13} />}</i>
                  </button>
                );
              })}
            </div>

            <div className="settings-switch-list">
              <SettingsSwitch
                label="Компактные превью"
                description="Больше карточек наклеек помещается на одном экране."
                checked={settings.compactPreviews}
                onChange={(checked) =>
                  void update({ compactPreviews: checked })
                }
              />
              <SettingsSwitch
                label="Уменьшить анимации"
                description="Отключает подъём карточек и плавные переходы."
                checked={settings.reduceMotion}
                onChange={(checked) => void update({ reduceMotion: checked })}
              />
            </div>
          </section>

          <section className="settings-card">
            <SettingsHeading
              icon={FileArchive}
              kicker="02 · Экспорт"
              title="Параметры по умолчанию"
              description="Подставляются в одиночный и пакетный экспорт."
            />

            <div className="settings-field-group">
              <label>Форматы</label>
              <div className="settings-format-row">
                {EXPORT_FORMATS.map((format) => {
                  const selected =
                    settings.defaultExportFormats.includes(format);
                  return (
                    <button
                      type="button"
                      key={format}
                      className={selected ? 'active' : ''}
                      aria-pressed={selected}
                      onClick={() => toggleFormat(format)}
                    >
                      {format.toUpperCase()}
                      {selected && <Check size={13} />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="settings-inline-grid">
              <div className="settings-field-group">
                <label>Масштаб растра</label>
                <div className="settings-segmented">
                  {[1, 2, 3].map((scale) => (
                    <button
                      type="button"
                      key={scale}
                      className={
                        settings.defaultExportScale === scale ? 'active' : ''
                      }
                      onClick={() =>
                        void update({ defaultExportScale: scale })
                      }
                    >
                      {scale}×
                    </button>
                  ))}
                </div>
              </div>
              <label className="settings-range">
                <span>
                  <strong>Качество JPG</strong>
                  <i>{settings.jpgQuality}%</i>
                </span>
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={settings.jpgQuality}
                  onChange={(event) =>
                    void update({ jpgQuality: Number(event.target.value) })
                  }
                />
              </label>
            </div>

            <div className="settings-switch-list single">
              <SettingsSwitch
                label="Показывать файл после экспорта"
                description="Автоматически открывает папку с готовым файлом."
                checked={settings.revealAfterExport}
                onChange={(checked) =>
                  void update({ revealAfterExport: checked })
                }
              />
            </div>
          </section>
        </div>

        <div className="settings-column">
          <section className="settings-card">
            <SettingsHeading
              icon={Gauge}
              kicker="03 · Обработка"
              title="Парсер и очередь"
              description="Настройте баланс скорости и нагрузки на компьютер."
            />

            <label className="settings-range processing-range">
              <span>
                <strong>Параллельные задачи</strong>
                <i>{settings.generationConcurrency}</i>
              </span>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={settings.generationConcurrency}
                onChange={(event) =>
                  void update({
                    generationConcurrency: Number(event.target.value),
                  })
                }
              />
              <small>Новое значение применяется к следующей партии.</small>
            </label>

            <label className="settings-select-row">
              <span>
                <strong>Тайм-аут страницы</strong>
                <small>Сколько ждать загрузку товарной страницы</small>
              </span>
              <select
                value={settings.parserTimeoutSeconds}
                onChange={(event) =>
                  void update({
                    parserTimeoutSeconds: Number(event.target.value),
                  })
                }
              >
                {[15, 25, 35, 45, 60, 90].map((seconds) => (
                  <option key={seconds} value={seconds}>
                    {seconds} сек.
                  </option>
                ))}
              </select>
            </label>

            <div className="browser-setting">
              <div className="browser-setting-title">
                <Chrome size={18} />
                <div>
                  <strong>Chrome / Chromium</strong>
                  <span>
                    {settings.browserExecutablePath
                      ? compactPath(settings.browserExecutablePath)
                      : 'Автоматический выбор'}
                  </span>
                </div>
              </div>
              <div className="browser-setting-actions">
                <button
                  type="button"
                  className="button secondary compact-button"
                  onClick={() => void chooseBrowserExecutable()}
                >
                  Выбрать файл
                </button>
                {settings.browserExecutablePath && (
                  <button
                    type="button"
                    className="button ghost compact-button"
                    onClick={() =>
                      void update({ browserExecutablePath: null })
                    }
                  >
                    Авто
                  </button>
                )}
              </div>
              <p>
                Путь и тайм-аут используются после перезапуска приложения.
                Встроенная проверка ниже запускает выбранный браузер сразу.
              </p>
            </div>
          </section>

          <section className="settings-card diagnostics-card">
            <SettingsHeading
              icon={ShieldCheck}
              kicker="04 · Система"
              title="Диагностика"
              description="Проверка движка парсинга и окружения приложения."
              action={
                <button
                  type="button"
                  className="button secondary compact-button"
                  disabled={isChecking}
                  onClick={() => void loadDiagnostics()}
                >
                  {isChecking ? (
                    <LoaderCircle className="spin" size={15} />
                  ) : (
                    <Cpu size={15} />
                  )}
                  {isChecking ? 'Проверяем…' : 'Проверить'}
                </button>
              }
            />

            {diagnostics ? (
              <>
                <div
                  className={
                    diagnostics.browser.status === 'ready'
                      ? 'diagnostic-result success'
                      : 'diagnostic-result error'
                  }
                >
                  {diagnostics.browser.status === 'ready' ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <CircleAlert size={20} />
                  )}
                  <div>
                    <strong>
                      {diagnostics.browser.status === 'ready'
                        ? 'Chromium готов к работе'
                        : 'Chromium не запустился'}
                    </strong>
                    <span>
                      {diagnostics.browser.status === 'ready'
                        ? `${diagnostics.browser.version} · ${formatDuration(
                            diagnostics.browser.launchDurationMs,
                          )}`
                        : diagnostics.browser.message}
                    </span>
                  </div>
                </div>
                <div className="diagnostic-grid">
                  <DiagnosticItem
                    label="Версия приложения"
                    value={diagnostics.appVersion}
                  />
                  <DiagnosticItem
                    label="Electron / Chromium"
                    value={`${diagnostics.electronVersion} / ${diagnostics.chromiumVersion}`}
                  />
                  <DiagnosticItem
                    label="Система"
                    value={`${platformLabel(diagnostics.platform)} · ${diagnostics.architecture}`}
                  />
                  <DiagnosticItem
                    label="Парсеры"
                    value={`${diagnostics.parserCount} подключён`}
                  />
                </div>
              </>
            ) : (
              <div className="diagnostic-placeholder">
                <ShieldCheck size={27} />
                <span>
                  Запустите проверку, чтобы убедиться, что браузер доступен
                  парсеру.
                </span>
              </div>
            )}

            <button
              type="button"
              className="data-directory-button"
              onClick={() => void revealDataDirectory()}
            >
              <Database size={17} />
              <span>
                <strong>Папка данных приложения</strong>
                <small>
                  Шаблоны, фоны и настройки хранятся локально
                </small>
              </span>
              <FolderOpen size={16} />
            </button>

            <div className="support-actions">
              <button
                type="button"
                className="data-directory-button"
                onClick={() => void revealLogsDirectory()}
              >
                <ScrollText size={17} />
                <span>
                  <strong>Технические журналы</strong>
                  <small>События запуска и критические ошибки</small>
                </span>
                <FolderOpen size={16} />
              </button>
              <button
                type="button"
                className="data-directory-button support-bundle-button"
                disabled={isExportingSupport}
                onClick={() => void createSupportBundle()}
              >
                {isExportingSupport ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <LifeBuoy size={17} />
                )}
                <span>
                  <strong>
                    {isExportingSupport
                      ? 'Готовим отчёт…'
                      : 'Отчёт для поддержки'}
                  </strong>
                  <small>Версии, настройки и обезличенные журналы</small>
                </span>
                <FileArchive size={16} />
              </button>
            </div>

            {lastSupportBundle && (
              <button
                type="button"
                className="support-bundle-result"
                onClick={() => void revealSupportBundle()}
              >
                <CheckCircle2 size={17} />
                <span>
                  <strong>Отчёт сохранён</strong>
                  <small>
                    {compactPath(lastSupportBundle.path)} ·{' '}
                    {formatBytes(lastSupportBundle.bytes)}
                  </small>
                </span>
                <FolderOpen size={16} />
              </button>
            )}
          </section>

          <section className="settings-reset-card">
            <div>
              <Settings2 size={18} />
              <span>
                <strong>Вернуть исходные настройки</strong>
                <small>Шаблоны и экспортированные файлы не удаляются.</small>
              </span>
            </div>
            <button
              type="button"
              className="button secondary compact-button"
              onClick={confirmReset}
            >
              <RotateCcw size={15} />
              Сбросить
            </button>
          </section>
        </div>
      </div>
    </main>
  );
}

interface SettingsHeadingProps {
  icon: typeof Sun;
  kicker: string;
  title: string;
  description: string;
  action?: ReactNode;
}

function SettingsHeading({
  icon: Icon,
  kicker,
  title,
  description,
  action,
}: SettingsHeadingProps) {
  return (
    <div className="settings-card-heading">
      <div className="settings-card-icon">
        <Icon size={19} />
      </div>
      <div>
        <span>{kicker}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action && <div className="settings-card-action">{action}</div>}
    </div>
  );
}

interface SettingsSwitchProps {
  label: string;
  description: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

function SettingsSwitch({
  label,
  description,
  checked,
  onChange,
}: SettingsSwitchProps) {
  return (
    <label className="settings-switch">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i className="switch-visual" aria-hidden="true" />
    </label>
  );
}

function DiagnosticItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function compactPath(path: string): string {
  if (path.length <= 48) {
    return path;
  }
  return `…${path.slice(-47)}`;
}

function formatDuration(milliseconds: number): string {
  return milliseconds < 1_000
    ? `${milliseconds} мс`
    : `${(milliseconds / 1_000).toFixed(1)} сек.`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function platformLabel(platform: string): string {
  if (platform === 'win32') {
    return 'Windows';
  }
  if (platform === 'darwin') {
    return 'macOS';
  }
  if (platform === 'linux') {
    return 'Linux';
  }
  return platform;
}
