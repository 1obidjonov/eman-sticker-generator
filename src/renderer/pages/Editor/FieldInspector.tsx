import { AlignCenter, AlignLeft, AlignRight, Trash2 } from 'lucide-react';
import type {
  Field,
  QRField,
  TextField,
} from '../../../shared/types/index.js';

interface FieldInspectorProps {
  field: Field | null;
  onChange(field: Field): void;
  onDelete(): void;
}

export function FieldInspector({
  field,
  onChange,
  onDelete,
}: FieldInspectorProps) {
  if (!field) {
    return (
      <aside className="inspector empty-inspector">
        <div className="inspector-empty-visual">T</div>
        <h2>Выберите поле</h2>
        <p>
          Нажмите на рамку на макете, чтобы изменить источник данных, шрифт,
          размер и другие параметры.
        </p>
      </aside>
    );
  }

  const updateRect = (
    key: keyof Field['rect'],
    value: number,
  ) => {
    onChange({
      ...field,
      rect: { ...field.rect, [key]: value },
    });
  };

  return (
    <aside className="inspector">
      <div className="inspector-header">
        <div>
          <span className={`field-type-pill ${field.type}`}>
            {field.type === 'text' ? 'Текст' : 'QR-код'}
          </span>
          <h2>{field.name}</h2>
        </div>
        <button
          type="button"
          className="icon-button danger"
          aria-label="Удалить поле"
          onClick={onDelete}
        >
          <Trash2 size={17} />
        </button>
      </div>

      <section className="inspector-section">
        <h3>Поле</h3>
        <label className="form-field compact">
          <span>Название</span>
          <input
            value={field.name}
            onChange={(event) =>
              onChange({ ...field, name: event.target.value })
            }
          />
        </label>
        <div className="coordinate-grid">
          <NumberInput
            label="X"
            value={field.rect.x}
            onChange={(value) => updateRect('x', value)}
          />
          <NumberInput
            label="Y"
            value={field.rect.y}
            onChange={(value) => updateRect('y', value)}
          />
          <NumberInput
            label="W"
            value={field.rect.width}
            minimum={24}
            onChange={(value) => updateRect('width', value)}
          />
          <NumberInput
            label="H"
            value={field.rect.height}
            minimum={24}
            onChange={(value) => updateRect('height', value)}
          />
        </div>
      </section>

      {field.type === 'text' ? (
        <TextInspector field={field} onChange={onChange} />
      ) : (
        <QrInspector field={field} onChange={onChange} />
      )}

      <section className="inspector-section">
        <h3>Слой</h3>
        <NumberInput
          label="Z-index"
          value={field.zIndex}
          onChange={(value) => onChange({ ...field, zIndex: value })}
        />
      </section>
    </aside>
  );
}

