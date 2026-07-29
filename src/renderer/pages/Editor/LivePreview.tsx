import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  BrowserTextMeasurementService,
  composeSticker,
} from '../../../core/renderer-engine/index.js';
import type {
  ComposedSVGDocument,
} from '../../../core/renderer-engine/types.js';
import type { Product, Template } from '../../../shared/types/index.js';

interface LivePreviewProps {
  template: Template;
  backgroundDataUrl: string;
}

const PREVIEW_PRODUCT: Product = {
  url: 'https://example.com/products/agt-tokyo-white',
  name: 'Акрил AGT 2800×1220×18 Tokyo White',
  price: '1 485 000 сум',
  sku: 'AGT-TW-18',
  sourceParser: 'preview',
};

export function LivePreview({
  template,
  backgroundDataUrl,
}: LivePreviewProps) {
  const measurementService = useMemo(
    () => new BrowserTextMeasurementService(),
    [],
  );
  const [result, setResult] = useState<ComposedSVGDocument | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void composeSticker(template, PREVIEW_PRODUCT, {
        backgroundResolver: {
          async resolve() {
            return backgroundDataUrl;
          },
        },
        textMeasurementService: measurementService,
      })
        .then((next) => {
          if (active) {
            setResult(next);
            setError(null);
          }
        })
        .catch((reason: unknown) => {
          if (active) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'Не удалось собрать предпросмотр.',
            );
          }
        });
    }, 120);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [backgroundDataUrl, measurementService, template]);

  return (
    <div className="live-preview">
      {!result && !error && (
        <div className="preview-loading">
          <LoaderCircle className="spin" size={24} />
          <span>Собираем точный предпросмотр…</span>
        </div>
      )}
      {error && (
        <div className="preview-error">
          <AlertTriangle size={22} />
          <span>{error}</span>
        </div>
      )}
      {result && (
        <>
          <div className="preview-artboard">
            <img
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`}
              alt="Предпросмотр наклейки"
            />
          </div>
          <div className="preview-footer">
            <div>
              <strong>Тестовые данные</strong>
              <span>{PREVIEW_PRODUCT.name}</span>
            </div>
            {result.warnings.length > 0 ? (
              <div className="warning-badge">
                <AlertTriangle size={15} />
                {result.warnings.length} предупреждений
              </div>
            ) : (
              <div className="success-badge">Все поля помещаются</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
