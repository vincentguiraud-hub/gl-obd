# G&L Diag – consignes pour Claude

Logiciel Windows (Electron) de diagnostic automobile de Vincent (G&L Créations), utilisé avec un adaptateur ELM327
(vLinker FS USB, Vgate iCar Pro BLE). Toute l'interface et tous les messages sont **en français**, simples, pour un artisan non informaticien.

## Architecture
- `main.cjs` : processus principal Electron (API exposée à la fenêtre, fichiers, PDF, mises à jour automatiques).
- `preload.cjs` : liste blanche des fonctions accessibles depuis la fenêtre (`window.diag`). Toute nouvelle fonction de `main.cjs` doit y être ajoutée.
- `src/core/` : logique sans interface (testable sous Node)
  - `elm.cjs` pilote ELM327 (commandes AT, ISO-TP, envoi multi-trames manuel, écoute du bus)
  - `obd.cjs` OBD-II générique (modes 01–0A, mode 06, mode 09), `dtc.cjs` libellés des codes défaut
  - `vag.cjs` calculateurs groupe VW (UDS 11 bits), `uds.cjs` atelier calculateur (identification, codage, DID, routines)
  - `hd.cjs` + `spn.cjs` poids lourds J1939 / MAN, `tesla.cjs` + `dbc.cjs` Tesla (DBC dans `data/`)
  - `diag.cjs` façade utilisée par `main.cjs` ; `transports.cjs` USB/COM, WiFi, BLE
  - `sim*.cjs`, `fakeecu.cjs` : simulateurs du mode démo (VW Crafter, MAN TGX, Tesla Model Y)
- `renderer/` : interface (HTML/CSS/JS sans framework) : `app.js`, `atelier.js`, `tesla.js`, `report.js` (rapport PDF)
- `test/*.test.cjs` : tests sur les simulateurs, lancés par `npm test`.

## Règles
1. Après toute modification, `npm test` doit passer. Si tu ajoutes une fonction dans `src/core`, ajoute un test et adapte le simulateur.
2. Ne casse jamais le mode démo : c'est le seul moyen de tester sans véhicule.
3. Les fonctions qui écrivent dans un calculateur gardent toujours : confirmation, sauvegarde automatique avant écriture, restauration possible.
4. Ne jamais inventer d'emplacements de codage (octet/bit) ou d'identifiants constructeur non vérifiés : laisse l'utilisateur les saisir.
5. Ne pas modifier la version dans `package.json` ni `.github/workflows/` : le robot de publication s'en charge.
6. Réponses à l'utilisateur : en français, courtes, sans jargon, en disant ce qui a changé et comment le vérifier dans le logiciel.
