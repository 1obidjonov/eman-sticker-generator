import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleStop,
  ExternalLink,
  FileArchive,
  FolderOpen,
  Layers3,
  Link2,
  LoaderCircle,
  PackageCheck,
  Play,
  RotateCcw,
  ScanSearch,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ExportFormat } from '../../../shared/ipc-contract.js';
import { useGenerationStore } from '../../stores/generationStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import { useTemplateStore } from '../../stores/templateStore.js';

const FORMATS: ExportFormat[] = ['svg', 'png', 'jpg'];

export function GeneratePage() {
  const template = useTemplateStore((state) => state.current);
  const openEditor = useTemplateStore((state) => state.openEditor);
  const urlsText = useGenerationStore((state) => state.urlsText);
  const parsers = useGenerationStore((state) => state.parsers);
  const progress = useGenerationStore((state) => state.progress);
  const items = useGenerationStore((state) => state.items);
  const isStarting = useGenerationStore((state) => state.isStarting);
  const isExporting = useGenerationStore((state) => state.isExporting);
  const error = useGenerationStore((state) => state.error);
  const lastExport = useGenerationStore((state) => state.lastExport);
  const setUrlsText = useGenerationStore((state) => state.setUrlsText);
  const loadParsers = useGenerationStore((state) => state.loadParsers);
  const start = useGenerationStore((state) => state.start);
  const cancel = useGenerationStore((state) => state.cancel);
  const exportAll = useGenerationStore((state) => state.exportAll);
  const revealLastExport = useGenerationStore(
    (state) => state.revealLastExport,
  );
  const clearError = useGenerationStore((state) => state.clearError);
  const settings = useSettingsStore((state) => state.settings);
  const [formats, setFormats] = useState<ExportFormat[]>(() => [
    ...settings.defaultExportFormats,
  ]);
  const [scale, setScale] = useState(settings.defaultExportScale);
  const [quality, setQuality] = useState(settings.jpgQuality);

  useEffect(() => {
    void loadParsers();
  }, [loadParsers]);

  const urls = useMemo(
    () =>
      [
        ...new Set(
          urlsText
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean),
        ),
      ],
    [urlsText],
  );
  const invalidUrlCount = useMemo(
    () => urls.filter((value) => !isHttpUrl(value)).length,
    [urls],
  );
  const tooManyUrls = urls.length > 1_000;
  const canStart =
    urls.length > 0 && invalidUrlCount === 0 && !tooManyUrls;

  if (!template) {
    return null;
  }

  const running =
    progress?.status === 'running' || progress?.status === 'queued';
  const succeeded = progress?.succeeded ?? 0;
  const percentage = progress
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const toggleFormat = (format: ExportFormat) => {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((candidate) => candidate !== format)
        : [...current, format],
    );
  };

  return (
    <main className="generate-page">
      <header className="generate-header">
        <div className="editor-title">
          <button
            type="button"
            className="icon-button"
            aria-label="Вернуться в редактор"
            onClick={openEditor}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <h1>Генерация · {template.name}</h1>
            <span>
              до 1000 ссылок
              <i>•</i>
              параллельная очередь
            </span>
          </div>
        </div>
        <div className="parser-status">
          <ScanSearch size={16} />
          <div>
            <span>Активный парсер</span>
            <strong>{parsers[0]?.displayName ?? 'Загрузка…'}</strong>
          </div>
        </div>
      </header>

      <div className="generate-workspace">
        <aside className="generation-control-panel">
          <section className="generation-section">
            <div className="section-heading compact-heading">
              <div>
                <span>01 · Источник</span>
                <h2>Ссылки на товары</h2>
              </div>
              <small>{urls.length} уникальных</small>
            </div>
            <label className="url-input-wrap">
              <Link2 size={17} />
              <textarea
                value={urlsText}
                disabled={running}
                placeholder={
                  'https://shop.example/product-1\nhttps://shop.example/product-2'
                }
                onChange={(event) => setUrlsText(event.target.value)}
              />
            </label>
            <p className="generation-hint">
              {invalidUrlCount > 0
                ? `Проверьте ссылки: некорректных строк — ${invalidUrlCount}.`
                : tooManyUrls
                  ? `Лимит превышен на ${urls.length - 1_000} ссылок.`
                  : 'Вставьте по одной ссылке в строку. Дубликаты будут удалены автоматически.'}
            </p>

            {!running ? (
              <button
                type="button"
                className="button primary generation-start-button"
                disabled={!canStart || isStarting}
                onClick={() =>
                  void start(template.id, settings.generationConcurrency)
                }
              >
                {isStarting ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Play size={18} />
                )}
                {isStarting
                  ? 'Запускаем браузер…'
                  : `Сгенерировать ${urls.length || ''}`}
              </button>
            ) : (
              <button
                type="button"
                className="button danger-button generation-start-button"
                onClick={() => void cancel()}
              >
                <CircleStop size={18} />
                Остановить генерацию
              </button>
            )}
          </section>

          <section className="generation-section">
            <div className="section-heading compact-heading">
              <div>
                <span>02 · Очередь</span>
                <h2>Ход выполнения</h2>
              </div>
              <strong className="progress-percent">{percentage}%</strong>
            </div>
            <div
              className="generation-progress-track"
              role="progressbar"
              aria-label="Прогресс генерации"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
            >
              <span style={{ width: `${percentage}%` }} />
            </div>
            <div className="generation-stat-grid">
              <div>
                <strong>{progress?.completed ?? 0}</strong>
                <span>обработано</span>
              </div>
              <div className="success-stat">
                <strong>{succeeded}</strong>
                <span>готово</span>
              </div>
              <div className="error-stat">
                <strong>{progress?.failed ?? 0}</strong>
                <span>ошибок</span>
              </div>
            </div>
            <div className="queue-state">
              {running ? (
                <>
                  <LoaderCircle className="spin" size={15} />
                  Работает {progress?.active ?? 0} воркеров
                </>
              ) : progress?.status === 'completed' ? (
                <>
                  <Check size={15} />
                  Очередь завершена
                </>
              ) : progress?.status === 'canceled' ? (
                <>
                  <CircleStop size={15} />
                  Очередь остановлена
                </>
              ) : (
                <>
                  <RotateCcw size={15} />
                  Ожидает запуска
                </>
              )}
            </div>
          </section>

          <section className="generation-section batch-export-section">
            <div className="section-heading compact-heading">
              <div>
                <span>03 · Пакет</span>
                <h2>Экспорт готовых</h2>
              </div>
              <FileArchive size={19} />
            </div>

            <div className="batch-format-row">
              {FORMATS.map((format) => (
                <button
                  type="button"
                  key={format}
                  className={
                    formats.includes(format)
                      ? 'batch-format active'
                      : 'batch-format'
                  }
                  aria-pressed={formats.includes(format)}
                  onClick={() => toggleFormat(format)}
                >
                  {format.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="batch-scale-row">
              <span>Масштаб растра</span>
              <div>
                {[1, 2, 3].map((value) => (
                  <button
                    type="button"
                    key={value}
                    className={scale === value ? 'active' : ''}
                    onClick={() => setScale(value)}
                  >
                    {value}×
                  </button>
                ))}
              </div>
            </div>

            {formats.includes('jpg') && (
              <label className="quality-control batch-quality">
                <span>
                  <strong>Качество JPG</strong>
                  <i>{quality}%</i>
                </span>
                <input
                  type="range"
                  min="40"
                  max="100"
                  step="5"
                  value={quality}
                  onChange={(event) => setQuality(Number(event.target.value))}
                />
              </label>
            )}

            {lastExport ? (
              <div className="batch-export-success">
                <PackageCheck size={20} />
                <div>
                  <strong>ZIP сохранён</strong>
                  <span>{formatBytes(lastExport.bytes)}</span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Показать архив"
                  onClick={() => void revealLastExport()}
                >
                  <FolderOpen size={17} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button secondary batch-export-button"
                disabled={
                  succeeded === 0 ||
                  formats.length === 0 ||
                  isExporting
                }
                onClick={() =>
                  void exportAll({
                    formats,
                    scale,
                    quality,
                    revealAfterExport: settings.revealAfterExport,
                  })
                }
              >
                {isExporting ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <FileArchive size={17} />
                )}
                {isExporting
                  ? 'Собираем ZIP…'
                  : `Скачать ZIP · ${succeeded}`}
              </button>
            )}
          </section>

          {error && (
            <div className="generation-error" role="alert">
              <AlertTriangle size={17} />
              <span>{error}</span>
              <button
                type="button"
                className="icon-button"
                aria-label="Закрыть ошибку"
                onClick={clearError}
              >
                ×
              </button>
            </div>
          )}
        </aside>

        <section className="generation-results">
          <div className="generation-results-header">
            <div>
              <div className="eyebrow">Предпросмотр партии</div>
              <h2>Сгенерированные наклейки</h2>
            </div>
            <span>
              <Layers3 size={15} />
              {succeeded} из {progress?.total ?? urls.length}
            </span>
          </div>

          {items.length === 0 ? (
            <div className="generation-empty-state">
              <div>
                <Layers3 size={31} />
              </div>
              <h3>Здесь появится готовая партия</h3>
              <p>
                Добавьте ссылки слева. Программа получит данные товаров,
                подставит их в шаблон и покажет результат по каждой позиции.
              </p>
            </div>
          ) : (
            <div className="generated-grid">
              {items.map((item) => (
                <article
                  key={`${item.jobId}-${item.index}`}
                  className={`generated-card ${item.status}`}
                >
                  <div className="generated-preview">
                    {item.status === 'completed' ? (
                      <img
                        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.svg)}`}
                        alt={item.product.name}
                      />
                    ) : item.status === 'failed' ? (
                      <div className="generated-error-preview">
                        <AlertTriangle size={24} />
                        <span>Не удалось обработать</span>
                      </div>
                    ) : (
                      <div className="generated-loading-preview">
                        <LoaderCircle className="spin" size={23} />
                        <span>В очереди</span>
                      </div>
                    )}
                    <span className="generated-index">
                      {String(item.index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <div className="generated-card-body">
                    {item.status === 'completed' ? (
                      <>
                        <div>
                          <strong>{item.product.name}</strong>
                          <span>
                            {item.product.sku ?? item.product.sourceParser}
                          </span>
                        </div>
                        <span
                          className="generated-link-icon"
                          title={shortHost(item.url)}
                        >
                          <ExternalLink size={15} />
                        </span>
                      </>
                    ) : item.status === 'failed' ? (
                      <div>
                        <strong>Ошибка парсинга</strong>
                        <span title={item.error}>{item.error}</span>
                      </div>
                    ) : (
                      <div>
                        <strong>Ожидает обработки</strong>
                        <span title={item.url}>{shortHost(item.url)}</span>
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function shortHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} КБ`
    : `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}
