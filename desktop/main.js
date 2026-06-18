/*
 * Electron main process — wraps the web app into a native desktop window so it
 * can be packaged into Windows (.exe) and Linux (AppImage/.deb) installers.
 *
 *   Dev:   npm start          (loads the app from the parent folder)
 *   Build: npm run dist       (copies the app in, builds an installer)
 */
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// When packaged, the app files were copied into ./app. In dev, use the parent.
function indexPath() {
  const bundled = path.join(__dirname, 'app', 'index.html');
  if (fs.existsSync(bundled)) return bundled;
  return path.join(__dirname, '..', 'index.html');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f1419',
    title: 'Lottery POS',
    webPreferences: { contextIsolation: true },
  });
  Menu.setApplicationMenu(null); // clean, kiosk-like for store clerks
  win.loadFile(indexPath());
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
