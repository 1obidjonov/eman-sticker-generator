import {
  ArrowLeft,
  Check,
  FileDown,
  Grid3X3,
  Layers3,
  Minus,
  Plus,
  QrCode,
  Save,
  ScanText,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Field } from '../../../shared/types/index.js';
import { useTemplateStore } from '../../stores/templateStore.js';
import { FieldInspector } from './FieldInspector.js';
import { KonvaCanvas } from './KonvaCanvas.js';
import { LivePreview } from './LivePreview.js';

export function EditorPage() {
  const template = useTemplateStore((state) => state.current);
  const background = useTemplateStore((state) => state.background);
  const selectedFieldId = useTemplateStore((state) => state.selectedFieldId);
  const isDirty = useTemplateStore((state) => state.isDirty);
  const isSaving = useTemplateStore((state) => state.isSaving);
  const closeEditor = useTemplateStore((state) => state.closeEditor);
  const saveCurrent = useTemplateStore((state) => state.saveCurrent);
  const openExport = useTemplateStore((state) => state.openExport);
  const openGenerate = useTemplateStore((state) => state.openGenerate);
  const addField = useTemplateStore((state) => state.addField);
  const updateField = useTemplateStore((state) => state.updateField);
  const deleteField = useTemplateStore((state) => state.deleteField);
  const selectField = useTemplateStore((state) => state.selectField);
  const [mode, setMode] = useState<'layout' | 'preview'>('layout');
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(true);

  const selectedField = useMemo(
    () =>
      template?.fields.find((field) => field.id === selectedFieldId) ?? null,
    [selectedFieldId, template?.fields],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingInput =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT';

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCurrent();
      } else if (!editingInput && event.key === 'Delete' && selectedFieldId) {
        deleteField(selectedFieldId);
      } else if (!editingInput && event.key === 'Escape') {
        selectField(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteField, saveCurrent, selectField, selectedFieldId]);

  if (!template || !background) {
    return null;
  }

  const leaveEditor = () => {
    if (
      !isDirty ||
      window.confirm('Есть несохранённые изменения. Выйти из редактора?')
    ) {
      closeEditor();
    }
  };

  const applyFieldChange = (next: Field) => {
    updateField(next.id, () => next);
  };

  return (
    <main className="editor-page">
      <header className="editor-header">
        <div className="editor-title">
          <button
            type="button"
            className="button secondary"
            onClick={openGenerate}
          >
            <Layers3 size={17} />
            Генерация
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Назад к шаблонам"
            onClick={leaveEditor}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <h1>{template.name}</h1>
            <span>
              {template.background.width} × {template.background.height} px
              <i>•</i>
              {template.fields.length} полей
            </span>
          </div>
        </div>
        <div className="editor-save-group">
          <span className={isDirty ? 'save-status dirty' : 'save-status'}>
            {isDirty ? (
              <>
                <Minus size={13} />
                Не сохранено
              </>
            ) : (
              <>
                <Check size={13} />
                Сохранено
              </>
            )}
          </span>
          <button
            type="button"
            className="button primary"
            disabled={!isDirty || isSaving}
            onClick={() => void saveCurrent()}
          >
            <Save size={17} />
            {isSaving ? 'Сохраняем…' : 'Сохранить'}
          </button>
          <button
            type="button"
            className="button secondary"
            onClick={openExport}
          >
            <FileDown size={17} />
            Экспорт
          </button>
        </div>
      </header>

      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            type="button"
            className="button secondary compact-button"
            onClick={() => addField('text')}
          >
            <ScanText size={17} />
            Текст
          </button>
          <button
            type="button"
            className="button secondary compact-button"
            onClick={() => addField('qr')}
          >
            <QrCode size={17} />
            QR-код
          </button>
        </div>

        <div className="view-switch">
          <button
            type="button"
            className={mode === 'layout' ? 'active' : ''}
            onClick={() => setMode('layout')}
          >
            Разметка
          </button>
          <button
            type="button"
            className={mode === 'preview' ? 'active' : ''}
            onClick={() => setMode('preview')}
          >
            Предпросмотр
          </button>
        </div>

        <div className="toolbar-group canvas-controls">
          <button
            type="button"
            className={showGrid ? 'icon-button active' : 'icon-button'}
            aria-label="Сетка"
            onClick={() => setShowGrid((value) => !value)}
          >
            <Grid3X3 size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Уменьшить"
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))}
          >
            <ZoomOut size={17} />
          </button>
          <span className="zoom-value">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Увеличить"
            onClick={() => setZoom((value) => Math.min(2, value + 0.1))}
          >
            <ZoomIn size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Сбросить масштаб"
            onClick={() => setZoom(1)}
          >
            <Plus size={17} />
          </button>
        </div>
      </div>

      <div className="editor-workspace">
        <section className="editor-canvas-area">
          {mode === 'layout' ? (
            <KonvaCanvas
              template={template}
              backgroundDataUrl={background.dataUrl}
              selectedFieldId={selectedFieldId}
              zoom={zoom}
              showGrid={showGrid}
              onSelect={selectField}
              onChange={applyFieldChange}
            />
          ) : (
            <LivePreview
              template={template}
              backgroundDataUrl={background.dataUrl}
            />
          )}
        </section>
        <FieldInspector
          field={selectedField}
          onChange={applyFieldChange}
          onDelete={() => {
            if (selectedField) {
              deleteField(selectedField.id);
            }
          }}
        />
      </div>
    </main>
  );
}
