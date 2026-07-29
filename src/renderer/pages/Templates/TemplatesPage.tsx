import {
  CopyPlus,
  FileImage,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { TemplateSummary } from '../../../shared/ipc-contract.js';
import { Modal } from '../../components/Modal.js';
import { useTemplateStore } from '../../stores/templateStore.js';

export function TemplatesPage() {
  const summaries = useTemplateStore((state) => state.summaries);
  const thumbnails = useTemplateStore((state) => state.thumbnails);
  const createTemplate = useTemplateStore((state) => state.createTemplate);
  const openTemplate = useTemplateStore((state) => state.openTemplate);
  const renameTemplate = useTemplateStore((state) => state.renameTemplate);
  const deleteTemplate = useTemplateStore((state) => state.deleteTemplate);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<TemplateSummary | null>(null);
  const [name, setName] = useState('');

  const openCreate = () => {
    setName('');
    setCreateOpen(true);
  };

  const confirmCreate = async () => {
    const created = await createTemplate(name);
    if (created) {
      setCreateOpen(false);
    }
  };

  const openRename = (summary: TemplateSummary) => {
    setRenameTarget(summary);
    setName(summary.name);
  };

  const confirmRename = async () => {
    if (!renameTarget) {
      return;
    }
    await renameTemplate(renameTarget.id, name);
    setRenameTarget(null);
  };

  const confirmDelete = async (summary: TemplateSummary) => {
    const accepted = window.confirm(
      `Удалить шаблон «${summary.name}»? Это действие нельзя отменить.`,
    );
    if (accepted) {
      await deleteTemplate(summary.id);
    }
  };

  return (
    <main className="page templates-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">Рабочее пространство</div>
          <h1>Шаблоны наклеек</h1>
          <p>
            Загрузите фон из Figma и разместите поверх него динамические поля.
          </p>
        </div>
        <button type="button" className="button primary" onClick={openCreate}>
          <Plus size={18} />
          Новый шаблон
        </button>
      </header>

      <section className="template-summary-strip">
        <div className="summary-icon">
          <FileImage size={20} />
        </div>
        <div>
          <strong>{summaries.length}</strong>
          <span>{pluralizeTemplates(summaries.length)}</span>
        </div>
        <div className="summary-divider" />
        <p>SVG, PNG и JPG используются как статичный фон без изменений.</p>
      </section>

      {summaries.length === 0 ? (
        <section className="empty-state">
          <div className="empty-state-icon">
            <CopyPlus size={32} />
          </div>
          <h2>Создайте первый шаблон</h2>
          <p>
            Выберите экспортированный из Figma фон, затем добавьте название,
            цену, артикул и QR-код.
          </p>
          <button type="button" className="button primary" onClick={openCreate}>
            <Plus size={18} />
            Создать шаблон
          </button>
        </section>
      ) : (
        <section className="templates-grid" aria-label="Список шаблонов">
          {summaries.map((summary) => (
            <article
              key={summary.id}
              className="template-card"
              tabIndex={0}
              onClick={() => void openTemplate(summary.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  void openTemplate(summary.id);
                }
              }}
            >
              <div className="template-thumbnail">
                {thumbnails[summary.id] ? (
                  <img src={thumbnails[summary.id]} alt="" />
                ) : (
                  <FileImage size={34} />
                )}
                <div className="template-card-actions">
                  <button
                    type="button"
                    className="icon-button floating"
                    aria-label="Переименовать"
                    onClick={(event) => {
                      event.stopPropagation();
                      openRename(summary);
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-button floating danger"
                    aria-label="Удалить"
                    onClick={(event) => {
                      event.stopPropagation();
                      void confirmDelete(summary);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="template-card-body">
                <div className="template-card-title">
                  <div>
                    <h2>{summary.name}</h2>
                    <span>{formatDate(summary.updatedAt)}</span>
                  </div>
                  <MoreHorizontal size={19} />
                </div>
                <div className="template-meta">
                  <span>
                    {summary.width} × {summary.height}
                  </span>
                  <span>{summary.fieldCount} полей</span>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      <Modal
        open={createOpen}
        title="Новый шаблон"
        description="После названия откроется выбор SVG, PNG или JPG-фона."
        confirmLabel="Выбрать фон"
        canConfirm={name.trim().length > 0}
        onClose={() => setCreateOpen(false)}
        onConfirm={() => void confirmCreate()}
      >
        <label className="form-field">
          <span>Название шаблона</span>
          <input
            autoFocus
            value={name}
            maxLength={120}
            placeholder="Например, Ценник для шоурума"
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </Modal>

      <Modal
        open={renameTarget !== null}
        title="Переименовать шаблон"
        confirmLabel="Сохранить"
        canConfirm={name.trim().length > 0}
        onClose={() => setRenameTarget(null)}
        onConfirm={() => void confirmRename()}
      >
        <label className="form-field">
          <span>Новое название</span>
          <input
            autoFocus
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </Modal>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function pluralizeTemplates(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  if (remainder100 >= 11 && remainder100 <= 19) {
    return 'шаблонов';
  }
  if (remainder10 === 1) {
    return 'шаблон';
  }
  if (remainder10 >= 2 && remainder10 <= 4) {
    return 'шаблона';
  }
  return 'шаблонов';
}
