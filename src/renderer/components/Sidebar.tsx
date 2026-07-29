import {
  FileDown,
  LayoutGrid,
  Layers3,
  Settings,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import type { ApplicationView } from '../stores/templateStore.js';

interface SidebarProps {
  view: ApplicationView;
  hasTemplate: boolean;
  onTemplates(): void;
  onEditor(): void;
  onGenerate(): void;
  onExport(): void;
  onSettings(): void;
}

export function Sidebar({
  view,
  hasTemplate,
  onTemplates,
  onEditor,
  onGenerate,
  onExport,
  onSettings,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <WandSparkles size={21} />
        </div>
        <div>
          <strong>Eman</strong>
          <span>Sticker Generator</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Главная навигация">
        <button
          type="button"
          className={view === 'templates' ? 'nav-item active' : 'nav-item'}
          onClick={onTemplates}
        >
          <LayoutGrid size={19} />
          <span>Шаблоны</span>
        </button>
        <button
          type="button"
          className={view === 'editor' ? 'nav-item active' : 'nav-item'}
          disabled={!hasTemplate}
          onClick={onEditor}
        >
          <Sparkles size={19} />
          <span>Редактор</span>
        </button>
        <button
          type="button"
          className={view === 'generate' ? 'nav-item active' : 'nav-item'}
          disabled={!hasTemplate}
          onClick={onGenerate}
        >
          <Layers3 size={19} />
          <span>Генерация</span>
        </button>
        <button
          type="button"
          className={view === 'export' ? 'nav-item active' : 'nav-item'}
          disabled={!hasTemplate}
          onClick={onExport}
        >
          <FileDown size={19} />
          <span>Экспорт</span>
        </button>
      </nav>

      <div className="sidebar-footer">
        <button
          type="button"
          className={view === 'settings' ? 'nav-item active' : 'nav-item'}
          onClick={onSettings}
        >
          <Settings size={19} />
          <span>Настройки</span>
        </button>
        <div className="stage-badge">
          <span>Этап 8 · RC</span>
          <strong>Windows Release Candidate</strong>
        </div>
      </div>
    </aside>
  );
}
