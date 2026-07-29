import { BrowserWindow, nativeTheme } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ThemePreference } from '../shared/ipc-contract.js';

const currentDirectory = fileURLToPath(new URL('.', import.meta.url));

export function createMainWindow(
  theme: ThemePreference = 'system',
  options: { showWhenReady?: boolean } = {},
): BrowserWindow {
  nativeTheme.themeSource = theme;
  const developmentUrl = process.env.VITE_DEV_SERVER_URL;

  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#101713' : '#f5f7f6',
    title: 'Eman Sticker Generator',
    webPreferences: {
      preload: join(currentDirectory, '../preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      navigateOnDragDrop: false,
      devTools: Boolean(developmentUrl),
      spellcheck: false,
    },
  });

  window.setMenuBarVisibility(false);
  if (options.showWhenReady !== false) {
    window.once('ready-to-show', () => window.show());
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  if (developmentUrl) {
    void window.loadURL(developmentUrl);
  } else {
    void window.loadFile(
      join(currentDirectory, '../../renderer/index.html'),
    );
  }

  return window;
}
