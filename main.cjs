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
  atelier: (op, m, ...args) => diag.atelier(op, m, ...args),
  scanDids: (m, from, to) => diag.scanDids(m, from, to, (p, did, n) => send("scan-progress", { p, did, n })),
  cancelScan: () => diag.cancelScan(),
  mode06: () => diag.mode06(),
  mode09: () => diag.mode09(),
  sniff: (ms) => diag.sniff(ms),
  saveText: ({ text, name, ext }) => {
    const target = dialog.showSaveDialogSync(win, { defaultPath: path.join(app.getPath("documents"), name), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!target) return null;
    fs.writeFileSync(target, (ext === "csv" ? "\ufeff" : "") + text, "utf8");
    return target;
  },
  // sauvegarde automatique avant toute écriture dans un calculateur
  teslaPoll: () => diag.teslaPoll(),
  teslaAll: (ms) => diag.teslaAll(ms),
  listBackups: () => {
    const dir = path.join(app.getPath("documents"), "G&L Diag", "Sauvegardes");
    try { return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, 300).map((f) => { try { return { file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) }; } catch { return null; } }).filter(Boolean); } catch { return []; }
  },
  recipes: () => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "options.json"), "utf8")); } catch { return []; } },
  saveRecipes: (r) => { fs.writeFileSync(path.join(app.getPath("userData"), "options.json"), JSON.stringify(r, null, 1)); return true; },
  importRecipes: () => {
    const f = dialog.showOpenDialogSync(win, { filters: [{ name: "Options G&L Diag", extensions: ["json"] }] });
    if (!f) return null;
    const data = JSON.parse(fs.readFileSync(f[0], "utf8"));
    if (!Array.isArray(data)) throw new Error("Fichier d'options invalide.");
    return data;
  },
  backup: (entry) => {
    const dir = path.join(app.getPath("documents"), "G&L Diag", "Sauvegardes");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")} ${entry.vin || ""} ${entry.module} ${entry.did}.json`.replace(/[\\/:*?"<>|]/g, "_"));
    fs.writeFileSync(f, JSON.stringify(entry, null, 1));
    return f;
  },
  labels: () => { try { return JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "noms.json"), "utf8")); } catch { return {}; } },
  saveLabels: (l) => { fs.writeFileSync(path.join(app.getPath("userData"), "noms.json"), JSON.stringify(l, null, 1)); return true; },
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
