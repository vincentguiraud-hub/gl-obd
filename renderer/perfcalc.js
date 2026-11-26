"use strict";
// Suivi d'une mesure de puissance : pied à fond, passages de rapport (boîte manuelle ou automatique), fin de mesure.
// Sans interface : utilisé par perf.js et testé sous Node (test/perf.test.cjs).
(function (root) {
  class PerfTrack {
    constructor() {
      this.samples = []; this.peak = 0; this.vMax = 0; this.pedMax = 0; this.gear = 1; this.shifts = 0;
      this.shiftUntil = 0; this.offCount = 0; this.slowCount = 0;
    }
    // pied à fond : relatif au maxi vu (la pédale « D » de beaucoup de VW/Audi plafonne vers 75-85 %)
    wot(s) { return s.pedal == null ? true : this.pedMax > 40 && s.pedal >= this.pedMax * 0.85; }
    push(s) {
      const prev = this.samples[this.samples.length - 1];
      if (s.pedal != null) this.pedMax = Math.max(this.pedMax, s.pedal);
      s.w = this.wot(s);
      // passage de rapport : le régime chute alors que la vitesse ne baisse pas
      if (prev && s.w && prev.rpm - s.rpm > 250 && (s.v == null || prev.v == null || s.v >= prev.v - 2)) {
        this.gear++; this.shifts++; this.shiftUntil = s.ms + 900; // le temps que l'embrayage / le convertisseur se recale
      }
      s.gear = this.gear;
      s.shift = s.ms < this.shiftUntil || (prev && s.rpm < prev.rpm - 40);
      this.peak = Math.max(this.peak, s.rpm);
      if (s.v != null) this.vMax = Math.max(this.vMax, s.v);
      this.samples.push(s);
      this.offCount = s.pedal != null && this.pedMax > 40 && s.pedal < this.pedMax * 0.5 ? this.offCount + 1 : 0;
      this.slowCount = s.v != null && s.v < this.vMax - 3 ? this.slowCount + 1 : 0;
      return s;
    }
    // fin automatique : pied relâché (ou, sans capteur de pédale, le véhicule ralentit)
    done() {
      const s = this.samples[this.samples.length - 1];
      if (!s || this.samples.length < 15 || this.peak < 2500) return this.samples.length > 3000;
      if (s.pedal != null && this.pedMax > 40) { if (this.offCount >= 2) return true; }
      else if (this.slowCount >= 2) return true;
      return this.samples.length > 3000;
    }
  }
  // courbe : maxi par tranche de 100 tr/min, pied à fond, hors passages de rapport (tous rapports confondus)
  function curve(samples) {
    const bins = new Map();
    for (const s of samples) {
      if (s.p == null || s.p <= 0 || s.w === false || s.shift) continue;
      const k = Math.round(s.rpm / 100) * 100;
      const b = bins.get(k);
      if (!b || s.p > b.p) bins.set(k, { rpm: k, p: s.p, t: s.t, boost: s.boost, map: s.map, maf: s.maf, egr: s.egr });
    }
    return [...bins.values()].sort((a, b) => a.rpm - b.rpm);
  }
  const api = { PerfTrack, curve };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.PerfCalc = api;
})(typeof window !== "undefined" ? window : globalThis);
