// Moyens de connexion à l'adaptateur ELM327
//  - Bluetooth classique : Windows crée un port COM après l'appairage
//  - WiFi : connexion TCP (souvent 192.168.0.10:35000)
//  - Bluetooth basse consommation (BLE) : géré par la fenêtre, relayé ici (BridgeTransport)
//  - Démo : simulateur intégré
"use strict";
const { EventEmitter } = require("events");
const net = require("net");

class TcpTransport extends EventEmitter {
  constructor(host, port) { super(); this.host = host; this.port = port; }
  open() {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port });
      const timer = setTimeout(() => { sock.destroy(); reject(new Error(`Impossible de joindre l'adaptateur WiFi ${this.host}:${this.port}. Vérifie que le PC est connecté au réseau WiFi de l'adaptateur (souvent « WiFi_OBDII » ou « V-LINK »).`)); }, 8000);
      sock.once("connect", () => { clearTimeout(timer); sock.setNoDelay(true); this.sock = sock; resolve(); });
      sock.once("error", (e) => { clearTimeout(timer); reject(new Error(`Connexion WiFi impossible : ${e.message}`)); });
      sock.on("data", (d) => this.emit("data", d));
      sock.on("close", () => this.emit("close"));
    });
  }
  write(s) { this.sock && this.sock.write(s, "latin1"); }
  close() { try { this.sock && this.sock.destroy(); } catch {} }
}

class SerialTransport extends EventEmitter {
  constructor(path, baudRate = 38400) { super(); this.path = path; this.baudRate = baudRate; }
  open() {
    const { SerialPort } = require("serialport");
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false });
      port.open((err) => {
        if (err) return reject(new Error(`Impossible d'ouvrir ${this.path} : ${err.message}. Si c'est un port Bluetooth, essaie l'autre port COM du même appareil.`));
        this.port = port;
        port.on("data", (d) => this.emit("data", d));
        port.on("close", () => this.emit("close"));
        port.on("error", () => this.emit("close"));
        resolve();
      });
    });
  }
  write(s) { this.port && this.port.write(Buffer.from(s, "latin1")); }
  close() { try { this.port && this.port.isOpen && this.port.close(); } catch {} }

  static async list() {
    const { SerialPort } = require("serialport");
    const ports = await SerialPort.list();
    return ports.map((p) => {
      const txt = `${p.pnpId || ""} ${p.manufacturer || ""} ${p.friendlyName || ""}`;
      const bt = /BTHENUM|bluetooth/i.test(txt);
      const obd = /FTDI|OBDLink|vLinker|Vgate|ScanTool|CH340|CP210|Silicon Labs|STN/i.test(txt);
      return {
        path: p.path,
        label: p.friendlyName || `${p.path}${p.manufacturer ? " – " + p.manufacturer : ""}`,
        bluetooth: bt,
        usb: !!p.vendorId,
        obd,
      };
    });
  }
}

// Bluetooth basse consommation : les octets passent par la fenêtre (Web Bluetooth)
class BridgeTransport extends EventEmitter {
  constructor(sendToRenderer) { super(); this.sendToRenderer = sendToRenderer; }
  async open() {}
  feed(data) { this.emit("data", Buffer.from(data)); }
  write(s) { this.sendToRenderer(s); }
  close() { this.emit("close"); }
}

module.exports = { TcpTransport, SerialTransport, BridgeTransport };
