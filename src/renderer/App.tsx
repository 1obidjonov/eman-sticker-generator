import { LoaderCircle, X } from 'lucide-react';
import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar.js';
import { EditorPage } from './pages/Editor/EditorPage.js';
import { ExportPage } from './pages/Export/ExportPage.js';
import { GeneratePage } from './pages/Generate/GeneratePage.js';
import { SettingsPage } from './pages/Settings/SettingsPage.js';
import { TemplatesPage } from './pages/Templates/TemplatesPage.js';
import { useSettingsStore } from './stores/settingsStore.js';
import { useTemplateStore } from './stores/templateStore.js';

export function App() {
  const view = useTemplateStore((state) => state.view);
  const isLoading = useTemplateStore((state) => state.isLoading);
  const isDirty = useTemplateStore((state) => state.isDirty);
  const current = useTemplateStore((state) => state.current);
  const error = useTemplateStore((state) => state.error);
  const loadTemplates = useTemplateStore((state) => state.loadTemplates);
  const closeEditor = useTemplateStore((state) => state.closeEditor);
  const openEditor = useTemplateStore((state) => state.openEditor);
  const openGenerate = useTemplateStore((state) => state.openGenerate);
  const openExport = useTemplateStore((state) => state.openExport);
  const openSettings = useTemplateStore((state) => state.openSettings);
  const clearError = useTemplateStore((state) => state.clearError);
  const initializeSettings = useSettingsStore((state) => state.initialize);
  const isSettingsLoading = useSettingsStore((state) => state.isLoading);

  useEffect(() => {
    void Promise.all([loadTemplates(), initializeSettings()]);
  }, [initializeSettings, loadTemplates]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const goToTemplates = () => {
    if (
      view === 'templates' ||
      !isDirty ||
      window.confirm('Есть несохранённые изменения. Выйти из редактора?')
    ) {
      closeEditor();
    }
  };

  return (
    <div className="application-shell">
      <Sidebar
        view={view}
        hasTemplate={current !== null}
        onTemplates={goToTemplates}
        onEditor={openEditor}
        onGenerate={openGenerate}
        onExport={openExport}
        onSettings={openSettings}
      />
      <div className="application-content">
        {view === 'templates' && <TemplatesPage />}
        {view === 'editor' && <EditorPage />}
        {view === 'generate' && <GeneratePage />}
        {view === 'export' && <ExportPage />}
        {view === 'settings' && <SettingsPage />}
      </div>

      {(isLoading || isSettingsLoading) && (
        <div className="loading-overlay">
          <div>
            <LoaderCircle className="spin" size={24} />
            <span>Загрузка…</span>
          </div>
        </div>
      )}

      {error && (
        <div className="toast error-toast" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть"
            onClick={clearError}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
