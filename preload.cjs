"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const call = (name) => (...args) => ipcRenderer.invoke("api", name, ...args);
const names = ["listPorts", "connect", "disconnect", "voltage", "readDtcs", "clearDtcs", "readiness", "freezeFrame",
  "supportedPids", "readPids", "vagModules", "vagScanModule", "vagClear", "vagDiscover", "raw", "history", "saveHistory",
  "deleteHistory", "savePdf", "saveCsv", "openExternal", "appVersion", "installUpdate",
  "atelier", "scanDids", "cancelScan", "mode06", "mode09", "sniff", "saveText", "backup", "labels", "saveLabels", "teslaPoll", "teslaAll", "listBackups", "recipes", "saveRecipes", "importRecipes", "requestChange", "openRequests", "checkMileage"];

const api = {};
for (const n of names) api[n] = call(n);
api.on = (ch, fn) => {
  if (!["status", "log", "progress", "ble-write", "ble-devices", "update", "scan-progress", "km-progress"].includes(ch)) return;
  ipcRenderer.on(ch, (_e, d) => fn(d));
};
api.bleData = (bytes) => ipcRenderer.send("ble-data", bytes);
api.bleClosed = () => ipcRenderer.send("ble-closed");
api.bleChoose = (id) => ipcRenderer.send("ble-choose", id);

contextBridge.exposeInMainWorld("diag", api);
