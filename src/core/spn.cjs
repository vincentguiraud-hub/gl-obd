// Descriptions en français des SPN J1939 les plus courants (poids lourds, MAN et autres)
"use strict";
const SPN = {
  27: "Position vanne EGR", 51: "Position papillon", 84: "Vitesse du véhicule (roue)", 91: "Position pédale d'accélérateur",
  94: "Pression d'alimentation carburant (basse pression)", 96: "Niveau de carburant", 97: "Présence d'eau dans le gazole",
  98: "Niveau d'huile moteur", 100: "Pression d'huile moteur", 102: "Pression de suralimentation (collecteur)",
  105: "Température air collecteur d'admission", 107: "Colmatage filtre à air", 108: "Pression atmosphérique",
  110: "Température liquide de refroidissement", 111: "Niveau de liquide de refroidissement", 117: "Pression air freins circuit 1",
  118: "Pression air freins circuit 2", 157: "Pression rampe d'injection", 158: "Tension après contact (borne 15)",
  164: "Pression de commande injection", 168: "Tension batterie", 171: "Température extérieure", 172: "Température air entrée moteur",
  173: "Température gaz d'échappement", 174: "Température carburant", 175: "Température huile moteur", 177: "Température huile de boîte",
  190: "Régime moteur", 191: "Vitesse arbre de sortie boîte", 412: "Température EGR", 520: "Couple ralentisseur",
  523: "Rapport engagé", 527: "Régulateur de vitesse", 597: "Contacteur de frein", 598: "Contacteur d'embrayage",
  629: "Calculateur – défaut interne", 630: "Calculateur – mémoire d'étalonnage", 639: "Bus de données J1939 (réseau principal)",
  651: "Injecteur cylindre 1", 652: "Injecteur cylindre 2", 653: "Injecteur cylindre 3", 654: "Injecteur cylindre 4",
  655: "Injecteur cylindre 5", 656: "Injecteur cylindre 6", 677: "Relais de démarreur", 697: "Commande ralentisseur / frein moteur",
  723: "Capteur régime moteur n°2 (arbre à cames)", 904: "Vitesse roue avant (essieu avant)", 917: "Kilométrage (haute résolution)",
  929: "Vitesse de roue (ABS)", 1081: "Témoin attente préchauffage", 1127: "Pression de suralimentation turbo 1",
  1136: "Température calculateur moteur", 1231: "Bus de données J1939 n°2", 1235: "Bus de données J1939 n°3",
  1347: "Pompe haute pression / doseur carburant", 1569: "Réduction de puissance moteur active", 1636: "Température air d'admission",
  1761: "Niveau AdBlue (réservoir)", 2659: "Débit EGR", 2791: "Commande vanne EGR", 2795: "Position actionneur turbo à géométrie variable",
  3031: "Température AdBlue (réservoir)", 3216: "Capteur NOx entrée catalyseur", 3226: "Capteur NOx sortie catalyseur",
  3242: "Température entrée FAP", 3246: "Température sortie FAP", 3251: "Pression différentielle FAP",
  3361: "Module de dosage AdBlue", 3364: "Qualité AdBlue", 3464: "Commande papillon d'échappement",
  3480: "Pression carburant injecteur de régénération (HC)", 3509: "Tension d'alimentation capteurs 1", 3510: "Tension d'alimentation capteurs 2",
  3511: "Tension d'alimentation capteurs 3", 3597: "Tension d'alimentation calculateur", 3711: "Régénération FAP",
  3719: "Charge en suie du FAP", 3720: "Charge en cendres du FAP", 3936: "FAP – système", 4076: "Température tuyau AdBlue (retour)",
  4094: "Qualité / dosage AdBlue insuffisant", 4334: "Pression AdBlue (pompe de dosage)", 4360: "Température entrée catalyseur SCR",
  4363: "Température sortie catalyseur SCR", 4364: "Efficacité de conversion du catalyseur SCR", 4374: "Pompe AdBlue",
  4376: "Vanne de retour AdBlue", 5246: "Restriction conducteur SCR (bridage AdBlue)", 5394: "Vanne de dosage AdBlue",
  5491: "Relais de chauffage AdBlue", 5743: "Capteur de température calculateur SCR", 6713: "Débit massique d'air",
};
const FMI = [
  "Valeur trop haute (donnée valide)", "Valeur trop basse (donnée valide)", "Donnée incohérente ou erronée",
  "Tension trop haute / court-circuit au +", "Tension trop basse / court-circuit à la masse", "Courant trop faible / circuit ouvert",
  "Courant trop fort / court-circuit à la masse", "Système mécanique ne répond pas / mal réglé", "Fréquence ou durée de signal anormale",
  "Mise à jour anormale (message absent)", "Variation anormalement rapide", "Cause inconnue", "Composant ou calculateur défectueux",
  "Hors calibration", "Instruction spéciale", "Valeur légèrement trop haute", "Valeur modérément trop haute", "Valeur légèrement trop basse",
  "Valeur modérément trop basse", "Erreur de données reçues du réseau", "Donnée dérive vers le haut", "Donnée dérive vers le bas",
  "", "", "", "", "", "", "", "", "", "Condition présente",
];
const spnText = (spn) => SPN[spn] || null;
const fmiText = (fmi) => FMI[fmi] || `FMI ${fmi}`;
module.exports = { spnText, fmiText };
