# G&L Diag

Logiciel Windows de diagnostic OBD pour adaptateur ELM327 (Bluetooth, WiFi, BLE).

- Défauts moteur OBD toutes marques (lecture / effacement), arrêt sur image, préparation contrôle technique
- Calculateurs VW, Audi, Seat, Škoda, Cupra, MAN TGE de 2013 à 2026 (UDS) : identification, défauts, effacement
- Autres marques : recherche étendue de tous les calculateurs (UDS 11 bits)
- Poids lourds MAN (TGL, TGM, TGS, TGX, Lion's) et autres camions J1939 : défauts actifs/passés (SPN/FMI), effacement, données en direct, calculateurs UDS 29 bits
- Atelier calculateur : fiche complète, défauts détaillés (état, conditions d'apparition), codage long bit par bit avec sauvegarde automatique, exploration de toutes les valeurs (DID), mesures en direct, adaptations, routines, accès sécurisé, requêtes libres
- Tests antipollution détaillés (mode 06), IUPR, CALID/CVN (mode 09)
- Tesla Model 3 / Model Y : batterie (santé, cellules, températures, énergie), moteurs, véhicule – lecture du bus avec le DBC communautaire model3dbc (MIT, © Josh Wardell, voir data/)
- Options cachées : recettes de codage/adaptation avec lecture d'état, sauvegarde et restauration
- Espion du bus CAN
- Données en direct avec courbes et export CSV
- Rapport PDF et historique des diagnostics
- Mode démo intégré

Installation : télécharger `GL-Diag-Setup.exe` dans les Releases. Les mises à jour s'installent automatiquement.

## Données tierces
- `data/obdb/` : base communautaire **OBDb** (https://github.com/OBDb), licence **Creative Commons BY-SA 4.0** (voir `data/obdb/LICENSE-CC-BY-SA-4.0.txt`). Convertie par `tools/build-obdb.py`, sans modification des valeurs.
- `data/tesla-model3y.dbc` : model3dbc © Josh Wardell, licence MIT.
