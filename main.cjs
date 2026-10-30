// G&L Diag – processus principal Electron
"use strict";
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { Diag } = require("./src/core/diag.cjs");
const { SerialTransport } = require("./src/core/transports.cjs");

let win;
const diag = new Diag();
let bleChooser = null;

const histFile = () => path.join(app.getPath("userData"), "historique.json");
const readHist = () => { try { return JSON.parse(fs.readFileSync(histFile(), "utf8")); } catch { return []; } };

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

function createWindow() {
  win = new BrowserWindow({
    width: 1380, height: 900, minWidth: 1000, minHeight: 640, title: "G&L Diag",
    icon: path.join(__dirname, "build", "icon.png"), backgroundColor: "#f3f4f6", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("before-input-event", (e, input) => {
    if (input.key === "F12") { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  // Bluetooth basse consommation : la fenêtre choisit l'appareil
  win.webContents.on("select-bluetooth-device", (event, devices, callback) => {
    event.preventDefault();
    bleChooser = callback;
    send("ble-devices", devices.map((d) => ({ id: d.deviceId, name: d.deviceName || "(sans nom)" })));
  });
  win.webContents.session.setPermissionCheckHandler(() => true);
  win.webContents.session.setDevicePermissionHandler(() => true);
}

diag.on("status", (s) => send("status", s));
diag.on("log", (l) => send("log", l));

const api = {
  listPorts: () => SerialTransport.list().catch((e) => { throw new Error("Lecture des ports COM impossible : " + e.message); }),
  connect: (opts) => diag.connect(opts, (s) => send("ble-write", s)),
  disconnect: () => diag.disconnect(),
  voltage: () => diag.voltage(),
  readDtcs: () => diag.readDtcs(),
  clearDtcs: () => diag.clearDtcs(),
  readiness: () => diag.readiness(),
  freezeFrame: () => diag.freezeFrame(),
  supportedPids: () => diag.supportedPids(),
  readPids: (pids) => diag.readPids(pids),
  vagModules: () => diag.vagModules(),
  vagScanModule: (m) => diag.vagScanModule(m),
  vagClear: (m) => diag.vagClear(m),
  vagDiscover: () => diag.vagDiscover((p, addr) => send("progress", { p, addr })),
  raw: (cmd) => diag.raw(cmd),
  history: () => readHist(),
  saveHistory: (entry) => {
    const h = readHist().filter((x) => x.id !== entry.id);
    h.unshift(entry);
    fs.writeFileSync(histFile(), JSON.stringify(h.slice(0, 300), null, 1));
    return true;
  },
  deleteHistory: (id) => { fs.writeFileSync(histFile(), JSON.stringify(readHist().filter((x) => x.id !== id), null, 1)); return true; },
  savePdf: async ({ html, name }) => {
    const target = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath("documents"), name), filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!target) return null;
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await w.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
    const pdf = await w.webContents.printToPDF({ pageSize: "A4", printBackground: true, margins: { marginType: "custom", top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 } });
    w.destroy();
    fs.writeFileSync(target, pdf);
    shell.openPath(target);
    return target;
  },
  saveCsv: ({ text, name }) => {
    const target = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath("documents"), name), filters: [{ name: "CSV (Excel)", extensions: ["csv"] }] });
    if (!target) return null;
    fs.writeFileSync(target, "﻿" + text, "utf8");
    return target;
  },
  openExternal: (url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); },
  appVersion: () => app.getVersion(),
  installUpdate: () => { const { autoUpdater } = require("electron-updater"); autoUpdater.quitAndInstall(); },
};

ipcMain.handle("api", async (_e, name, ...args) => {
  if (!api[name]) throw new Error("Fonction inconnue : " + name);
  return api[name](...args);
});
ipcMain.on("ble-data", (_e, bytes) => { if (diag.t && diag.t.feed) diag.t.feed(bytes); });
ipcMain.on("ble-closed", () => { if (diag.t && diag.t.feed) diag.t.close(); });
ipcMain.on("ble-choose", (_e, id) => { if (bleChooser) { const cb = bleChooser; bleChooser = null; cb(id || ""); } });

app.whenReady().then(() => {
  createWindow();
  if (app.isPackaged) {
    try {
      const { autoUpdater } = require("electron-updater");
      autoUpdater.autoInstallOnAppQuit = true;
      autoUpdater.on("update-available", (i) => send("update", { state: "downloading", version: i.version }));
      autoUpdater.on("update-downloaded", (i) => send("update", { state: "ready", version: i.version }));
      autoUpdater.checkForUpdates().catch(() => {});
      setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600 * 1000);
    } catch {}
  }
});
app.on("window-all-closed", () => { diag.disconnect(); app.quit(); });
