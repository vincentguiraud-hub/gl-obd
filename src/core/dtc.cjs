// Descriptions en français des codes défaut (SAE J2012 / ISO 15031-6)
// + codes fréquents sur le groupe VW (VW, Audi, Seat, Škoda, Cupra, MAN TGE).
"use strict";

const D = {
  // --- Mesure air / carburant ---
  P0010: "Actionneur arbre à cames admission (banc 1) – circuit", P0011: "Calage arbre à cames admission (banc 1) – trop avancé",
  P0012: "Calage arbre à cames admission (banc 1) – trop retardé", P0016: "Corrélation vilebrequin / arbre à cames (banc 1, capteur A)",
  P0017: "Corrélation vilebrequin / arbre à cames (banc 1, capteur B)", P0030: "Chauffage sonde lambda amont (B1S1) – circuit",
  P0036: "Chauffage sonde lambda aval (B1S2) – circuit", P0045: "Turbo – commande de suralimentation – circuit ouvert",
  P0046: "Turbo – commande de suralimentation – plage/fonctionnement", P0047: "Turbo – commande de suralimentation – signal bas",
  P0048: "Turbo – commande de suralimentation – signal haut", P0068: "Corrélation MAP/MAF – position papillon",
  P007A: "Capteur de température d'air après intercooler (banc 1) – circuit", P007B: "Capteur de température d'air après intercooler (banc 1) – plage/fonctionnement",
  P007C: "Capteur de température d'air après intercooler (banc 1) – signal bas", P007D: "Capteur de température d'air après intercooler (banc 1) – signal haut",
  P007E: "Capteur de température d'air après intercooler (banc 1) – intermittent",
  P0087: "Pression rampe carburant trop basse", P0088: "Pression rampe carburant trop haute", P0089: "Régulateur de pression carburant – fonctionnement",
  P0093: "Fuite importante détectée dans le circuit carburant", P0100: "Débitmètre d'air (MAF) – circuit",
  P0101: "Débitmètre d'air (MAF) – plage/fonctionnement", P0102: "Débitmètre d'air (MAF) – signal trop bas",
  P0103: "Débitmètre d'air (MAF) – signal trop haut", P0105: "Capteur pression collecteur (MAP) – circuit",
  P0106: "Capteur pression collecteur (MAP) – plage/fonctionnement", P0107: "Capteur pression collecteur (MAP) – signal bas",
  P0108: "Capteur pression collecteur (MAP) – signal haut", P0110: "Capteur température air admission – circuit",
  P0112: "Capteur température air admission – signal bas", P0113: "Capteur température air admission – signal haut",
  P0115: "Capteur température liquide de refroidissement – circuit", P0116: "Capteur température liquide de refroidissement – plage/fonctionnement",
  P0117: "Capteur température liquide de refroidissement – signal bas", P0118: "Capteur température liquide de refroidissement – signal haut",
  P0120: "Capteur position papillon/pédale A – circuit", P0121: "Capteur position papillon A – plage/fonctionnement",
  P0122: "Capteur position papillon A – signal bas", P0123: "Capteur position papillon A – signal haut",
  P0125: "Température de liquide insuffisante pour la régulation en boucle fermée", P0128: "Thermostat – température de liquide sous la température de régulation",
  P0130: "Sonde lambda amont (B1S1) – circuit", P0131: "Sonde lambda amont (B1S1) – tension basse", P0132: "Sonde lambda amont (B1S1) – tension haute",
  P0133: "Sonde lambda amont (B1S1) – réponse lente", P0134: "Sonde lambda amont (B1S1) – pas d'activité", P0135: "Chauffage sonde lambda amont (B1S1) – circuit",
  P0136: "Sonde lambda aval (B1S2) – circuit", P0137: "Sonde lambda aval (B1S2) – tension basse", P0138: "Sonde lambda aval (B1S2) – tension haute",
  P0140: "Sonde lambda aval (B1S2) – pas d'activité", P0141: "Chauffage sonde lambda aval (B1S2) – circuit",
  P0170: "Correction carburant (banc 1) – dysfonctionnement", P0171: "Mélange trop pauvre (banc 1)", P0172: "Mélange trop riche (banc 1)",
  P0174: "Mélange trop pauvre (banc 2)", P0175: "Mélange trop riche (banc 2)", P0180: "Capteur température carburant – circuit",
  P0190: "Capteur pression rampe carburant – circuit", P0191: "Capteur pression rampe carburant – plage/fonctionnement",
  P0192: "Capteur pression rampe carburant – signal bas", P0193: "Capteur pression rampe carburant – signal haut",
  P0200: "Injecteurs – circuit", P0201: "Injecteur cylindre 1 – circuit", P0202: "Injecteur cylindre 2 – circuit",
  P0203: "Injecteur cylindre 3 – circuit", P0204: "Injecteur cylindre 4 – circuit", P0205: "Injecteur cylindre 5 – circuit", P0206: "Injecteur cylindre 6 – circuit",
  P0220: "Capteur position papillon/pédale B – circuit", P0221: "Capteur position papillon B – plage/fonctionnement",
  P0234: "Suralimentation excessive (overboost)", P0235: "Capteur de pression de suralimentation A – circuit",
  P0236: "Capteur de pression de suralimentation A – plage/fonctionnement", P0237: "Capteur de pression de suralimentation A – signal bas",
  P0238: "Capteur de pression de suralimentation A – signal haut", P0243: "Électrovanne de régulation turbo (wastegate) A – circuit",
  P0245: "Électrovanne de régulation turbo A – signal bas", P0246: "Électrovanne de régulation turbo A – signal haut",
  P0251: "Pompe d'injection – doseur carburant – dysfonctionnement", P0263: "Cylindre 1 – contribution/équilibrage",
  P0266: "Cylindre 2 – contribution/équilibrage", P0269: "Cylindre 3 – contribution/équilibrage", P0272: "Cylindre 4 – contribution/équilibrage",
  P0299: "Pression de suralimentation insuffisante (turbo)",
  // --- Allumage / ratés ---
  P0300: "Ratés de combustion aléatoires / plusieurs cylindres", P0301: "Ratés de combustion cylindre 1", P0302: "Ratés de combustion cylindre 2",
  P0303: "Ratés de combustion cylindre 3", P0304: "Ratés de combustion cylindre 4", P0305: "Ratés de combustion cylindre 5", P0306: "Ratés de combustion cylindre 6",
  P0320: "Capteur régime moteur – circuit", P0321: "Capteur régime moteur – plage/fonctionnement", P0322: "Capteur régime moteur – pas de signal",
  P0325: "Capteur de cliquetis 1 – circuit", P0326: "Capteur de cliquetis 1 – plage/fonctionnement", P0327: "Capteur de cliquetis 1 – signal bas", P0328: "Capteur de cliquetis 1 – signal haut",
  P0335: "Capteur position vilebrequin A – circuit", P0336: "Capteur position vilebrequin A – plage/fonctionnement",
  P0340: "Capteur position arbre à cames A – circuit", P0341: "Capteur position arbre à cames A – plage/fonctionnement",
  P0351: "Bobine d'allumage A (cyl. 1) – circuit", P0352: "Bobine d'allumage B (cyl. 2) – circuit", P0353: "Bobine d'allumage C (cyl. 3) – circuit", P0354: "Bobine d'allumage D (cyl. 4) – circuit",
  P0380: "Bougies de préchauffage – circuit A", P0381: "Témoin de préchauffage – circuit",
  // --- Antipollution ---
  P0400: "Recirculation des gaz d'échappement (EGR) – débit", P0401: "EGR – débit insuffisant", P0402: "EGR – débit excessif",
  P0403: "EGR – circuit de commande", P0404: "EGR – plage/fonctionnement", P0405: "Capteur position EGR A – signal bas", P0406: "Capteur position EGR A – signal haut",
  P0420: "Efficacité du catalyseur sous le seuil (banc 1)", P0430: "Efficacité du catalyseur sous le seuil (banc 2)",
  P0440: "Système EVAP (vapeurs essence) – dysfonctionnement", P0441: "Système EVAP – débit de purge incorrect",
  P0442: "Système EVAP – petite fuite", P0455: "Système EVAP – grosse fuite", P0456: "Système EVAP – très petite fuite",
  P0470: "Capteur pression gaz d'échappement – circuit", P0471: "Capteur pression gaz d'échappement – plage/fonctionnement",
  P0480: "Ventilateur de refroidissement 1 – circuit",
  // --- Vitesse / ralenti ---
  P0500: "Capteur de vitesse véhicule – dysfonctionnement", P0501: "Capteur de vitesse véhicule – plage/fonctionnement",
  P0505: "Régulation du ralenti – dysfonctionnement", P0506: "Régime de ralenti trop bas", P0507: "Régime de ralenti trop haut",
  P0520: "Capteur/contacteur pression d'huile – circuit", P0521: "Capteur pression d'huile – plage/fonctionnement",
  P0530: "Capteur pression fluide climatisation – circuit", P0562: "Tension du réseau de bord trop basse", P0563: "Tension du réseau de bord trop haute",
  P0571: "Contacteur de feux stop A – circuit", P0560: "Tension du réseau de bord – dysfonctionnement",
  // --- Calculateur ---
  P0600: "Liaison série (bus) – dysfonctionnement", P0601: "Calculateur moteur – erreur mémoire interne", P0602: "Calculateur moteur – erreur de programmation",
  P0603: "Calculateur moteur – erreur mémoire permanente (KAM)", P0604: "Calculateur moteur – erreur mémoire RAM", P0605: "Calculateur moteur – erreur mémoire ROM",
  P0606: "Calculateur moteur – processeur défectueux", P0627: "Pompe à carburant – circuit de commande ouvert", P0641: "Tension de référence capteurs A – circuit",
  P0651: "Tension de référence capteurs B – circuit", P0670: "Module de commande des bougies de préchauffage – circuit",
  P0671: "Bougie de préchauffage cylindre 1 – circuit", P0672: "Bougie de préchauffage cylindre 2 – circuit",
  P0673: "Bougie de préchauffage cylindre 3 – circuit", P0674: "Bougie de préchauffage cylindre 4 – circuit",
  P0683: "Module préchauffage – communication avec le calculateur moteur",
  // --- Boîte ---
  P0700: "Boîte de vitesses – défaut mémorisé dans le calculateur de boîte", P0705: "Capteur de position du levier de vitesses – circuit",
  P0715: "Capteur de vitesse arbre d'entrée boîte – circuit", P0720: "Capteur de vitesse arbre de sortie boîte – circuit",
  P0730: "Rapport de boîte incorrect", P0741: "Embrayage de convertisseur – performance/blocage ouvert",
  P0806: "Capteur de position d'embrayage – plage/fonctionnement", P0830: "Contacteur pédale d'embrayage A – circuit",
  // --- Codes P2xxx fréquents ---
  P2002: "Filtre à particules (FAP) – efficacité sous le seuil (banc 1)", P2015: "Capteur position volets d'admission – plage/fonctionnement",
  P2004: "Volets de turbulence (swirl) bloqués ouverts", P2008: "Volets de turbulence (swirl) – circuit de commande",
  P2096: "Correction carburant aval – système trop pauvre", P2097: "Correction carburant aval – système trop riche",
  P2100: "Moteur de papillon – circuit ouvert", P2101: "Moteur de papillon – plage/fonctionnement",
  P2135: "Capteurs position papillon/pédale A/B – incohérence de tension", P2138: "Capteurs pédale d'accélérateur D/E – incohérence",
  P2177: "Mélange trop pauvre hors ralenti (banc 1)", P2178: "Mélange trop riche hors ralenti (banc 1)",
  P2187: "Mélange trop pauvre au ralenti (banc 1)", P2188: "Mélange trop riche au ralenti (banc 1)",
  P2263: "Système de suralimentation turbo – performance", P2279: "Fuite d'air à l'admission",
  P2293: "Régulateur de pression carburant 2 – performance", P2425: "Vanne de refroidissement EGR – circuit de commande ouvert",
  P2452: "Capteur de pression différentielle FAP – circuit", P2453: "Capteur de pression différentielle FAP – plage/fonctionnement",
  P2454: "Capteur de pression différentielle FAP – signal bas", P2455: "Capteur de pression différentielle FAP – signal haut",
  P2457: "Refroidisseur EGR – performance", P2459: "FAP – fréquence de régénération trop élevée",
  P2463: "Filtre à particules (FAP) – accumulation de suie trop importante", P244A: "FAP – pression différentielle trop basse",
  P244B: "FAP – pression différentielle trop haute", P242F: "FAP – accumulation de cendres (restriction)",
  P2BAD: "Émissions de NOx trop élevées – cause inconnue", P2BAE: "Émissions de NOx trop élevées – cause inconnue (dosage)",
  P20B9: "Chauffage réservoir AdBlue – circuit", P20E8: "Pression du réducteur AdBlue trop basse", P20E9: "Pression du réducteur AdBlue trop haute",
  P20EE: "Catalyseur SCR (AdBlue) – efficacité NOx sous le seuil", P203F: "Niveau AdBlue trop bas",
  P2047: "Injecteur AdBlue – circuit ouvert", P2080: "Capteur de température gaz d'échappement 1 – plage/fonctionnement",
  P2201: "Capteur NOx (banc 1) – plage/fonctionnement", P2200: "Capteur NOx (banc 1) – circuit",
  P229F: "Capteur NOx (banc 1, capteur 2) – plage/fonctionnement", P2563: "Capteur position turbo (géométrie variable) – plage/fonctionnement",
  P2564: "Capteur position turbo – signal bas", P2565: "Capteur position turbo – signal haut",
  P3000: "Batterie haute tension – système", P0A80: "Batterie de traction (hybride/électrique) – remplacer",
  // --- Communication ---
  U0001: "Bus CAN haute vitesse – communication", U0100: "Perte de communication avec le calculateur moteur",
  U0101: "Perte de communication avec le calculateur de boîte", U0121: "Perte de communication avec le calculateur ABS",
  U0140: "Perte de communication avec le calculateur habitacle (BCM)", U0151: "Perte de communication avec le calculateur airbag",
  U0155: "Perte de communication avec le combiné d'instruments", U0164: "Perte de communication avec la climatisation",
  U0131: "Perte de communication avec la direction assistée", U0146: "Perte de communication avec la passerelle (gateway)",
  U0184: "Perte de communication avec l'autoradio / multimédia", U1000: "Communication bus CAN – défaut constructeur",
  U0415: "Données invalides reçues du calculateur ABS", U0401: "Données invalides reçues du calculateur moteur",
  // --- Châssis / carrosserie (génériques) ---
  C0035: "Capteur vitesse roue avant gauche – circuit", C0040: "Capteur vitesse roue avant droite – circuit",
  C0045: "Capteur vitesse roue arrière gauche – circuit", C0050: "Capteur vitesse roue arrière droite – circuit",
  C0110: "Moteur de pompe ABS – circuit", C0121: "Électrovanne ABS – circuit", C0131: "Capteur de pression ABS/ESP – circuit",
  C0455: "Capteur d'angle de braquage – circuit", C0460: "Capteur d'angle de braquage – plage/fonctionnement",
  C0561: "Système ESP désactivé – défaut mémorisé", C1145: "Capteur vitesse roue avant droite – circuit",
  B1000: "Calculateur – défaut interne", B0001: "Airbag frontal conducteur – étage 1", B0002: "Airbag frontal conducteur – étage 2",
  B0010: "Airbag frontal passager – étage 1", B0020: "Airbag latéral gauche", B0028: "Airbag latéral droit",
  B0051: "Ceinture conducteur – prétensionneur", B0052: "Ceinture passager – prétensionneur", B0081: "Capteur d'occupation siège passager",
  B1001: "Calculateur – erreur de configuration (codage)",
};

