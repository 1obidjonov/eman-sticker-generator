import {
  AlertTriangle,
  ArrowLeft,
  Check,
  FileArchive,
  FileCode2,
  FolderOpen,
  Image as ImageIcon,
  LoaderCircle,
  PackageCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  BrowserTextMeasurementService,
  composeSticker,
} from '../../../core/renderer-engine/index.js';
import type {
  ComposedSVGDocument,
} from '../../../core/renderer-engine/types.js';
import type {
  ExportFormat,
  ExportResult,
} from '../../../shared/ipc-contract.js';
import type { Product } from '../../../shared/types/index.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import { useTemplateStore } from '../../stores/templateStore.js';

const FORMAT_OPTIONS: Array<{
  format: ExportFormat;
  title: string;
  description: string;
}> = [
  {
    format: 'svg',
    title: 'SVG',
    description: 'Вектор, любой масштаб',
  },
  {
    format: 'png',
    title: 'PNG',
    description: 'Точный растр без потерь',
  },
  {
    format: 'jpg',
    title: 'JPG',
    description: 'Компактный файл на белом фоне',
  },
];

const INITIAL_PRODUCT: Product = {
  url: 'https://example.com/products/agt-tokyo-white',
  name: 'Акрил AGT 2800×1220×18 Tokyo White',
  price: '1 485 000 сум',
  sku: 'AGT-TW-18',
  sourceParser: 'manual-export',
};