function TextInspector({
  field,
  onChange,
}: {
  field: TextField;
  onChange(field: TextField): void;
}) {
  const updateFont = (
    key: keyof TextField['font'],
    value: string | number | boolean,
  ) => {
    onChange({
      ...field,
      font: { ...field.font, [key]: value },
    });
  };

  return (
    <>
      <section className="inspector-section">
        <h3>Данные</h3>
        <label className="form-field compact">
          <span>Источник</span>
          <select
            value={field.source}
            onChange={(event) =>
              onChange({
                ...field,
                source: event.target.value as TextField['source'],
              })
            }
          >
            <option value="productName">Название товара</option>
            <option value="price">Цена</option>
            <option value="sku">Артикул</option>
            <option value="custom">Свой текст</option>
          </select>
        </label>
        {field.source === 'custom' && (
          <label className="form-field compact">
            <span>Текст</span>
            <textarea
              rows={3}
              value={field.customText ?? ''}
              onChange={(event) =>
                onChange({ ...field, customText: event.target.value })
              }
            />
          </label>
        )}
      </section>

      <section className="inspector-section">
        <h3>Типографика</h3>
        <label className="form-field compact">
          <span>Шрифт</span>
          <input
            value={field.font.family}
            onChange={(event) => updateFont('family', event.target.value)}
          />
        </label>
        <div className="coordinate-grid three">
          <NumberInput
            label="Размер"
            value={field.font.size}
            minimum={1}
            onChange={(value) => updateFont('size', value)}
          />
          <NumberInput
            label="Min"
            value={field.font.minSize}
            minimum={1}
            onChange={(value) => updateFont('minSize', value)}
          />
          <NumberInput
            label="Max"
            value={field.font.maxSize}
            minimum={1}
            onChange={(value) => updateFont('maxSize', value)}
          />
        </div>
        <div className="inline-controls">
          <button
            type="button"
            className={field.font.bold ? 'toggle-button active' : 'toggle-button'}
            onClick={() => updateFont('bold', !field.font.bold)}
          >
            B
          </button>
          <button
            type="button"
            className={
              field.font.italic ? 'toggle-button italic active' : 'toggle-button italic'
            }
            onClick={() => updateFont('italic', !field.font.italic)}
          >
            I
          </button>
          <div className="alignment-control">
            {[
              { alignment: 'left' as const, Icon: AlignLeft },
              { alignment: 'center' as const, Icon: AlignCenter },
              { alignment: 'right' as const, Icon: AlignRight },
            ].map(({ alignment, Icon }) => (
              <button
                key={alignment}
                type="button"
                className={field.align === alignment ? 'active' : ''}
                aria-label={`Выравнивание ${alignment}`}
                onClick={() =>
                  onChange({
                    ...field,
                    align: alignment,
                  })
                }
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
          <label className="color-control" title="Цвет текста">
            <input
              type="color"
              value={field.color.slice(0, 7)}
              onChange={(event) =>
                onChange({ ...field, color: event.target.value.toUpperCase() })
              }
            />
          </label>
        </div>
        <NumberInput
          label="Межстрочный интервал"
          value={field.lineHeight}
          minimum={0.5}
          step={0.05}
          onChange={(value) => onChange({ ...field, lineHeight: value })}
        />
      </section>

      <section className="inspector-section">
        <h3>Переполнение</h3>
        <Switch
          label="Переносить строки"
          checked={field.wrap}
          onChange={(checked) => onChange({ ...field, wrap: checked })}
        />
        <Switch
          label="Автоматически уменьшать"
          checked={field.autoShrink}
          onChange={(checked) => onChange({ ...field, autoShrink: checked })}
        />
        <Switch
          label="Добавлять многоточие"
          checked={field.ellipsis}
          onChange={(checked) => onChange({ ...field, ellipsis: checked })}
        />
      </section>
    </>
  );
}

function QrInspector({
  field,
  onChange,
}: {
  field: QRField;
  onChange(field: QRField): void;
}) {
  return (
    <>
      <section className="inspector-section">
        <h3>Данные</h3>
        <label className="form-field compact">
          <span>Источник</span>
          <select
            value={field.source}
            onChange={(event) =>
              onChange({
                ...field,
                source: event.target.value as QRField['source'],
              })
            }
          >
            <option value="productUrl">Ссылка на товар</option>
            <option value="customText">Своё значение</option>
          </select>
        </label>
        {field.source === 'customText' && (
          <label className="form-field compact">
            <span>Значение</span>
            <textarea
              rows={3}
              value={field.customValue ?? ''}
              onChange={(event) =>
                onChange({ ...field, customValue: event.target.value })
              }
            />
          </label>
        )}
      </section>

      <section className="inspector-section">
        <h3>QR-код</h3>
        <div className="coordinate-grid">
          <NumberInput
            label="Размер"
            value={field.size}
            minimum={24}
            onChange={(value) => onChange({ ...field, size: value })}
          />
          <NumberInput
            label="Отступ"
            value={field.margin}
            minimum={0}
            onChange={(value) => onChange({ ...field, margin: value })}
          />
        </div>
        <label className="form-field compact">
          <span>Коррекция ошибок</span>
          <select
            value={field.errorCorrectionLevel}
            onChange={(event) =>
              onChange({
                ...field,
                errorCorrectionLevel: event.target
                  .value as QRField['errorCorrectionLevel'],
              })
            }
          >
            <option value="L">L — минимальная</option>
            <option value="M">M — стандартная</option>
            <option value="Q">Q — повышенная</option>
            <option value="H">H — максимальная</option>
          </select>
        </label>
        <Switch
          label="Белый фон"
          checked={field.whiteBackground}
          onChange={(checked) =>
            onChange({ ...field, whiteBackground: checked })
          }
        />
      </section>
    </>
  );
}

function NumberInput({
  label,
  value,
  minimum,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  minimum?: number;
  step?: number;
  onChange(value: number): void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={minimum}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) {
            onChange(minimum === undefined ? next : Math.max(minimum, next));
          }
        }}
      />
    </label>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-visual" />
    </label>
  );
}