const RANGES = [
  [/^P0[01]/, "Mesure air/carburant"], [/^P02/, "Mesure air/carburant"], [/^P03/, "Allumage / ratés de combustion"],
  [/^P04/, "Contrôle des émissions (antipollution)"], [/^P05/, "Vitesse véhicule, ralenti, entrées auxiliaires"],
  [/^P06/, "Calculateur et sorties"], [/^P0[78]/, "Boîte de vitesses / transmission"], [/^P0A/, "Hybride / électrique"],
  [/^P2/, "Moteur / antipollution (code générique étendu)"], [/^P1/, "Moteur – code spécifique constructeur"],
  [/^P3/, "Moteur – code constructeur / réservé"], [/^C/, "Châssis (freins, direction, suspension)"],
  [/^B/, "Carrosserie / habitacle (airbags, confort, éclairage)"], [/^U/, "Réseau / communication entre calculateurs"],
];

// Types de défaut (3e octet UDS, SAE J2012 « Failure Type Byte »)
const FTB = {
  0x00: "", 0x01: "défaut électrique général", 0x02: "défaut de signal général", 0x03: "défaut fréquence/MLI", 0x04: "défaut interne du système",
  0x05: "programmation du système", 0x06: "défaut d'algorithme", 0x07: "défaut mécanique", 0x08: "défaut de bus / signal",
  0x09: "défaut de composant", 0x11: "court-circuit à la masse", 0x12: "court-circuit au positif (+)",
  0x13: "circuit ouvert", 0x14: "court-circuit à la masse ou circuit ouvert", 0x15: "court-circuit au + ou circuit ouvert",
  0x16: "tension trop basse", 0x17: "tension trop haute", 0x18: "courant trop bas", 0x19: "courant trop haut",
  0x1a: "résistance trop basse", 0x1b: "résistance trop haute", 0x1c: "tension hors plage",
  0x1d: "courant hors plage", 0x1e: "résistance hors plage", 0x1f: "circuit intermittent",
  0x21: "signal trop faible", 0x22: "signal trop fort", 0x23: "signal figé bas", 0x24: "signal figé haut",
  0x25: "forme de signal incorrecte", 0x26: "variation trop lente", 0x27: "variation trop rapide", 0x28: "décalage / zéro incorrect",
  0x29: "signal invalide", 0x2a: "signal figé", 0x2f: "signal instable", 0x31: "pas de signal", 0x36: "fréquence trop basse",
  0x37: "fréquence trop haute", 0x38: "fréquence incorrecte", 0x41: "erreur de somme de contrôle", 0x42: "erreur mémoire",
  0x44: "erreur mémoire données", 0x45: "erreur mémoire programme", 0x46: "erreur de calibration / paramétrage", 0x47: "chien de garde / sécurité",
  0x49: "défaut électronique interne", 0x4b: "surchauffe", 0x51: "non programmé", 0x52: "non activé", 0x53: "désactivé",
  0x54: "étalonnage manquant", 0x55: "non configuré (codage)", 0x56: "configuration invalide", 0x62: "comparaison de signaux incorrecte",
  0x64: "signal non plausible", 0x68: "compteur d'événements", 0x71: "actionneur bloqué", 0x72: "actionneur bloqué ouvert",
  0x73: "actionneur bloqué fermé", 0x74: "actionneur patine", 0x75: "position d'urgence non atteinte", 0x76: "mauvais montage",
  0x77: "position commandée non atteinte", 0x78: "réglage / alignement requis", 0x79: "liaison mécanique défaillante",
  0x7a: "fuite de fluide ou joint", 0x7b: "niveau de fluide bas", 0x81: "message série invalide", 0x82: "compteur de message incorrect",
  0x83: "erreur de protection (checksum) message", 0x84: "signal en dessous de la plage", 0x85: "signal au-dessus de la plage",
  0x86: "signal invalide", 0x87: "message manquant", 0x88: "bus off", 0x8f: "erreur de communication",
  0x92: "performance ou réglage incorrect", 0x93: "pas de fonctionnement", 0x94: "fonctionnement inattendu", 0x95: "montage incorrect",
  0x96: "défaut interne du composant", 0x97: "fonctionnement bloqué par une autre fonction", 0x98: "surchauffe du composant",
};

function describeDtc(code) {
  const base = code.slice(0, 5);
  const text = D[base];
  const cat = (RANGES.find(([re]) => re.test(base)) || [null, "Code défaut"])[1];
  return { description: text || null, category: cat };
}

function ftbText(b) { return FTB[b] ?? null; }

module.exports = { describeDtc, ftbText };