export function ExportPage() {
  const template = useTemplateStore((state) => state.current);
  const background = useTemplateStore((state) => state.background);
  const isDirty = useTemplateStore((state) => state.isDirty);
  const openEditor = useTemplateStore((state) => state.openEditor);
  const settings = useSettingsStore((state) => state.settings);
  const measurementService = useMemo(
    () => new BrowserTextMeasurementService(),
    [],
  );
  const [product, setProduct] = useState<Product>(INITIAL_PRODUCT);
  const [formats, setFormats] = useState<ExportFormat[]>(() => [
    ...settings.defaultExportFormats,
  ]);
  const [scale, setScale] = useState(settings.defaultExportScale);
  const [quality, setQuality] = useState(settings.jpgQuality);
  const [composition, setComposition] =
    useState<ComposedSVGDocument | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [isComposing, setIsComposing] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<ExportResult | null>(null);

  useEffect(() => {
    if (!template || !background) {
      return;
    }

    let active = true;
    setIsComposing(true);
    const timer = window.setTimeout(() => {
      void composeSticker(template, product, {
        backgroundResolver: {
          async resolve() {
            return background.dataUrl;
          },
        },
        textMeasurementService: measurementService,
      })
        .then((result) => {
          if (active) {
            setComposition(result);
            setComposeError(null);
            setIsComposing(false);
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setComposition(null);
            setComposeError(toErrorMessage(error));
            setIsComposing(false);
          }
        });
    }, 100);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [background, measurementService, product, template]);

  if (!template || !background) {
    return null;
  }

  const setProductValue = (
    key: 'name' | 'price' | 'sku' | 'url',
    value: string,
  ) => {
    setProduct((current) => ({ ...current, [key]: value }));
    setLastExport(null);
  };

  const toggleFormat = (format: ExportFormat) => {
    setFormats((current) =>
      current.includes(format)
        ? current.filter((item) => item !== format)
        : [...current, format],
    );
    setLastExport(null);
  };

  const runExport = async () => {
    if (!composition || formats.length === 0 || isExporting) {
      return;
    }

    setIsExporting(true);
    setExportError(null);
    try {
      const api = window.stickerGenerator;
      if (!api) {
        throw new Error(
          'Экспорт файлов доступен только в настольном приложении.',
        );
      }

      const common = {
        svg: composition.svg,
        baseName: template.name,
        scale,
        quality,
      };
      const result =
        formats.length === 1
          ? await api.export.saveFile({
              ...common,
              format: formats[0] as ExportFormat,
            })
          : await api.export.saveZip({ ...common, formats });

      if (result) {
        setLastExport(result);
        if (settings.revealAfterExport) {
          await api.export.reveal(result.path);
        }
      }
    } catch (error) {
      setExportError(toErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  const revealLastExport = async () => {
    if (!lastExport || !window.stickerGenerator) {
      return;
    }
    try {
      await window.stickerGenerator.export.reveal(lastExport.path);
    } catch (error) {
      setExportError(toErrorMessage(error));
    }
  };

  const rasterSelected =
    formats.includes('png') || formats.includes('jpg');
  const pixelWidth = template.background.width * scale;
  const pixelHeight = template.background.height * scale;

  return (
    <main className="export-page">
      <header className="export-header">
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
            <h1>Экспорт · {template.name}</h1>
            <span>
              {template.background.width} × {template.background.height} px
              <i>•</i>
              текущая версия макета
            </span>
          </div>
        </div>
        <div className={isDirty ? 'export-version dirty' : 'export-version'}>
          {isDirty ? (
            <>
              <AlertTriangle size={15} />
              Есть несохранённые изменения
            </>
          ) : (
            <>
              <Check size={15} />
              Шаблон сохранён
            </>
          )}
        </div>
      </header>

      <div className="export-workspace">
        <section className="export-preview-panel">
          <div className="section-heading">
            <div>
              <span>01 · Результат</span>
              <h2>Предпросмотр наклейки</h2>
            </div>
            {composition && (
              <div className="preview-dimensions">
                SVG · {template.background.width} × {template.background.height}
              </div>
            )}
          </div>

          <div className="export-preview-stage">
            {isComposing && (
              <div className="preview-loading">
                <LoaderCircle className="spin" size={23} />
                Обновляем макет…
              </div>
            )}
            {composeError && (
              <div className="preview-error">
                <AlertTriangle size={21} />
                {composeError}
              </div>
            )}
            {composition && !isComposing && (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(composition.svg)}`}
                alt="Наклейка перед экспортом"
              />
            )}
          </div>

          <div className="export-preview-meta">
            <div>
              <strong>{product.name || 'Без названия'}</strong>
              <span>{product.sku || 'Артикул не указан'}</span>
            </div>
            {composition && composition.warnings.length > 0 ? (
              <div className="warning-badge">
                <AlertTriangle size={14} />
                {composition.warnings.length} предупреждений
              </div>
            ) : (
              <div className="success-badge">
                <Check size={14} />
                Макет готов
              </div>
            )}
          </div>
        </section>

        <aside className="export-settings">
          <section className="export-settings-section">
            <div className="section-heading compact-heading">
              <div>
                <span>02 · Данные</span>
                <h2>Тестовый товар</h2>
              </div>
            </div>
            <div className="export-product-grid">
              <label className="form-field compact export-field-wide">
                <span>Название товара</span>
                <input
                  value={product.name}
                  onChange={(event) =>
                    setProductValue('name', event.target.value)
                  }
                />
              </label>
              <label className="form-field compact">
                <span>Цена</span>
                <input
                  value={product.price ?? ''}
                  onChange={(event) =>
                    setProductValue('price', event.target.value)
                  }
                />
              </label>
              <label className="form-field compact">
                <span>Артикул</span>
                <input
                  value={product.sku ?? ''}
                  onChange={(event) =>
                    setProductValue('sku', event.target.value)
                  }
                />
              </label>
              <label className="form-field compact export-field-wide">
                <span>Ссылка для QR-кода</span>
                <input
                  value={product.url}
                  onChange={(event) =>
                    setProductValue('url', event.target.value)
                  }
                />
              </label>
            </div>
          </section>

          <section className="export-settings-section">
            <div className="section-heading compact-heading">
              <div>
                <span>03 · Форматы</span>
                <h2>Файлы экспорта</h2>
              </div>
              <small>Можно выбрать несколько</small>
            </div>

            <div className="format-options">
              {FORMAT_OPTIONS.map((option) => {
                const selected = formats.includes(option.format);
                return (
                  <button
                    type="button"
                    key={option.format}
                    className={selected ? 'format-option selected' : 'format-option'}
                    aria-pressed={selected}
                    onClick={() => toggleFormat(option.format)}
                  >
                    <span className="format-icon">
                      {option.format === 'svg' ? (
                        <FileCode2 size={18} />
                      ) : (
                        <ImageIcon size={18} />
                      )}
                    </span>
                    <span>
                      <strong>{option.title}</strong>
                      <small>{option.description}</small>
                    </span>
                    <i>{selected && <Check size={13} />}</i>
                  </button>
                );
              })}
            </div>

            {rasterSelected && (
              <div className="raster-settings">
                <div>
                  <label>Масштаб растра</label>
                  <div className="scale-options">
                    {[1, 2, 3].map((value) => (
                      <button
                        type="button"
                        key={value}
                        className={scale === value ? 'active' : ''}
                        onClick={() => {
                          setScale(value);
                          setLastExport(null);
                        }}
                      >
                        {value}×
                      </button>
                    ))}
                  </div>
                </div>
                <span>
                  {pixelWidth} × {pixelHeight} px
                </span>
              </div>
            )}

            {formats.includes('jpg') && (
              <label className="quality-control">
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
                  onChange={(event) => {
                    setQuality(Number(event.target.value));
                    setLastExport(null);
                  }}
                />
              </label>
            )}
          </section>

          <section className="export-action-section">
            {exportError && (
              <div className="export-inline-error">
                <AlertTriangle size={16} />
                {exportError}
              </div>
            )}

            {lastExport ? (
              <div className="export-success">
                <PackageCheck size={23} />
                <div>
                  <strong>Экспорт завершён</strong>
                  <span>
                    {lastExport.archived ? 'ZIP-архив' : lastExport.formats[0]?.toUpperCase()}
                    {' · '}
                    {formatBytes(lastExport.bytes)}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Показать файл"
                  onClick={() => void revealLastExport()}
                >
                  <FolderOpen size={18} />
                </button>
              </div>
            ) : (
              <div className="export-summary">
                {formats.length > 1 ? (
                  <FileArchive size={18} />
                ) : (
                  <ImageIcon size={18} />
                )}
                <span>
                  {formats.length === 0
                    ? 'Выберите формат'
                    : formats.length === 1
                      ? `Будет сохранён файл ${formats[0]?.toUpperCase()}`
                      : `${formats.length} формата будут упакованы в ZIP`}
                </span>
              </div>
            )}

            <button
              type="button"
              className="button primary export-button"
              disabled={
                formats.length === 0 ||
                !composition ||
                isComposing ||
                isExporting
              }
              onClick={() => void runExport()}
            >
              {isExporting ? (
                <LoaderCircle className="spin" size={18} />
              ) : formats.length > 1 ? (
                <FileArchive size={18} />
              ) : (
                <ImageIcon size={18} />
              )}
              {isExporting
                ? 'Экспортируем…'
                : formats.length > 1
                  ? 'Сохранить ZIP'
                  : 'Экспортировать файл'}
            </button>
          </section>
        </aside>
      </div>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить экспорт.';
}
