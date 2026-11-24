import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Fuel, Gauge, Warehouse, Wallet, LayoutDashboard, CalendarRange,
  Building2, Settings2, LogOut, Plus, Trash2, Pencil, AlertTriangle,
  CheckCircle2, X, Loader2, ChevronRight, MapPin, Droplet, Lock, Download, History,
  ClipboardCheck, Printer, ChevronDown, Truck, Camera, BookOpen, Landmark, Users, Upload
} from "lucide-react";
import { storage, isStorageDegraded, hasLocalStorage, getSession, setSession, login } from "./storage.js";
import QRCode from "qrcode";

/* =========================================================================
   Gestion StationPro — gestion quotidienne de réseaux de stations-service (multi-sociétés)
   Design : tableau de bord "poste de contrôle" — fond pétrole sombre,
   lectures façon compteur de pompe (chiffres ambrés tabulaires),
   essence = ambre, gasoil = sarcelle. Extensible par construction :
   stations et pompes sont des enregistrements, jamais des champs figés.
   ========================================================================= */

// Toutes les couleurs pointent vers des variables CSS (définies dans StyleInjector),
// pas des codes figés — ça permet de changer le thème (clair/sombre) et la couleur
// d'accent depuis les Paramètres d'affichage, sans toucher au reste du code : chaque
// endroit qui utilise C.xxx suit automatiquement le nouveau réglage.
const C = {
  bg: "var(--smi-bg)",
  bgAlt: "var(--smi-bg-alt)",
  panel: "var(--smi-panel)",
  panelAlt: "var(--smi-panel-alt)",
  border: "var(--smi-border)",
  borderLight: "var(--smi-border-light)",
  amber: "var(--smi-accent)",
  amberDim: "var(--smi-accent-dim)",
  amberSoft: "var(--smi-accent-soft)",
  teal: "var(--smi-teal)",
  tealSoft: "var(--smi-teal-soft)",
  text: "var(--smi-text)",
  textMuted: "var(--smi-text-muted)",
  textFaint: "var(--smi-text-faint)",
  danger: "var(--smi-danger)",
  dangerSoft: "var(--smi-danger-soft)",
  success: "var(--smi-success)",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&family=Poppins:wght@400;500;600;700&display=swap');
:root {
  --smi-bg: #0E1512; --smi-bg-alt: #0A0F0D; --smi-panel: #161F1A; --smi-panel-alt: #1D2921;
  --smi-border: #2A3A30; --smi-border-light: #3A4C40;
  --smi-accent: #E8A33D; --smi-accent-dim: #8A6224; --smi-accent-soft: #3A2E18;
  --smi-teal: #3FA7A0; --smi-teal-soft: #16302E;
  --smi-text: #F1EEE6; --smi-text-muted: #93A398; --smi-text-faint: #5E6E64;
  --smi-danger: #D9695F; --smi-danger-soft: #3A2220; --smi-success: #5FAE6E;
  --smi-font-body: 'Inter', system-ui, sans-serif;
}
.smi-root { font-family: var(--smi-font-body); background:${C.bg}; color:${C.text}; }
.smi-display { font-family: 'Bebas Neue', 'Inter', sans-serif; letter-spacing: 0.04em; }
.smi-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.smi-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
.smi-scroll::-webkit-scrollbar-thumb { background: ${C.borderLight}; border-radius: 4px; }
.smi-input:focus, .smi-select:focus, .smi-btn:focus-visible { outline: 2px solid ${C.amber}; outline-offset: 2px; }
@keyframes smiPulse { 0%,100% { opacity: 1; } 50% { opacity: .55; } }
.smi-live { animation: smiPulse 2.2s ease-in-out infinite; }
.smi-print-only { display: none; }
@media print {
  /* Technique display:none (plutôt que visibility:hidden) — plus fiable sur mobile,
     certains navigateurs ayant des bugs d'affichage (valeurs à zéro, contenu perdu) avec
     visibility:hidden combiné à des tableaux complexes lors de l'impression. */
  .smi-no-print { display: none !important; }
  .smi-print-only { display: block !important; }
  .smi-print-area, .smi-print-area * { background: #fff !important; color: #111 !important; border-color: #ccc !important; box-shadow: none !important; }
  /* Les vignettes de preuve (reçu, bon) doivent rester lisibles une fois imprimées —
     une miniature de 40px à l'écran ne sert à rien sur papier. */
  .smi-print-photo { width: 220px !important; height: 220px !important; object-fit: contain !important; display: block !important; margin: 6px 0 !important; }
  .smi-print-photo-row { flex-direction: column !important; align-items: flex-start !important; }
}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: FONTS }} />;
}

/* --------------------------- Paramètres d'affichage ----------------------------
   Réglages personnels (thème, taille du texte, couleur d'accent, police) — gardés
   sur l'appareil de chaque utilisateur (localStorage), pas dans la base commune :
   chacun règle l'affichage à son goût, sans influencer les autres. */
const THEME_PRESETS = {
  sombre: { bg: "#0E1512", bgAlt: "#0A0F0D", panel: "#161F1A", panelAlt: "#1D2921", border: "#2A3A30", borderLight: "#3A4C40", text: "#F1EEE6", textMuted: "#93A398", textFaint: "#5E6E64" },
  clair: { bg: "#F7F5F1", bgAlt: "#FFFFFF", panel: "#FFFFFF", panelAlt: "#F0EDE6", border: "#DAD3C7", borderLight: "#C4BBA9", text: "#1E2420", textMuted: "#5B6B60", textFaint: "#8A968E" },
};
const ACCENT_PRESETS = { ambre: "#E8A33D", bleu: "#4C8FE8", vert: "#5FAE6E", corail: "#E86A5C", violet: "#A279E0" };
// Palette dédiée aux stations — chaque station peut choisir sa couleur pour être repérée
// d'un coup d'œil (cartes du Tableau de bord, Commandes, Stations...), indépendamment du
// thème personnel de chaque utilisateur.
const STATION_COLOR_PRESETS = ["#E8A33D", "#4C8FE8", "#5FAE6E", "#E86A5C", "#A279E0", "#3FA7A0", "#E8578C", "#C9A227"];
const FONT_PRESETS = {
  inter: "'Inter', system-ui, sans-serif",
  systeme: "system-ui, -apple-system, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  poppins: "'Poppins', 'Inter', sans-serif",
};
const SIZE_PRESETS = { petit: "14px", normal: "16px", grand: "18px" };
const DISPLAY_SETTINGS_KEY = "smi_sarl_display_settings_v1";
const DEFAULT_DISPLAY_SETTINGS = { theme: "sombre", accent: "ambre", taille: "normal", police: "inter" };

function loadDisplaySettings() {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(raw) };
  } catch { /* stockage indisponible : on reste sur les valeurs par défaut */ }
  return { ...DEFAULT_DISPLAY_SETTINGS };
}

function applyDisplaySettings(s) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = THEME_PRESETS[s.theme] || THEME_PRESETS.sombre;
  root.style.setProperty("--smi-bg", theme.bg);
  root.style.setProperty("--smi-bg-alt", theme.bgAlt);
  root.style.setProperty("--smi-panel", theme.panel);
  root.style.setProperty("--smi-panel-alt", theme.panelAlt);
  root.style.setProperty("--smi-border", theme.border);
  root.style.setProperty("--smi-border-light", theme.borderLight);
  root.style.setProperty("--smi-text", theme.text);
  root.style.setProperty("--smi-text-muted", theme.textMuted);
  root.style.setProperty("--smi-text-faint", theme.textFaint);
  root.style.setProperty("--smi-accent", ACCENT_PRESETS[s.accent] || ACCENT_PRESETS.ambre);
  root.style.setProperty("--smi-font-body", FONT_PRESETS[s.police] || FONT_PRESETS.inter);
  root.style.fontSize = SIZE_PRESETS[s.taille] || SIZE_PRESETS.normal;
}

function saveDisplaySettings(s) {
  try { localStorage.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(s)); } catch { /* stockage indisponible, tant pis pour la persistance */ }
}

function DisplaySettingsPanel({ onClose }) {
  const [settings, setSettings] = useState(loadDisplaySettings());

  const update = (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    applyDisplaySettings(next);
    saveDisplaySettings(next);
  };

  const reset = () => {
    setSettings(DEFAULT_DISPLAY_SETTINGS);
    applyDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
    saveDisplaySettings(DEFAULT_DISPLAY_SETTINGS);
  };

  return (
    <div onClick={onClose} className="smi-no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded-lg p-5 w-full max-w-md" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-4">
          <p className="smi-display text-xl">Paramètres d'affichage</p>
          <button onClick={onClose} className="smi-btn" style={{ color: C.textMuted }}><X size={20} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: C.textFaint }}>Ces réglages sont personnels — gardés sur cet appareil uniquement, sans effet pour les autres utilisateurs.</p>

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.textMuted }}>Thème</p>
            <div className="grid grid-cols-2 gap-2">
              {[{ k: "sombre", label: "Sombre" }, { k: "clair", label: "Clair" }].map((t) => (
                <button key={t.k} onClick={() => update({ theme: t.k })} className="smi-btn rounded-md py-2 text-sm" style={{ background: settings.theme === t.k ? C.amberSoft : C.bgAlt, border: `1px solid ${settings.theme === t.k ? C.amber : C.border}`, color: settings.theme === t.k ? C.amber : C.text }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.textMuted }}>Taille du texte</p>
            <div className="grid grid-cols-3 gap-2">
              {[{ k: "petit", label: "Petit" }, { k: "normal", label: "Normal" }, { k: "grand", label: "Grand" }].map((t) => (
                <button key={t.k} onClick={() => update({ taille: t.k })} className="smi-btn rounded-md py-2 text-sm" style={{ background: settings.taille === t.k ? C.amberSoft : C.bgAlt, border: `1px solid ${settings.taille === t.k ? C.amber : C.border}`, color: settings.taille === t.k ? C.amber : C.text }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.textMuted }}>Couleur d'accent</p>
            <div className="flex gap-2 flex-wrap">
              {Object.entries(ACCENT_PRESETS).map(([k, hex]) => (
                <button key={k} onClick={() => update({ accent: k })} aria-label={k} className="smi-btn rounded-full" style={{ width: 34, height: 34, background: hex, border: settings.accent === k ? `3px solid ${C.text}` : `1px solid ${C.border}` }} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.textMuted }}>Police</p>
            <SelectInput value={settings.police} onChange={(e) => update({ police: e.target.value })}>
              <option value="inter">Inter (par défaut)</option>
              <option value="systeme">Système (native de l'appareil)</option>
              <option value="georgia">Georgia (classique)</option>
              <option value="poppins">Poppins (moderne)</option>
            </SelectInput>
          </div>
        </div>

        <div className="flex justify-between items-center mt-5">
          <button onClick={reset} className="smi-btn text-xs" style={{ color: C.textFaint }}>Réinitialiser</button>
          <Button onClick={onClose}><CheckCircle2 size={16} /> Terminé</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- Logo (mark) -------------------------------
   Pompe à carburant blanche sur fond bleu — identité Gestion StationPro. */
function Logo({ size = 28 }) {
  // Même icône que le favicon et l'icône installable.
  return <img src="/icon-192.png" width={size} height={size} alt="" aria-hidden="true" style={{ borderRadius: size * 0.22, display: "block" }} />;
}

/* ---------------------------- Helpers -------------------------------- */

// Nom commercial de l'application, et nom de la société connectée (affiché dans l'en-tête
// et sur les rapports imprimés).
const APP_NAME = "Gestion StationPro";
let NOM_SOCIETE = "";
function setNomSociete(n) { NOM_SOCIETE = n || ""; }
function nomSociete() { return NOM_SOCIETE || APP_NAME; }

const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2));

// Redimensionne et compresse une photo prise sur le téléphone avant de la stocker (toute la
// base de l'application est un seul document JSON — des photos non compressées la
// feraient grossir très vite). Le résultat reste largement lisible pour vérifier un bon
// de livraison, tout en restant léger.
function resizeImage(file, maxWidth = 700, quality = 0.6) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const versementTotal = (v) => num(v.banqueMontant) + num(v.paiementMarchandMontant) + num(v.autreMontant);
const bonTotal = (b) => num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute);
// fmtMontant accepte une devise explicite (celle de la station concernée) ; fmtGNF reste
// disponible comme raccourci pour les rares affichages sans contexte de station.
const fmtMontant = (v, devise = "GNF") => `${Math.round(num(v)).toLocaleString("fr-FR")} ${devise}`;
const fmtGNF = (v) => fmtMontant(v, "GNF");
const fmtVol = (v) => `${num(v).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`;
const isFutureDate = (iso) => !!iso && iso > todayISO();

// Hash simple (SHA-256) pour ne jamais garder un code PIN en clair dans le stockage.
// Note d'honnêteté : ceci reste une protection légère côté client (pas d'authentification
// serveur, pas de session) — elle dissuade l'accès accidentel entre postes, ce n'est pas
// une sécurité de niveau bancaire.
// Hash simple, synchrone et sans dépendance au Web Crypto API (indisponible ou restreint
// dans certains environnements d'exécution sandboxés) pour ne jamais garder un code PIN
// en clair dans le stockage. Note d'honnêteté : ceci reste une protection légère côté
// client (pas d'authentification serveur, pas de session) — elle dissuade l'accès
// accidentel entre postes, ce n'est pas une sécurité de niveau bancaire.
function hashPin(pin) {
  const s = String(pin);
  let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + 1), 2166136261) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function makeAuditEntry({ user, role, stationId, entity, action, before, after }) {
  return { id: uid(), ts: new Date().toISOString(), user: user || "—", role, stationId: stationId || null, entity, action, before: before || null, after: after || null };
}

// Ajoute une entrée au journal (le plus récent en tête) sans retenir la base entière avant/
// après (avant/après restent la ligne concernée uniquement, pas tout le blob).
function withAudit(db, entryProps) {
  const entry = makeAuditEntry(entryProps);
  return { ...db, audit: [entry, ...(db.audit || [])].slice(0, AUDIT_MAX) };
}
const fmtDateLong = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
};
const monthLabel = (m) => ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"][m];

function sumReleve(releves, stationId, date) {
  const rows = releves.filter((r) => r.stationId === stationId && r.date === date);
  let essence = 0, gasoil = 0;
  rows.forEach((r) => {
    essence += Math.max(0, num(r.indexClotureEssence) - num(r.indexOuvertureEssence));
    gasoil += Math.max(0, num(r.indexClotureGasoil) - num(r.indexOuvertureGasoil));
  });
  return { essence, gasoil, total: essence + gasoil, count: rows.length };
}

function findVente(ventes, stationId, date) {
  return ventes.find((v) => v.stationId === stationId && v.date === date);
}
function findStock(stocks, stationId, date) {
  return stocks.find((s) => s.stationId === stationId && s.date === date);
}
function findCaisse(caisses, stationId, date) {
  return caisses.find((c) => c.stationId === stationId && c.date === date);
}
function latestBefore(list, stationId, date) {
  return list
    .filter((x) => x.stationId === stationId && x.date < date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

function computeVente(releves, ventes, stationId, date) {
  const vol = sumReleve(releves, stationId, date);
  const v = findVente(ventes, stationId, date);
  const prixEssence = v ? num(v.prixEssence) : 0;
  const prixGasoil = v ? num(v.prixGasoil) : 0;
  const montantEssence = vol.essence * prixEssence;
  const montantGasoil = vol.gasoil * prixGasoil;
  return { ...vol, prixEssence, prixGasoil, montantEssence, montantGasoil, ca: montantEssence + montantGasoil, record: v };
}

// Volumes vendus par une pompe précise (pas toute la station) sur une journée — sert de
// base à la caisse individuelle du pompiste qui gère cette pompe.
function sumRelevePompe(releves, stationId, pompeId, date) {
  const r = releves.find((x) => x.stationId === stationId && x.pompeId === pompeId && x.date === date);
  const essence = r ? Math.max(0, num(r.indexClotureEssence) - num(r.indexOuvertureEssence)) : 0;
  const gasoil = r ? Math.max(0, num(r.indexClotureGasoil) - num(r.indexOuvertureGasoil)) : 0;
  return { essence, gasoil, total: essence + gasoil };
}

// Caisse individuelle d'un pompiste pour une pompe et une date données. Le prix appliqué
// est celui fixé pour la station ce jour-là (module Ventes) — les pompes d'une même
// station vendent au même prix.
function computeMouvementPompiste(releves, ventes, mouvements, stationId, pompeId, date) {
  const vol = sumRelevePompe(releves, stationId, pompeId, date);
  const v = findVente(ventes, stationId, date);
  const prixEssence = v ? num(v.prixEssence) : 0;
  const prixGasoil = v ? num(v.prixGasoil) : 0;
  const valeurVente = vol.essence * prixEssence + vol.gasoil * prixGasoil;
  const m = mouvements.find((x) => x.stationId === stationId && x.pompeId === pompeId && x.date === date) || {};
  // Rétro-compatibilité : les anciennes saisies avaient un montant unique par type
  // (decaissementEspece/decaissementMobile/bon) au lieu de lignes détaillées.
  const decaissements = m.decaissements || [
    ...(num(m.decaissementEspece) ? [{ id: "legacy-e", type: "espece", montant: m.decaissementEspece }] : []),
    ...(num(m.decaissementMobile) ? [{ id: "legacy-m", type: "mobile", montant: m.decaissementMobile }] : []),
  ];
  const bons = m.bons || (num(m.bon) ? [{ id: "legacy-b", montant: m.bon, libelle: "Bon (ancienne saisie)" }] : []);
  const decaissementEspece = decaissements.filter((d) => d.type === "espece").reduce((a, d) => a + num(d.montant), 0);
  const decaissementMobile = decaissements.filter((d) => d.type === "mobile").reduce((a, d) => a + num(d.montant), 0);
  const totalBon = bons.reduce((a, b) => a + num(b.montant), 0);
  const saCaisse = valeurVente - decaissementEspece - decaissementMobile - totalBon;
  return { record: m.id ? m : null, vol, prixEssence, prixGasoil, valeurVente, decaissements, bons, decaissementEspece, decaissementMobile, totalBon, saCaisse };
}

function computeStock(releves, stocks, stationId, date) {
  const s = findStock(stocks, stationId, date) || {};
  const vol = sumReleve(releves, stationId, date);
  const stockOuvertureEssence = num(s.stockOuvertureEssence);
  const stockOuvertureGasoil = num(s.stockOuvertureGasoil);
  const livraisonEssence = num(s.livraisonEssence);
  const livraisonGasoil = num(s.livraisonGasoil);
  const stockClotureEssence = stockOuvertureEssence + livraisonEssence - vol.essence;
  const stockClotureGasoil = stockOuvertureGasoil + livraisonGasoil - vol.gasoil;
  const stockPhysiqueEssence = s.stockPhysiqueEssence === undefined || s.stockPhysiqueEssence === "" ? null : num(s.stockPhysiqueEssence);
  const stockPhysiqueGasoil = s.stockPhysiqueGasoil === undefined || s.stockPhysiqueGasoil === "" ? null : num(s.stockPhysiqueGasoil);
  const ecartEssence = stockPhysiqueEssence === null ? null : stockPhysiqueEssence - stockClotureEssence;
  const ecartGasoil = stockPhysiqueGasoil === null ? null : stockPhysiqueGasoil - stockClotureGasoil;
  return { record: s.id ? s : null, vol, stockOuvertureEssence, stockOuvertureGasoil, livraisonEssence, livraisonGasoil, stockClotureEssence, stockClotureGasoil, stockPhysiqueEssence, stockPhysiqueGasoil, ecartEssence, ecartGasoil };
}

// Les rapports affichent le stock physique constaté (jaugeage) quand il existe — plus
// fidèle à la réalité que le stock théorique calculé — et ne retombent sur le calculé
// qu'à défaut de comptage physique pour ce jour-là.
function stockAffichable(s, produit) {
  const phys = produit === "essence" ? s.stockPhysiqueEssence : s.stockPhysiqueGasoil;
  const close = produit === "essence" ? s.stockClotureEssence : s.stockClotureGasoil;
  return phys !== null && phys !== undefined ? phys : close;
}

/* --------------------------- Cuves : niveau et alertes --------------------------- */

const PRODUITS = [{ k: "essence", label: "Essence", tone: "amber" }, { k: "gasoil", label: "Gasoil", tone: "teal" }];

// État des cuves d'une station : niveau estimé, remplissage, place libre, jours restants
// et statut (bon / alerte / critique). Le niveau vient du dernier contrôle de stock
// (stock physique jaugé s'il existe, sinon stock théorique). Quand plusieurs cuves
// contiennent le même produit, le stock du produit est réparti au prorata des capacités.
function etatCuvesStation(db, stationId) {
  const cuves = (db.cuves || []).filter((c) => c.stationId === stationId);
  const lastDate = db.stocks.filter((x) => x.stationId === stationId).map((x) => x.date).sort().pop() || null;
  const stock = lastDate ? computeStock(db.releves, db.stocks, stationId, lastDate) : null;
  // Rythme de vente : moyenne des 7 jours qui précèdent le dernier contrôle.
  const rythme = { essence: 0, gasoil: 0 };
  if (lastDate) {
    const base = new Date(`${lastDate}T00:00:00`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base); d.setDate(d.getDate() - i);
      const v = sumReleve(db.releves, stationId, d.toISOString().slice(0, 10));
      rythme.essence += v.essence / 7; rythme.gasoil += v.gasoil / 7;
    }
  }
  const capTotale = { essence: 0, gasoil: 0 };
  cuves.forEach((c) => { capTotale[c.produit] = (capTotale[c.produit] || 0) + num(c.capacite); });
  const liste = cuves.map((c) => {
    const cap = num(c.capacite);
    const niveauProduit = stock ? stockAffichable(stock, c.produit) : null;
    const part = capTotale[c.produit] > 0 ? cap / capTotale[c.produit] : 0;
    const niveau = niveauProduit === null ? null : Math.max(0, niveauProduit * part);
    const pct = niveau !== null && cap > 0 ? Math.min(100, Math.round((niveau / cap) * 100)) : null;
    const alerte = num(c.seuilAlerte) || Math.round(cap * 0.25);
    const critique = num(c.seuilCritique) || Math.round(cap * 0.1);
    const statut = niveau === null ? "inconnu" : niveau <= critique ? "critique" : niveau <= alerte ? "alerte" : "bon";
    const r = rythme[c.produit] * part;
    const joursRestants = niveau !== null && r > 0 ? niveau / r : null;
    const ecart = stock ? (c.produit === "essence" ? stock.ecartEssence : stock.ecartGasoil) : null;
    return { cuve: c, cap, niveau, pct, alerte, critique, statut, placeLibre: niveau !== null ? Math.max(0, cap - niveau) : null, rythme: r, joursRestants, ecart: ecart === null ? null : ecart * part };
  });
  return { liste, lastDate };
}

// Place libre totale pour un produit dans une station (utile avant une livraison).
function placeLibreProduit(db, stationId, produit) {
  const { liste } = etatCuvesStation(db, stationId);
  const l = liste.filter((x) => x.cuve.produit === produit);
  if (!l.length || l.some((x) => x.placeLibre === null)) return null;
  return l.reduce((a, x) => a + x.placeLibre, 0);
}

const STATUT_CUVE = {
  bon: { label: "Bon", tone: "success" },
  alerte: { label: "Alerte", tone: "amber" },
  critique: { label: "Critique", tone: "danger" },
  inconnu: { label: "Pas de contrôle", tone: "muted" },
};

function sumBons(bons) {
  return (bons || []).reduce((a, b) => a + num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute), 0);
}
function sumVersements(versements) {
  return (versements || []).reduce((a, v) => a + num(v.banqueMontant) + num(v.paiementMarchandMontant) + num(v.autreMontant), 0);
}

function computeCaisse(releves, ventes, caisses, bonsColl, versementsColl, stationId, date, depensesColl = [], reglementsColl = []) {
  const c = findCaisse(caisses, stationId, date) || {};
  const ca = computeVente(releves, ventes, stationId, date).ca;
  const caissePrecedente = num(c.caissePrecedente);

  // Source unique : les Bons et Versements du jour viennent désormais des onglets dédiés
  // Bons / Versement, pas d'une saisie séparée dans Caisse — évite toute confusion ou
  // double-saisie sur le terrain. Repli sur l'ancienne saisie embarquée dans Caisse
  // uniquement pour les dates saisies avant la création de ces onglets.
  const bonsDuJour = (bonsColl || []).filter((b) => b.stationId === stationId && b.date === date);
  const versementsDuJour = (versementsColl || []).filter((v) => v.stationId === stationId && v.date === date);

  const bons = bonsDuJour.length > 0 ? bonsDuJour : (c.bons || []);
  const versements = versementsDuJour.length > 0 ? versementsDuJour : (c.versements || []);
  const totalBon = bonsDuJour.length > 0 ? bonsDuJour.reduce((a, b) => a + bonTotal(b), 0) : (c.bons ? sumBons(bons) : num(c.totalBon));
  const totalVersement = versementsDuJour.length > 0 ? versementsDuJour.reduce((a, v) => a + versementTotal(v), 0) : (c.versements ? sumVersements(versements) : num(c.totalVersement));

  const totalPaiementMarchand = num(c.totalPaiementMarchand);
  // Un gérant peut anticiper un versement en pleine journée (grosse recette du matin
  // versée avant la fin de journée, par exemple) — cet argent sort donc réellement du
  // tiroir le jour même. Le versement du jour se déduit désormais de la caisse attendue,
  // au même titre que le Bon et le Paiement marchand.
  // Dépenses payées en espèces depuis la caisse de la station (hors dépenses refusées).
  const totalDepenses = (depensesColl || []).filter((d) => d.stationId === stationId && d.date === date && d.payeeParCaisse && d.statut !== "refusee").reduce((a, d) => a + num(d.montant), 0);
  // Règlements de clients à crédit reçus en espèces à la station : ils entrent dans la caisse.
  const totalEncaissements = (reglementsColl || []).filter((r) => r.stationId === stationId && r.date === date && r.encaisseEnCaisse).reduce((a, r) => a + num(r.montant), 0);
  let caisseAttendue = caissePrecedente + ca - totalBon - totalPaiementMarchand - totalVersement - totalDepenses + totalEncaissements;
  // Cas normal, pas une erreur : la caisse peut rester plusieurs jours sans être versée
  // (2, 3, 4 jours...), puis être versée en une seule fois — ce versement dépasse alors
  // forcément le CA d'un seul jour. Dans ce cas, on ne peut plus dire ce qu'il reste
  // précisément dans le tiroir avec les seules données de ce jour-là ; on retient
  // simplement le CA du jour comme caisse attendue, plutôt qu'un négatif trompeur.
  if (caisseAttendue < 0) caisseAttendue = ca;
  const caisseDuJour = c.caisseDuJour === undefined || c.caisseDuJour === "" ? null : num(c.caisseDuJour);
  const ecart = caisseDuJour === null ? null : caisseDuJour - caisseAttendue;
  return { record: c.id ? c : null, ca, caissePrecedente, totalBon, totalVersement, totalPaiementMarchand, totalDepenses, totalEncaissements, caisseAttendue, caisseDuJour, ecart, bons, versements };
}

/* --------------------------- Persistence hook -------------------------- */

const DB_KEY = "smi_sarl_db_v1";
const emptyDb = { stations: [], pompes: [], releves: [], ventes: [], stocks: [], caisses: [], inspections: [], receptions: [], mouvements: [], versements: [], bons: [], pompistes: [], gerants: [], partenaires: [], commandesPartenaires: [], versementsPartenaires: [], commandesReseau: [], passations: [], cuves: [], fournisseurs: [], paiementsFournisseurs: [], depenses: [], clients: [], reglementsClients: [], factures: [], parametres: [], profils: [], utilisateurs: [], comptesStations: [], audit: [] };
const COLLECTIONS = ["stations", "pompes", "releves", "ventes", "stocks", "caisses", "inspections", "receptions", "mouvements", "versements", "bons", "pompistes", "gerants", "partenaires", "commandesPartenaires", "versementsPartenaires", "commandesReseau", "passations", "cuves", "fournisseurs", "paiementsFournisseurs", "depenses", "clients", "reglementsClients", "factures", "parametres", "profils", "utilisateurs", "comptesStations"];

// Grille de contrôle standard pour l'inspection d'une station. Chaque point est noté
// Conforme / Non conforme / Non applicable, avec une remarque libre optionnelle.
const INSPECTION_CHECKLIST = [
  { id: "proprete", label: "Propreté générale du site" },
  { id: "securite_incendie", label: "Extincteurs présents et à jour" },
  { id: "signaletique", label: "Affichage des prix conforme et lisible" },
  { id: "pompes_etat", label: "État général des pompes" },
  { id: "sanitaires", label: "Hygiène des sanitaires" },
  { id: "epi_personnel", label: "Tenue et équipement du personnel" },
  { id: "registre_maintenance", label: "Registre de maintenance à jour" },
  { id: "eclairage", label: "Éclairage fonctionnel" },
];
const AUDIT_MAX = 500; // le journal garde les 500 dernières actions pour rester léger

// Fusionne trois versions d'une base (distant / base locale de départ / locale modifiée)
// collection par collection, par id — au lieu d'écraser tout le blob partagé. Ça évite
// qu'un gérant qui sauvegarde sa station efface les modifications qu'un admin (ou un
// autre gérant) vient d'enregistrer sur une autre partie des données pendant ce temps.
// Ce n'est pas un vrai verrou transactionnel (il reste une fenêtre de course très courte
// entre la lecture et l'écriture), mais ça supprime l'essentiel du risque de perte de
// données en usage normal multi-poste.
function mergeDb(remote, base, local) {
  const merged = {};
  for (const key of COLLECTIONS) {
    const remoteArr = remote[key] || [];
    const baseArr = base[key] || [];
    const localArr = local[key] || [];
    const baseIds = new Set(baseArr.map((x) => x.id));
    const localIds = new Set(localArr.map((x) => x.id));
    const deletedIds = new Set([...baseIds].filter((id) => !localIds.has(id)));
    const changed = localArr.filter((x) => {
      const b = baseArr.find((y) => y.id === x.id);
      return !b || JSON.stringify(b) !== JSON.stringify(x);
    });
    const byId = new Map(remoteArr.filter((x) => !deletedIds.has(x.id)).map((x) => [x.id, x]));
    changed.forEach((c) => byId.set(c.id, c));
    merged[key] = Array.from(byId.values());
  }
  const localAuditIds = new Set((base.audit || []).map((a) => a.id));
  const newAuditLocal = (local.audit || []).filter((a) => !localAuditIds.has(a.id));
  const mergedAudit = [...(remote.audit || []), ...newAuditLocal]
    .sort((a, b) => (a.ts < b.ts ? 1 : -1))
    .slice(0, AUDIT_MAX);
  merged.audit = mergedAudit;
  return merged;
}

function useSmiStorage() {
  const [db, setDbState] = useState(null);
  // La session (profil + société) est propre à cet appareil : elle vient du navigateur,
  // jamais de la base partagée.
  const [session, setSessionState] = useState(() => getSession());
  const profile = session?.profile || null;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [logoutReason, setLogoutReason] = useState("");

  // baseDbRef garde la dernière version connue comme "commune" (juste après chargement ou
  // écriture réussie), pour servir de référence à la fusion à 3 lors de la prochaine écriture.
  const baseDbRef = useRef(emptyDb);

  // Le serveur peut refuser la session (expirée, société suspendue...) : retour à l'écran
  // de connexion avec le message reçu.
  useEffect(() => {
    const onLogout = (e) => { setLogoutReason(e.detail || ""); setSessionState(null); setDbState(null); };
    window.addEventListener("gsp-logout", onLogout);
    return () => window.removeEventListener("gsp-logout", onLogout);
  }, []);

  useEffect(() => {
    setNomSociete(session?.tenant?.nom || "");
    if (!session?.token) { setReady(true); return; }
    let cancelled = false;
    setReady(false);
    (async () => {
      let loadedDb = emptyDb;
      try {
        const r = await storage.get(DB_KEY);
        if (r?.value) loadedDb = { ...emptyDb, ...JSON.parse(r.value) };
      } catch (e) {
        if (e?.auth) return;
        // Nouvelle société : la base n'existe pas encore, on la crée vide.
        if (session.profile?.role === "admin") {
          try { await storage.set(DB_KEY, JSON.stringify(emptyDb)); } catch { /* le prochain enregistrement réessaiera */ }
        }
      }
      if (cancelled) return;
      baseDbRef.current = loadedDb;
      setDbState(loadedDb);
      setReady(true);
      // Après la première tentative de chargement, on sait si l'API distante répond ou non.
      if (isStorageDegraded()) {
        setError(hasLocalStorage
          ? "Stockage partagé indisponible pour l'instant : les données sont enregistrées dans ce navigateur uniquement (pas de partage entre postes)."
          : "Stockage indisponible pour l'instant : les données ne seront conservées que le temps de cette session.");
      }
    })();
    return () => { cancelled = true; };
  }, [session?.token]);

  const lastDbRef = useRef(null);
  const writeChainRef = useRef(Promise.resolve());

  const writeDbToStorage = useCallback(async (base, next) => {
    lastDbRef.current = next;
    let ok = false;
    let finalDb = next;
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        // Lecture fraîche juste avant d'écrire, puis fusion, pour intégrer les changements
        // faits ailleurs (autre poste, autre onglet) depuis la dernière lecture locale.
        let remote = base;
        try {
          const r = await storage.get(DB_KEY);
          if (r?.value) remote = { ...emptyDb, ...JSON.parse(r.value) };
        } catch { /* pas de version distante lisible, on part de la base locale */ }
        finalDb = mergeDb(remote, base, next);
        await storage.set(DB_KEY, JSON.stringify(finalDb));
        ok = true;
      } catch {
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    if (ok) {
      baseDbRef.current = finalDb;
      setDbState(finalDb);
      if (!isStorageDegraded()) setError(null);
    } else {
      setError("Échec de l'enregistrement. Vos données restent affichées et seront renvoyées à la prochaine tentative.");
    }
  }, []);

  // Les écritures sont mises en file pour qu'une saisie rapide (double clic, saisies
  // successives) ne déclenche jamais deux sauvegardes concurrentes sur la même clé.
  const persistDb = useCallback((next) => {
    const base = baseDbRef.current;
    setDbState(next);
    writeChainRef.current = writeChainRef.current.then(() => writeDbToStorage(base, next));
  }, [writeDbToStorage]);

  const retrySave = useCallback(() => {
    if (lastDbRef.current) persistDb(lastDbRef.current);
  }, [persistDb]);

  // Connexion réussie (session enregistrée par storage.login) ou déconnexion (null).
  const setProfile = useCallback((next) => {
    if (next === null) { setSession(null); setDbState(null); setLogoutReason(""); setSessionState(null); return; }
    setLogoutReason("");
    setSessionState(getSession());
  }, []);

  return { db, setDb: persistDb, profile, setProfile, ready, error, retrySave, tenant: session?.tenant || null, logoutReason };
}

/* ------------------------------ UI atoms -------------------------------- */

function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      <span className="text-xs font-semibold tracking-wide uppercase" style={{ color: C.textMuted }}>{label}</span>
      {children}
      {hint && <span className="text-xs" style={{ color: C.textFaint }}>{hint}</span>}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      className="smi-input w-full rounded-md px-3 py-2 text-sm"
      style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }}
    />
  );
}

function NumberInput(props) {
  return (
    <input
      type="number"
      inputMode="decimal"
      {...props}
      className="smi-input smi-mono w-full rounded-md px-3 py-2 text-sm"
      style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }}
    />
  );
}

function SelectInput({ children, ...props }) {
  return (
    <select
      {...props}
      className="smi-select w-full rounded-md px-3 py-2 text-sm"
      style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }}
    >
      {children}
    </select>
  );
}

function Button({ variant = "primary", className = "", ...props }) {
  const styles = {
    primary: { background: C.amber, color: "#1A1305", border: `1px solid ${C.amber}` },
    ghost: { background: "transparent", color: C.text, border: `1px solid ${C.border}` },
    danger: { background: "transparent", color: C.danger, border: `1px solid ${C.danger}` },
  }[variant];
  return (
    <button
      {...props}
      className={`smi-btn inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-opacity hover:opacity-85 disabled:opacity-40 ${className}`}
      style={styles}
    />
  );
}

function Card({ children, className = "", style }) {
  return (
    <div className={`rounded-lg p-4 ${className}`} style={{ background: C.panel, border: `1px solid ${C.border}`, ...style }}>
      {children}
    </div>
  );
}

function GaugeNumber({ value, unit, tone = "amber", size = "md" }) {
  const color = tone === "amber" ? C.amber : tone === "teal" ? C.teal : tone === "danger" ? C.danger : C.text;
  const bg = tone === "amber" ? C.amberSoft : tone === "teal" ? C.tealSoft : tone === "danger" ? C.dangerSoft : C.panelAlt;
  return (
    <div
      className={`smi-mono inline-flex items-baseline gap-1 rounded px-2.5 py-1 font-bold ${size === "lg" ? "text-xl" : "text-sm"}`}
      style={{ background: bg, color, border: `1px solid color-mix(in srgb, ${color} 27%, transparent)` }}
    >
      <span>{value}</span>
      {unit && <span className="text-xs font-medium opacity-70">{unit}</span>}
    </div>
  );
}

function Pill({ children, tone = "muted" }) {
  const color = { muted: C.textMuted, amber: C.amber, teal: C.teal, danger: C.danger, success: C.success }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 27%, transparent)` }}>
      {children}
    </span>
  );
}

// Visionneuse plein écran pour les photos (bon de livraison, reçu de versement...) — clic
// sur une vignette pour voir la photo en grand, clic n'importe où (ou sur la croix) pour
// fermer.
// Visionneuse plein écran pour les photos (bon de livraison, reçu de versement...) — clic
// sur une vignette pour voir la photo en grand, clic n'importe où (ou sur la croix) pour
// fermer. Le bouton Imprimer ouvre la photo seule dans un nouvel onglet dédié à
// l'impression — indépendant du reste de la page (Rapport journalier, historique...), pour
// que l'impression ne contienne que cette photo, rien d'autre.
function ImageLightbox({ src, onClose }) {
  if (!src) return null;

  const printPhoto = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Photo</title><meta charset="utf-8"></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;">
        <img src="${src}" style="max-width:100%;max-height:100vh;" onload="window.print()" />
      </body></html>`);
    w.document.close();
  };

  return (
    <div
      onClick={onClose}
      className="smi-no-print"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <button onClick={(e) => { e.stopPropagation(); printPhoto(); }} className="smi-btn" style={{ position: "absolute", top: 16, right: 64, color: "#fff" }} aria-label="Imprimer">
        <Printer size={26} />
      </button>
      <button onClick={onClose} className="smi-btn" style={{ position: "absolute", top: 16, right: 16, color: "#fff" }} aria-label="Fermer">
        <X size={28} />
      </button>
      <img src={src} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// QR code généré localement (aucun appel réseau) — utilisé dans le pied de page des
// rapports imprimés/exportés en PDF, pour retrouver l'application en scannant plutôt
// qu'en retapant l'adresse.
function QrCode({ value, size = 90 }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: size, margin: 0, color: { dark: "#111111", light: "#ffffff" } })
      .then((url) => { if (!cancelled) setSrc(url); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [value, size]);
  if (!src) return <div style={{ width: size, height: size }} />;
  return <img src={src} alt="Code QR de l'application" width={size} height={size} />;
}

function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <Icon size={28} style={{ color: C.textFaint }} />
      <p className="font-semibold" style={{ color: C.text }}>{title}</p>
      {hint && <p className="text-sm max-w-xs" style={{ color: C.textFaint }}>{hint}</p>}
    </div>
  );
}

/* ------------------------ Reusable dropdowns ---------------------------- */

function StationSelect({ stations, value, onChange, disabled, allowAll = false }) {
  return (
    <SelectInput value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="" disabled={!allowAll}>{allowAll ? "Toutes les stations" : "Sélectionner une station"}</option>
      {stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
    </SelectInput>
  );
}

// Une pompe ne dispense pas forcément les deux carburants — si aucune liste de produits
// n'a été enregistrée (pompes créées avant cette fonctionnalité), on considère par défaut
// qu'elle dispense les deux, pour ne rien casser sur les données existantes.
function pompeHas(pompe, produit) {
  return !pompe || !pompe.produits || pompe.produits.includes(produit);
}

function PompeSelect({ pompes, stationId, value, onChange, disabled }) {
  const list = pompes.filter((p) => p.stationId === stationId);
  return (
    <SelectInput value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled || !stationId}>
      <option value="">{stationId ? (list.length ? "Sélectionner une pompe" : "Aucune pompe pour cette station") : "Choisir la station d'abord"}</option>
      {list.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
    </SelectInput>
  );
}

/* ------------------------------ Role gate -------------------------------- */

const ADMIN_PIN_KEY = "smi_sarl_admin_pin_v1";

const LAST_SOCIETE_KEY = "gsp_derniere_societe";

// Écran de connexion : code société + profil + nom + code. Tout est vérifié par le
// serveur (/api/login) ; la session obtenue reste sur cet appareil uniquement.
function LoginScreen({ onLoggedIn, reason }) {
  const [societe, setSociete] = useState(() => { try { return localStorage.getItem(LAST_SOCIETE_KEY) || ""; } catch { return ""; } });
  const [role, setRole] = useState("admin");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(reason || "");

  const canSubmit = !busy && societe.trim() && name.trim() && pin.trim();

  const submit = async () => {
    setErr("");
    setBusy(true);
    try {
      await login({ societe: societe.trim(), role, name: name.trim(), pin: pin.trim() });
      try { localStorage.setItem(LAST_SOCIETE_KEY, societe.trim()); } catch { /* non bloquant */ }
      onLoggedIn();
    } catch (e) {
      setErr(e.message || "Connexion impossible pour le moment. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const isAgent = role === "pompiste" || role === "gerant" || role === "siege";
  const inputStyle = { background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text };

  return (
    <div className="smi-root min-h-screen flex items-center justify-center p-6">
      <StyleInjector />
      <Card className="w-full max-w-md" style={{ background: C.panel }}>
        <div className="flex items-center gap-3 mb-1">
          <Logo size={40} />
          <div>
            <p className="smi-display text-2xl leading-none">{APP_NAME}</p>
            <p className="text-xs" style={{ color: C.textMuted }}>Gestion de réseaux de stations-service</p>
          </div>
        </div>
        <p className="text-sm mt-4 mb-3" style={{ color: C.textMuted }}>Connectez-vous à l'espace de votre société.</p>

        <div className="mb-3">
          <Field label="Code société" hint="Communiqué à la création de votre compte.">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={inputStyle} value={societe} onChange={(e) => setSociete(e.target.value)} placeholder="ex : smi" autoCapitalize="none" autoCorrect="off" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {[{ k: "admin", label: "Administrateur", hint: "Vue complète" }, { k: "siege", label: "Siège", hint: "Comptable, direction…" }, { k: "gerant", label: "Gérant", hint: "Saisie de sa station" }, { k: "pompiste", label: "Pompiste", hint: "Sa pompe uniquement" }].map((r) => (
            <button
              key={r.k}
              onClick={() => setRole(r.k)}
              className="smi-btn rounded-md p-3 text-left transition-colors"
              style={{ background: role === r.k ? C.amberSoft : C.bgAlt, border: `1px solid ${role === r.k ? C.amber : C.border}` }}
            >
              <p className="font-semibold text-sm" style={{ color: role === r.k ? C.amber : C.text }}>{r.label}</p>
              <p className="text-xs mt-0.5" style={{ color: C.textFaint }}>{r.hint}</p>
            </button>
          ))}
        </div>

        {role === "siege" && (
          <p className="text-xs mb-3" style={{ color: C.textFaint }}>Compte créé par l'administrateur (onglet Sécurité), avec les modules auxquels vous avez droit.</p>
        )}
        {role === "gerant" && (
          <p className="text-xs mb-3" style={{ color: C.textFaint }}>Votre compte est créé par un administrateur depuis l'onglet Stations. Entrez le nom et le mot de passe qu'il vous a communiqués.</p>
        )}
        {role === "pompiste" && (
          <p className="text-xs mb-3" style={{ color: C.textFaint }}>Votre compte (pompe assignée) est créé par votre gérant depuis l'onglet Mouvements Pompiste. Entrez le nom et le mot de passe qu'il vous a communiqués.</p>
        )}

        <div className="flex flex-col gap-3 mb-3">
          <Field label={isAgent ? "Nom d'utilisateur" : "Votre nom"} hint={isAgent ? undefined : "Utilisé pour identifier vos saisies dans le journal."}>
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : Mamadou Diallo" />
          </Field>
          <Field label={isAgent ? "Mot de passe" : "Code PIN administrateur"}>
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={inputStyle} type="password" inputMode={isAgent ? undefined : "numeric"} value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canSubmit) submit(); }} placeholder="••••" />
          </Field>
        </div>

        {err && (
          <p className="text-xs flex items-center gap-1.5 mb-3" style={{ color: C.danger }}>
            <AlertTriangle size={13} /> {err}
          </p>
        )}

        <Button className="w-full justify-center" disabled={!canSubmit} onClick={submit}>
          {busy ? "Vérification…" : "Se connecter"} <ChevronRight size={16} />
        </Button>
      </Card>
    </div>
  );
}

/* ------------------------------ Stations view ---------------------------- */

function StationsView({ db, setDb, profile }) {
  const [form, setForm] = useState(null); // null = closed, {} = new, {...} = editing
  const [pinInput, setPinInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Comptes gérants — un compte par personne (nom + mot de passe + station), au lieu d'un
  // code PIN partagé par station. Plusieurs gérants peuvent ainsi être créés pour une même
  // station (ex. "Gérant 1", "Gérant 2"), chacun avec ses saisies clairement identifiées
  // dans le Journal des saisies. La pompe se choisit à chaque saisie dans Relevé Pompes,
  // pas ici — un gérant gère toute sa station, pas une seule pompe.
  const [acctStationId, setAcctStationId] = useState(db.stations[0]?.id || "");
  const [acctNom, setAcctNom] = useState("");
  const [acctPassword, setAcctPassword] = useState("");
  const [acctPartenaireId, setAcctPartenaireId] = useState("");
  const [acctProfilId, setAcctProfilId] = useState("");
  const profilsGerant = (db.profils || []).filter((x) => x.type === "gerant");
  const [acctErr, setAcctErr] = useState("");
  const [resettingId, setResettingId] = useState(null);
  const [newPassInput, setNewPassInput] = useState("");
  const [resetErr, setResetErr] = useState("");

  const save = () => {
    if (!form.nom?.trim()) return;
    setSaving(true);
    const before = form.id ? db.stations.find((s) => s.id === form.id) : null;
    const record = { ...form, devise: form.devise || "GNF" };
    if (pinInput.trim()) record.pinHash = hashPin(pinInput.trim());
    if (!record.id) record.id = uid();
    let next = { ...db };
    if (before) {
      next.stations = db.stations.map((s) => (s.id === record.id ? record : s));
    } else {
      next.stations = [...db.stations, record];
      // Toute station a forcément des pompes — on en pré-crée 4 (P1 à P4) pour éviter
      // l'étape oubliée « aucune pompe ». L'admin peut toujours en ajouter une 5ᵉ, 6ᵉ...
      // depuis l'onglet Pompes, ou supprimer celles qui ne servent pas.
      const nouvellesPompes = [1, 2, 3, 4].map((n) => ({ id: uid(), stationId: record.id, nom: `P${n}`, produits: ["essence", "gasoil"] }));
      next.pompes = [...db.pompes, ...nouvellesPompes];
    }
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: record.id, entity: "station", action: before ? "modification" : "création", before: before ? { nom: before.nom } : null, after: { nom: record.nom, pompesCreees: before ? undefined : 4 } });
    setDb(next);
    setSaving(false);
    setForm(null);
    setPinInput("");
  };

  const remove = (id) => {
    const inUse = db.pompes.some((p) => p.stationId === id);
    if (inUse && !confirm("Cette station a des pompes associées. Supprimer quand même la station ?")) return;
    const before = db.stations.find((s) => s.id === id);
    let next = { ...db, stations: db.stations.filter((s) => s.id !== id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: id, entity: "station", action: "suppression", before: { nom: before?.nom }, after: null });
    setDb(next);
  };

  const createGerantAccount = () => {
    setAcctErr("");
    if (!acctStationId) { setAcctErr("Choisissez une station."); return; }
    if (!acctNom.trim()) { setAcctErr("Indiquez le nom du gérant."); return; }
    if (acctPassword.trim().length < 4) { setAcctErr("Le mot de passe doit faire au moins 4 caractères."); return; }
    const row = { id: uid(), stationId: acctStationId, pompeId: null, partenaireId: acctPartenaireId || null, profilId: acctProfilId || "", nom: acctNom.trim(), passwordHash: hashPin(acctPassword.trim()) };
    let next = { ...db, gerants: [...(db.gerants || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: acctStationId, entity: "gerant_compte", action: "création", after: { nom: row.nom } });
    setDb(next);
    setAcctNom(""); setAcctPassword(""); setAcctPartenaireId(""); setAcctProfilId("");
  };

  // Réinitialise uniquement le mot de passe d'un compte — nom, station et pompe assignée
  // restent inchangés, aucune autre donnée n'est touchée.
  const resetGerantPassword = (acct) => {
    setResetErr("");
    if (newPassInput.trim().length < 4) { setResetErr("Le mot de passe doit faire au moins 4 caractères."); return; }
    const row = { ...acct, passwordHash: hashPin(newPassInput.trim()) };
    let next = { ...db, gerants: db.gerants.map((g) => (g.id === acct.id ? row : g)) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: acct.stationId, entity: "gerant_compte", action: "modification", after: { nom: acct.nom, note: "mot de passe réinitialisé" } });
    setDb(next);
    setResettingId(null);
    setNewPassInput("");
  };

  const removeGerantAccount = (acct) => {
    if (!confirm(`Supprimer le compte de ${acct.nom} ?`)) return;
    let next = { ...db, gerants: db.gerants.filter((g) => g.id !== acct.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: acct.stationId, entity: "gerant_compte", action: "suppression", before: { nom: acct.nom } });
    setDb(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="smi-display text-2xl">Stations</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Ajouter une station l'intègre immédiatement partout — aucune modification de structure requise.</p>
        </div>
        <Button onClick={() => setForm({})}><Plus size={16} /> Nouvelle station</Button>
      </div>

      {form && (
        <Card>
          {!form.id && (
            <p className="text-xs mb-3 flex items-center gap-1.5" style={{ color: C.textMuted }}>
              <Gauge size={13} /> 4 pompes (P1 à P4) seront créées automatiquement avec cette station — ajoutez-en d'autres ou supprimez-en depuis l'onglet Pompes.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom de la station"><TextInput value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. Station Kaloum" /></Field>
            <Field label="Fournisseur carburant"><TextInput value={form.fournisseur || ""} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })} placeholder="Ex. Total Guinée" /></Field>
            <Field label="Localisation"><TextInput value={form.localisation || ""} onChange={(e) => setForm({ ...form, localisation: e.target.value })} placeholder="Ex. Conakry, Kaloum" /></Field>
            <Field label="Devise"><TextInput value={form.devise ?? "GNF"} onChange={(e) => setForm({ ...form, devise: e.target.value })} /></Field>
            <Field label="Fond de roulement (L)" hint="Seuil minimum de stock total (essence + gasoil) à maintenir — sert à alerter avant une rupture.">
              <NumberInput value={form.fondRoulement ?? ""} onChange={(e) => setForm({ ...form, fondRoulement: e.target.value })} />
            </Field>
            <Field label="Couleur de la station" hint="Pour la repérer facilement sur ses cartes dans l'application.">
              <div className="flex gap-2 flex-wrap items-center">
                {STATION_COLOR_PRESETS.map((hex) => (
                  <button key={hex} type="button" onClick={() => setForm({ ...form, couleur: hex })} aria-label={hex} className="smi-btn rounded-full" style={{ width: 28, height: 28, background: hex, border: form.couleur === hex ? `3px solid ${C.text}` : `1px solid ${C.border}` }} />
                ))}
                {form.couleur && <button type="button" onClick={() => setForm({ ...form, couleur: null })} className="smi-btn text-xs" style={{ color: C.textFaint }}>Aucune</button>}
              </div>
            </Field>
            <Field label={form.pinHash ? "Changer le code PIN de la station" : "Code PIN de la station (optionnel, non utilisé pour les gérants)"} hint={form.pinHash ? "Un code est déjà défini ; laissez vide pour le conserver." : "Réservé à un usage futur — les gérants se connectent désormais avec un compte individuel (voir plus bas)."}>
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="••••" />
            </Field>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={save} disabled={saving}><CheckCircle2 size={16} /> Enregistrer</Button>
            <Button variant="ghost" onClick={() => { setForm(null); setPinInput(""); }}><X size={16} /> Annuler</Button>
          </div>
        </Card>
      )}

      {db.stations.length === 0 ? (
        <EmptyState icon={Building2} title="Aucune station" hint="Créez la première station du réseau pour commencer." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {db.stations.map((s) => {
            const gerantsDeCetteStation = (db.gerants || []).filter((g) => g.stationId === s.id);
            return (
              <Card key={s.id} className="flex flex-col gap-2" style={s.couleur ? { background: `color-mix(in srgb, ${s.couleur} 14%, ${C.panel})`, border: `1px solid color-mix(in srgb, ${s.couleur} 40%, ${C.border})`, borderLeft: `4px solid ${s.couleur}` } : undefined}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold flex items-center gap-1.5">{s.couleur && <span style={{ width: 9, height: 9, borderRadius: 999, background: s.couleur, flexShrink: 0 }} />}{s.nom}</p>
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: C.textMuted }}><MapPin size={12} /> {s.localisation || "—"}</p>
                  </div>
                  <Pill tone="amber">{s.devise || "GNF"}</Pill>
                </div>
                <p className="text-xs" style={{ color: C.textFaint }}>Fournisseur : {s.fournisseur || "—"}</p>
                <p className="text-xs" style={{ color: C.textFaint }}>{db.pompes.filter((p) => p.stationId === s.id).length} pompe(s)</p>
                {s.fondRoulement && <p className="text-xs" style={{ color: C.textFaint }}>Fond de roulement : {fmtVol(num(s.fondRoulement))} L</p>}
                <div className="text-xs" style={{ color: C.textFaint }}>
                  {gerantsDeCetteStation.length === 0 ? (
                    <span>Aucun gérant enregistré</span>
                  ) : (
                    gerantsDeCetteStation.map((g, i) => (
                      <p key={g.id} className="flex items-center gap-1"><Users size={11} /> Gérant {i + 1} : {g.nom}</p>
                    ))
                  )}
                </div>
                <div className="flex gap-2 mt-1">
                  <Button variant="ghost" onClick={() => setForm(s)}><Pencil size={14} /> Modifier</Button>
                  <Button variant="danger" onClick={() => remove(s.id)}><Trash2 size={14} /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="max-w-md">
        <p className="font-semibold text-sm mb-1">Comptes gérants</p>
        <p className="text-xs mb-3" style={{ color: C.textMuted }}>Créez un compte par personne — plusieurs gérants peuvent être créés pour une même station (Gérant 1, Gérant 2...), chacun avec son propre nom et mot de passe.</p>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Station"><StationSelect stations={db.stations} value={acctStationId} onChange={setAcctStationId} /></Field>
          <Field label="Nom du gérant">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={acctNom} onChange={(e) => setAcctNom(e.target.value)} placeholder="ex : Mamadou Diallo" />
          </Field>
        </div>
        <Field label="Mot de passe (4 caractères minimum)">
          <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" value={acctPassword} onChange={(e) => setAcctPassword(e.target.value)} placeholder="••••" />
        </Field>
        <div className="mt-3">
          <Field label="Partenaire assigné (optionnel)" hint="Donne accès à l'onglet Partenaires, verrouillé sur ce client — pour un gérant chargé du suivi d'un partenaire.">
            <SelectInput value={acctPartenaireId} onChange={(e) => setAcctPartenaireId(e.target.value)}>
              <option value="">Aucun</option>
              {(db.partenaires || []).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </SelectInput>
          </Field>
        </div>
        {profilsGerant.length > 0 && (
          <div className="mt-3">
            <Field label="Profil de droits (optionnel)" hint="Vide = tous les modules d'un gérant. Les profils se gèrent dans Sécurité.">
              <SelectInput value={acctProfilId} onChange={(e) => setAcctProfilId(e.target.value)}>
                <option value="">Gérant (accès complet à sa station)</option>
                {profilsGerant.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </SelectInput>
            </Field>
          </div>
        )}
        {acctErr && <p className="text-xs flex items-center gap-1.5 mt-2 mb-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {acctErr}</p>}
        <div className="flex justify-end mt-3"><Button onClick={createGerantAccount}><Plus size={15} /> Créer le compte</Button></div>

        {db.gerants?.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
            <p className="text-xs font-semibold mb-1" style={{ color: C.textMuted }}>Tous les comptes gérants</p>
            {db.gerants.map((acct) => (
              <div key={acct.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>{acct.nom} — <span style={{ color: C.textFaint }}>{db.stations.find((s) => s.id === acct.stationId)?.nom || "—"}{acct.partenaireId ? ` · Partenaire : ${(db.partenaires || []).find((p) => p.id === acct.partenaireId)?.nom || "—"}` : ""}</span></span>
                  {profilsGerant.length > 0 && (
                    <select className="smi-select rounded-md px-1 py-0.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={acct.profilId || ""} onChange={(e) => setDb(withAudit({ ...db, gerants: db.gerants.map((g) => (g.id === acct.id ? { ...g, profilId: e.target.value } : g)) }, { user: profile?.name, role: profile?.role, stationId: acct.stationId, entity: "gerant_compte", action: "changement de profil", after: { nom: acct.nom, profil: profilsGerant.find((x) => x.id === e.target.value)?.nom || "Gérant" } }))}>
                      <option value="">Gérant</option>
                      {profilsGerant.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
                    </select>
                  )}
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setResettingId(resettingId === acct.id ? null : acct.id); setResetErr(""); setNewPassInput(""); }} className="smi-btn" style={{ color: C.teal }}><Lock size={13} /></button>
                    <button onClick={() => removeGerantAccount(acct)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={13} /></button>
                  </div>
                </div>
                {resettingId === acct.id && (
                  <div className="rounded-md p-2 flex items-center gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <input className="smi-input flex-1 rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" value={newPassInput} onChange={(e) => setNewPassInput(e.target.value)} placeholder="Nouveau mot de passe" />
                    <Button onClick={() => resetGerantPassword(acct)}>Valider</Button>
                  </div>
                )}
                {resettingId === acct.id && resetErr && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {resetErr}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------- Pompes view ------------------------------ */

/* ------------------------------- Partenaires view ------------------------------ */

// Client partenaire non intégré au contrôle strict du réseau (pas de relevé pompes, pas
// de stock, pas de caisse) — juste un suivi Commandes + Versements, comme les feuilles de
// suivi papier existantes.
function bonComTotal(c) { return num(c.quantiteCommandee) * num(c.prixUnitaire); }

function PartenairesView({ db, setDb, profile }) {
  const isAdmin = profile.role === "admin";
  const isGerantAssigne = profile.role === "gerant" && !!profile.partenaireId;

  // Gestion des clients partenaires (admin uniquement)
  const [newNom, setNewNom] = useState("");
  const [newLocalisation, setNewLocalisation] = useState("");
  const [clientErr, setClientErr] = useState("");
  const [selectedId, setSelectedId] = useState(isGerantAssigne ? profile.partenaireId : (db.partenaires?.[0]?.id || ""));

  const createClient = () => {
    setClientErr("");
    if (!newNom.trim()) { setClientErr("Indiquez le nom du client."); return; }
    const row = { id: uid(), nom: newNom.trim(), localisation: newLocalisation.trim() };
    let next = { ...db, partenaires: [...(db.partenaires || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: null, entity: "partenaire", action: "création", after: { nom: row.nom } });
    setDb(next);
    setNewNom(""); setNewLocalisation("");
    setSelectedId(row.id);
  };

  const removeClient = (p) => {
    if (!confirm(`Supprimer le client ${p.nom} et tout son historique (commandes, versements) ?`)) return;
    let next = {
      ...db,
      partenaires: db.partenaires.filter((x) => x.id !== p.id),
      commandesPartenaires: db.commandesPartenaires.filter((c) => c.partenaireId !== p.id),
      versementsPartenaires: db.versementsPartenaires.filter((v) => v.partenaireId !== p.id),
    };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: null, entity: "partenaire", action: "suppression", before: { nom: p.nom } });
    setDb(next);
    if (selectedId === p.id) setSelectedId("");
  };

  // Formulaire Commande
  const [cDate, setCDate] = useState(todayISO());
  const [cProduit, setCProduit] = useState("essence");
  const [cQteCommandee, setCQteCommandee] = useState("");
  const [cQteLivree, setCQteLivree] = useState("");
  const [cPrixUnitaire, setCPrixUnitaire] = useState("");
  const [cErr, setCErr] = useState("");
  const [cEditingId, setCEditingId] = useState(null);

  const resetCommandeForm = () => {
    setCDate(todayISO()); setCProduit("essence"); setCQteCommandee(""); setCQteLivree(""); setCPrixUnitaire(""); setCEditingId(null);
  };

  const startEditCommande = (c) => {
    setCErr("");
    setCDate(c.date); setCProduit(c.produit); setCQteCommandee(c.quantiteCommandee ?? "");
    setCQteLivree(c.quantiteLivree ?? ""); setCPrixUnitaire(c.prixUnitaire ?? ""); setCEditingId(c.id);
  };

  const saveCommande = () => {
    setCErr("");
    if (!selectedId) { setCErr("Choisissez un client."); return; }
    if (!cQteCommandee || num(cQteCommandee) <= 0) { setCErr("Indiquez une quantité commandée."); return; }
    if (isFutureDate(cDate)) { setCErr("La date ne peut pas être dans le futur."); return; }
    const existing = cEditingId ? db.commandesPartenaires.find((c) => c.id === cEditingId) : null;
    const row = { id: cEditingId || uid(), partenaireId: selectedId, date: cDate, produit: cProduit, quantiteCommandee: cQteCommandee, quantiteLivree: cQteLivree, prixUnitaire: cPrixUnitaire, timestamp: existing?.timestamp || new Date().toISOString() };
    let next = { ...db, commandesPartenaires: cEditingId ? db.commandesPartenaires.map((c) => (c.id === cEditingId ? row : c)) : [...db.commandesPartenaires, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: null, entity: "commande_partenaire", action: cEditingId ? "modification" : "création", after: { date: cDate, quantiteCommandee: cQteCommandee } });
    setDb(next);
    resetCommandeForm();
  };

  const removeCommande = (c) => {
    if (!confirm("Supprimer cette commande ?")) return;
    let next = { ...db, commandesPartenaires: db.commandesPartenaires.filter((x) => x.id !== c.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: null, entity: "commande_partenaire", action: "suppression", before: { date: c.date } });
    setDb(next);
    if (cEditingId === c.id) resetCommandeForm();
  };

  // Formulaire Versement
  const [vDate, setVDate] = useState(todayISO());
  const [vMontant, setVMontant] = useState("");
  const [vNote, setVNote] = useState("");
  const [vErr, setVErr] = useState("");
  const [vEditingId, setVEditingId] = useState(null);

  const resetVersementForm = () => {
    setVDate(todayISO()); setVMontant(""); setVNote(""); setVEditingId(null);
  };

  const startEditVersement = (v) => {
    setVErr("");
    setVDate(v.date); setVMontant(v.montant ?? ""); setVNote(v.note || ""); setVEditingId(v.id);
  };

  const saveVersement = () => {
    setVErr("");
    if (!selectedId) { setVErr("Choisissez un client."); return; }
    if (!vMontant || num(vMontant) <= 0) { setVErr("Indiquez un montant."); return; }
    if (isFutureDate(vDate)) { setVErr("La date ne peut pas être dans le futur."); return; }
    const existing = vEditingId ? db.versementsPartenaires.find((v) => v.id === vEditingId) : null;
    const row = { id: vEditingId || uid(), partenaireId: selectedId, date: vDate, montant: vMontant, note: vNote, timestamp: existing?.timestamp || new Date().toISOString() };
    let next = { ...db, versementsPartenaires: vEditingId ? db.versementsPartenaires.map((v) => (v.id === vEditingId ? row : v)) : [...db.versementsPartenaires, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: null, entity: "versement_partenaire", action: vEditingId ? "modification" : "création", after: { date: vDate, montant: vMontant } });
    setDb(next);
    resetVersementForm();
  };

  const removeVersementP = (v) => {
    if (!confirm("Supprimer ce versement ?")) return;
    let next = { ...db, versementsPartenaires: db.versementsPartenaires.filter((x) => x.id !== v.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: null, entity: "versement_partenaire", action: "suppression", before: { date: v.date } });
    setDb(next);
    if (vEditingId === v.id) resetVersementForm();
  };

  const client = (db.partenaires || []).find((p) => p.id === selectedId);
  const commandesClient = (db.commandesPartenaires || []).filter((c) => c.partenaireId === selectedId).sort((a, b) => (a.date < b.date ? 1 : -1));
  const versementsClient = (db.versementsPartenaires || []).filter((v) => v.partenaireId === selectedId).sort((a, b) => (a.date < b.date ? 1 : -1));

  const totalVolumeCommande = commandesClient.reduce((a, c) => a + num(c.quantiteCommandee), 0);
  const totalVolumeLivre = commandesClient.reduce((a, c) => a + num(c.quantiteLivree), 0);
  const totalValeurCommandee = commandesClient.reduce((a, c) => a + bonComTotal(c), 0);
  const totalVerse = versementsClient.reduce((a, v) => a + num(v.montant), 0);
  const resteALivrer = totalVolumeCommande - totalVolumeLivre;
  const resteAPayer = totalValeurCommandee - totalVerse;

  if (profile.role === "gerant" && !profile.partenaireId) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="smi-display text-2xl">Partenaires</h2>
        <EmptyState icon={Users} title="Aucun partenaire assigné à votre compte" hint="Contactez l'administrateur pour qu'il vous assigne un client partenaire depuis l'onglet Stations." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Partenaires</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Suivi des commandes et versements des clients/stations partenaires — sans le contrôle quotidien du réseau (pas de relevé, stock ou caisse).</p>
      </div>

      {isAdmin && (
        <Card className="max-w-md">
          <p className="font-semibold text-sm mb-3">Clients partenaires</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Field label="Nom du client">
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={newNom} onChange={(e) => setNewNom(e.target.value)} placeholder="ex : Tawoutama Irie" />
            </Field>
            <Field label="Localisation">
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={newLocalisation} onChange={(e) => setNewLocalisation(e.target.value)} placeholder="ex : Macenta" />
            </Field>
          </div>
          {clientErr && <p className="text-xs flex items-center gap-1.5 mb-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {clientErr}</p>}
          <div className="flex justify-end"><Button onClick={createClient}><Plus size={15} /> Ajouter le client</Button></div>

          {(db.partenaires || []).length > 0 && (
            <div className="flex flex-col gap-1.5 mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              {db.partenaires.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs">
                  <button onClick={() => setSelectedId(p.id)} className="smi-btn text-left flex-1" style={{ color: selectedId === p.id ? C.amber : C.text, fontWeight: selectedId === p.id ? 700 : 400 }}>
                    {p.nom} {p.localisation ? `— ${p.localisation}` : ""}
                  </button>
                  <button onClick={() => removeClient(p)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {!selectedId ? (
        <EmptyState icon={Users} title="Aucun client sélectionné" hint={isAdmin ? "Ajoutez ou choisissez un client partenaire ci-dessus." : "Aucun client disponible."} />
      ) : (
        <>
          <Card>
            <p className="font-semibold text-sm mb-1">{client?.nom}</p>
            <p className="text-xs mb-3" style={{ color: C.textFaint }}>{client?.localisation}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <p className="text-[10px] uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Volume commandé</p>
                <GaugeNumber value={fmtVol(totalVolumeCommande)} tone="teal" />
              </div>
              <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <p className="text-[10px] uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Volume livré</p>
                <GaugeNumber value={fmtVol(totalVolumeLivre)} tone="teal" />
                <p className="text-[10px] mt-1" style={{ color: resteALivrer > 0 ? C.danger : C.success }}>Reste à livrer : {fmtVol(resteALivrer)}</p>
              </div>
              <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
                <p className="text-[10px] uppercase font-semibold mb-1" style={{ color: C.amber }}>Valeur commandée</p>
                <GaugeNumber value={fmtMontant(totalValeurCommandee, "GNF")} tone="amber" />
              </div>
              <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <p className="text-[10px] uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Montant versé</p>
                <GaugeNumber value={fmtMontant(totalVerse, "GNF")} />
                <p className="text-[10px] mt-1" style={{ color: resteAPayer > 0 ? C.danger : C.success }}>Reste à payer : {fmtMontant(resteAPayer, "GNF")}</p>
              </div>
            </div>
          </Card>

          <Card className="max-w-md">
            <p className="font-semibold text-sm mb-3">Nouvelle commande</p>
            {cEditingId && (
              <div className="rounded-md p-2.5 mb-3 flex items-center justify-between gap-2" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
                <span className="text-xs" style={{ color: C.teal }}>Modification d'une commande existante</span>
                <button onClick={resetCommandeForm} className="smi-btn text-xs" style={{ color: C.teal }}>Annuler</button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <Field label="Date"><TextInput type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} max={todayISO()} /></Field>
              <Field label="Produit">
                <SelectInput value={cProduit} onChange={(e) => setCProduit(e.target.value)}>
                  <option value="essence">Essence</option>
                  <option value="gasoil">Gasoil</option>
                </SelectInput>
              </Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <Field label="Quantité commandée (L)"><NumberInput value={cQteCommandee} onChange={(e) => setCQteCommandee(e.target.value)} /></Field>
              <Field label="Quantité livrée (L)" hint="Laissez vide si pas encore livrée"><NumberInput value={cQteLivree} onChange={(e) => setCQteLivree(e.target.value)} /></Field>
              <Field label="Prix unitaire (GNF)"><NumberInput value={cPrixUnitaire} onChange={(e) => setCPrixUnitaire(e.target.value)} /></Field>
            </div>
            {cErr && <p className="text-xs flex items-center gap-1.5 mb-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {cErr}</p>}
            <div className="flex justify-end"><Button onClick={saveCommande}><CheckCircle2 size={16} /> {cEditingId ? "Mettre à jour" : "Valider"}</Button></div>
          </Card>

          <Card>
            <p className="font-semibold text-sm mb-3">Historique des commandes</p>
            {commandesClient.length === 0 ? (
              <EmptyState icon={Truck} title="Aucune commande enregistrée" />
            ) : (
              <div className="overflow-x-auto smi-scroll">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th className="text-left py-1" style={{ color: C.textMuted }}>Date</th>
                      <th className="text-left py-1" style={{ color: C.textMuted }}>Produit</th>
                      <th className="text-right py-1" style={{ color: C.textMuted }}>Commandé (L)</th>
                      <th className="text-right py-1" style={{ color: C.textMuted }}>Livré (L)</th>
                      <th className="text-right py-1" style={{ color: C.textMuted }}>Valeur (GNF)</th>
                      <th className="py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {commandesClient.map((c) => (
                      <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="py-1">{fmtDateLong(c.date)}</td>
                        <td className="py-1">{c.produit === "essence" ? "Essence" : "Gasoil"}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(c.quantiteCommandee)}</td>
                        <td className="py-1 text-right smi-mono">{c.quantiteLivree ? fmtVol(c.quantiteLivree) : "—"}</td>
                        <td className="py-1 text-right smi-mono">{fmtMontant(bonComTotal(c), "GNF")}</td>
                        <td className="py-1 flex gap-2 justify-end">
                          <button onClick={() => startEditCommande(c)} className="smi-btn" style={{ color: C.teal }}><Pencil size={13} /></button>
                          {isAdmin && <button onClick={() => removeCommande(c)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={13} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="max-w-md">
            <p className="font-semibold text-sm mb-3">Nouveau versement</p>
            {vEditingId && (
              <div className="rounded-md p-2.5 mb-3 flex items-center justify-between gap-2" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
                <span className="text-xs" style={{ color: C.teal }}>Modification d'un versement existant</span>
                <button onClick={resetVersementForm} className="smi-btn text-xs" style={{ color: C.teal }}>Annuler</button>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <Field label="Date"><TextInput type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} max={todayISO()} /></Field>
              <Field label="Montant (GNF)"><NumberInput value={vMontant} onChange={(e) => setVMontant(e.target.value)} /></Field>
            </div>
            <Field label="Note (optionnel)">
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="ex : Virement bancaire" />
            </Field>
            {vErr && <p className="text-xs flex items-center gap-1.5 mt-2 mb-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {vErr}</p>}
            <div className="flex justify-end mt-2"><Button onClick={saveVersement}><CheckCircle2 size={16} /> {vEditingId ? "Mettre à jour" : "Valider"}</Button></div>
          </Card>

          <Card>
            <p className="font-semibold text-sm mb-3">Historique des versements</p>
            {versementsClient.length === 0 ? (
              <EmptyState icon={Landmark} title="Aucun versement enregistré" />
            ) : (
              <div className="flex flex-col gap-2">
                {versementsClient.map((v) => (
                  <div key={v.id} className="rounded-md p-2.5 flex items-center gap-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <div className="flex-1 min-w-0 text-xs" style={{ color: C.textMuted }}>
                      <span className="font-medium" style={{ color: C.text }}>{fmtDateLong(v.date)}</span>
                      {v.note && <span> · {v.note}</span>}
                    </div>
                    <span className="text-xs font-semibold smi-mono flex-shrink-0">{fmtMontant(v.montant, "GNF")}</span>
                    <button onClick={() => startEditVersement(v)} className="smi-btn flex-shrink-0" style={{ color: C.teal }}><Pencil size={13} /></button>
                    {isAdmin && <button onClick={() => removeVersementP(v)} className="smi-btn flex-shrink-0" style={{ color: C.danger }}><Trash2 size={13} /></button>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function PompesView({ db, setDb, profile }) {
  const [form, setForm] = useState(null);

  const toggleProduit = (produit) => {
    setForm((f) => {
      const current = f.produits || ["essence", "gasoil"];
      const has = current.includes(produit);
      let next = has ? current.filter((p) => p !== produit) : [...current, produit];
      if (next.length === 0) next = current; // au moins un produit doit rester sélectionné
      return { ...f, produits: next };
    });
  };

  const save = () => {
    if (!form.nom?.trim() || !form.stationId) return;
    const record = { ...form, produits: form.produits || ["essence", "gasoil"] };
    let next = { ...db };
    if (record.id) next.pompes = db.pompes.map((p) => (p.id === record.id ? record : p));
    else next.pompes = [...db.pompes, { ...record, id: uid() }];
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: record.stationId, entity: "pompe", action: record.id ? "modification" : "création", after: { nom: record.nom, produits: record.produits } });
    setDb(next);
    setForm(null);
  };

  const remove = (id) => {
    const inUse = db.releves.some((r) => r.pompeId === id);
    if (inUse && !confirm("Des relevés existent pour cette pompe. Supprimer quand même ?")) return;
    const p = db.pompes.find((x) => x.id === id);
    let next = { ...db, pompes: db.pompes.filter((p) => p.id !== id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: p?.stationId, entity: "pompe", action: "suppression", before: { nom: p?.nom } });
    setDb(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="smi-display text-2xl">Pompes</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Chaque pompe est rattachée à une station et alimente automatiquement les relevés, ventes et stocks.</p>
        </div>
        <Button onClick={() => setForm({ stationId: db.stations[0]?.id || "", produits: ["essence", "gasoil"] })} disabled={db.stations.length === 0}><Plus size={16} /> Nouvelle pompe</Button>
      </div>

      {db.stations.length === 0 && <EmptyState icon={Gauge} title="Créez d'abord une station" hint="Les pompes doivent être rattachées à une station existante." />}

      {form && (
        <Card>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom de la pompe"><TextInput value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. P1" /></Field>
            <Field label="Station associée"><StationSelect stations={db.stations} value={form.stationId} onChange={(v) => setForm({ ...form, stationId: v })} /></Field>
          </div>
          <div className="mt-3">
            <p className="text-xs font-medium mb-2" style={{ color: C.textMuted }}>Produits dispensés par cette pompe</p>
            <div className="flex gap-2">
              {[{ k: "essence", label: "Essence" }, { k: "gasoil", label: "Gasoil" }].map((p) => {
                const active = (form.produits || ["essence", "gasoil"]).includes(p.k);
                return (
                  <button
                    key={p.k}
                    onClick={() => toggleProduit(p.k)}
                    className="smi-btn rounded-md px-3 py-2 text-sm"
                    style={{ background: active ? C.amberSoft : C.bgAlt, border: `1px solid ${active ? C.amber : C.border}`, color: active ? C.amber : C.textMuted }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Choisissez les deux si la pompe dispense les deux carburants.</p>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button>
            <Button variant="ghost" onClick={() => setForm(null)}><X size={16} /> Annuler</Button>
          </div>
        </Card>
      )}

      {db.pompes.length === 0 ? (
        <EmptyState icon={Gauge} title="Aucune pompe" hint="Ajoutez les pompes de chaque station." />
      ) : (
        <div className="overflow-x-auto smi-scroll rounded-lg" style={{ border: `1px solid ${C.border}` }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: C.panelAlt }}>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: C.textMuted }}>Pompe</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: C.textMuted }}>Station</th>
                <th className="text-left px-3 py-2 font-semibold" style={{ color: C.textMuted }}>Produits</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {db.pompes.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="px-3 py-2 font-semibold">{p.nom}</td>
                  <td className="px-3 py-2" style={{ color: C.textMuted }}>{db.stations.find((s) => s.id === p.stationId)?.nom || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                      {pompeHas(p, "essence") && <Pill tone="amber">Essence</Pill>}
                      {pompeHas(p, "gasoil") && <Pill tone="teal">Gasoil</Pill>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <Button variant="ghost" onClick={() => setForm(p)}><Pencil size={13} /></Button>
                      <Button variant="danger" onClick={() => remove(p.id)}><Trash2 size={13} /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* --------------------------- Relevé Pompes view --------------------------- */

function RelevePompesView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(profile.stationId || db.stations[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [pompeId, setPompeId] = useState(profile.pompeId || "");
  const [idxOE, setIdxOE] = useState("");
  const [idxCE, setIdxCE] = useState("");
  const [idxOG, setIdxOG] = useState("");
  const [idxCG, setIdxCG] = useState("");

  const existing = db.releves.find((r) => r.stationId === stationId && r.pompeId === pompeId && r.date === date);

  // Relevé le plus récent avant la date sélectionnée, pour la même pompe — sert à
  // pré-remplir automatiquement l'ouverture du jour avec la clôture précédente.
  const previousReleve = useMemo(() => {
    const candidates = db.releves.filter((r) => r.pompeId === pompeId && r.stationId === stationId && r.date < date);
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }, [db.releves, pompeId, stationId, date]);

  useEffect(() => {
    if (existing) {
      setIdxOE(existing.indexOuvertureEssence ?? "");
      setIdxCE(existing.indexClotureEssence ?? "");
      setIdxOG(existing.indexOuvertureGasoil ?? "");
      setIdxCG(existing.indexClotureGasoil ?? "");
    } else if (previousReleve) {
      // Auto-report : l'ouverture du jour reprend la clôture du relevé précédent.
      setIdxOE(previousReleve.indexClotureEssence ?? "");
      setIdxCE("");
      setIdxOG(previousReleve.indexClotureGasoil ?? "");
      setIdxCG("");
    } else {
      setIdxOE(""); setIdxCE(""); setIdxOG(""); setIdxCG("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, pompeId, date]);

  const ve = Math.max(0, num(idxCE) - num(idxOE));
  const vg = Math.max(0, num(idxCG) - num(idxOG));
  const cumul = sumReleve(db.releves, stationId, date);
  const [err, setErr] = useState("");
  const pompe = db.pompes.find((p) => p.id === pompeId);
  const showEssence = pompeHas(pompe, "essence");
  const showGasoil = pompeHas(pompe, "gasoil");

  const save = () => {
    setErr("");
    // Verrouillage défense-en-profondeur : un gérant écrit toujours sur SA station,
    // même si l'état local a été altéré (le sélecteur est désactivé côté UI, mais on
    // ne fait pas confiance qu'à ça).
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId || !pompeId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    if (showEssence && idxOE !== "" && idxCE !== "" && num(idxCE) < num(idxOE)) { setErr("L'index de clôture essence est inférieur à l'index d'ouverture — vérifiez la saisie (compteur remis à zéro ?)."); return; }
    if (showGasoil && idxOG !== "" && idxCG !== "" && num(idxCG) < num(idxOG)) { setErr("L'index de clôture gasoil est inférieur à l'index d'ouverture — vérifiez la saisie."); return; }
    // Une pompe qui ne dispense pas un carburant n'enregistre aucune valeur pour celui-ci,
    // même si un ancien champ traînait en mémoire.
    const row = {
      id: existing?.id || uid(), stationId: effStationId, pompeId, date,
      indexOuvertureEssence: showEssence ? idxOE : "", indexClotureEssence: showEssence ? idxCE : "",
      indexOuvertureGasoil: showGasoil ? idxOG : "", indexClotureGasoil: showGasoil ? idxCG : "",
    };
    let next = { ...db, releves: existing ? db.releves.map((r) => (r.id === existing.id ? row : r)) : [...db.releves, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "releve", action: existing ? "modification" : "création", before: existing ? { indexClotureEssence: existing.indexClotureEssence, indexClotureGasoil: existing.indexClotureGasoil } : null, after: { date, pompeId, indexClotureEssence: idxCE, indexClotureGasoil: idxCG } });
    setDb(next);
  };

  const removeRow = (r) => {
    let next = { ...db, releves: db.releves.filter((x) => x.id !== r.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: r.stationId, entity: "releve", action: "suppression", before: { date: r.date, pompeId: r.pompeId } });
    setDb(next);
  };

  const dayRows = db.releves.filter((r) => r.stationId === stationId && r.date === date);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Relevé Pompes</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Une ligne = une pompe pour un jour. Ventes calculées automatiquement à partir des index.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
          <Field label="Pompe"><PompeSelect pompes={db.pompes} stationId={stationId} value={pompeId} onChange={setPompeId} /></Field>
          <div className="flex items-end">{existing && <Pill tone="teal">Relevé existant — modification</Pill>}</div>
        </div>

        <div className={`grid gap-4 mt-4 ${showEssence && showGasoil ? "sm:grid-cols-2" : ""}`}>
          {showEssence && (
            <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
              <p className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: C.amber }}><Droplet size={13} /> Essence</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Index ouverture" hint={!existing && previousReleve ? "Repris de la clôture précédente" : undefined}><NumberInput value={idxOE} onChange={(e) => setIdxOE(e.target.value)} /></Field>
                <Field label="Index clôture"><NumberInput value={idxCE} onChange={(e) => setIdxCE(e.target.value)} /></Field>
              </div>
              <div className="mt-2"><GaugeNumber value={fmtVol(ve)} tone="amber" /></div>
            </div>
          )}
          {showGasoil && (
            <div className="rounded-md p-3" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
              <p className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: C.teal }}><Droplet size={13} /> Gasoil</p>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Index ouverture" hint={!existing && previousReleve ? "Repris de la clôture précédente" : undefined}><NumberInput value={idxOG} onChange={(e) => setIdxOG(e.target.value)} /></Field>
                <Field label="Index clôture"><NumberInput value={idxCG} onChange={(e) => setIdxCG(e.target.value)} /></Field>
              </div>
              <div className="mt-2"><GaugeNumber value={fmtVol(vg)} tone="teal" /></div>
            </div>
          )}
          {!showEssence && !showGasoil && pompeId && (
            <p className="text-sm" style={{ color: C.textFaint }}>Cette pompe n'a aucun produit configuré — vérifiez sa fiche dans l'onglet Pompes.</p>
          )}
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Vente totale pompe</span>
            <GaugeNumber value={fmtVol(ve + vg)} size="lg" />
          </div>
          <Button onClick={save} disabled={!stationId || !pompeId}><CheckCircle2 size={16} /> Enregistrer le relevé</Button>
        </div>
        {err && (
          <p className="text-xs flex items-center gap-1.5 mt-2" style={{ color: C.danger }}>
            <AlertTriangle size={13} /> {err}
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-sm">Relevés du {fmtDateLong(date)}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: C.textMuted }}>Cumul station/jour</span>
            <GaugeNumber value={fmtVol(cumul.total)} tone="amber" />
          </div>
        </div>
        {dayRows.length === 0 ? (
          <p className="text-sm" style={{ color: C.textFaint }}>Aucun relevé saisi pour cette station ce jour.</p>
        ) : (
          <div className="overflow-x-auto smi-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Pompe</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Essence</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Gasoil</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {dayRows.map((r) => {
                  const rve = Math.max(0, num(r.indexClotureEssence) - num(r.indexOuvertureEssence));
                  const rvg = Math.max(0, num(r.indexClotureGasoil) - num(r.indexOuvertureGasoil));
                  return (
                    <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-1.5 font-semibold">{db.pompes.find((p) => p.id === r.pompeId)?.nom || "—"}</td>
                      <td className="py-1.5 text-right smi-mono">{fmtVol(rve)}</td>
                      <td className="py-1.5 text-right smi-mono">{fmtVol(rvg)}</td>
                      <td className="py-1.5 text-right smi-mono font-semibold">{fmtVol(rve + rvg)}</td>
                      <td className="py-1.5 text-right"><Button variant="danger" onClick={() => removeRow(r)}><Trash2 size={12} /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- Ventes view ------------------------------ */

function VentesView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());
  const v = computeVente(db.releves, db.ventes, stationId, date);
  const [prixEssence, setPrixEssence] = useState("");
  const [prixGasoil, setPrixGasoil] = useState("");
  const [err, setErr] = useState("");
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  useEffect(() => {
    setPrixEssence(v.record ? v.record.prixEssence : "");
    setPrixGasoil(v.record ? v.record.prixGasoil : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, date]);

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = { id: v.record?.id || uid(), stationId: effStationId, date, prixEssence, prixGasoil };
    let next = { ...db, ventes: v.record ? db.ventes.map((x) => (x.id === v.record.id ? row : x)) : [...db.ventes, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "vente", action: v.record ? "modification" : "création", after: { date, prixEssence, prixGasoil } });
    setDb(next);
  };

  const preview = computeVente(db.releves, [...db.ventes.filter((x) => x.id !== v.record?.id), { stationId, date, prixEssence, prixGasoil }], stationId, date);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Ventes</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Volumes agrégés automatiquement depuis le Relevé Pompes. Le prix unitaire fixe le chiffre d'affaires du jour.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.amber }}>Essence</p>
            <p className="text-xs mb-1" style={{ color: C.textMuted }}>Volume (auto)</p>
            <GaugeNumber value={fmtVol(preview.essence)} tone="amber" />
            <div className="mt-2"><Field label={`Prix unitaire (${devise}/L)`}><NumberInput value={prixEssence} onChange={(e) => setPrixEssence(e.target.value)} /></Field></div>
            <p className="text-xs mt-2" style={{ color: C.textMuted }}>Montant : <span className="smi-mono font-semibold" style={{ color: C.text }}>{fmtMontant(preview.montantEssence, devise)}</span></p>
          </div>
          <div className="rounded-md p-3" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: C.teal }}>Gasoil</p>
            <p className="text-xs mb-1" style={{ color: C.textMuted }}>Volume (auto)</p>
            <GaugeNumber value={fmtVol(preview.gasoil)} tone="teal" />
            <div className="mt-2"><Field label={`Prix unitaire (${devise}/L)`}><NumberInput value={prixGasoil} onChange={(e) => setPrixGasoil(e.target.value)} /></Field></div>
            <p className="text-xs mt-2" style={{ color: C.textMuted }}>Montant : <span className="smi-mono font-semibold" style={{ color: C.text }}>{fmtMontant(preview.montantGasoil, devise)}</span></p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div>
            <span className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Chiffre d'affaires du jour</span>
            <div className="mt-1"><GaugeNumber value={fmtMontant(preview.ca, devise)} size="lg" /></div>
          </div>
          <Button onClick={save} disabled={!stationId}><CheckCircle2 size={16} /> Enregistrer le prix</Button>
        </div>
        {err && (
          <p className="text-xs flex items-center gap-1.5 mt-2" style={{ color: C.danger }}>
            <AlertTriangle size={13} /> {err}
          </p>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- Stock view ------------------------------- */

function StockView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(profile.stationId || db.stations[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const s = computeStock(db.releves, db.stocks, stationId, date);
  const prevClose = latestBefore(db.stocks, stationId, date);
  const prevComputed = prevClose ? computeStock(db.releves, db.stocks, stationId, prevClose.date) : null;

  const [ouvE, setOuvE] = useState("");
  const [ouvG, setOuvG] = useState("");
  const [livE, setLivE] = useState("");
  const [livG, setLivG] = useState("");
  const [physE, setPhysE] = useState("");
  const [physG, setPhysG] = useState("");

  useEffect(() => {
    if (s.record) {
      setOuvE(s.record.stockOuvertureEssence ?? ""); setOuvG(s.record.stockOuvertureGasoil ?? "");
      setLivE(s.record.livraisonEssence ?? ""); setLivG(s.record.livraisonGasoil ?? "");
      setPhysE(s.record.stockPhysiqueEssence ?? ""); setPhysG(s.record.stockPhysiqueGasoil ?? "");
    } else {
      // Le stock d'ouverture du jour reprend le stock PHYSIQUE constaté la veille (pas le
      // stock théorique calculé) — pour que le comptage réel serve de référence d'un jour
      // sur l'autre, sans laisser un écart non constaté se perpétuer silencieusement. À
      // défaut de comptage physique la veille, on retombe sur le stock de clôture calculé.
      const ouvertureEssence = (prevClose?.stockPhysiqueEssence !== undefined && prevClose?.stockPhysiqueEssence !== "")
        ? String(prevClose.stockPhysiqueEssence) : (prevComputed ? String(prevComputed.stockClotureEssence) : "");
      const ouvertureGasoil = (prevClose?.stockPhysiqueGasoil !== undefined && prevClose?.stockPhysiqueGasoil !== "")
        ? String(prevClose.stockPhysiqueGasoil) : (prevComputed ? String(prevComputed.stockClotureGasoil) : "");
      setOuvE(ouvertureEssence);
      setOuvG(ouvertureGasoil);
      setLivE(""); setLivG("");
      // Comptage physique du jour pré-rempli avec ce même point de départ — à corriger
      // selon le comptage réel une fois les livraisons et ventes du jour prises en compte.
      setPhysE(ouvertureEssence);
      setPhysG(ouvertureGasoil);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, date]);

  const live = computeStock(db.releves, [...db.stocks.filter((x) => x.id !== s.record?.id), { stationId, date, stockOuvertureEssence: ouvE, stockOuvertureGasoil: ouvG, livraisonEssence: livE, livraisonGasoil: livG, stockPhysiqueEssence: physE, stockPhysiqueGasoil: physG }], stationId, date);
  const [err, setErr] = useState("");

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = { id: s.record?.id || uid(), stationId: effStationId, date, stockOuvertureEssence: ouvE, stockOuvertureGasoil: ouvG, livraisonEssence: livE, livraisonGasoil: livG, stockPhysiqueEssence: physE, stockPhysiqueGasoil: physG };
    let next = { ...db, stocks: s.record ? db.stocks.map((x) => (x.id === s.record.id ? row : x)) : [...db.stocks, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "stock", action: s.record ? "modification" : "création", before: s.record ? { stockPhysiqueEssence: s.record.stockPhysiqueEssence, stockPhysiqueGasoil: s.record.stockPhysiqueGasoil } : null, after: { date, stockPhysiqueEssence: physE, stockPhysiqueGasoil: physG } });
    setDb(next);
  };

  const fmtEcart = (e) => (e === null ? "—" : `${e > 0 ? "+" : ""}${e.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} L`);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Contrôle Stock</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Stock de clôture calculé automatiquement ; le comptage physique du jour devient le stock d'ouverture du lendemain.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        {[{ key: "Essence", tone: "amber", ouv: ouvE, setOuv: setOuvE, liv: livE, setLiv: setLivE, phys: physE, setPhys: setPhysE, close: live.stockClotureEssence, ecart: live.ecartEssence, vente: live.vol.essence },
          { key: "Gasoil", tone: "teal", ouv: ouvG, setOuv: setOuvG, liv: livG, setLiv: setLivG, phys: physG, setPhys: setPhysG, close: live.stockClotureGasoil, ecart: live.ecartGasoil, vente: live.vol.gasoil }
        ].map((r) => (
          <div key={r.key} className="rounded-md p-3 mb-3" style={{ background: r.tone === "amber" ? C.amberSoft : C.tealSoft, border: `1px solid ${r.tone === "amber" ? C.amberDim : C.teal + "55"}` }}>
            <p className="text-xs font-semibold uppercase mb-2" style={{ color: r.tone === "amber" ? C.amber : C.teal }}>{r.key}</p>
            <div className="grid sm:grid-cols-4 gap-2 items-end">
              <Field label="Stock ouverture (L)" hint="Repris du stock physique constaté la veille"><NumberInput value={r.ouv} onChange={(e) => r.setOuv(e.target.value)} /></Field>
              <Field label="Livraison (L)"><NumberInput value={r.liv} onChange={(e) => r.setLiv(e.target.value)} /></Field>
              <Field label="Ventes du jour (auto)"><div className="pt-1"><GaugeNumber value={fmtVol(r.vente)} tone={r.tone} /></div></Field>
              <Field label="Stock clôture (auto)"><div className="pt-1"><GaugeNumber value={fmtVol(r.close)} tone={r.tone} /></div></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <Field label="Comptage physique (L)" hint="Deviendra le stock d'ouverture du lendemain — à corriger selon le comptage réel du jour"><NumberInput value={r.phys} onChange={(e) => r.setPhys(e.target.value)} /></Field>
              <Field label="Écart constaté (auto)">
                <div className="pt-1"><GaugeNumber value={fmtEcart(r.ecart)} tone={r.ecart !== null && Math.abs(r.ecart) > 0.001 ? "danger" : "muted"} /></div>
              </Field>
            </div>
          </div>
        ))}

        <div className="flex items-center justify-end gap-3">
          {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <Button onClick={save} disabled={!stationId}><CheckCircle2 size={16} /> Enregistrer le contrôle</Button>
        </div>
      </Card>
    </div>
  );
}

/* -------------------------------- Caisse view ------------------------------- */

function CaisseView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(profile.stationId || db.stations[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const c = computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, stationId, date, db.depenses, db.reglementsClients);

  const [precedente, setPrecedente] = useState("");
  const [duJour, setDuJour] = useState("");
  const [paiementMarchand, setPaiementMarchand] = useState("");

  useEffect(() => {
    if (c.record) {
      setPrecedente(c.record.caissePrecedente ?? ""); setDuJour(c.record.caisseDuJour ?? "");
      setPaiementMarchand(c.record.totalPaiementMarchand ?? "");
    } else {
      // Saisie manuelle obligatoire : le jour où le gérant verse tout l'argent déclaré,
      // il met 0 ici — on ne présume plus que la caisse précédente se reporte
      // automatiquement, puisque ça dépend de ce qui a réellement été laissé en caisse.
      setPrecedente("");
      // Pré-rempli avec le CA du jour (calculé depuis les ventes) — modifiable si le
      // comptage réel du gérant diffère.
      setDuJour(c.ca ? String(c.ca) : "");
      setPaiementMarchand("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, date]);

  const live = computeCaisse(db.releves, db.ventes, [...db.caisses.filter((x) => x.id !== c.record?.id), { stationId, date, caissePrecedente: precedente, caisseDuJour: duJour, totalPaiementMarchand: paiementMarchand }], db.bons, db.versements, stationId, date, db.depenses, db.reglementsClients);
  const [err, setErr] = useState("");
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = { id: c.record?.id || uid(), stationId: effStationId, date, caissePrecedente: precedente, caisseDuJour: duJour, totalPaiementMarchand: paiementMarchand };
    let next = { ...db, caisses: c.record ? db.caisses.map((x) => (x.id === c.record.id ? row : x)) : [...db.caisses, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "caisse", action: c.record ? "modification" : "création", before: c.record ? { caisseDuJour: c.record.caisseDuJour } : null, after: { date, caisseDuJour: duJour } });
    setDb(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Caisse</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Caisse attendue calculée à partir du chiffre d'affaires du jour et des mouvements.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={`Caisse précédente (${devise})`} hint="À saisir manuellement — mettez 0 si tout a été versé la veille"><NumberInput value={precedente} onChange={(e) => setPrecedente(e.target.value)} /></Field>
          <Field label={`Caisse du jour — comptage (${devise})`} hint={!c.record ? "Pré-rempli avec le CA du jour, à corriger selon le comptage réel" : undefined}><NumberInput value={duJour} onChange={(e) => setDuJour(e.target.value)} /></Field>
          <Field label={`Paiement marchand (${devise})`} hint="Mobile money, carte, tout paiement non encaissé en espèces"><NumberInput value={paiementMarchand} onChange={(e) => setPaiementMarchand(e.target.value)} /></Field>
        </div>

        {/* Bons et Versements ne se saisissent plus ici — ils viennent automatiquement des
            onglets dédiés Bons et Versement, pour éviter toute double saisie sur le terrain. */}
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Total Bons du jour (auto)</p>
            <GaugeNumber value={fmtMontant(live.totalBon, devise)} />
            <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Repris automatiquement de l'onglet Bons.</p>
          </div>
          <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Total Versements du jour (auto)</p>
            <GaugeNumber value={fmtMontant(live.totalVersement, devise)} />
            <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Repris automatiquement de l'onglet Versement — déduit de la caisse attendue. Mettez 0 dans « Caisse précédente » le jour où tout a été versé.</p>
          </div>
          {live.totalEncaissements > 0 && (
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Règlements clients encaissés (auto)</p>
              <GaugeNumber value={fmtMontant(live.totalEncaissements, devise)} />
              <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Repris de l'onglet Clients à crédit — ajoutés à la caisse attendue.</p>
            </div>
          )}
          {live.totalDepenses > 0 && (
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Dépenses payées par la caisse (auto)</p>
              <GaugeNumber value={fmtMontant(live.totalDepenses, devise)} />
              <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Reprises de l'onglet Dépenses — déduites de la caisse attendue.</p>
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>CA du jour (auto)</p>
            <GaugeNumber value={fmtMontant(live.ca, devise)} />
          </div>
          <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
            <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Caisse attendue (auto)</p>
            <GaugeNumber value={fmtMontant(live.caisseAttendue, devise)} tone="amber" size="lg" />
          </div>
          <div className="rounded-md p-3" style={{ background: live.ecart !== null && Math.abs(live.ecart) > 1 ? C.dangerSoft : C.panelAlt, border: `1px solid ${live.ecart !== null && Math.abs(live.ecart) > 1 ? C.danger : C.border}` }}>
            <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Écart vs comptage (info)</p>
            <GaugeNumber value={live.ecart === null ? "—" : fmtMontant(live.ecart, devise)} tone={live.ecart !== null && Math.abs(live.ecart) > 1 ? "danger" : "muted"} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <Button onClick={save} disabled={!stationId}><CheckCircle2 size={16} /> Enregistrer la caisse</Button>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------ Inspection view ----------------------------- */

/* ------------------------------- Réception view ----------------------------- */

/* --------------------------- Mouvements Pompiste ----------------------------- */

function MouvementsPompisteView({ db, setDb, profile }) {
  const isPompiste = profile.role === "pompiste";
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(profile.stationId || db.stations[0]?.id || "");
  const [pompeId, setPompeId] = useState(isPompiste ? profile.pompeId : "");
  const [date, setDate] = useState(todayISO());
  const [pompisteName, setPompisteName] = useState(isPompiste ? profile.name : "");
  const m = computeMouvementPompiste(db.releves, db.ventes, db.mouvements, stationId, pompeId, date);
  const [decaissements, setDecaissements] = useState([]);
  const [bons, setBons] = useState([]);
  const [err, setErr] = useState("");
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  // Gestion des comptes pompistes (créés par le gérant uniquement)
  const [acctPompeId, setAcctPompeId] = useState("");
  const [acctNom, setAcctNom] = useState("");
  const [acctPassword, setAcctPassword] = useState("");
  const [acctErr, setAcctErr] = useState("");
  const [resettingId, setResettingId] = useState(null);
  const [newPassInput, setNewPassInput] = useState("");
  const [resetErr, setResetErr] = useState("");

  useEffect(() => {
    if (m.record) {
      setDecaissements(m.decaissements || []);
      setBons(m.bons || []);
      setPompisteName(m.record.pompisteName ?? (isPompiste ? profile.name : ""));
    } else {
      setDecaissements([]); setBons([]);
      if (isPompiste) setPompisteName(profile.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, pompeId, date]);

  const addDecaissement = (type) => setDecaissements((p) => [...p, { id: uid(), type, montant: "" }]);
  const updateDecaissement = (id, montant) => setDecaissements((p) => p.map((d) => (d.id === id ? { ...d, montant } : d)));
  const removeDecaissement = (id) => setDecaissements((p) => p.filter((d) => d.id !== id));

  const addBonLine = () => setBons((p) => [...p, { id: uid(), montant: "", libelle: "" }]);
  const updateBonLine = (id, field, val) => setBons((p) => p.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  const removeBonLine = (id) => setBons((p) => p.filter((b) => b.id !== id));

  const live = computeMouvementPompiste(db.releves, db.ventes, [...db.mouvements.filter((x) => x.id !== m.record?.id), { stationId, pompeId, date, decaissements, bons }], stationId, pompeId, date);

  const save = () => {
    setErr("");
    const effStationId = isPompiste ? profile.stationId : stationId;
    const effPompeId = isPompiste ? profile.pompeId : pompeId;
    if (!effStationId || !effPompeId) { setErr("Choisissez une station et une pompe."); return; }
    if (!pompisteName.trim()) { setErr("Indiquez le nom du pompiste."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    if (bons.some((b) => num(b.montant) > 0 && !b.libelle?.trim())) { setErr("Chaque bon doit avoir un libellé."); return; }
    const row = { id: m.record?.id || uid(), stationId: effStationId, pompeId: effPompeId, date, pompisteName: pompisteName.trim(), decaissements, bons };
    let next = { ...db, mouvements: m.record ? db.mouvements.map((x) => (x.id === m.record.id ? row : x)) : [...db.mouvements, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "mouvement", action: m.record ? "modification" : "création", after: { date, pompisteName: row.pompisteName, saCaisse: computeMouvementPompiste(db.releves, db.ventes, [...db.mouvements.filter((x) => x.id !== m.record?.id), row], effStationId, effPompeId, date).saCaisse } });
    setDb(next);
  };

  const createAccount = () => {
    setAcctErr("");
    if (!acctPompeId) { setAcctErr("Choisissez une pompe."); return; }
    if (!acctNom.trim()) { setAcctErr("Indiquez le nom du pompiste."); return; }
    if (acctPassword.trim().length < 4) { setAcctErr("Le mot de passe doit faire au moins 4 caractères."); return; }
    const row = { id: uid(), stationId: profile.stationId, pompeId: acctPompeId, nom: acctNom.trim(), passwordHash: hashPin(acctPassword.trim()) };
    let next = { ...db, pompistes: [...(db.pompistes || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: profile.stationId, entity: "pompiste_compte", action: "création", after: { nom: row.nom, pompe: db.pompes.find((p) => p.id === acctPompeId)?.nom } });
    setDb(next);
    setAcctPompeId(""); setAcctNom(""); setAcctPassword("");
  };

  const removeAccount = (acct) => {
    if (!confirm(`Supprimer le compte de ${acct.nom} ?`)) return;
    let next = { ...db, pompistes: db.pompistes.filter((p) => p.id !== acct.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: acct.stationId, entity: "pompiste_compte", action: "suppression", before: { nom: acct.nom } });
    setDb(next);
  };

  // Réinitialise uniquement le mot de passe d'un compte pompiste — nom et pompe assignée
  // restent inchangés, aucune autre donnée n'est touchée.
  const resetPompistePassword = (acct) => {
    setResetErr("");
    if (newPassInput.trim().length < 4) { setResetErr("Le mot de passe doit faire au moins 4 caractères."); return; }
    const row = { ...acct, passwordHash: hashPin(newPassInput.trim()) };
    let next = { ...db, pompistes: db.pompistes.map((p) => (p.id === acct.id ? row : p)) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: acct.stationId, entity: "pompiste_compte", action: "modification", after: { nom: acct.nom, note: "mot de passe réinitialisé" } });
    setDb(next);
    setResettingId(null);
    setNewPassInput("");
  };

  const pompe = db.pompes.find((p) => p.id === (isPompiste ? profile.pompeId : pompeId));
  const stationAccounts = isGerant ? (db.pompistes || []).filter((p) => p.stationId === profile.stationId) : [];

  const history = db.mouvements
    .filter((x) => (isPompiste ? x.pompeId === profile.pompeId : (!stationId || x.stationId === stationId)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Mouvements Pompiste</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Caisse individuelle d'un pompiste, calculée à partir des ventes de sa pompe.</p>
      </div>

      {isGerant && (
        <Card className="max-w-md">
          <p className="font-semibold text-sm mb-3">Comptes pompistes de ma station</p>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <Field label="Pompe"><PompeSelect pompes={db.pompes} stationId={profile.stationId} value={acctPompeId} onChange={setAcctPompeId} /></Field>
            <Field label="Nom du pompiste">
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={acctNom} onChange={(e) => setAcctNom(e.target.value)} placeholder="ex : Ibrahima Kaba" />
            </Field>
          </div>
          <Field label="Mot de passe (4 caractères minimum)">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" value={acctPassword} onChange={(e) => setAcctPassword(e.target.value)} placeholder="••••" />
          </Field>
          {acctErr && <p className="text-xs flex items-center gap-1.5 mt-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {acctErr}</p>}
          <div className="flex justify-end mt-3"><Button onClick={createAccount}><Plus size={15} /> Créer le compte</Button></div>

          {stationAccounts.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              {stationAccounts.map((acct) => (
                <div key={acct.id} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span>{acct.nom} — <span style={{ color: C.textFaint }}>{db.pompes.find((p) => p.id === acct.pompeId)?.nom || "—"}</span></span>
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setResettingId(resettingId === acct.id ? null : acct.id); setResetErr(""); setNewPassInput(""); }} className="smi-btn" style={{ color: C.teal }}><Lock size={13} /></button>
                      <button onClick={() => removeAccount(acct)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={13} /></button>
                    </div>
                  </div>
                  {resettingId === acct.id && (
                    <div className="rounded-md p-2 flex items-center gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                      <input className="smi-input flex-1 rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" value={newPassInput} onChange={(e) => setNewPassInput(e.target.value)} placeholder="Nouveau mot de passe" />
                      <Button onClick={() => resetPompistePassword(acct)}>Valider</Button>
                    </div>
                  )}
                  {resettingId === acct.id && resetErr && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {resetErr}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card className="max-w-md">
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isPompiste} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Pompe gérée"><PompeSelect pompes={db.pompes} stationId={stationId} value={pompeId} onChange={setPompeId} disabled={isPompiste} /></Field>
          <Field label="Nom du pompiste">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={pompisteName} onChange={(e) => setPompisteName(e.target.value)} disabled={isPompiste} placeholder="ex : Ibrahima Kaba" />
          </Field>
        </div>

        <div className="rounded-md p-3 mb-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Relevé de la pompe {pompe ? `« ${pompe.nom} »` : ""} — {fmtDateLong(date)}</p>
          <div className={`grid gap-2 text-sm mt-1 ${pompeHas(pompe, "essence") && pompeHas(pompe, "gasoil") ? "grid-cols-2" : "grid-cols-1"}`}>
            {pompeHas(pompe, "essence") && <span>Essence : <span className="smi-mono">{fmtVol(live.vol.essence)}</span></span>}
            {pompeHas(pompe, "gasoil") && <span>Gasoil : <span className="smi-mono">{fmtVol(live.vol.gasoil)}</span></span>}
          </div>
          <p className="text-xs mt-2" style={{ color: C.textFaint }}>Valeur de la vente : <span className="smi-mono font-semibold" style={{ color: C.text }}>{fmtMontant(live.valeurVente, devise)}</span></p>
        </div>

        {/* Décaissements — plusieurs lignes possibles, le total se recalcule automatiquement */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Décaissements</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => addDecaissement("espece")}><Plus size={14} /> Espèce</Button>
              <Button variant="ghost" onClick={() => addDecaissement("mobile")}><Plus size={14} /> Mobile</Button>
            </div>
          </div>
          {decaissements.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Aucun décaissement.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {decaissements.map((d) => (
                <div key={d.id} className="rounded-md p-2 flex items-center gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <Pill tone={d.type === "espece" ? "amber" : "teal"}>{d.type === "espece" ? "Espèce" : "Mobile"}</Pill>
                  <input className="smi-input flex-1 rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder={`Montant (${devise})`} value={d.montant} onChange={(e) => updateDecaissement(d.id, e.target.value)} />
                  <button onClick={() => removeDecaissement(d.id)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-right mt-1.5" style={{ color: C.textFaint }}>Total espèce : <span className="smi-mono">{fmtMontant(live.decaissementEspece, devise)}</span> · Total mobile : <span className="smi-mono">{fmtMontant(live.decaissementMobile, devise)}</span></p>
        </div>

        {/* Bons — plusieurs lignes possibles, le total se recalcule automatiquement */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Bons</p>
            <Button variant="ghost" onClick={addBonLine}><Plus size={14} /> Ajouter un bon</Button>
          </div>
          {bons.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Aucun bon.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {bons.map((b) => (
                <div key={b.id} className="rounded-md p-2 flex items-center gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <input className="smi-input flex-1 rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} placeholder="Libellé" value={b.libelle} onChange={(e) => updateBonLine(b.id, "libelle", e.target.value)} />
                  <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text, width: 120 }} type="number" placeholder={`Montant (${devise})`} value={b.montant} onChange={(e) => updateBonLine(b.id, "montant", e.target.value)} />
                  <button onClick={() => removeBonLine(b.id)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-right mt-1.5" style={{ color: C.textFaint }}>Total bons : <span className="smi-mono">{fmtMontant(live.totalBon, devise)}</span></p>
        </div>

        <div className="rounded-md p-3 mt-4" style={{ background: Math.abs(live.saCaisse) < 1 ? "#1E3A24" : C.dangerSoft, border: `1px solid ${Math.abs(live.saCaisse) < 1 ? C.success : C.danger}` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: Math.abs(live.saCaisse) < 1 ? C.success : C.danger }}>Sa caisse</p>
          <GaugeNumber value={fmtMontant(live.saCaisse, devise)} tone={Math.abs(live.saCaisse) < 1 ? "success" : "danger"} size="lg" />
          <p className="text-xs mt-1" style={{ color: Math.abs(live.saCaisse) < 1 ? C.success : C.danger }}>
            {Math.abs(live.saCaisse) < 1 ? "Pas de manquant." : live.saCaisse > 0 ? `Excédent de ${fmtMontant(live.saCaisse, devise)}.` : `Manquant de ${fmtMontant(Math.abs(live.saCaisse), devise)}.`}
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button>
        </div>
      </Card>

      <Card>
        <p className="font-semibold text-sm mb-3">Historique</p>
        {history.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucun mouvement enregistré" hint="Les mouvements de caisse par pompiste apparaîtront ici." />
        ) : (
          <div className="overflow-x-auto smi-scroll">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1" style={{ color: C.textMuted }}>Date</th>
                  {!isPompiste && <th className="text-left py-1" style={{ color: C.textMuted }}>Pompe</th>}
                  <th className="text-left py-1" style={{ color: C.textMuted }}>Pompiste</th>
                  <th className="text-right py-1" style={{ color: C.textMuted }}>Sa caisse</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const st = db.stations.find((s) => s.id === h.stationId);
                  const c = computeMouvementPompiste(db.releves, db.ventes, db.mouvements, h.stationId, h.pompeId, h.date);
                  const ok = Math.abs(c.saCaisse) < 1;
                  return (
                    <tr key={h.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-1">{fmtDateLong(h.date)}</td>
                      {!isPompiste && <td className="py-1">{db.pompes.find((p) => p.id === h.pompeId)?.nom || "—"}</td>}
                      <td className="py-1">{h.pompisteName}</td>
                      <td className="py-1 text-right smi-mono font-semibold" style={{ color: ok ? C.success : C.danger }}>{fmtMontant(c.saCaisse, st?.devise || "GNF")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* -------------------------------- Versement view ----------------------------- */

function VersementView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());
  const [banqueNom, setBanqueNom] = useState("");
  const [banqueMontant, setBanqueMontant] = useState("");
  const [banquePhoto, setBanquePhoto] = useState(null);
  const [recuNumero, setRecuNumero] = useState("");
  const [paiementMarchandMontant, setPaiementMarchandMontant] = useState("");
  const [autreMontant, setAutreMontant] = useState("");
  const [autreLibelle, setAutreLibelle] = useState("");
  const [err, setErr] = useState("");
  const [expandedDate, setExpandedDate] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  const total = num(banqueMontant) + num(paiementMarchandMontant) + num(autreMontant);

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setBanquePhoto(dataUrl);
    } catch {
      setErr("Impossible de lire la photo.");
    }
  };

  const reset = () => {
    setBanqueNom(""); setBanqueMontant(""); setBanquePhoto(null); setRecuNumero("");
    setPaiementMarchandMontant(""); setAutreMontant(""); setAutreLibelle(""); setEditingId(null);
  };

  // Charge un versement existant dans le formulaire pour le corriger — plus besoin de
  // supprimer puis ressaisir une saisie mal enregistrée.
  const startEdit = (v) => {
    setErr("");
    setStationId(v.stationId);
    setDate(v.date);
    setBanqueNom(v.banqueNom || "");
    setBanqueMontant(v.banqueMontant ?? "");
    setBanquePhoto(v.banquePhoto || null);
    setRecuNumero(v.recuNumero || "");
    setPaiementMarchandMontant(v.paiementMarchandMontant ?? "");
    setAutreMontant(v.autreMontant ?? "");
    setAutreLibelle(v.autreLibelle || "");
    setEditingId(v.id);
  };

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) { setErr("Choisissez une station."); return; }
    if (total <= 0) { setErr("Indiquez au moins un montant."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const existing = editingId ? db.versements.find((x) => x.id === editingId) : null;
    const row = { id: editingId || uid(), stationId: effStationId, date, banqueNom, banqueMontant, banquePhoto, recuNumero, paiementMarchandMontant, autreMontant, autreLibelle, timestamp: existing?.timestamp || new Date().toISOString() };
    let next = { ...db, versements: editingId ? db.versements.map((x) => (x.id === editingId ? row : x)) : [...db.versements, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "versement", action: editingId ? "modification" : "création", before: existing ? { date: existing.date } : null, after: { date, banqueNom, total } });
    setDb(next);
    reset();
    setExpandedDate(date);
  };

  const removeVersement = (v) => {
    if (!confirm("Supprimer ce versement ?")) return;
    let next = { ...db, versements: db.versements.filter((x) => x.id !== v.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: v.stationId, entity: "versement", action: "suppression", before: { date: v.date } });
    setDb(next);
    if (editingId === v.id) reset();
  };

  const history = db.versements
    .filter((v) => (isGerant ? v.stationId === profile.stationId : (!stationId || v.stationId === stationId)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.timestamp || "").localeCompare(a.timestamp || "")));

  // Un même jour peut cumuler plusieurs versements (bancaire le matin, marchand le soir...)
  // — on regroupe donc l'historique par date pour afficher un cumul journalier clair,
  // avec le détail de chaque saisie disponible en dépliant la ligne.
  const grouped = useMemo(() => {
    const map = new Map();
    history.forEach((v) => {
      if (!map.has(v.date)) map.set(v.date, []);
      map.get(v.date).push(v);
    });
    return Array.from(map.entries()).map(([d, entries]) => ({
      date: d,
      entries,
      total: entries.reduce((a, e) => a + versementTotal(e), 0),
      station: db.stations.find((s) => s.id === entries[0].stationId),
    }));
  }, [history, db.stations]);

  // Cumul automatique sur toute la période affichée — recalculé dès qu'un versement est
  // ajouté ou supprimé, puisqu'il est dérivé directement de l'historique filtré.
  const cumulTotal = history.reduce((a, v) => a + versementTotal(v), 0);
  const cumulBancaire = history.reduce((a, v) => a + num(v.banqueMontant), 0);
  const cumulMarchand = history.reduce((a, v) => a + num(v.paiementMarchandMontant), 0);
  const cumulAutre = history.reduce((a, v) => a + num(v.autreMontant), 0);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const exportPdf = () => window.print();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl flex items-center gap-2"><Landmark size={22} /> Versement</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Enregistrement des dépôts du jour : versement bancaire, paiement marchand, versement au compte du DG.</p>
        </div>
        <Button variant="ghost" onClick={exportPdf} disabled={grouped.length === 0}><Printer size={16} /> Exporter en PDF</Button>
      </div>

      <Card className="max-w-md smi-no-print">
        {editingId && (
          <div className="rounded-md p-2.5 mb-3 flex items-center justify-between gap-2" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
            <span className="text-xs" style={{ color: C.teal }}>Modification d'un versement existant</span>
            <button onClick={reset} className="smi-btn text-xs" style={{ color: C.teal }}>Annuler</button>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        <div className="rounded-md p-3 mb-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <p className="text-xs uppercase font-semibold mb-2" style={{ color: C.textMuted }}>Versement bancaire</p>
          <div className="flex flex-col gap-3">
            <Field label="Nom de la banque">
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={banqueNom} onChange={(e) => setBanqueNom(e.target.value)} placeholder="ex : BNG" />
            </Field>
            <Field label={`Montant (${devise})`}><NumberInput value={banqueMontant} onChange={(e) => setBanqueMontant(e.target.value)} /></Field>
            <Field label="N° de reçu">
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={recuNumero} onChange={(e) => setRecuNumero(e.target.value)} placeholder="ex : REC-004821" />
            </Field>
            <Field label="Capture du reçu">
              <label className="smi-btn flex items-center justify-center gap-2 rounded-md px-3 py-3 text-sm cursor-pointer" style={{ background: C.bgAlt, border: `1px dashed ${C.border}`, color: C.textMuted }}>
                <Camera size={18} />
                {banquePhoto ? "Changer la photo" : "Ajouter une photo (caméra ou galerie)"}
                <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
              </label>
              {banquePhoto && (
                <div className="mt-2">
                  <img src={banquePhoto} alt="Reçu de versement" className="rounded-md cursor-pointer" style={{ maxHeight: 140, border: `1px solid ${C.border}` }} onClick={() => setLightbox(banquePhoto)} />
                </div>
              )}
            </Field>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label={`Paiement marchand (${devise})`}><NumberInput value={paiementMarchandMontant} onChange={(e) => setPaiementMarchandMontant(e.target.value)} /></Field>
          <Field label={`Versement au compte du DG (${devise})`}><NumberInput value={autreMontant} onChange={(e) => setAutreMontant(e.target.value)} /></Field>
          <Field label="Libellé (versement au compte du DG)">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={autreLibelle} onChange={(e) => setAutreLibelle(e.target.value)} placeholder="ex : Remboursement caisse" />
          </Field>
        </div>

        <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Total de cette saisie</p>
          <GaugeNumber value={fmtMontant(total, devise)} tone="amber" size="lg" />
          <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Le cumul du jour (si plusieurs versements) s'affiche dans l'historique ci-dessous.</p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <Button onClick={save}><CheckCircle2 size={16} /> {editingId ? "Mettre à jour" : "Valider"}</Button>
        </div>
      </Card>

      <Card className="smi-print-area">
        <div className="hidden smi-print-only mb-3">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Historique des versements</h1>
          <p style={{ fontSize: 13, color: "#444" }}>{station?.nom || "Toutes stations"}</p>
        </div>
        <p className="font-semibold text-sm mb-3">Historique des versements</p>
        {grouped.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Cumul total</p>
              <GaugeNumber value={fmtMontant(cumulTotal, devise)} tone="amber" />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Cumul bancaire</p>
              <GaugeNumber value={fmtMontant(cumulBancaire, devise)} />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Cumul paiement marchand</p>
              <GaugeNumber value={fmtMontant(cumulMarchand, devise)} />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Cumul versement au compte du DG</p>
              <GaugeNumber value={fmtMontant(cumulAutre, devise)} />
            </div>
          </div>
        )}
        {grouped.length === 0 ? (
          <EmptyState icon={Landmark} title="Aucun versement enregistré" hint="Les versements enregistrés apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-2">
            {grouped.map((g) => {
              const open = expandedDate === g.date;
              const dv = g.station?.devise || "GNF";
              return (
                <div key={g.date} className="rounded-md" style={{ border: `1px solid ${C.border}` }}>
                  <button onClick={() => setExpandedDate(open ? null : g.date)} className="smi-btn w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{fmtDateLong(g.date)}</span>
                      <span className="text-xs" style={{ color: C.textFaint }}>{g.station?.nom || "—"}</span>
                      {g.entries.length > 1 && <Pill tone="amber">{g.entries.length} versements</Pill>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold smi-mono" style={{ color: C.amber }}>{fmtMontant(g.total, dv)}</span>
                      <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.textFaint }} />
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      {g.entries.map((v) => {
                        const vTotal = versementTotal(v);
                        return (
                          <div key={v.id} className="rounded-md p-2.5 flex items-center gap-3 smi-print-photo-row" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                            {v.banquePhoto ? (
                              <img src={v.banquePhoto} alt="" className="rounded-md flex-shrink-0 cursor-pointer smi-print-photo" style={{ width: 40, height: 40, objectFit: "cover", border: `1px solid ${C.border}` }} onClick={() => setLightbox(v.banquePhoto)} />
                            ) : (
                              <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: C.panel, border: `1px solid ${C.border}`, color: C.textFaint }}><Landmark size={16} /></div>
                            )}
                            <div className="flex-1 min-w-0 text-xs flex flex-col gap-0.5" style={{ color: C.textMuted }}>
                              {num(v.banqueMontant) > 0 && <span>Bancaire{v.banqueNom ? ` (${v.banqueNom})` : ""} : <span className="smi-mono" style={{ color: C.text }}>{fmtMontant(v.banqueMontant, dv)}</span></span>}
                              {v.recuNumero && <span>N° de reçu : <span className="smi-mono" style={{ color: C.text }}>{v.recuNumero}</span></span>}
                              {num(v.paiementMarchandMontant) > 0 && <span>Paiement marchand : <span className="smi-mono" style={{ color: C.text }}>{fmtMontant(v.paiementMarchandMontant, dv)}</span></span>}
                              {num(v.autreMontant) > 0 && <span>Versement au compte du DG{v.autreLibelle ? ` (${v.autreLibelle})` : ""} : <span className="smi-mono" style={{ color: C.text }}>{fmtMontant(v.autreMontant, dv)}</span></span>}
                            </div>
                            <span className="text-xs font-semibold smi-mono flex-shrink-0">{fmtMontant(vTotal, dv)}</span>
                            <button onClick={() => startEdit(v)} className="smi-btn flex-shrink-0 smi-no-print" style={{ color: C.teal }}><Pencil size={13} /></button>
                            {!isGerant && <button onClick={() => removeVersement(v)} className="smi-btn flex-shrink-0 smi-no-print" style={{ color: C.danger }}><Trash2 size={13} /></button>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <QrCode value={appUrl} size={64} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
            <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
          </div>
        </div>
      </div>
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

/* ----------------------------------- Bons view -------------------------------- */

// Catégorie déduite automatiquement du libellé déjà saisi (pas de champ séparé à
// remplir) — "citerne" d'un côté, "groupe"/"transport"/"vidange" de l'autre. Les frais de
// route suivent la même catégorie que le bon auquel ils sont rattachés.
function bonCategorie(b) {
  const l = (b.libelle || "").toLowerCase();
  if (l.includes("groupe") || l.includes("transport") || l.includes("vidange")) return "groupe_transport_vidange";
  return "citerne";
}

function BonsView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());
  const [libelle, setLibelle] = useState("");
  const [quantite, setQuantite] = useState("");
  const [prixUnitaire, setPrixUnitaire] = useState("");
  const [fraisRoute, setFraisRoute] = useState("");
  const [clientId, setClientId] = useState("");
  const [produitBon, setProduitBon] = useState("gasoil");
  const [immatriculation, setImmatriculation] = useState("");
  const [numeroBon, setNumeroBon] = useState("");
  const clients = db.clients || [];
  // Vente à crédit : le prix du jour de la station est proposé automatiquement.
  useEffect(() => {
    if (!clientId || prixUnitaire) return;
    const v = findVente(db.ventes, stationId, date) || latestBefore(db.ventes, stationId, date);
    const pr = v ? (produitBon === "essence" ? v.prixEssence : v.prixGasoil) : "";
    if (num(pr) > 0) setPrixUnitaire(String(pr));
  }, [clientId, produitBon, stationId, date]); // eslint-disable-line react-hooks/exhaustive-deps
  const [photo, setPhoto] = useState(null);
  const [err, setErr] = useState("");
  const [expandedDate, setExpandedDate] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  const total = num(quantite) * num(prixUnitaire) + num(fraisRoute);

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setPhoto(dataUrl);
    } catch {
      setErr("Impossible de lire la photo.");
    }
  };

  const reset = () => {
    setLibelle(""); setQuantite(""); setPrixUnitaire(""); setFraisRoute(""); setPhoto(null); setEditingId(null); setClientId(""); setImmatriculation(""); setNumeroBon("");
  };

  // Charge une ligne existante dans le formulaire pour la corriger — plus besoin de
  // supprimer puis ressaisir une saisie mal enregistrée.
  const startEdit = (b) => {
    setErr("");
    setStationId(b.stationId);
    setDate(b.date);
    setLibelle(b.libelle || "");
    setQuantite(b.quantite ?? "");
    setPrixUnitaire(b.prixUnitaire ?? "");
    setFraisRoute(b.fraisRoute ?? "");
    setClientId(b.clientId || "");
    setProduitBon(b.produit || "gasoil");
    setImmatriculation(b.immatriculation || "");
    setNumeroBon(b.numeroBon || "");
    setPhoto(b.photo || null);
    setEditingId(b.id);
  };

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) { setErr("Choisissez une station."); return; }
    const cli = clients.find((c) => c.id === clientId);
    const lib = libelle.trim() || (cli ? `Client ${cli.nom}` : "");
    if (!lib) { setErr("Indiquez un libellé pour ce bon."); return; }
    if (total <= 0) { setErr("Indiquez une quantité et un prix, ou des frais de route."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const existing = editingId ? db.bons.find((b) => b.id === editingId) : null;
    const row = { id: editingId || uid(), stationId: effStationId, date, libelle: lib, quantite, prixUnitaire, fraisRoute, photo, clientId: cli ? cli.id : "", produit: cli ? produitBon : (existing?.produit || ""), immatriculation: immatriculation.trim(), numeroBon: numeroBon.trim(), timestamp: existing?.timestamp || new Date().toISOString() };
    let next = { ...db, bons: editingId ? db.bons.map((b) => (b.id === editingId ? row : b)) : [...db.bons, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "bon", action: editingId ? "modification" : "création", before: existing ? { libelle: existing.libelle, date: existing.date } : null, after: { date, libelle: row.libelle, total } });
    setDb(next);
    reset();
    setExpandedDate(date);
  };

  const removeBon = (b) => {
    if (!confirm("Supprimer ce bon ?")) return;
    let next = { ...db, bons: db.bons.filter((x) => x.id !== b.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: b.stationId, entity: "bon", action: "suppression", before: { date: b.date, libelle: b.libelle } });
    setDb(next);
    if (editingId === b.id) reset();
  };

  const history = db.bons
    .filter((b) => (isGerant ? b.stationId === profile.stationId : (!stationId || b.stationId === stationId)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.timestamp || "").localeCompare(a.timestamp || "")));

  // Un même jour peut cumuler plusieurs bons — regroupement par date avec cumul journalier,
  // détail de chaque ligne disponible en dépliant.
  const grouped = useMemo(() => {
    const map = new Map();
    history.forEach((b) => {
      if (!map.has(b.date)) map.set(b.date, []);
      map.get(b.date).push(b);
    });
    return Array.from(map.entries()).map(([d, entries]) => ({
      date: d,
      entries,
      total: entries.reduce((a, e) => a + bonTotal(e), 0),
      station: db.stations.find((s) => s.id === entries[0].stationId),
    }));
  }, [history, db.stations]);

  // Cumul automatique sur toute la période affichée — recalculé dès qu'un bon est ajouté
  // ou supprimé, puisqu'il est dérivé directement de l'historique filtré. La catégorie
  // (Citerne / Groupe-Transport-Vidange) est déduite automatiquement du libellé déjà
  // saisi, sans champ supplémentaire — les frais de route de chaque bon suivent sa
  // catégorie plutôt que d'être comptés à part.
  const cumulTotal = history.reduce((a, b) => a + bonTotal(b), 0);
  const cumulCiterne = history.filter((b) => bonCategorie(b) === "citerne").reduce((a, b) => a + bonTotal(b), 0);
  const cumulGroupeTransport = history.filter((b) => bonCategorie(b) === "groupe_transport_vidange").reduce((a, b) => a + bonTotal(b), 0);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const exportPdf = () => window.print();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl">Bons</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Enregistrement des bons de carburant (non payés en espèces).</p>
        </div>
        <Button variant="ghost" onClick={exportPdf} disabled={grouped.length === 0}><Printer size={16} /> Exporter en PDF</Button>
      </div>

      <Card className="max-w-md smi-no-print">
        {editingId && (
          <div className="rounded-md p-2.5 mb-3 flex items-center justify-between gap-2" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
            <span className="text-xs" style={{ color: C.teal }}>Modification d'un bon existant</span>
            <button onClick={reset} className="smi-btn text-xs" style={{ color: C.teal }}>Annuler</button>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        <div className="flex flex-col gap-3">
          {clients.length > 0 && (
            <Field label="Client à crédit (facultatif)" hint="Choisissez le client si ce carburant lui est vendu à crédit : le montant s'ajoute à son compte.">
              <SelectInput value={clientId} onChange={(e) => setClientId(e.target.value)}>
                <option value="">— Aucun (bon interne) —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              </SelectInput>
            </Field>
          )}
          {clientId && (
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Produit"><SelectInput value={produitBon} onChange={(e) => setProduitBon(e.target.value)}><option value="gasoil">Gasoil</option><option value="essence">Essence</option></SelectInput></Field>
              <Field label="Immatriculation"><input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={immatriculation} onChange={(e) => setImmatriculation(e.target.value)} /></Field>
              <Field label="N° du bon"><input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={numeroBon} onChange={(e) => setNumeroBon(e.target.value)} /></Field>
            </div>
          )}
          <Field label="Libellé" hint="Utilisez « Citerne » ou « Groupe / Transport / Vidange » dans le libellé pour un classement automatique correct dans les cumuls.">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="ex : Citerne BI 7077" />
          </Field>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Quantité (L)"><NumberInput value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Field>
            <Field label={`Prix unitaire (${devise})`}><NumberInput value={prixUnitaire} onChange={(e) => setPrixUnitaire(e.target.value)} /></Field>
            <Field label={`Frais de route (${devise})`}><NumberInput value={fraisRoute} onChange={(e) => setFraisRoute(e.target.value)} /></Field>
          </div>
          <Field label="Photo du bon (optionnel)">
            <label className="smi-btn flex items-center justify-center gap-2 rounded-md px-3 py-3 text-sm cursor-pointer" style={{ background: C.bgAlt, border: `1px dashed ${C.border}`, color: C.textMuted }}>
              <Camera size={18} />
              {photo ? "Changer la photo" : "Ajouter une photo (caméra ou galerie)"}
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            </label>
            {photo && (
              <div className="mt-2">
                <img src={photo} alt="Bon" className="rounded-md cursor-pointer" style={{ maxHeight: 140, border: `1px solid ${C.border}` }} onClick={() => setLightbox(photo)} />
              </div>
            )}
          </Field>
        </div>

        <div className="rounded-md p-3 mt-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Total de cette saisie</p>
          <GaugeNumber value={fmtMontant(total, devise)} tone="amber" size="lg" />
          <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Le cumul du jour (si plusieurs bons) s'affiche dans l'historique ci-dessous.</p>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <Button onClick={save}><CheckCircle2 size={16} /> {editingId ? "Mettre à jour" : "Valider"}</Button>
        </div>
      </Card>

      <Card className="smi-print-area">
        <div className="hidden smi-print-only mb-3">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Historique des bons</h1>
          <p style={{ fontSize: 13, color: "#444" }}>{isGerant ? station?.nom : (station?.nom || "Toutes stations")}</p>
        </div>
        <p className="font-semibold text-sm mb-3">Historique des bons</p>
        {grouped.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Cumul total</p>
              <GaugeNumber value={fmtMontant(cumulTotal, devise)} tone="amber" />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Cumul Citerne</p>
              <GaugeNumber value={fmtMontant(cumulCiterne, devise)} />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Cumul Groupe/Transport/Vidange</p>
              <GaugeNumber value={fmtMontant(cumulGroupeTransport, devise)} />
            </div>
          </div>
        )}
        {grouped.length === 0 ? (
          <EmptyState icon={Wallet} title="Aucun bon enregistré" hint="Les bons enregistrés apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-2">
            {grouped.map((g) => {
              const open = expandedDate === g.date;
              const dv = g.station?.devise || "GNF";
              return (
                <div key={g.date} className="rounded-md" style={{ border: `1px solid ${C.border}` }}>
                  <button onClick={() => setExpandedDate(open ? null : g.date)} className="smi-btn w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{fmtDateLong(g.date)}</span>
                      <span className="text-xs" style={{ color: C.textFaint }}>{g.station?.nom || "—"}</span>
                      {g.entries.length > 1 && <Pill tone="amber">{g.entries.length} bons</Pill>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold smi-mono" style={{ color: C.amber }}>{fmtMontant(g.total, dv)}</span>
                      <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.textFaint }} />
                    </div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 flex flex-col gap-2" style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                      {g.entries.map((b) => (
                        <div key={b.id} className="rounded-md p-2.5 flex items-center gap-3 smi-print-photo-row" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                          {b.photo ? (
                            <img src={b.photo} alt="" className="rounded-md flex-shrink-0 cursor-pointer smi-print-photo" style={{ width: 40, height: 40, objectFit: "cover", border: `1px solid ${C.border}` }} onClick={() => setLightbox(b.photo)} />
                          ) : (
                            <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 40, height: 40, background: C.panel, border: `1px solid ${C.border}`, color: C.textFaint }}><Wallet size={16} /></div>
                          )}
                          <div className="flex-1 min-w-0 text-xs" style={{ color: C.textMuted }}>
                            <span className="font-medium" style={{ color: C.text }}>{b.libelle}</span>{" "}
                            <Pill tone={bonCategorie(b) === "groupe_transport_vidange" ? "teal" : "amber"}>{bonCategorie(b) === "groupe_transport_vidange" ? "Groupe/Transport/Vidange" : "Citerne"}</Pill>
                            {num(b.quantite) > 0 && <span> · {fmtVol(b.quantite)} × {fmtMontant(b.prixUnitaire, dv)}</span>}
                            {num(b.fraisRoute) > 0 && <span> · Frais : {fmtMontant(b.fraisRoute, dv)}</span>}
                          </div>
                          <span className="text-xs font-semibold smi-mono flex-shrink-0">{fmtMontant(bonTotal(b), dv)}</span>
                          <button onClick={() => startEdit(b)} className="smi-btn flex-shrink-0 smi-no-print" style={{ color: C.teal }}><Pencil size={13} /></button>
                          {!isGerant && <button onClick={() => removeBon(b)} className="smi-btn flex-shrink-0 smi-no-print" style={{ color: C.danger }}><Trash2 size={13} /></button>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <QrCode value={appUrl} size={64} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
            <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
          </div>
        </div>
      </div>
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function ReceptionView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());
  const [produit, setProduit] = useState("gasoil");
  const [quantite, setQuantite] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [fournisseurId, setFournisseurId] = useState("");
  const [prixAchat, setPrixAchat] = useState("");
  const [montantPaye, setMontantPaye] = useState("");
  const isAdminR = profile.role === "admin";
  const fournisseurs = db.fournisseurs || [];
  const [numeroBon, setNumeroBon] = useState("");
  const [photo, setPhoto] = useState(null);
  const [err, setErr] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const onPhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImage(file);
      setPhoto(dataUrl);
    } catch {
      setErr("Impossible de lire la photo.");
    }
  };

  const reset = () => {
    setQuantite(""); setFournisseur(""); setFournisseurId(""); setPrixAchat(""); setMontantPaye(""); setNumeroBon(""); setPhoto(null); setEditingId(null);
  };

  // Charge une réception existante dans le formulaire pour la corriger — plus besoin de
  // supprimer puis ressaisir une saisie mal enregistrée.
  const startEdit = (r) => {
    setErr("");
    setStationId(r.stationId);
    setDate(r.date);
    setProduit(r.produit);
    setQuantite(r.quantite ?? "");
    setFournisseur(r.fournisseur || "");
    setFournisseurId(r.fournisseurId || "");
    setPrixAchat(r.prixAchat ?? "");
    setMontantPaye(r.montantPaye ?? "");
    setNumeroBon(r.numeroBon || "");
    setPhoto(r.photo || null);
    setEditingId(r.id);
  };

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) { setErr("Choisissez une station."); return; }
    if (!quantite || num(quantite) <= 0) { setErr("Indiquez une quantité valide."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const existing = editingId ? db.receptions.find((x) => x.id === editingId) : null;
    if (num(montantPaye) > 0 && num(prixAchat) <= 0) { setErr("Indiquez le prix d'achat avant le montant payé."); return; }
    if (num(prixAchat) > 0 && num(montantPaye) > num(quantite) * num(prixAchat)) { setErr("Le montant payé dépasse le montant de la livraison."); return; }
    const four = fournisseurs.find((f) => f.id === fournisseurId);
    // Le prix d'achat et le montant payé sont réservés à l'administrateur : un gérant qui
    // corrige une réception ne les efface pas.
    const prix = isAdminR ? prixAchat : (existing?.prixAchat ?? "");
    const paye = isAdminR ? montantPaye : (existing?.montantPaye ?? "");
    const row = { id: editingId || uid(), stationId: effStationId, date, produit, quantite, fournisseurId: four ? four.id : "", fournisseur: four ? four.nom : fournisseur, prixAchat: prix, montantPaye: paye, numeroBon, photo, timestamp: existing?.timestamp || new Date().toISOString() };
    let next = { ...db, receptions: editingId ? db.receptions.map((x) => (x.id === editingId ? row : x)) : [...db.receptions, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "reception", action: editingId ? "modification" : "création", before: existing ? { produit: existing.produit, quantite: existing.quantite } : null, after: { produit, quantite, fournisseur, numeroBon } });
    setDb(next);
    reset();
  };

  const removeReception = (r) => {
    if (!confirm("Supprimer cette réception ?")) return;
    let next = { ...db, receptions: db.receptions.filter((x) => x.id !== r.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: r.stationId, entity: "reception", action: "suppression", before: { produit: r.produit, quantite: r.quantite } });
    setDb(next);
    if (editingId === r.id) reset();
  };

  const history = db.receptions
    .filter((r) => (isGerant ? r.stationId === profile.stationId : (!stationId || r.stationId === stationId)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.timestamp || "").localeCompare(a.timestamp || "")));

  // Cumul automatique — recalculé à chaque nouvelle réception ajoutée ou supprimée,
  // puisqu'il est dérivé directement de la liste affichée.
  const cumulEssence = history.filter((r) => r.produit === "essence").reduce((a, r) => a + num(r.quantite), 0);
  const cumulGasoil = history.filter((r) => r.produit === "gasoil").reduce((a, r) => a + num(r.quantite), 0);
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const exportPdf = () => window.print();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl flex items-center gap-2"><Truck size={22} /> Réception</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Enregistrement d'une livraison de carburant, avec photo du bon comme preuve.</p>
        </div>
        <Button variant="ghost" onClick={exportPdf} disabled={history.length === 0}><Printer size={16} /> Exporter en PDF</Button>
      </div>

      <Card className="max-w-md smi-no-print">
        {editingId && (
          <div className="rounded-md p-2.5 mb-3 flex items-center justify-between gap-2" style={{ background: C.tealSoft, border: `1px solid color-mix(in srgb, ${C.teal} 33%, transparent)` }}>
            <span className="text-xs" style={{ color: C.teal }}>Modification d'une réception existante</span>
            <button onClick={reset} className="smi-btn text-xs" style={{ color: C.teal }}>Annuler</button>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        <div className="flex flex-col gap-3">
          <Field label="Produit">
            <SelectInput value={produit} onChange={(e) => setProduit(e.target.value)}>
              <option value="gasoil">Gasoil</option>
              <option value="essence">Essence</option>
            </SelectInput>
          </Field>
          {(() => {
            const libre = stationId ? placeLibreProduit(db, stationId, produit) : null;
            const trop = libre !== null && num(quantite) > libre;
            return (
              <Field label="Quantité (L)" hint={libre === null ? undefined : (trop ? `Attention : dépasse la place libre dans les cuves (${fmtVol(libre)}).` : `Place libre dans les cuves : ${fmtVol(libre)}.`)}>
                <NumberInput value={quantite} onChange={(e) => setQuantite(e.target.value)} />
              </Field>
            );
          })()}
          <Field label="Fournisseur" hint={fournisseurs.length === 0 && isAdminR ? "Créez vos fournisseurs dans l'onglet Fournisseurs pour suivre ce que vous leur devez." : undefined}>
            {fournisseurs.length > 0 && (
              <SelectInput value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)}>
                <option value="">— Autre (saisie libre) —</option>
                {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </SelectInput>
            )}
            {!fournisseurId && <input className="smi-input w-full rounded-md px-3 py-2 text-sm mt-1" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="Nom du fournisseur" />}
          </Field>
          {isAdminR && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Prix d'achat / de cession (par litre)" hint={!prixAchat && prixCessionDefaut(db, stationId, produit) > 0 ? `Vide = prix de cession de la station (${fmtMontant(prixCessionDefaut(db, stationId, produit))}).` : undefined}><NumberInput value={prixAchat} onChange={(e) => setPrixAchat(e.target.value)} /></Field>
              <Field label="Payé à la livraison" hint={num(prixAchat) > 0 && num(quantite) > 0 ? `Montant : ${fmtMontant(num(quantite) * num(prixAchat))} · reste dû ${fmtMontant(Math.max(0, num(quantite) * num(prixAchat) - num(montantPaye)))}` : undefined}><NumberInput value={montantPaye} onChange={(e) => setMontantPaye(e.target.value)} /></Field>
            </div>
          )}
          <Field label="N° Bon">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={numeroBon} onChange={(e) => setNumeroBon(e.target.value)} />
          </Field>
          <Field label="Photo du bon">
            <label className="smi-btn flex items-center justify-center gap-2 rounded-md px-3 py-3 text-sm cursor-pointer" style={{ background: C.panelAlt, border: `1px dashed ${C.border}`, color: C.textMuted }}>
              <Camera size={18} />
              {photo ? "Changer la photo" : "Ajouter une photo (caméra ou galerie)"}
              <input type="file" accept="image/*" className="hidden" onChange={onPhotoChange} />
            </label>
            {photo && (
              <div className="mt-2">
                <img src={photo} alt="Bon de livraison" className="rounded-md cursor-pointer" style={{ maxHeight: 140, border: `1px solid ${C.border}` }} onClick={() => setLightbox(photo)} />
              </div>
            )}
          </Field>
        </div>

        {err && <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}

        <div className="flex justify-end mt-4">
          <Button onClick={save}><CheckCircle2 size={16} /> {editingId ? "Mettre à jour" : "Valider"}</Button>
        </div>
      </Card>

      <Card className="smi-print-area">
        <div className="hidden smi-print-only mb-3">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Historique des réceptions</h1>
          <p style={{ fontSize: 13, color: "#444" }}>{db.stations.find((s) => s.id === stationId)?.nom || "Toutes stations"}</p>
        </div>
        <p className="font-semibold text-sm mb-3">Historique des réceptions</p>
        {history.length > 0 && (
          <div className="rounded-md p-3 mb-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
            <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Cumul total reçu</p>
            <div className="flex gap-4">
              <GaugeNumber value={`${fmtVol(cumulEssence)} Essence`} tone="amber" />
              <GaugeNumber value={`${fmtVol(cumulGasoil)} Gasoil`} tone="teal" />
            </div>
          </div>
        )}
        {history.length === 0 ? (
          <EmptyState icon={Truck} title="Aucune réception enregistrée" hint="Les livraisons enregistrées apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((r) => (
              <div key={r.id} className="rounded-md p-3 flex items-center gap-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                {r.photo ? (
                  <img src={r.photo} alt="" className="rounded-md flex-shrink-0 cursor-pointer" style={{ width: 48, height: 48, objectFit: "cover", border: `1px solid ${C.border}` }} onClick={() => setLightbox(r.photo)} />
                ) : (
                  <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 48, height: 48, background: C.panel, border: `1px solid ${C.border}`, color: C.textFaint }}><Truck size={18} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.produit === "essence" ? "Essence" : "Gasoil"} — {fmtVol(r.quantite)}</p>
                  <p className="text-xs truncate" style={{ color: C.textFaint }}>{fmtDateLong(r.date)} · {db.stations.find((s) => s.id === r.stationId)?.nom || "—"} · {r.fournisseur || "—"} {r.numeroBon ? `· Bon n° ${r.numeroBon}` : ""}</p>
                  {isAdminR && num(r.prixAchat) > 0 && <p className="text-xs smi-mono" style={{ color: C.textMuted }}>{fmtMontant(num(r.quantite) * num(r.prixAchat))} · payé {fmtMontant(r.montantPaye)}{num(r.quantite) * num(r.prixAchat) - num(r.montantPaye) > 0 ? ` · reste ${fmtMontant(num(r.quantite) * num(r.prixAchat) - num(r.montantPaye))}` : ""}</p>}
                </div>
                <button onClick={() => startEdit(r)} className="smi-btn flex-shrink-0" style={{ color: C.teal }}><Pencil size={14} /></button>
                {!isGerant && <button onClick={() => removeReception(r)} className="smi-btn flex-shrink-0" style={{ color: C.danger }}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <QrCode value={appUrl} size={64} />
          <div>
            <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
            <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
          </div>
        </div>
      </div>
      <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  );
}

function InspectionView({ db, setDb, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());
  const [items, setItems] = useState(() => Object.fromEntries(INSPECTION_CHECKLIST.map((c) => [c.id, { status: "conforme", note: "" }])));
  const [observations, setObservations] = useState("");
  const [err, setErr] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const setItemStatus = (id, status) => setItems((prev) => ({ ...prev, [id]: { ...prev[id], status } }));
  const setItemNote = (id, note) => setItems((prev) => ({ ...prev, [id]: { ...prev[id], note } }));

  const resetForm = () => {
    setItems(Object.fromEntries(INSPECTION_CHECKLIST.map((c) => [c.id, { status: "conforme", note: "" }])));
    setObservations("");
  };

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = {
      id: uid(), stationId: effStationId, date,
      inspecteur: profile?.name || "—",
      items: INSPECTION_CHECKLIST.map((c) => ({ id: c.id, label: c.label, status: items[c.id]?.status || "conforme", note: items[c.id]?.note || "" })),
      observations,
    };
    const nonConformites = row.items.filter((i) => i.status === "non_conforme").length;
    let next = { ...db, inspections: [...db.inspections, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "inspection", action: "création", after: { date, nonConformites } });
    setDb(next);
    resetForm();
  };

  const removeInspection = (insp) => {
    if (!confirm("Supprimer cette inspection ?")) return;
    let next = { ...db, inspections: db.inspections.filter((x) => x.id !== insp.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: insp.stationId, entity: "inspection", action: "suppression", before: { date: insp.date } });
    setDb(next);
  };

  const history = db.inspections
    .filter((i) => (isGerant ? i.stationId === profile.stationId : (!stationId || i.stationId === stationId)))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  const statusMeta = {
    conforme: { label: "Conforme", tone: "success" },
    non_conforme: { label: "Non conforme", tone: "danger" },
    na: { label: "N/A", tone: "muted" },
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Inspection</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Grille de contrôle standard pour visite de station — conservée avec date, inspecteur et remarques.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>

        <div className="flex flex-col gap-3">
          {INSPECTION_CHECKLIST.map((c) => (
            <div key={c.id} className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-medium">{c.label}</p>
                <div className="flex gap-1.5">
                  {["conforme", "non_conforme", "na"].map((s) => (
                    <button
                      key={s}
                      onClick={() => setItemStatus(c.id, s)}
                      className="smi-btn rounded-md px-2.5 py-1 text-xs font-medium"
                      style={{
                        background: items[c.id]?.status === s ? (s === "non_conforme" ? C.dangerSoft : s === "conforme" ? "#1E3A24" : C.panel) : "transparent",
                        color: items[c.id]?.status === s ? (s === "non_conforme" ? C.danger : s === "conforme" ? C.success : C.textMuted) : C.textFaint,
                        border: `1px solid ${items[c.id]?.status === s ? (s === "non_conforme" ? C.danger : s === "conforme" ? C.success : C.border) : C.border}`,
                      }}
                    >
                      {statusMeta[s].label}
                    </button>
                  ))}
                </div>
              </div>
              {items[c.id]?.status === "non_conforme" && (
                <input
                  className="smi-input w-full rounded-md px-3 py-1.5 text-xs mt-2"
                  style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }}
                  placeholder="Remarque (optionnel)"
                  value={items[c.id]?.note || ""}
                  onChange={(e) => setItemNote(c.id, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>

        <div className="mt-3">
          <Field label="Observations générales (optionnel)">
            <textarea className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-3 mt-4">
          {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <Button onClick={save} disabled={!stationId && !isGerant}><CheckCircle2 size={16} /> Enregistrer l'inspection</Button>
        </div>
      </Card>

      <Card>
        <p className="font-semibold text-sm mb-3">Historique des inspections</p>
        {history.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="Aucune inspection enregistrée" hint="Les inspections réalisées apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((insp) => {
              const nc = insp.items.filter((i) => i.status === "non_conforme").length;
              const open = expandedId === insp.id;
              return (
                <div key={insp.id} className="rounded-md" style={{ border: `1px solid ${C.border}` }}>
                  <button onClick={() => setExpandedId(open ? null : insp.id)} className="smi-btn w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{fmtDateLong(insp.date)}</span>
                      <span className="text-xs" style={{ color: C.textFaint }}>{db.stations.find((s) => s.id === insp.stationId)?.nom || "—"} · {insp.inspecteur}</span>
                      <Pill tone={nc > 0 ? "danger" : "success"}>{nc > 0 ? `${nc} non-conformité(s)` : "Tout conforme"}</Pill>
                    </div>
                    <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.textFaint }} />
                  </button>
                  {open && (
                    <div className="px-3 pb-3 flex flex-col gap-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
                      {insp.items.map((i) => (
                        <div key={i.id} className="flex items-center justify-between gap-2 text-xs pt-1.5">
                          <span style={{ color: C.textMuted }}>{i.label}{i.note ? ` — ${i.note}` : ""}</span>
                          <Pill tone={statusMeta[i.status]?.tone || "muted"}>{statusMeta[i.status]?.label || i.status}</Pill>
                        </div>
                      ))}
                      {insp.observations && <p className="text-xs pt-2" style={{ color: C.textFaint }}>Observations : {insp.observations}</p>}
                      {!isGerant && (
                        <div className="pt-2"><Button variant="danger" onClick={() => removeInspection(insp)}><Trash2 size={13} /> Supprimer</Button></div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------- Dashboard view ----------------------------- */

/* ---------------------------------- Cuves ---------------------------------- */

function JaugeCuve({ pct, statut, height = 96 }) {
  const color = statut === "critique" ? C.danger : statut === "alerte" ? C.amber : statut === "bon" ? C.teal : C.textFaint;
  return (
    <div style={{ width: 54, height, border: `2px solid ${C.border}`, borderRadius: 8, position: "relative", overflow: "hidden", background: C.bgAlt, flexShrink: 0 }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${pct || 0}%`, background: color, opacity: 0.85, transition: "height .4s" }} />
      <span className="smi-mono" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: C.text }}>{pct === null ? "—" : `${pct}%`}</span>
    </div>
  );
}

function CuvesView({ db, setDb, profile }) {
  const isAdmin = profile.role === "admin";
  const stations = isAdmin ? db.stations : db.stations.filter((s) => s.id === profile.stationId);
  const [form, setForm] = useState(null); // null = fermé
  const [err, setErr] = useState("");

  const etats = useMemo(() => stations.map((s) => ({ station: s, ...etatCuvesStation(db, s.id) })), [db, stations]);
  const enAlerte = etats.flatMap((e) => e.liste.filter((x) => x.statut === "alerte" || x.statut === "critique").map((x) => ({ ...x, station: e.station })));

  const openNew = (stationId, produit = "essence") => { setErr(""); setForm({ stationId, produit, nom: `Cuve ${produit}`, capacite: "", seuilAlerte: "", seuilCritique: "", emplacement: "" }); };
  const save = () => {
    setErr("");
    if (!form.nom?.trim()) { setErr("Indiquez le nom de la cuve."); return; }
    if (num(form.capacite) <= 0) { setErr("Indiquez la capacité de la cuve."); return; }
    if (form.seuilCritique !== "" && form.seuilAlerte !== "" && num(form.seuilCritique) > num(form.seuilAlerte)) { setErr("Le seuil critique doit être inférieur au seuil d'alerte."); return; }
    const row = { id: form.id || uid(), stationId: form.stationId, nom: form.nom.trim(), produit: form.produit, capacite: form.capacite, seuilAlerte: form.seuilAlerte, seuilCritique: form.seuilCritique, emplacement: (form.emplacement || "").trim() };
    let next = { ...db, cuves: form.id ? db.cuves.map((c) => (c.id === form.id ? row : c)) : [...(db.cuves || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: row.stationId, entity: "cuve", action: form.id ? "modification" : "création", after: { nom: row.nom, produit: row.produit, capacite: row.capacite } });
    setDb(next); setForm(null);
  };
  const remove = (c) => {
    if (!confirm(`Supprimer la cuve « ${c.nom} » ? Les relevés et stocks ne sont pas touchés.`)) return;
    let next = { ...db, cuves: db.cuves.filter((x) => x.id !== c.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: c.stationId, entity: "cuve", action: "suppression", before: { nom: c.nom } });
    setDb(next);
  };
  const inputStyle = { background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Cuves</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Niveau de chaque cuve d'après le dernier contrôle de stock, place libre avant livraison et nombre de jours avant rupture au rythme des 7 derniers jours.</p>
      </div>

      {enAlerte.length > 0 && (
        <Card style={{ background: C.dangerSoft, border: `1px solid ${C.danger}` }}>
          <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={16} /> {enAlerte.length} cuve{enAlerte.length > 1 ? "s" : ""} à réapprovisionner</p>
          <ul className="text-xs mt-1 flex flex-col gap-0.5" style={{ color: C.danger }}>
            {enAlerte.map((x) => <li key={x.cuve.id}>{x.station.nom} — {x.cuve.nom} : {fmtVol(x.niveau)} ({x.pct} %){x.joursRestants !== null ? `, environ ${x.joursRestants.toFixed(1)} j` : ""}{x.statut === "critique" ? " · CRITIQUE" : ""}</li>)}
          </ul>
        </Card>
      )}

      {form && (
        <Card className="max-w-2xl">
          <p className="font-semibold mb-3">{form.id ? "Modifier la cuve" : "Nouvelle cuve"} — {db.stations.find((s) => s.id === form.stationId)?.nom}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nom de la cuve"><input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={inputStyle} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></Field>
            <Field label="Produit">
              <SelectInput value={form.produit} onChange={(e) => setForm({ ...form, produit: e.target.value })}>{PRODUITS.map((p) => <option key={p.k} value={p.k}>{p.label}</option>)}</SelectInput>
            </Field>
            <Field label="Capacité (L)"><NumberInput value={form.capacite} onChange={(e) => setForm({ ...form, capacite: e.target.value })} /></Field>
            <Field label="Emplacement (facultatif)"><input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={inputStyle} value={form.emplacement} onChange={(e) => setForm({ ...form, emplacement: e.target.value })} placeholder="ex : îlot A" /></Field>
            <Field label="Seuil d'alerte (L)" hint="Vide = 25 % de la capacité."><NumberInput value={form.seuilAlerte} onChange={(e) => setForm({ ...form, seuilAlerte: e.target.value })} /></Field>
            <Field label="Seuil critique (L)" hint="Vide = 10 % de la capacité."><NumberInput value={form.seuilCritique} onChange={(e) => setForm({ ...form, seuilCritique: e.target.value })} /></Field>
          </div>
          {err && <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button>
            <Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button>
          </div>
        </Card>
      )}

      {stations.length === 0 && <EmptyState icon={Droplet} title="Aucune station" hint="Créez d'abord une station dans l'onglet Stations." />}

      {etats.map(({ station, liste, lastDate }) => (
        <Card key={station.id}>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div>
              <p className="font-semibold">{station.nom}</p>
              <p className="text-xs" style={{ color: C.textFaint }}>{lastDate ? `Dernier contrôle de stock : ${fmtDateLong(lastDate)}` : "Aucun contrôle de stock saisi"}</p>
            </div>
            {isAdmin && <Button variant="ghost" onClick={() => openNew(station.id)}><Plus size={14} /> Cuve</Button>}
          </div>
          {liste.length === 0 ? (
            <div className="text-sm flex flex-col gap-2" style={{ color: C.textMuted }}>
              <p>Aucune cuve définie pour cette station.</p>
              {isAdmin && <div className="flex gap-2 flex-wrap"><Button variant="ghost" onClick={() => openNew(station.id, "essence")}>+ Cuve essence</Button><Button variant="ghost" onClick={() => openNew(station.id, "gasoil")}>+ Cuve gasoil</Button></div>}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liste.map((x) => {
                const st = STATUT_CUVE[x.statut];
                return (
                  <div key={x.cuve.id} className="rounded-md p-3 flex gap-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, borderLeft: `4px solid ${st.tone === "danger" ? C.danger : st.tone === "amber" ? C.amber : st.tone === "success" ? C.teal : C.border}` }}>
                    <JaugeCuve pct={x.pct} statut={x.statut} />
                    <div className="flex-1 min-w-0 text-xs flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-sm truncate">{x.cuve.nom}</p>
                        <Pill tone={st.tone}>{st.label}</Pill>
                      </div>
                      <p style={{ color: C.textFaint }}>{PRODUITS.find((p) => p.k === x.cuve.produit)?.label}{x.cuve.emplacement ? ` · ${x.cuve.emplacement}` : ""}</p>
                      <div className="flex justify-between"><span style={{ color: C.textFaint }}>Niveau</span><span className="smi-mono font-semibold">{x.niveau === null ? "—" : fmtVol(x.niveau)} / {fmtVol(x.cap)}</span></div>
                      <div className="flex justify-between"><span style={{ color: C.textFaint }}>Place libre</span><span className="smi-mono">{x.placeLibre === null ? "—" : fmtVol(x.placeLibre)}</span></div>
                      <div className="flex justify-between"><span style={{ color: C.textFaint }}>Vente moyenne (7 j)</span><span className="smi-mono">{fmtVol(x.rythme)}/j</span></div>
                      <div className="flex justify-between"><span style={{ color: C.textFaint }}>Avant rupture</span><span className="smi-mono font-semibold" style={{ color: x.joursRestants !== null && x.joursRestants <= 3 ? C.danger : C.text }}>{x.joursRestants === null ? "—" : `${x.joursRestants.toFixed(1)} j`}</span></div>
                      {x.ecart !== null && Math.abs(x.ecart) >= 1 && <div className="flex justify-between"><span style={{ color: C.textFaint }}>Écart au dernier jaugeage</span><span className="smi-mono" style={{ color: x.ecart < 0 ? C.danger : C.success }}>{x.ecart > 0 ? "+" : ""}{fmtVol(x.ecart)}</span></div>}
                      <div className="flex justify-between"><span style={{ color: C.textFaint }}>Seuils alerte / critique</span><span className="smi-mono">{fmtVol(x.alerte)} / {fmtVol(x.critique)}</span></div>
                      {isAdmin && (
                        <div className="flex gap-2 mt-1">
                          <button className="smi-btn flex items-center gap-1" style={{ color: C.textMuted }} onClick={() => { setErr(""); setForm({ ...x.cuve }); }}><Pencil size={12} /> Modifier</button>
                          <button className="smi-btn flex items-center gap-1" style={{ color: C.danger }} onClick={() => remove(x.cuve)}><Trash2 size={12} /> Supprimer</button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ----------------------- Fournisseurs, dépenses, résultat ----------------------- */

const DEPENSE_CATEGORIES = ["Salaires", "Électricité", "Eau", "Loyer", "Maintenance", "Transport", "Sécurité", "Fournitures", "Taxes et impôts", "Communication", "Frais bancaires", "Carburant (usage interne)", "Autre"];
const MODES_PAIEMENT = ["Espèces", "Mobile money", "Virement", "Chèque", "Autre"];

// Montant dû pour une livraison : quantité × prix d'achat (ou, à défaut, le prix de cession
// fixé pour la station dans son Compte station).
const compteStation = (db, stationId) => (db.comptesStations || []).find((c) => c.stationId === stationId) || null;
const prixCessionDefaut = (db, stationId, produit) => { const c = compteStation(db, stationId); return c ? num(produit === "essence" ? c.prixCessionE : c.prixCessionG) : 0; };
const prixLivraison = (db, r) => num(r.prixAchat) > 0 ? num(r.prixAchat) : prixCessionDefaut(db, r.stationId, r.produit);
const montantReception = (r, db) => num(r.quantite) * (db ? prixLivraison(db, r) : num(r.prixAchat));

// Ce que la société doit encore au fournisseur : solde de départ + livraisons non payées
// − paiements enregistrés après coup.
function soldeFournisseur(db, f) {
  // Stations dont les versements paient ce fournisseur : leur dette est le « reste à verser »
  // du Compte station, pas le détail des livraisons.
  const liees = (db.comptesStations || []).filter((c) => c.fournisseurId === f.id).map((c) => c.stationId);
  const resteLiees = liees.reduce((a, sid) => a + Math.max(0, calcCompteStation(db, sid)?.reste || 0), 0);
  const livraisons = db.receptions.filter((r) => r.fournisseurId === f.id && !liees.includes(r.stationId));
  const du = livraisons.reduce((a, r) => a + montantReception(r, db) - num(r.montantPaye), 0);
  const paye = (db.paiementsFournisseurs || []).filter((p) => p.fournisseurId === f.id).reduce((a, p) => a + num(p.montant), 0);
  return num(f.soldeInitial) + du - paye + resteLiees;
}

// Prix d'achat moyen pondéré d'un produit pour une station, sur toutes les livraisons
// chiffrées jusqu'à une date. Sert à estimer le coût du carburant vendu.
function prixAchatMoyen(db, stationId, produit, jusquA) {
  const chiffrees = db.receptions.filter((r) => r.stationId === stationId && r.produit === produit && num(r.prixAchat) > 0);
  const l = chiffrees.filter((r) => r.date <= jusquA);
  const q = l.reduce((a, r) => a + num(r.quantite), 0);
  if (q > 0) return l.reduce((a, r) => a + montantReception(r), 0) / q;
  // Carburant vendu avant la première livraison chiffrée (stock de départ) : on retient
  // le prix de cette première livraison plutôt qu'un coût nul.
  const premiere = chiffrees.sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  if (premiere) return num(premiere.prixAchat);
  const pc = prixCessionDefaut(db, stationId, produit);
  return pc > 0 ? pc : null;
}

function exportCsv(nom, entetes, lignes) {
  const csv = [entetes, ...lignes].map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${nom}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const inputCls = "smi-input w-full rounded-md px-3 py-2 text-sm";
const inputSty = () => ({ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text });

function FournisseursView({ db, setDb, profile }) {
  const [form, setForm] = useState(null);
  const [payFor, setPayFor] = useState(null); // { fournisseurId, date, montant, mode, stationId, note }
  const [openId, setOpenId] = useState(null);
  const [err, setErr] = useState("");
  const list = db.fournisseurs || [];
  const totalDu = list.reduce((a, f) => a + Math.max(0, soldeFournisseur(db, f)), 0);

  const save = () => {
    setErr("");
    if (!form.nom?.trim()) { setErr("Indiquez le nom du fournisseur."); return; }
    const row = { id: form.id || uid(), nom: form.nom.trim(), contact: (form.contact || "").trim(), telephone: (form.telephone || "").trim(), adresse: (form.adresse || "").trim(), produits: (form.produits || "").trim(), delaiPaiement: form.delaiPaiement || "", soldeInitial: form.soldeInitial || "" };
    let next = { ...db, fournisseurs: form.id ? list.map((f) => (f.id === form.id ? row : f)) : [...list, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, entity: "fournisseur", action: form.id ? "modification" : "création", after: { nom: row.nom } });
    setDb(next); setForm(null);
  };
  const remove = (f) => {
    if (db.receptions.some((r) => r.fournisseurId === f.id) || (db.paiementsFournisseurs || []).some((p) => p.fournisseurId === f.id)) { alert("Ce fournisseur a des livraisons ou des paiements : suppression impossible."); return; }
    if (!confirm(`Supprimer le fournisseur « ${f.nom} » ?`)) return;
    setDb(withAudit({ ...db, fournisseurs: list.filter((x) => x.id !== f.id) }, { user: profile?.name, role: profile?.role, entity: "fournisseur", action: "suppression", before: { nom: f.nom } }));
  };
  const savePay = () => {
    setErr("");
    const f = list.find((x) => x.id === payFor.fournisseurId);
    if (num(payFor.montant) <= 0) { setErr("Indiquez le montant payé."); return; }
    if (isFutureDate(payFor.date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = { id: uid(), fournisseurId: f.id, stationId: payFor.stationId || "", date: payFor.date, montant: payFor.montant, mode: payFor.mode, note: (payFor.note || "").trim(), timestamp: new Date().toISOString() };
    setDb(withAudit({ ...db, paiementsFournisseurs: [...(db.paiementsFournisseurs || []), row] }, { user: profile?.name, role: profile?.role, entity: "paiement fournisseur", action: "création", after: { fournisseur: f.nom, montant: row.montant } }));
    setPayFor(null);
  };
  const removePay = (p) => {
    if (!confirm("Supprimer ce paiement ?")) return;
    setDb(withAudit({ ...db, paiementsFournisseurs: db.paiementsFournisseurs.filter((x) => x.id !== p.id) }, { user: profile?.name, role: profile?.role, entity: "paiement fournisseur", action: "suppression", before: { montant: p.montant } }));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="smi-display text-2xl">Fournisseurs</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Ce que vous devez à chaque fournisseur : livraisons chiffrées dans Réception (prix d'achat − payé à la livraison) moins les paiements enregistrés ici.</p>
        </div>
        <Button onClick={() => { setErr(""); setForm({ nom: "", contact: "", telephone: "", adresse: "", produits: "Essence, Gasoil", delaiPaiement: "", soldeInitial: "" }); }}><Plus size={16} /> Fournisseur</Button>
      </div>

      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm" style={{ color: C.textMuted }}>Total dû à l'ensemble des fournisseurs</span>
        <GaugeNumber value={fmtMontant(totalDu)} tone={totalDu > 0 ? "danger" : "muted"} size="lg" />
      </Card>

      {form && (
        <Card className="max-w-2xl">
          <p className="font-semibold mb-3">{form.id ? "Modifier le fournisseur" : "Nouveau fournisseur"}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nom"><input className={inputCls} style={inputSty()} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></Field>
            <Field label="Contact"><input className={inputCls} style={inputSty()} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="Téléphone"><input className={inputCls} style={inputSty()} value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></Field>
            <Field label="Adresse"><input className={inputCls} style={inputSty()} value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} /></Field>
            <Field label="Produits"><input className={inputCls} style={inputSty()} value={form.produits} onChange={(e) => setForm({ ...form, produits: e.target.value })} /></Field>
            <Field label="Délai de paiement (jours)"><NumberInput value={form.delaiPaiement} onChange={(e) => setForm({ ...form, delaiPaiement: e.target.value })} /></Field>
            <Field label="Solde de départ dû" hint="Ce que vous lui deviez déjà avant d'utiliser l'application."><NumberInput value={form.soldeInitial} onChange={(e) => setForm({ ...form, soldeInitial: e.target.value })} /></Field>
          </div>
          {err && <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button></div>
        </Card>
      )}

      {list.length === 0 && !form && <EmptyState icon={Truck} title="Aucun fournisseur" hint="Ajoutez vos fournisseurs, puis choisissez-les lors de chaque Réception avec le prix d'achat." />}

      <div className="grid md:grid-cols-2 gap-3">
        {list.map((f) => {
          const solde = soldeFournisseur(db, f);
          const livs = db.receptions.filter((r) => r.fournisseurId === f.id).sort((a, b) => (a.date < b.date ? 1 : -1));
          const pays = (db.paiementsFournisseurs || []).filter((p) => p.fournisseurId === f.id).sort((a, b) => (a.date < b.date ? 1 : -1));
          return (
            <Card key={f.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{f.nom}</p><p className="text-xs" style={{ color: C.textFaint }}>{[f.contact, f.telephone].filter(Boolean).join(" · ") || "—"}</p></div>
                <Pill tone={solde > 0 ? "danger" : "success"}>{solde > 0 ? "Dette" : "À jour"}</Pill>
              </div>
              <p className="text-xs" style={{ color: C.textMuted }}>{f.produits || "—"}{f.delaiPaiement ? ` · paiement à ${f.delaiPaiement} jours` : ""}</p>
              <div className="flex items-center justify-between"><span className="text-xs" style={{ color: C.textFaint }}>Solde dû</span><GaugeNumber value={fmtMontant(solde)} tone={solde > 0 ? "danger" : "muted"} /></div>
              <p className="text-xs" style={{ color: C.textFaint }}>{livs.length} livraison(s) · {pays.length} paiement(s)</p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => { setErr(""); setPayFor({ fournisseurId: f.id, date: todayISO(), montant: solde > 0 ? String(Math.round(solde)) : "", mode: "Virement", stationId: "", note: "" }); }} disabled={solde <= 0}>Payer</Button>
                <Button variant="ghost" onClick={() => setOpenId(openId === f.id ? null : f.id)}>{openId === f.id ? "Masquer" : "Détail"}</Button>
                <Button variant="ghost" onClick={() => { setErr(""); setForm({ ...f }); }}><Pencil size={14} /></Button>
                <Button variant="ghost" onClick={() => remove(f)}><Trash2 size={14} /></Button>
              </div>
              {payFor?.fournisseurId === f.id && (
                <div className="rounded-md p-3 flex flex-col gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Date"><TextInput type="date" value={payFor.date} max={todayISO()} onChange={(e) => setPayFor({ ...payFor, date: e.target.value })} /></Field>
                    <Field label="Montant"><NumberInput value={payFor.montant} onChange={(e) => setPayFor({ ...payFor, montant: e.target.value })} /></Field>
                    <Field label="Mode"><SelectInput value={payFor.mode} onChange={(e) => setPayFor({ ...payFor, mode: e.target.value })}>{MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}</SelectInput></Field>
                    <Field label="Payé par la station"><SelectInput value={payFor.stationId} onChange={(e) => setPayFor({ ...payFor, stationId: e.target.value })}><option value="">Direction / siège</option>{db.stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</SelectInput></Field>
                  </div>
                  <Field label="Note"><input className={inputCls} style={inputSty()} value={payFor.note} onChange={(e) => setPayFor({ ...payFor, note: e.target.value })} placeholder="ex : n° de virement" /></Field>
                  {err && <p className="text-xs" style={{ color: C.danger }}>{err}</p>}
                  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setPayFor(null)}>Annuler</Button><Button onClick={savePay}>Enregistrer le paiement</Button></div>
                </div>
              )}
              {openId === f.id && (
                <div className="text-xs flex flex-col gap-1 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                  {livs.map((r) => <div key={r.id} className="flex justify-between gap-2"><span>{fmtDateLong(r.date)} · {db.stations.find((s) => s.id === r.stationId)?.nom || "—"} · {r.produit} {fmtVol(r.quantite)}</span><span className="smi-mono">{num(r.prixAchat) > 0 ? `${fmtMontant(montantReception(r))} (payé ${fmtMontant(r.montantPaye)})` : "prix non saisi"}</span></div>)}
                  {pays.map((p) => <div key={p.id} className="flex justify-between gap-2" style={{ color: C.success }}><span>{fmtDateLong(p.date)} · paiement {p.mode}{p.note ? ` · ${p.note}` : ""}</span><span className="smi-mono flex items-center gap-2">− {fmtMontant(p.montant)}<button className="smi-btn" style={{ color: C.danger }} onClick={() => removePay(p)}><Trash2 size={12} /></button></span></div>)}
                  {livs.length + pays.length === 0 && <span style={{ color: C.textFaint }}>Aucun mouvement.</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function DepensesView({ db, setDb, profile }) {
  const isAdmin = profile.role === "admin";
  const isGerant = profile.role === "gerant";
  const vide = () => ({ stationId: isGerant ? profile.stationId : (db.stations[0]?.id || ""), date: todayISO(), categorie: DEPENSE_CATEGORIES[0], montant: "", beneficiaire: "", description: "", mode: "Espèces", payeeParCaisse: true });
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [fStation, setFStation] = useState(isGerant ? profile.stationId : "");
  const [fCat, setFCat] = useState("");
  const [fStatut, setFStatut] = useState("");
  const [fMois, setFMois] = useState(todayISO().slice(0, 7));

  const all = (db.depenses || []).filter((d) => (isGerant ? d.stationId === profile.stationId : true));
  const rows = all.filter((d) => (!fStation || d.stationId === fStation) && (!fCat || d.categorie === fCat) && (!fStatut || d.statut === fStatut) && (!fMois || d.date.startsWith(fMois))).sort((a, b) => (a.date < b.date ? 1 : -1));
  const valides = rows.filter((d) => d.statut === "validee");
  const parCat = {};
  valides.forEach((d) => { parCat[d.categorie] = (parCat[d.categorie] || 0) + num(d.montant); });
  const enAttente = all.filter((d) => d.statut === "en_attente");

  const save = () => {
    setErr("");
    if (!form.stationId) { setErr("Choisissez une station."); return; }
    if (num(form.montant) <= 0) { setErr("Indiquez le montant."); return; }
    if (isFutureDate(form.date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const existing = form.id ? all.find((d) => d.id === form.id) : null;
    const row = {
      id: form.id || uid(), stationId: isGerant ? profile.stationId : form.stationId, date: form.date, categorie: form.categorie, montant: form.montant,
      beneficiaire: (form.beneficiaire || "").trim(), description: (form.description || "").trim(), mode: form.mode,
      payeeParCaisse: form.mode === "Espèces" && !!form.payeeParCaisse,
      // Saisie d'un gérant : en attente de validation. Saisie de l'administrateur : validée.
      statut: existing ? (isAdmin ? existing.statut : "en_attente") : (isAdmin ? "validee" : "en_attente"),
      creePar: existing?.creePar || profile.name, validePar: isAdmin ? (existing?.validePar || profile.name) : "",
      timestamp: existing?.timestamp || new Date().toISOString(),
    };
    let next = { ...db, depenses: existing ? db.depenses.map((d) => (d.id === row.id ? row : d)) : [...(db.depenses || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: row.stationId, entity: "dépense", action: existing ? "modification" : "création", after: { categorie: row.categorie, montant: row.montant, statut: row.statut } });
    setDb(next); setForm(null);
  };
  const setStatut = (d, statut) => {
    setDb(withAudit({ ...db, depenses: db.depenses.map((x) => (x.id === d.id ? { ...x, statut, validePar: profile.name } : x)) }, { user: profile?.name, role: profile?.role, stationId: d.stationId, entity: "dépense", action: statut === "validee" ? "validation" : "refus", after: { montant: d.montant, categorie: d.categorie } }));
  };
  const remove = (d) => {
    if (!confirm("Supprimer cette dépense ?")) return;
    setDb(withAudit({ ...db, depenses: db.depenses.filter((x) => x.id !== d.id) }, { user: profile?.name, role: profile?.role, stationId: d.stationId, entity: "dépense", action: "suppression", before: { montant: d.montant, categorie: d.categorie } }));
  };
  const statutPill = (st) => st === "validee" ? <Pill tone="success">Validée</Pill> : st === "refusee" ? <Pill tone="danger">Refusée</Pill> : <Pill tone="amber">En attente</Pill>;
  const stNom = (id) => db.stations.find((s) => s.id === id)?.nom || "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="smi-display text-2xl">Dépenses</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>{isAdmin ? "Dépenses des stations par catégorie. Celles saisies par un gérant attendent votre validation." : "Saisissez les dépenses de votre station : l'administrateur les valide."} Une dépense payée en espèces par la caisse est déduite de la caisse attendue du jour.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={rows.length === 0} onClick={() => exportCsv(`depenses-${fMois || "toutes"}`, ["Date", "Station", "Catégorie", "Bénéficiaire", "Description", "Mode", "Payée par la caisse", "Montant", "Statut", "Saisie par"], rows.map((d) => [d.date, stNom(d.stationId), d.categorie, d.beneficiaire, d.description, d.mode, d.payeeParCaisse ? "oui" : "non", num(d.montant), d.statut, d.creePar]))}><Download size={16} /> CSV</Button>
          <Button onClick={() => { setErr(""); setForm(vide()); }}><Plus size={16} /> Dépense</Button>
        </div>
      </div>

      {isAdmin && enAttente.length > 0 && (
        <Card style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-sm font-semibold" style={{ color: C.amber }}>{enAttente.length} dépense{enAttente.length > 1 ? "s" : ""} en attente de validation</p>
        </Card>
      )}

      {form && (
        <Card className="max-w-2xl">
          <p className="font-semibold mb-3">{form.id ? "Modifier la dépense" : "Nouvelle dépense"}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Station"><StationSelect stations={db.stations} value={form.stationId} onChange={(v) => setForm({ ...form, stationId: v })} disabled={isGerant} /></Field>
            <Field label="Date"><TextInput type="date" value={form.date} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Catégorie"><SelectInput value={form.categorie} onChange={(e) => setForm({ ...form, categorie: e.target.value })}>{DEPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</SelectInput></Field>
            <Field label="Montant"><NumberInput value={form.montant} onChange={(e) => setForm({ ...form, montant: e.target.value })} /></Field>
            <Field label="Bénéficiaire"><input className={inputCls} style={inputSty()} value={form.beneficiaire} onChange={(e) => setForm({ ...form, beneficiaire: e.target.value })} /></Field>
            <Field label="Mode de paiement"><SelectInput value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>{MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}</SelectInput></Field>
          </div>
          <div className="mt-3"><Field label="Description"><input className={inputCls} style={inputSty()} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field></div>
          {form.mode === "Espèces" && (
            <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={!!form.payeeParCaisse} onChange={(e) => setForm({ ...form, payeeParCaisse: e.target.checked })} /> Payée avec l'argent de la caisse de la station</label>
          )}
          {err && <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button></div>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Mois"><TextInput type="month" value={fMois} onChange={(e) => setFMois(e.target.value)} /></Field>
          {!isGerant && <Field label="Station"><SelectInput value={fStation} onChange={(e) => setFStation(e.target.value)}><option value="">Toutes</option>{db.stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</SelectInput></Field>}
          <Field label="Catégorie"><SelectInput value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">Toutes</option>{DEPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</SelectInput></Field>
          <Field label="Statut"><SelectInput value={fStatut} onChange={(e) => setFStatut(e.target.value)}><option value="">Tous</option><option value="validee">Validée</option><option value="en_attente">En attente</option><option value="refusee">Refusée</option></SelectInput></Field>
        </div>
        <div className="flex flex-wrap gap-3 mt-3 items-center">
          <span className="text-sm" style={{ color: C.textMuted }}>Total validé</span>
          <GaugeNumber value={fmtMontant(valides.reduce((a, d) => a + num(d.montant), 0))} tone="amber" />
          {Object.entries(parCat).sort((a, b) => b[1] - a[1]).map(([c, m]) => <Pill key={c}>{c} : {fmtMontant(m)}</Pill>)}
        </div>
      </Card>

      {rows.length === 0 ? <EmptyState icon={Wallet} title="Aucune dépense" hint="Aucune dépense pour ces filtres." /> : (
        <div className="flex flex-col gap-2">
          {rows.map((d) => (
            <div key={d.id} className="rounded-md p-3 flex items-center gap-3 flex-wrap" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{d.categorie} — <span className="smi-mono">{fmtMontant(d.montant)}</span></p>
                <p className="text-xs" style={{ color: C.textFaint }}>{fmtDateLong(d.date)} · {stNom(d.stationId)} · {d.mode}{d.payeeParCaisse ? " (caisse)" : ""}{d.beneficiaire ? ` · ${d.beneficiaire}` : ""}{d.description ? ` · ${d.description}` : ""} · saisie par {d.creePar || "—"}</p>
              </div>
              {statutPill(d.statut)}
              {isAdmin && d.statut === "en_attente" && <><Button onClick={() => setStatut(d, "validee")}>Valider</Button><Button variant="ghost" onClick={() => setStatut(d, "refusee")}>Refuser</Button></>}
              {(isAdmin || d.statut === "en_attente") && <button className="smi-btn" style={{ color: C.teal }} onClick={() => { setErr(""); setForm({ ...d }); }}><Pencil size={14} /></button>}
              {isAdmin && <button className="smi-btn" style={{ color: C.danger }} onClick={() => remove(d)}><Trash2 size={14} /></button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Résultat d'une période, station par station : chiffre d'affaires (relevés × prix de vente),
// coût du carburant vendu (litres × prix d'achat moyen des livraisons), dépenses validées.
function ResultatView({ db }) {
  const premier = todayISO().slice(0, 8) + "01";
  const [du, setDu] = useState(premier);
  const [au, setAu] = useState(todayISO());
  const [stationId, setStationId] = useState("");

  const calc = useMemo(() => {
    const stations = db.stations.filter((s) => !stationId || s.id === stationId);
    const lignes = stations.map((s) => {
      const dates = [...new Set(db.releves.filter((r) => r.stationId === s.id && r.date >= du && r.date <= au).map((r) => r.date))];
      let ca = 0, lE = 0, lG = 0;
      dates.forEach((d) => { const v = computeVente(db.releves, db.ventes, s.id, d); ca += v.ca; lE += v.essence; lG += v.gasoil; });
      const pE = prixAchatMoyen(db, s.id, "essence", au), pG = prixAchatMoyen(db, s.id, "gasoil", au);
      const coutManquant = (lE > 0 && pE === null) || (lG > 0 && pG === null);
      const cout = lE * (pE || 0) + lG * (pG || 0);
      const deps = (db.depenses || []).filter((d) => d.stationId === s.id && d.statut === "validee" && d.date >= du && d.date <= au);
      const depenses = deps.reduce((a, d) => a + num(d.montant), 0);
      const achats = db.receptions.filter((r) => r.stationId === s.id && r.date >= du && r.date <= au).reduce((a, r) => a + montantReception(r, db), 0);
      const bons = (db.bons || []).filter((b) => b.stationId === s.id && b.date >= du && b.date <= au).reduce((a, b) => a + bonTotal(b), 0);
      const parCat = {};
      deps.forEach((d) => { parCat[d.categorie] = (parCat[d.categorie] || 0) + num(d.montant); });
      return { station: s, ca, lE, lG, pE, pG, cout, coutManquant, marge: ca - cout, depenses, resultat: ca - cout - depenses, achats, bons, parCat, devise: s.devise || "GNF" };
    });
    const tot = lignes.reduce((a, l) => ({ ca: a.ca + l.ca, cout: a.cout + l.cout, marge: a.marge + l.marge, depenses: a.depenses + l.depenses, resultat: a.resultat + l.resultat, achats: a.achats + l.achats, bons: a.bons + l.bons }), { ca: 0, cout: 0, marge: 0, depenses: 0, resultat: 0, achats: 0, bons: 0 });
    const parCat = {};
    lignes.forEach((l) => Object.entries(l.parCat).forEach(([c, m]) => { parCat[c] = (parCat[c] || 0) + m; }));
    return { lignes, tot, parCat };
  }, [db, du, au, stationId]);

  const dettes = (db.fournisseurs || []).reduce((a, f) => a + Math.max(0, soldeFournisseur(db, f)), 0);
  const manque = calc.lignes.some((l) => l.coutManquant);
  const row = (label, v, opts = {}) => (
    <div className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: opts.top ? `1px solid ${C.border}` : undefined }}>
      <span className="text-sm" style={{ color: opts.muted ? C.textFaint : C.text, fontWeight: opts.bold ? 700 : 400 }}>{label}</span>
      <span className="smi-mono text-sm" style={{ fontWeight: opts.bold ? 700 : 500, color: opts.color || C.text }}>{v}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl">Résultat</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Ventes − coût du carburant vendu − dépenses validées, sur la période choisie.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => exportCsv(`resultat-${du}-${au}`, ["Station", "Litres essence", "Litres gasoil", "Chiffre d'affaires", "Prix d'achat moyen essence", "Prix d'achat moyen gasoil", "Coût du carburant vendu", "Marge brute", "Dépenses", "Résultat", "Achats de la période", "Bons"], calc.lignes.map((l) => [l.station.nom, l.lE, l.lG, Math.round(l.ca), l.pE ? Math.round(l.pE) : "", l.pG ? Math.round(l.pG) : "", Math.round(l.cout), Math.round(l.marge), Math.round(l.depenses), Math.round(l.resultat), Math.round(l.achats), Math.round(l.bons)]))}><Download size={16} /> CSV</Button>
          <Button variant="ghost" onClick={() => window.print()}><Printer size={16} /> PDF</Button>
        </div>
      </div>

      <Card className="smi-no-print">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Du"><TextInput type="date" value={du} onChange={(e) => setDu(e.target.value)} /></Field>
          <Field label="Au"><TextInput type="date" value={au} onChange={(e) => setAu(e.target.value)} /></Field>
          <Field label="Station"><SelectInput value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">Toutes</option>{db.stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</SelectInput></Field>
          <div className="flex items-end gap-1 flex-wrap">
            {[["Ce mois", premier, todayISO()], ["30 jours", new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), todayISO()], ["Cette année", todayISO().slice(0, 4) + "-01-01", todayISO()]].map(([l, a, b]) => <Button key={l} variant="ghost" onClick={() => { setDu(a); setAu(b); }}>{l}</Button>)}
          </div>
        </div>
      </Card>

      <div className="hidden smi-print-only mb-1">
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Résultat du {fmtDateLong(du)} au {fmtDateLong(au)}</h1>
      </div>

      {manque && (
        <Card style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-sm" style={{ color: C.amber }}>Prix d'achat manquant pour certaines stations : saisissez le prix d'achat dans Réception pour que le coût du carburant vendu (et donc la marge) soit juste.</p>
        </Card>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <Card>
          <p className="font-semibold mb-2">{stationId ? db.stations.find((s) => s.id === stationId)?.nom : "Toutes les stations"}</p>
          {row("Chiffre d'affaires", fmtMontant(calc.tot.ca))}
          {row("− Coût du carburant vendu", fmtMontant(calc.tot.cout))}
          {row("= Marge brute", fmtMontant(calc.tot.marge), { bold: true, top: true })}
          {row("− Dépenses validées", fmtMontant(calc.tot.depenses))}
          {row("= Résultat", fmtMontant(calc.tot.resultat), { bold: true, top: true, color: calc.tot.resultat < 0 ? C.danger : C.success })}
          <div className="mt-2" />
          {row("Achats de carburant de la période", fmtMontant(calc.tot.achats), { muted: true })}
          {row("Bons de la période (non déduits)", fmtMontant(calc.tot.bons), { muted: true })}
          {row("Dettes fournisseurs (aujourd'hui)", fmtMontant(dettes), { muted: true, color: dettes > 0 ? C.danger : undefined })}
        </Card>
        <Card>
          <p className="font-semibold mb-2">Dépenses par catégorie</p>
          {Object.keys(calc.parCat).length === 0 ? <p className="text-sm" style={{ color: C.textFaint }}>Aucune dépense validée sur la période.</p>
            : Object.entries(calc.parCat).sort((a, b) => b[1] - a[1]).map(([c, m]) => <div key={c}>{row(c, fmtMontant(m))}</div>)}
        </Card>
      </div>

      {!stationId && calc.lignes.length > 1 && (
        <Card>
          <p className="font-semibold mb-2">Par station</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: C.textMuted }}><th className="text-left py-1.5 pr-3">Station</th><th className="text-right pr-3">Litres vendus</th><th className="text-right pr-3">Chiffre d'affaires</th><th className="text-right pr-3">Coût carburant</th><th className="text-right pr-3">Marge brute</th><th className="text-right pr-3">Dépenses</th><th className="text-right">Résultat</th></tr></thead>
              <tbody>
                {calc.lignes.map((l) => (
                  <tr key={l.station.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-1.5 pr-3">{l.station.nom}{l.coutManquant && <span style={{ color: C.amber }}> *</span>}</td>
                    <td className="text-right pr-3 smi-mono">{fmtVol(l.lE + l.lG)}</td>
                    <td className="text-right pr-3 smi-mono">{fmtMontant(l.ca, l.devise)}</td>
                    <td className="text-right pr-3 smi-mono">{fmtMontant(l.cout, l.devise)}</td>
                    <td className="text-right pr-3 smi-mono">{fmtMontant(l.marge, l.devise)}</td>
                    <td className="text-right pr-3 smi-mono">{fmtMontant(l.depenses, l.devise)}</td>
                    <td className="text-right smi-mono font-semibold" style={{ color: l.resultat < 0 ? C.danger : C.success }}>{fmtMontant(l.resultat, l.devise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {manque && <p className="text-xs mt-2" style={{ color: C.amber }}>* prix d'achat manquant : coût du carburant incomplet.</p>}
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ Clients à crédit ------------------------------ */

const bonsClient = (db, clientId) => (db.bons || []).filter((b) => b.clientId === clientId);
const reglementsClient = (db, clientId) => (db.reglementsClients || []).filter((r) => r.clientId === clientId);
function soldeClient(db, c) {
  return num(c.soldeInitial) + bonsClient(db, c.id).reduce((a, b) => a + bonTotal(b), 0) - reglementsClient(db, c.id).reduce((a, r) => a + num(r.montant), 0);
}
const parametresSociete = (db) => (db.parametres || []).find((x) => x.id === "societe") || {};

function ClientsView({ db, setDb, profile }) {
  const isAdmin = profile.role === "admin";
  const clients = db.clients || [];
  const [form, setForm] = useState(null);
  const [reg, setReg] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [facture, setFacture] = useState(null); // { client, du, au, numero, date, lignes, reglements }
  const [periode, setPeriode] = useState({ du: todayISO().slice(0, 8) + "01", au: todayISO() });
  const [showParams, setShowParams] = useState(false);
  const [params, setParams] = useState(() => ({ adresse: "", telephone: "", email: "", identifiant: "", mentions: "Paiement à réception de facture.", ...parametresSociete(db) }));
  const [err, setErr] = useState("");
  const stNom = (id) => db.stations.find((x) => x.id === id)?.nom || "—";

  const totalCreances = clients.reduce((a, c) => a + Math.max(0, soldeClient(db, c)), 0);

  const saveClient = () => {
    setErr("");
    if (!form.nom?.trim()) { setErr("Indiquez le nom du client."); return; }
    const row = { id: form.id || uid(), nom: form.nom.trim(), contact: (form.contact || "").trim(), telephone: (form.telephone || "").trim(), adresse: (form.adresse || "").trim(), plafond: form.plafond || "", soldeInitial: form.soldeInitial || "", delaiPaiement: form.delaiPaiement || "" };
    setDb(withAudit({ ...db, clients: form.id ? clients.map((c) => (c.id === row.id ? row : c)) : [...clients, row] }, { user: profile?.name, role: profile?.role, entity: "client", action: form.id ? "modification" : "création", after: { nom: row.nom, plafond: row.plafond } }));
    setForm(null);
  };
  const removeClient = (c) => {
    if (bonsClient(db, c.id).length || reglementsClient(db, c.id).length) { alert("Ce client a des bons ou des règlements : suppression impossible."); return; }
    if (!confirm(`Supprimer le client « ${c.nom} » ?`)) return;
    setDb(withAudit({ ...db, clients: clients.filter((x) => x.id !== c.id) }, { user: profile?.name, role: profile?.role, entity: "client", action: "suppression", before: { nom: c.nom } }));
  };
  const saveReg = () => {
    setErr("");
    if (num(reg.montant) <= 0) { setErr("Indiquez le montant reçu."); return; }
    if (isFutureDate(reg.date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const stationId = isAdmin ? reg.stationId : profile.stationId;
    if (reg.encaisseEnCaisse && !stationId) { setErr("Choisissez la station qui a reçu l'argent."); return; }
    const row = { id: uid(), clientId: reg.clientId, date: reg.date, montant: reg.montant, mode: reg.mode, stationId: stationId || "", encaisseEnCaisse: reg.mode === "Espèces" && !!reg.encaisseEnCaisse && !!stationId, note: (reg.note || "").trim(), saisiPar: profile.name, timestamp: new Date().toISOString() };
    setDb(withAudit({ ...db, reglementsClients: [...(db.reglementsClients || []), row] }, { user: profile?.name, role: profile?.role, stationId: row.stationId || null, entity: "règlement client", action: "création", after: { client: clients.find((c) => c.id === row.clientId)?.nom, montant: row.montant } }));
    setReg(null);
  };
  const removeReg = (r) => {
    if (!confirm("Supprimer ce règlement ?")) return;
    setDb(withAudit({ ...db, reglementsClients: db.reglementsClients.filter((x) => x.id !== r.id) }, { user: profile?.name, role: profile?.role, entity: "règlement client", action: "suppression", before: { montant: r.montant } }));
  };
  const saveParams = () => {
    const row = { ...params, id: "societe" };
    setDb({ ...db, parametres: [...(db.parametres || []).filter((x) => x.id !== "societe"), row] });
    setShowParams(false);
  };

  // Facture d'une période : tous les bons à crédit du client sur la période, numérotée et
  // enregistrée (pour garder une suite de numéros sans trou).
  const emettreFacture = (c) => {
    const lignes = bonsClient(db, c.id).filter((b) => b.date >= periode.du && b.date <= periode.au).sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!lignes.length) { alert("Aucun bon à crédit pour ce client sur cette période."); return; }
    const annee = todayISO().slice(0, 4);
    const n = (db.factures || []).filter((f) => f.numero.startsWith(`FAC-${annee}-`)).length + 1;
    const f = { id: uid(), numero: `FAC-${annee}-${String(n).padStart(4, "0")}`, clientId: c.id, date: todayISO(), du: periode.du, au: periode.au, montant: lignes.reduce((a, b) => a + bonTotal(b), 0), emisePar: profile.name };
    setDb(withAudit({ ...db, factures: [...(db.factures || []), f] }, { user: profile?.name, role: profile?.role, entity: "facture", action: "émission", after: { numero: f.numero, client: c.nom, montant: f.montant } }));
    setFacture(f);
  };

  if (facture) {
    const c = clients.find((x) => x.id === facture.clientId) || {};
    const ps = parametresSociete(db);
    const lignes = bonsClient(db, facture.clientId).filter((b) => b.date >= facture.du && b.date <= facture.au).sort((a, b) => (a.date < b.date ? -1 : 1));
    const total = lignes.reduce((a, b) => a + bonTotal(b), 0);
    const regs = reglementsClient(db, facture.clientId).filter((r) => r.date >= facture.du && r.date <= facture.au);
    const th = { textAlign: "left", padding: "6px 8px", borderBottom: "2px solid #333", fontSize: 12 };
    const td = { padding: "5px 8px", borderBottom: "1px solid #ddd", fontSize: 12 };
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 smi-no-print">
          <Button variant="ghost" onClick={() => setFacture(null)}>← Retour</Button>
          <Button onClick={() => window.print()}><Printer size={16} /> Imprimer / PDF</Button>
        </div>
        <div className="rounded-md p-6" style={{ background: "#fff", color: "#222", maxWidth: 800 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, borderBottom: "3px solid #003B73", paddingBottom: 12 }}>
            <div>
              <p style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()}</p>
              {ps.adresse && <p style={{ fontSize: 12 }}>{ps.adresse}</p>}
              {(ps.telephone || ps.email) && <p style={{ fontSize: 12 }}>{[ps.telephone, ps.email].filter(Boolean).join(" · ")}</p>}
              {ps.identifiant && <p style={{ fontSize: 12 }}>{ps.identifiant}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 20, fontWeight: 700, color: "#003B73" }}>FACTURE</p>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{facture.numero}</p>
              <p style={{ fontSize: 12 }}>Date : {fmtDateLong(facture.date)}</p>
              <p style={{ fontSize: 12 }}>Période : {fmtDateLong(facture.du)} au {fmtDateLong(facture.au)}</p>
            </div>
          </div>
          <div style={{ margin: "14px 0" }}>
            <p style={{ fontSize: 11, color: "#666" }}>FACTURÉ À</p>
            <p style={{ fontSize: 15, fontWeight: 700 }}>{c.nom}</p>
            {c.adresse && <p style={{ fontSize: 12 }}>{c.adresse}</p>}
            {(c.contact || c.telephone) && <p style={{ fontSize: 12 }}>{[c.contact, c.telephone].filter(Boolean).join(" · ")}</p>}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Date</th><th style={th}>Station</th><th style={th}>N° bon</th><th style={th}>Véhicule</th><th style={th}>Produit</th><th style={{ ...th, textAlign: "right" }}>Litres</th><th style={{ ...th, textAlign: "right" }}>Prix</th><th style={{ ...th, textAlign: "right" }}>Montant</th></tr></thead>
            <tbody>
              {lignes.map((b) => (
                <tr key={b.id}>
                  <td style={td}>{fmtDateLong(b.date)}</td><td style={td}>{stNom(b.stationId)}</td><td style={td}>{b.numeroBon || "—"}</td><td style={td}>{b.immatriculation || "—"}</td>
                  <td style={td}>{b.produit === "essence" ? "Essence" : b.produit === "gasoil" ? "Gasoil" : b.libelle}</td>
                  <td style={{ ...td, textAlign: "right" }}>{fmtVol(b.quantite)}</td><td style={{ ...td, textAlign: "right" }}>{fmtMontant(b.prixUnitaire)}</td><td style={{ ...td, textAlign: "right" }}>{fmtMontant(bonTotal(b))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <table style={{ minWidth: 300 }}>
              <tbody>
                <tr><td style={{ ...td, fontWeight: 700 }}>Total de la facture</td><td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMontant(total)}</td></tr>
                {regs.length > 0 && <tr><td style={td}>Règlements reçus sur la période</td><td style={{ ...td, textAlign: "right" }}>{fmtMontant(regs.reduce((a, r) => a + num(r.montant), 0))}</td></tr>}
                <tr><td style={{ ...td, fontWeight: 700, color: "#003B73" }}>Solde du compte au {fmtDateLong(todayISO())}</td><td style={{ ...td, textAlign: "right", fontWeight: 700, color: "#003B73" }}>{fmtMontant(soldeClient(db, c))}</td></tr>
              </tbody>
            </table>
          </div>
          {ps.mentions && <p style={{ fontSize: 11, color: "#555", marginTop: 18 }}>{ps.mentions}</p>}
          <p style={{ fontSize: 10, color: "#888", marginTop: 8 }}>Facture établie avec {APP_NAME}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="smi-display text-2xl">Clients à crédit</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Le carburant vendu à crédit se saisit dans Bons en choisissant le client. Ici : ce que chaque client doit, ses règlements, son plafond, et ses factures.</p>
        </div>
        {isAdmin && <div className="flex gap-2"><Button variant="ghost" onClick={() => setShowParams(!showParams)}><Settings2 size={16} /> En-tête des factures</Button><Button onClick={() => { setErr(""); setForm({ nom: "", contact: "", telephone: "", adresse: "", plafond: "", soldeInitial: "", delaiPaiement: "30" }); }}><Plus size={16} /> Client</Button></div>}
      </div>

      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm" style={{ color: C.textMuted }}>Total dû par les clients</span>
        <GaugeNumber value={fmtMontant(totalCreances)} tone={totalCreances > 0 ? "amber" : "muted"} size="lg" />
      </Card>

      {showParams && isAdmin && (
        <Card className="max-w-2xl">
          <p className="font-semibold mb-3">Coordonnées affichées sur les factures</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Adresse"><input className={inputCls} style={inputSty()} value={params.adresse} onChange={(e) => setParams({ ...params, adresse: e.target.value })} /></Field>
            <Field label="Téléphone"><input className={inputCls} style={inputSty()} value={params.telephone} onChange={(e) => setParams({ ...params, telephone: e.target.value })} /></Field>
            <Field label="E-mail"><input className={inputCls} style={inputSty()} value={params.email} onChange={(e) => setParams({ ...params, email: e.target.value })} /></Field>
            <Field label="RCCM / NIF"><input className={inputCls} style={inputSty()} value={params.identifiant} onChange={(e) => setParams({ ...params, identifiant: e.target.value })} /></Field>
          </div>
          <div className="mt-3"><Field label="Mentions en bas de facture"><input className={inputCls} style={inputSty()} value={params.mentions} onChange={(e) => setParams({ ...params, mentions: e.target.value })} /></Field></div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setShowParams(false)}>Annuler</Button><Button onClick={saveParams}>Enregistrer</Button></div>
        </Card>
      )}

      {form && (
        <Card className="max-w-2xl">
          <p className="font-semibold mb-3">{form.id ? "Modifier le client" : "Nouveau client"}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nom (entreprise ou personne)"><input className={inputCls} style={inputSty()} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></Field>
            <Field label="Contact"><input className={inputCls} style={inputSty()} value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></Field>
            <Field label="Téléphone"><input className={inputCls} style={inputSty()} value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} /></Field>
            <Field label="Adresse"><input className={inputCls} style={inputSty()} value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} /></Field>
            <Field label="Plafond de crédit" hint="Vide = sans plafond. Alerte quand le solde l'approche."><NumberInput value={form.plafond} onChange={(e) => setForm({ ...form, plafond: e.target.value })} /></Field>
            <Field label="Délai de paiement (jours)"><NumberInput value={form.delaiPaiement} onChange={(e) => setForm({ ...form, delaiPaiement: e.target.value })} /></Field>
            <Field label="Solde de départ dû" hint="Ce que le client devait déjà avant l'application."><NumberInput value={form.soldeInitial} onChange={(e) => setForm({ ...form, soldeInitial: e.target.value })} /></Field>
          </div>
          {err && <p className="text-xs mt-3" style={{ color: C.danger }}>{err}</p>}
          <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button onClick={saveClient}><CheckCircle2 size={16} /> Enregistrer</Button></div>
        </Card>
      )}

      {clients.length === 0 && !form && <EmptyState icon={Users} title="Aucun client à crédit" hint={isAdmin ? "Ajoutez vos clients en compte (entreprises, flottes de véhicules...)." : "L'administrateur n'a pas encore créé de client."} />}

      <Card className="smi-no-print">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Période des factures — du"><TextInput type="date" value={periode.du} onChange={(e) => setPeriode({ ...periode, du: e.target.value })} /></Field>
          <Field label="au"><TextInput type="date" value={periode.au} onChange={(e) => setPeriode({ ...periode, au: e.target.value })} /></Field>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        {clients.map((c) => {
          const solde = soldeClient(db, c);
          const plafond = num(c.plafond);
          const ratio = plafond > 0 ? solde / plafond : 0;
          const bons = bonsClient(db, c.id).sort((a, b) => (a.date < b.date ? 1 : -1));
          const regs = reglementsClient(db, c.id).sort((a, b) => (a.date < b.date ? 1 : -1));
          const facts = (db.factures || []).filter((f) => f.clientId === c.id).sort((a, b) => (a.numero < b.numero ? 1 : -1));
          const surPeriode = bons.filter((b) => b.date >= periode.du && b.date <= periode.au);
          return (
            <Card key={c.id} className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div><p className="font-semibold">{c.nom}</p><p className="text-xs" style={{ color: C.textFaint }}>{[c.contact, c.telephone].filter(Boolean).join(" · ") || "—"}</p></div>
                {plafond > 0 && ratio >= 1 ? <Pill tone="danger">Plafond dépassé</Pill> : plafond > 0 && ratio >= 0.8 ? <Pill tone="amber">Proche du plafond</Pill> : solde > 0 ? <Pill tone="amber">Doit</Pill> : <Pill tone="success">À jour</Pill>}
              </div>
              <div className="flex items-center justify-between"><span className="text-xs" style={{ color: C.textFaint }}>Solde dû{plafond > 0 ? ` (plafond ${fmtMontant(plafond)})` : ""}</span><GaugeNumber value={fmtMontant(solde)} tone={solde > 0 ? "amber" : "muted"} /></div>
              {plafond > 0 && <div style={{ height: 6, borderRadius: 3, background: C.bgAlt }}><div style={{ width: `${Math.min(100, ratio * 100)}%`, height: "100%", borderRadius: 3, background: ratio >= 1 ? C.danger : ratio >= 0.8 ? C.amber : C.teal }} /></div>}
              <p className="text-xs" style={{ color: C.textFaint }}>{bons.length} bon(s) · {regs.length} règlement(s) · {surPeriode.length} bon(s) sur la période</p>
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => { setErr(""); setReg({ clientId: c.id, date: todayISO(), montant: solde > 0 ? String(Math.round(solde)) : "", mode: "Espèces", stationId: isAdmin ? "" : profile.stationId, encaisseEnCaisse: !isAdmin, note: "" }); }} disabled={solde <= 0}>Encaisser</Button>
                {isAdmin && <Button variant="ghost" onClick={() => emettreFacture(c)} disabled={surPeriode.length === 0}><Printer size={14} /> Facture de la période</Button>}
                <Button variant="ghost" onClick={() => setOpenId(openId === c.id ? null : c.id)}>{openId === c.id ? "Masquer" : "Relevé"}</Button>
                {isAdmin && <Button variant="ghost" onClick={() => { setErr(""); setForm({ ...c }); }}><Pencil size={14} /></Button>}
                {isAdmin && <Button variant="ghost" onClick={() => removeClient(c)}><Trash2 size={14} /></Button>}
              </div>
              {reg?.clientId === c.id && (
                <div className="rounded-md p-3 flex flex-col gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Date"><TextInput type="date" value={reg.date} max={todayISO()} onChange={(e) => setReg({ ...reg, date: e.target.value })} /></Field>
                    <Field label="Montant reçu"><NumberInput value={reg.montant} onChange={(e) => setReg({ ...reg, montant: e.target.value })} /></Field>
                    <Field label="Mode"><SelectInput value={reg.mode} onChange={(e) => setReg({ ...reg, mode: e.target.value })}>{MODES_PAIEMENT.map((m) => <option key={m}>{m}</option>)}</SelectInput></Field>
                    {isAdmin && <Field label="Station"><SelectInput value={reg.stationId} onChange={(e) => setReg({ ...reg, stationId: e.target.value })}><option value="">Direction / siège</option>{db.stations.map((st) => <option key={st.id} value={st.id}>{st.nom}</option>)}</SelectInput></Field>}
                  </div>
                  {reg.mode === "Espèces" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!reg.encaisseEnCaisse} onChange={(e) => setReg({ ...reg, encaisseEnCaisse: e.target.checked })} /> Argent reçu dans la caisse de la station</label>}
                  <Field label="Note"><input className={inputCls} style={inputSty()} value={reg.note} onChange={(e) => setReg({ ...reg, note: e.target.value })} /></Field>
                  {err && <p className="text-xs" style={{ color: C.danger }}>{err}</p>}
                  <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setReg(null)}>Annuler</Button><Button onClick={saveReg}>Enregistrer</Button></div>
                </div>
              )}
              {openId === c.id && (
                <div className="text-xs flex flex-col gap-1 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                  {facts.length > 0 && <div className="flex flex-wrap gap-1 mb-1">{facts.map((f) => <button key={f.id} className="smi-btn" onClick={() => setFacture(f)}><Pill tone="teal">{f.numero} · {fmtMontant(f.montant)}</Pill></button>)}</div>}
                  {[...bons.map((b) => ({ t: "b", d: b.date, x: b })), ...regs.map((r) => ({ t: "r", d: r.date, x: r }))].sort((a, b) => (a.d < b.d ? 1 : -1)).map(({ t, x }) => t === "b"
                    ? <div key={x.id} className="flex justify-between gap-2"><span>{fmtDateLong(x.date)} · {stNom(x.stationId)} · {x.produit || x.libelle} {fmtVol(x.quantite)}{x.immatriculation ? ` · ${x.immatriculation}` : ""}{x.numeroBon ? ` · bon ${x.numeroBon}` : ""}</span><span className="smi-mono">+ {fmtMontant(bonTotal(x))}</span></div>
                    : <div key={x.id} className="flex justify-between gap-2" style={{ color: C.success }}><span>{fmtDateLong(x.date)} · règlement {x.mode}{x.stationId ? ` · ${stNom(x.stationId)}` : ""}{x.note ? ` · ${x.note}` : ""}</span><span className="smi-mono flex items-center gap-2">− {fmtMontant(x.montant)}{isAdmin && <button className="smi-btn" style={{ color: C.danger }} onClick={() => removeReg(x)}><Trash2 size={12} /></button>}</span></div>)}
                  {bons.length + regs.length === 0 && <span style={{ color: C.textFaint }}>Aucun mouvement.</span>}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------ Compte station ------------------------------ */

// Compte d'une station envers son fournisseur, quand les versements des gérants paient le
// carburant reçu (comme le suivi « VERSEMENT » sur Excel) :
//   à verser  = stock de roulement de départ + réceptions, au prix de cession
//   reste     = à verser − versements − bons − dépenses payées par la caisse + ajustement
// Contrôle : ce que la station détient (stock restant au prix de cession + caisse non
// versée) doit couvrir le reste à verser ; la différence, une fois la marge de la station
// (prix de vente − prix de cession) prise en compte, est un manquant ou un excédent.
function calcCompteStation(db, stationId, jusquA = todayISO()) {
  const c = compteStation(db, stationId);
  if (!c || !c.dateDebut) return null;
  const d0 = c.dateDebut;
  const dans = (x) => x.stationId === stationId && x.date >= d0 && x.date <= jusquA;
  const pcE = num(c.prixCessionE), pcG = num(c.prixCessionG);
  const valeurDepart = num(c.stockInitialE) * pcE + num(c.stockInitialG) * pcG;
  const recs = db.receptions.filter(dans).sort((a, b) => (a.date < b.date ? -1 : 1));
  const valeurReceptions = recs.reduce((a, r) => a + montantReception(r, db), 0);
  const aVerser = valeurDepart + valeurReceptions;
  const versements = db.versements.filter(dans).reduce((a, v) => a + versementTotal(v), 0);
  const bons = (db.bons || []).filter(dans).reduce((a, b) => a + bonTotal(b), 0);
  const depensesCaisse = (db.depenses || []).filter((d) => dans(d) && d.payeeParCaisse && d.statut !== "refusee").reduce((a, d) => a + num(d.montant), 0);
  const ajustement = num(c.ajustement);
  // Ce sont les versements de la station qui paient : un règlement fait directement par la
  // direction au fournisseur ne change pas ce que la station doit.
  const paye = versements + bons + depensesCaisse;
  const reste = aVerser - paye + ajustement;

  // Contrôle par le stock et la caisse
  const lastStock = db.stocks.filter(dans).map((x) => x.date).sort().pop();
  const st = lastStock ? computeStock(db.releves, db.stocks, stationId, lastStock) : null;
  const stockE = st ? Math.max(0, stockAffichable(st, "essence")) : null;
  const stockG = st ? Math.max(0, stockAffichable(st, "gasoil")) : null;
  const pmE = prixAchatMoyen(db, stationId, "essence", jusquA) || pcE;
  const pmG = prixAchatMoyen(db, stationId, "gasoil", jusquA) || pcG;
  const valeurStock = st ? stockE * pmE + stockG * pmG : null;
  const lastCaisse = db.caisses.filter(dans).map((x) => x.date).sort().pop();
  const caisse = lastCaisse ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, stationId, lastCaisse, db.depenses, db.reglementsClients) : null;
  const caisseNonVersee = caisse ? (caisse.caisseDuJour ?? caisse.caisseAttendue) : 0;
  const dates = [...new Set(db.releves.filter(dans).map((r) => r.date))];
  let ca = 0, lE = 0, lG = 0;
  dates.forEach((d) => { const v = computeVente(db.releves, db.ventes, stationId, d); ca += v.ca; lE += v.essence; lG += v.gasoil; });
  const marge = ca - (lE * pmE + lG * pmG);
  const ecart = valeurStock === null ? null : reste - (valeurStock + caisseNonVersee) + marge; // > 0 : manquant

  // Livraison par livraison (le plus ancien est payé en premier)
  // Un ajustement négatif agit comme un paiement ; un ajustement positif comme une somme due de plus.
  let dispo = paye + Math.max(0, -ajustement);
  const lots = [];
  if (valeurDepart > 0) lots.push({ id: "depart", date: d0, libelle: "Stock de roulement de départ", litres: num(c.stockInitialE) + num(c.stockInitialG), montant: valeurDepart });
  if (ajustement > 0) lots.push({ id: "ajustement", date: d0, libelle: `Ajustement de reprise${c.ajustementLibelle ? ` (${c.ajustementLibelle})` : ""}`, litres: 0, montant: ajustement });
  recs.forEach((r) => lots.push({ id: r.id, date: r.date, libelle: `${r.produit === "essence" ? "Essence" : "Gasoil"}${r.numeroBon ? ` · bon ${r.numeroBon}` : ""}`, litres: num(r.quantite), montant: montantReception(r, db) }));
  lots.forEach((l) => { const p = Math.min(l.montant, Math.max(0, dispo)); l.paye = p; l.reste = l.montant - p; dispo -= p; });

  return { compte: c, valeurDepart, valeurReceptions, aVerser, versements, bons, depensesCaisse, ajustement, paye, reste, stockE, stockG, valeurStock, stockDate: lastStock, caisseNonVersee, caisseDate: lastCaisse, ca, litres: lE + lG, marge, ecart, lots };
}

function CompteStationView({ db, setDb, profile }) {
  const isAdmin = profile.role === "admin";
  const stations = isAdmin ? db.stations : db.stations.filter((s) => s.id === profile.stationId);
  const [stationId, setStationId] = useState(stations[0]?.id || "");
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";
  const c = compteStation(db, stationId);
  const r = useMemo(() => (stationId ? calcCompteStation(db, stationId) : null), [db, stationId]);
  const resume = useMemo(() => stations.map((s) => ({ s, r: calcCompteStation(db, s.id) })), [db, stations]);

  const openEdit = () => { setErr(""); setEdit(c ? { ...c } : { stationId, dateDebut: todayISO(), stockInitialE: "", stockInitialG: "", prixCessionE: "", prixCessionG: "", fournisseurId: "", ajustement: "", ajustementLibelle: "" }); };
  const save = () => {
    setErr("");
    if (!edit.dateDebut) { setErr("Indiquez la date de début du suivi."); return; }
    if (num(edit.prixCessionE) <= 0 && num(edit.prixCessionG) <= 0) { setErr("Indiquez au moins un prix de cession."); return; }
    const row = { ...edit, id: c?.id || uid(), stationId };
    setDb(withAudit({ ...db, comptesStations: [...(db.comptesStations || []).filter((x) => x.stationId !== stationId), row] }, { user: profile?.name, role: profile?.role, stationId, entity: "compte station", action: c ? "modification" : "création", after: { dateDebut: row.dateDebut, prixCessionE: row.prixCessionE, prixCessionG: row.prixCessionG, ajustement: row.ajustement } }));
    setEdit(null);
  };
  const ligne = (label, v, o = {}) => (
    <div className="flex items-center justify-between gap-3 py-1.5" style={{ borderTop: o.top ? `1px solid ${C.border}` : undefined }}>
      <span className="text-sm" style={{ color: o.muted ? C.textFaint : C.text, fontWeight: o.bold ? 700 : 400 }}>{label}</span>
      <span className="smi-mono text-sm" style={{ fontWeight: o.bold ? 700 : 500, color: o.color || C.text }}>{v}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="smi-display text-2xl">Compte station</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Ce que chaque station doit au fournisseur quand les versements paient le carburant reçu : valeur à verser au prix de cession, versements, reste à verser, et contrôle par le stock et la caisse.</p>
        </div>
        {isAdmin && stations.length > 1 && <div className="w-56"><SelectInput value={stationId} onChange={(e) => { setStationId(e.target.value); setEdit(null); }}>{stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</SelectInput></div>}
      </div>

      {isAdmin && stations.length > 1 && (
        <Card>
          <p className="font-semibold mb-2">Toutes les stations</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: C.textMuted }}><th className="text-left py-1 pr-3">Station</th><th className="text-right pr-3">À verser</th><th className="text-right pr-3">Versé (+ bons, dépenses)</th><th className="text-right pr-3">Reste à verser</th><th className="text-right">Manquant / excédent</th></tr></thead>
              <tbody>
                {resume.map(({ s, r: x }) => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${C.border}`, cursor: "pointer" }} onClick={() => setStationId(s.id)}>
                    <td className="py-1.5 pr-3">{s.nom}</td>
                    {x ? <>
                      <td className="text-right pr-3 smi-mono">{fmtMontant(x.aVerser, s.devise)}</td>
                      <td className="text-right pr-3 smi-mono">{fmtMontant(x.paye, s.devise)}</td>
                      <td className="text-right pr-3 smi-mono font-semibold">{fmtMontant(x.reste, s.devise)}</td>
                      <td className="text-right smi-mono" style={{ color: x.ecart === null ? C.textFaint : x.ecart > 1000 ? C.danger : C.success }}>{x.ecart === null ? "—" : x.ecart > 1000 ? `Manque ${fmtMontant(x.ecart, s.devise)}` : x.ecart < -1000 ? `+${fmtMontant(-x.ecart, s.devise)}` : "Équilibré"}</td>
                    </> : <td colSpan={4} className="text-right text-xs" style={{ color: C.textFaint }}>Compte non paramétré</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {station && (!c || edit) && isAdmin && (
        <Card className="max-w-2xl">
          {!edit ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm" style={{ color: C.textMuted }}>Le compte de {station.nom} n'est pas encore paramétré.</p>
              <Button onClick={openEdit}>Paramétrer</Button>
            </div>
          ) : (
            <>
              <p className="font-semibold mb-3">Paramètres du compte — {station.nom}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Début du suivi" hint="Les réceptions et versements comptent à partir de cette date."><TextInput type="date" value={edit.dateDebut} onChange={(e) => setEdit({ ...edit, dateDebut: e.target.value })} /></Field>
                <Field label="Fournisseur payé par les versements"><SelectInput value={edit.fournisseurId} onChange={(e) => setEdit({ ...edit, fournisseurId: e.target.value })}><option value="">— Aucun —</option>{(db.fournisseurs || []).map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}</SelectInput></Field>
                <Field label="Stock de roulement de départ — essence (L)"><NumberInput value={edit.stockInitialE} onChange={(e) => setEdit({ ...edit, stockInitialE: e.target.value })} /></Field>
                <Field label="Stock de roulement de départ — gasoil (L)"><NumberInput value={edit.stockInitialG} onChange={(e) => setEdit({ ...edit, stockInitialG: e.target.value })} /></Field>
                <Field label={`Prix de cession essence (${devise}/L)`} hint="Fixé par le fournisseur. Une réception peut avoir son propre prix."><NumberInput value={edit.prixCessionE} onChange={(e) => setEdit({ ...edit, prixCessionE: e.target.value })} /></Field>
                <Field label={`Prix de cession gasoil (${devise}/L)`}><NumberInput value={edit.prixCessionG} onChange={(e) => setEdit({ ...edit, prixCessionG: e.target.value })} /></Field>
                <Field label={`Ajustement de reprise (${devise})`} hint="+ ajoute au reste à verser, − le diminue (correction ponctuelle)."><NumberInput value={edit.ajustement} onChange={(e) => setEdit({ ...edit, ajustement: e.target.value })} /></Field>
                <Field label="Motif de l'ajustement"><input className={inputCls} style={inputSty()} value={edit.ajustementLibelle} onChange={(e) => setEdit({ ...edit, ajustementLibelle: e.target.value })} /></Field>
              </div>
              {err && <p className="text-xs mt-3" style={{ color: C.danger }}>{err}</p>}
              <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setEdit(null)}>Annuler</Button><Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button></div>
            </>
          )}
        </Card>
      )}

      {station && !c && !isAdmin && <EmptyState icon={Landmark} title="Compte non paramétré" hint="L'administrateur doit d'abord paramétrer le compte de votre station." />}

      {r && !edit && (
        <>
          <div className="grid md:grid-cols-2 gap-3">
            <Card>
              <div className="flex items-center justify-between mb-1">
                <p className="font-semibold">{station.nom} — depuis le {fmtDateLong(r.compte.dateDebut)}</p>
                {isAdmin && <button className="smi-btn text-xs flex items-center gap-1" style={{ color: C.teal }} onClick={openEdit}><Pencil size={12} /> Paramètres</button>}
              </div>
              {ligne("Stock de roulement de départ", fmtMontant(r.valeurDepart, devise))}
              {ligne("+ Réceptions", fmtMontant(r.valeurReceptions, devise))}
              {ligne("= Total à verser", fmtMontant(r.aVerser, devise), { bold: true, top: true })}
              {ligne("− Versements", fmtMontant(r.versements, devise))}
              {ligne("− Bons", fmtMontant(r.bons, devise))}
              {r.depensesCaisse > 0 && ligne("− Dépenses payées par la caisse", fmtMontant(r.depensesCaisse, devise))}
              {r.ajustement !== 0 && ligne(`${r.ajustement > 0 ? "+" : "−"} Ajustement${r.compte.ajustementLibelle ? ` (${r.compte.ajustementLibelle})` : ""}`, fmtMontant(Math.abs(r.ajustement), devise))}
              {ligne("= Reste à verser", fmtMontant(r.reste, devise), { bold: true, top: true, color: r.reste > 0 ? C.amber : C.success })}
              {r.compte.fournisseurId && <p className="text-xs mt-1" style={{ color: C.textFaint }}>Les versements de cette station paient {(db.fournisseurs || []).find((f) => f.id === r.compte.fournisseurId)?.nom || "le fournisseur"} : ce reste à verser compte dans sa dette.</p>}
            </Card>
            <Card>
              <p className="font-semibold mb-1">Contrôle par le stock et la caisse</p>
              {r.valeurStock === null ? <p className="text-sm" style={{ color: C.textFaint }}>Aucun contrôle de stock depuis le début du suivi.</p> : (
                <>
                  {ligne(`Stock restant (${fmtDateLong(r.stockDate)})`, `${fmtVol(r.stockE + r.stockG)} · ${fmtMontant(r.valeurStock, devise)}`)}
                  {ligne(`Caisse non versée${r.caisseDate ? ` (${fmtDateLong(r.caisseDate)})` : ""}`, fmtMontant(r.caisseNonVersee, devise))}
                  {ligne("= Ce que la station détient", fmtMontant(r.valeurStock + r.caisseNonVersee, devise), { bold: true, top: true })}
                  {ligne("Marge de la station (vente − cession)", fmtMontant(r.marge, devise), { muted: true })}
                  <div className="rounded-md p-3 mt-2" style={{ background: r.ecart > 1000 ? C.dangerSoft : C.panelAlt, border: `1px solid ${r.ecart > 1000 ? C.danger : C.border}` }}>
                    <p className="text-xs uppercase font-semibold" style={{ color: r.ecart > 1000 ? C.danger : C.textMuted }}>{r.ecart > 1000 ? "Manquant à expliquer" : r.ecart < -1000 ? "Excédent" : "Compte équilibré"}</p>
                    <GaugeNumber value={fmtMontant(Math.abs(r.ecart), devise)} tone={r.ecart > 1000 ? "danger" : "muted"} size="lg" />
                    <p className="text-xs mt-1" style={{ color: C.textFaint }}>Reste à verser − ce que la station détient + sa marge. Un manquant vient d'un écart de stock, d'argent non versé ou d'une saisie oubliée.</p>
                  </div>
                </>
              )}
            </Card>
          </div>

          <Card>
            <p className="font-semibold mb-2">Livraison par livraison <span className="text-xs font-normal" style={{ color: C.textFaint }}>(les plus anciennes sont payées en premier)</span></p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ color: C.textMuted }}><th className="text-left py-1 pr-3">Date</th><th className="text-left pr-3">Livraison</th><th className="text-right pr-3">Litres</th><th className="text-right pr-3">Montant</th><th className="text-right pr-3">Payé</th><th className="text-right pr-3">Reste</th><th className="text-right">Statut</th></tr></thead>
                <tbody>
                  {r.lots.map((l) => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-1.5 pr-3">{fmtDateLong(l.date)}</td><td className="pr-3">{l.libelle}</td>
                      <td className="text-right pr-3 smi-mono">{fmtVol(l.litres)}</td><td className="text-right pr-3 smi-mono">{fmtMontant(l.montant, devise)}</td>
                      <td className="text-right pr-3 smi-mono">{fmtMontant(l.paye, devise)}</td><td className="text-right pr-3 smi-mono">{fmtMontant(l.reste, devise)}</td>
                      <td className="text-right">{l.reste <= 1 ? <Pill tone="success">Soldée</Pill> : l.paye > 0 ? <Pill tone="amber">En cours</Pill> : <Pill tone="muted">À payer</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* --------------------------- Tableau de bord financier --------------------------- */

const isoAddDays = (iso, n) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Courbe simple des entrées (ventes) et sorties (dépenses + paiements fournisseurs) jour par jour.
function CourbeFlux({ jours, entrees, sorties }) {
  const W = 640, H = 170, mx = Math.max(1, ...entrees, ...sorties);
  const x = (i) => 40 + (i * (W - 60)) / Math.max(1, jours.length - 1);
  const y = (v) => H - 20 - (v / mx) * (H - 40);
  const pts = (a) => a.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const aire = (a, c) => (<g><polygon points={`${x(0)},${H - 20} ${pts(a)} ${x(a.length - 1)},${H - 20}`} fill={c} opacity="0.15" /><polyline points={pts(a)} fill="none" stroke={c} strokeWidth="2.5" />{a.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={c} />)}</g>);
  const court = (v) => v >= 1e9 ? `${(v / 1e9).toFixed(1)} Md` : v >= 1e6 ? `${(v / 1e6).toFixed(0)} M` : `${Math.round(v / 1000)} k`;
  return (
    <svg viewBox={`0 0 ${W} ${H + 6}`} width="100%" role="img" aria-label="Entrées et sorties par jour">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1="40" x2={W - 20} y1={y(mx * f)} y2={y(mx * f)} stroke={C.border} strokeDasharray="3 3" /><text x="2" y={y(mx * f) + 4} fontSize="10" fill={C.textFaint}>{court(mx * f)}</text></g>)}
      {aire(entrees, C.teal)}
      {aire(sorties, C.amber)}
      {jours.map((d, i) => <text key={d} x={x(i)} y={H + 2} fontSize="10" textAnchor="middle" fill={C.textFaint}>{d.slice(8)}/{d.slice(5, 7)}</text>)}
    </svg>
  );
}

function FinanceOverview({ db }) {
  const [periode, setPeriode] = useState("mois");
  const [stationId, setStationId] = useState("");
  const today = todayISO();
  const annee = today.slice(0, 4);

  const data = useMemo(() => {
    const stations = db.stations.filter((s) => !stationId || s.id === stationId);
    const ids = new Set(stations.map((s) => s.id));
    // Ventes par jour et par station (litres + CA), calculées une seule fois.
    const ventesJour = {}; // date -> { ca, e: {stationId: litres}, g: {...} }
    const cles = new Set(db.releves.filter((r) => ids.has(r.stationId)).map((r) => `${r.stationId}|${r.date}`));
    cles.forEach((k) => {
      const [sid, d] = k.split("|");
      const v = computeVente(db.releves, db.ventes, sid, d);
      const j = (ventesJour[d] = ventesJour[d] || { ca: 0, l: [] });
      j.ca += v.ca; j.l.push({ sid, e: v.essence, g: v.gasoil });
    });
    const caEntre = (a, b) => Object.entries(ventesJour).filter(([d]) => d >= a && d <= b).reduce((t, [, j]) => t + j.ca, 0);
    const coutEntre = (a, b) => Object.entries(ventesJour).filter(([d]) => d >= a && d <= b).reduce((t, [, j]) => t + j.l.reduce((u, x) => u + x.e * (prixAchatMoyen(db, x.sid, "essence", b) || 0) + x.g * (prixAchatMoyen(db, x.sid, "gasoil", b) || 0), 0), 0);
    const deps = (db.depenses || []).filter((d) => ids.has(d.stationId) && d.statut === "validee");
    const depEntre = (a, b) => deps.filter((d) => d.date >= a && d.date <= b).reduce((t, d) => t + num(d.montant), 0);
    const paiementsFour = (a, b) => (db.paiementsFournisseurs || []).filter((p) => (!stationId || p.stationId === stationId) && p.date >= a && p.date <= b).reduce((t, p) => t + num(p.montant), 0)
      + db.receptions.filter((r) => ids.has(r.stationId) && r.date >= a && r.date <= b).reduce((t, r) => t + num(r.montantPaye), 0);
    const versEntre = (a, b) => db.versements.filter((v) => ids.has(v.stationId) && v.date >= a && v.date <= b).reduce((t, v) => t + versementTotal(v), 0);

    const du = periode === "jour" ? today : periode === "7j" ? isoAddDays(today, -6) : today.slice(0, 8) + "01";
    // Valeur du stock en cuve : dernier contrôle de chaque station, au prix de vente et au prix d'achat moyen.
    let litres = 0, valeurVente = 0, valeurAchat = 0, achatConnu = true;
    stations.forEach((s) => {
      const last = db.stocks.filter((x) => x.stationId === s.id).map((x) => x.date).sort().pop();
      if (!last) return;
      const st = computeStock(db.releves, db.stocks, s.id, last);
      const v = findVente(db.ventes, s.id, last) || latestBefore(db.ventes, s.id, last) || {};
      ["essence", "gasoil"].forEach((p) => {
        const l = Math.max(0, stockAffichable(st, p));
        litres += l;
        valeurVente += l * num(p === "essence" ? v.prixEssence : v.prixGasoil);
        const pa = prixAchatMoyen(db, s.id, p, today);
        if (pa === null && l > 0) achatConnu = false;
        valeurAchat += l * (pa || 0);
      });
    });
    const mois = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"].map((nom, i) => {
      const a = `${annee}-${String(i + 1).padStart(2, "0")}-01`;
      const b = `${annee}-${String(i + 1).padStart(2, "0")}-31`;
      const ventes = caEntre(a, b), cout = coutEntre(a, b), depenses = depEntre(a, b);
      return { nom, ventes, cout, depenses, resultat: ventes - cout - depenses, courant: today.slice(5, 7) === String(i + 1).padStart(2, "0") };
    });
    const jours = [...Array(7)].map((_, i) => isoAddDays(today, i - 6));
    return {
      ca: caEntre(du, today), caJour: caEntre(today, today),
      depenses: depEntre(du, today), depJour: depEntre(today, today),
      versements: versEntre(du, today),
      litres, valeurVente, valeurAchat, achatConnu, mois,
      totAnnee: mois.reduce((t, m) => ({ ventes: t.ventes + m.ventes, cout: t.cout + m.cout, depenses: t.depenses + m.depenses, resultat: t.resultat + m.resultat }), { ventes: 0, cout: 0, depenses: 0, resultat: 0 }),
      jours, entrees: jours.map((d) => caEntre(d, d)), sorties: jours.map((d) => depEntre(d, d) + paiementsFour(d, d)),
      dettes: (db.fournisseurs || []).reduce((t, f) => t + Math.max(0, soldeFournisseur(db, f)), 0),
      creances: (db.clients || []).reduce((t, c) => t + Math.max(0, soldeClient(db, c)), 0),
    };
  }, [db, periode, stationId, today, annee]);

  const Kpi = ({ titre, valeur, bas, droite, tone = "teal" }) => (
    <div className="rounded-lg p-3 flex flex-col gap-1" style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: `3px solid ${tone === "amber" ? C.amber : tone === "danger" ? C.danger : C.teal}` }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: C.textFaint }}>{titre}</span>
      <span className="smi-mono text-lg font-bold">{valeur}</span>
      {bas && <div className="flex justify-between text-xs" style={{ color: C.textMuted }}><span>{bas}</span><span className="smi-mono">{droite}</span></div>}
    </div>
  );
  const libPeriode = periode === "jour" ? "aujourd'hui" : periode === "7j" ? "7 derniers jours" : "ce mois";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        {[["jour", "Jour"], ["7j", "7 jours"], ["mois", "Mois"]].map(([k, l]) => (
          <button key={k} onClick={() => setPeriode(k)} className="smi-btn rounded-full px-3 py-1 text-xs font-semibold" style={{ background: periode === k ? C.amber : C.bgAlt, color: periode === k ? "#fff" : C.textMuted, border: `1px solid ${periode === k ? C.amber : C.border}` }}>{l}</button>
        ))}
        <div className="ml-auto w-56"><SelectInput value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">Toutes les stations</option>{db.stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</SelectInput></div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi titre={`Chiffre d'affaires — ${libPeriode}`} valeur={fmtMontant(data.ca)} bas="Aujourd'hui" droite={fmtMontant(data.caJour)} />
        <Kpi titre="Valeur du stock en cuve" valeur={fmtMontant(data.valeurVente)} bas={`${fmtVol(data.litres)}${data.achatConnu && data.valeurAchat > 0 ? " · au prix d'achat" : ""}`} droite={data.achatConnu && data.valeurAchat > 0 ? fmtMontant(data.valeurAchat) : ""} />
        <Kpi titre={`Dépenses — ${libPeriode}`} valeur={fmtMontant(data.depenses)} bas="Aujourd'hui" droite={fmtMontant(data.depJour)} tone="amber" />
        <Kpi titre={`Résultat ${annee}`} valeur={fmtMontant(data.totAnnee.resultat)} bas="Ventes − coût − dépenses" droite="" tone={data.totAnnee.resultat < 0 ? "danger" : "teal"} />
        <Kpi titre={`Versements — ${libPeriode}`} valeur={fmtMontant(data.versements)} tone="teal" />
        <Kpi titre="Dettes fournisseurs" valeur={fmtMontant(data.dettes)} tone={data.dettes > 0 ? "danger" : "teal"} />
        <Kpi titre="Créances clients" valeur={fmtMontant(data.creances)} tone={data.creances > 0 ? "amber" : "teal"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <Card>
          <p className="font-semibold mb-2 flex justify-between"><span>Exercice {annee}</span><span className="smi-mono">{fmtMontant(data.totAnnee.resultat)}</span></p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: C.textMuted }}><th className="text-left py-1">Mois</th><th className="text-right">Ventes</th><th className="text-right">Coût carburant</th><th className="text-right">Dépenses</th><th className="text-right">Résultat</th></tr></thead>
              <tbody>
                {data.mois.map((m) => (
                  <tr key={m.nom} style={{ borderTop: `1px solid ${C.border}`, color: m.courant ? C.teal : m.ventes === 0 ? C.textFaint : C.text, fontWeight: m.courant ? 700 : 400 }}>
                    <td className="py-1">{m.nom}</td>
                    <td className="text-right smi-mono">{fmtMontant(m.ventes)}</td>
                    <td className="text-right smi-mono">{fmtMontant(m.cout)}</td>
                    <td className="text-right smi-mono" style={{ color: m.depenses ? C.amber : undefined }}>{fmtMontant(m.depenses)}</td>
                    <td className="text-right smi-mono" style={{ color: m.resultat < 0 ? C.danger : undefined }}>{fmtMontant(m.resultat)}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: `2px solid ${C.border}`, fontWeight: 700 }}>
                  <td className="py-1">Total</td>
                  <td className="text-right smi-mono">{fmtMontant(data.totAnnee.ventes)}</td>
                  <td className="text-right smi-mono">{fmtMontant(data.totAnnee.cout)}</td>
                  <td className="text-right smi-mono">{fmtMontant(data.totAnnee.depenses)}</td>
                  <td className="text-right smi-mono">{fmtMontant(data.totAnnee.resultat)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {!data.achatConnu && <p className="text-xs mt-2" style={{ color: C.amber }}>Prix d'achat manquant pour certaines livraisons : le coût du carburant est sous-estimé. Saisissez-le dans Réception.</p>}
        </Card>
        <Card>
          <p className="font-semibold mb-1">Entrées et sorties — 7 derniers jours</p>
          <p className="text-xs mb-2" style={{ color: C.textFaint }}><span style={{ color: C.teal }}>■</span> Ventes · <span style={{ color: C.amber }}>■</span> Dépenses et paiements fournisseurs</p>
          <CourbeFlux jours={data.jours} entrees={data.entrees} sorties={data.sorties} />
        </Card>
      </div>
    </div>
  );
}

function DashboardView({ db }) {
  const monthPrefix = todayISO().slice(0, 7);

  // useMemo évite de refaire tous ces calculs (potentiellement lourds sur plusieurs mois
  // de données) à chaque rendu déclenché par une saisie ailleurs dans l'app.
  const rows = useMemo(() => db.stations.map((s) => {
    const dates = new Set([
      ...db.releves.filter((r) => r.stationId === s.id && r.date.startsWith(monthPrefix)).map((r) => r.date),
    ]);
    let vEssence = 0, vGasoil = 0, ca = 0;
    dates.forEach((d) => {
      const v = computeVente(db.releves, db.ventes, s.id, d);
      vEssence += v.essence; vGasoil += v.gasoil; ca += v.ca;
    });
    const lastStockDate = [...db.stocks].filter((x) => x.stationId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
    const stock = lastStockDate ? computeStock(db.releves, db.stocks, s.id, lastStockDate) : null;
    const lastCaisseDate = [...db.caisses].filter((x) => x.stationId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
    const caisse = lastCaisseDate ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, s.id, lastCaisseDate, db.depenses, db.reglementsClients) : null;
    const totalVersements = db.versements.filter((v) => v.stationId === s.id && v.date.startsWith(monthPrefix)).reduce((a, v) => a + versementTotal(v), 0);

    // Rythme de vente moyen sur les 7 derniers jours (essence + gasoil confondus) — sert
    // de base pour estimer combien de jours il reste avant une rupture de stock.
    let rythme7j = 0;
    const today = new Date(`${todayISO()}T00:00:00`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const v = computeVente(db.releves, db.ventes, s.id, dateStr);
      rythme7j += v.essence + v.gasoil;
    }
    rythme7j = rythme7j / 7;

    const stockTotalActuel = stock ? stockAffichable(stock, "essence") + stockAffichable(stock, "gasoil") : null;
    const fondRoulement = num(s.fondRoulement);
    const joursAvantRupture = stockTotalActuel !== null && rythme7j > 0 ? stockTotalActuel / rythme7j : null;

    let statutStock = null;
    if (fondRoulement > 0 && stockTotalActuel !== null) {
      if (stockTotalActuel < fondRoulement || (joursAvantRupture !== null && joursAvantRupture <= 3)) {
        statutStock = "alerte";
      } else if (stockTotalActuel < fondRoulement * 1.2) {
        statutStock = "attention";
      } else {
        statutStock = "ok";
      }
    }

    return { station: s, vEssence, vGasoil, ca, stock, stockDate: lastStockDate, caisse, caisseDate: lastCaisseDate, totalVersements, rythme7j, stockTotalActuel, fondRoulement, joursAvantRupture, statutStock };
  }), [db.stations, db.releves, db.ventes, db.stocks, db.caisses, db.versements, monthPrefix]);

  const stationsEnAlerte = rows.filter((r) => r.statutStock === "alerte");
  const cuvesEnAlerte = useMemo(() => db.stations.flatMap((s) => etatCuvesStation(db, s.id).liste.filter((x) => x.statut === "alerte" || x.statut === "critique").map((x) => ({ ...x, station: s }))), [db]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Tableau de bord</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Vue financière du réseau, puis le détail station par station ({monthLabel(new Date().getMonth())}) — mise à jour automatique à chaque saisie.</p>
      </div>

      {db.stations.length > 0 && <FinanceOverview db={db} />}

      <h3 className="smi-display text-lg mt-2">Stations — mois en cours</h3>

      {stationsEnAlerte.length > 0 && (
        <Card style={{ background: C.dangerSoft, border: `1px solid ${C.danger}` }}>
          <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={16} /> {stationsEnAlerte.length} station{stationsEnAlerte.length > 1 ? "s" : ""} sous le fond de roulement — commande à déclencher</p>
          <p className="text-xs mt-1" style={{ color: C.danger }}>{stationsEnAlerte.map((r) => r.station.nom).join(", ")}</p>
        </Card>
      )}

      {cuvesEnAlerte.length > 0 && (
        <Card style={{ background: C.amberSoft, border: `1px solid ${C.amber}` }}>
          <p className="text-sm font-semibold flex items-center gap-1.5" style={{ color: C.amber }}><Droplet size={16} /> {cuvesEnAlerte.length} cuve{cuvesEnAlerte.length > 1 ? "s" : ""} sous le seuil d'alerte</p>
          <p className="text-xs mt-1" style={{ color: C.textMuted }}>{cuvesEnAlerte.map((x) => `${x.station.nom} — ${x.cuve.nom} (${x.pct} %${x.statut === "critique" ? ", critique" : ""})`).join(" · ")}</p>
        </Card>
      )}

      {db.stations.length === 0 ? (
        <EmptyState icon={LayoutDashboard} title="Aucune donnée à afficher" hint="Ajoutez des stations et saisissez des relevés pour alimenter le tableau de bord." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => {
            const devise = r.station.devise || "GNF";
            const statutColor = r.statutStock === "alerte" ? C.danger : r.statutStock === "attention" ? C.amber : r.statutStock === "ok" ? C.success : C.textFaint;
            const statutLabel = r.statutStock === "alerte" ? "Commander maintenant" : r.statutStock === "attention" ? "À surveiller" : r.statutStock === "ok" ? "Stock suffisant" : "Fond de roulement non défini";
            return (
            <Card key={r.station.id} className="flex flex-col gap-3 smi-live" style={{ animationName: "none", ...(r.station.couleur ? { background: `color-mix(in srgb, ${r.station.couleur} 14%, ${C.panel})`, border: `1px solid color-mix(in srgb, ${r.station.couleur} 40%, ${C.border})`, borderLeft: `4px solid ${r.station.couleur}` } : {}) }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold flex items-center gap-1.5">{r.station.couleur && <span style={{ width: 9, height: 9, borderRadius: 999, background: r.station.couleur, flexShrink: 0 }} />}{r.station.nom}</p>
                <Pill tone="amber">{devise}</Pill>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><p className="text-xs" style={{ color: C.textFaint }}>Essence (mois)</p><GaugeNumber value={fmtVol(r.vEssence)} tone="amber" /></div>
                <div><p className="text-xs" style={{ color: C.textFaint }}>Gasoil (mois)</p><GaugeNumber value={fmtVol(r.vGasoil)} tone="teal" /></div>
              </div>
              <div><p className="text-xs" style={{ color: C.textFaint }}>Chiffre d'affaires (mois)</p><GaugeNumber value={fmtMontant(r.ca, devise)} /></div>
              <div><p className="text-xs" style={{ color: C.textFaint }}>Versements (mois)</p><GaugeNumber value={fmtMontant(r.totalVersements, devise)} tone="muted" /></div>
              <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <div>
                  <p className="text-xs" style={{ color: C.textFaint }}>Stock actuel {r.stockDate ? `(${fmtDateLong(r.stockDate)})` : ""}</p>
                  {r.stock ? (
                    <div className="flex flex-col gap-1 mt-1">
                      <GaugeNumber value={`E ${fmtVol(stockAffichable(r.stock, "essence"))}`} tone="amber" />
                      <GaugeNumber value={`G ${fmtVol(stockAffichable(r.stock, "gasoil"))}`} tone="teal" />
                    </div>
                  ) : <p className="text-xs mt-1" style={{ color: C.textFaint }}>Aucun contrôle</p>}
                </div>
                <div>
                  <p className="text-xs" style={{ color: C.textFaint }}>Dernière caisse {r.caisseDate ? `(${fmtDateLong(r.caisseDate)})` : ""}</p>
                  {r.caisse ? <div className="mt-1"><GaugeNumber value={fmtMontant(r.caisse.caisseAttendue, devise)} /></div> : <p className="text-xs mt-1" style={{ color: C.textFaint }}>Aucune caisse</p>}
                </div>
              </div>

              <div className="rounded-md p-3 mt-1" style={{ background: `color-mix(in srgb, ${statutColor} 12%, transparent)`, border: `1px solid ${statutColor}` }}>
                <p className="text-xs uppercase font-semibold mb-1" style={{ color: statutColor }}>Fond de roulement</p>
                {r.fondRoulement > 0 ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs" style={{ color: C.textFaint }}>Stock total actuel</span>
                      <span className="smi-mono text-sm font-semibold">{r.stockTotalActuel !== null ? fmtVol(r.stockTotalActuel) : "—"} L</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs" style={{ color: C.textFaint }}>Seuil (fond de roulement)</span>
                      <span className="smi-mono text-sm">{fmtVol(r.fondRoulement)} L</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs" style={{ color: C.textFaint }}>Rythme de vente (7 j)</span>
                      <span className="smi-mono text-sm">{fmtVol(r.rythme7j)} L/j</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs" style={{ color: C.textFaint }}>Jours avant rupture (estimé)</span>
                      <span className="smi-mono text-sm font-semibold" style={{ color: statutColor }}>{r.joursAvantRupture !== null ? `${r.joursAvantRupture.toFixed(1)} j` : "—"}</span>
                    </div>
                    <p className="text-xs font-semibold mt-1.5" style={{ color: statutColor }}>{statutLabel}</p>
                  </>
                ) : (
                  <p className="text-xs" style={{ color: C.textFaint }}>Définissez le fond de roulement de cette station dans l'onglet Stations.</p>
                )}
              </div>
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Commandes réseau ------------------------------ */

// Recommandation de quantité à commander par station — croise stock physique actuel,
// fond de roulement (seuil cible), rythme de vente récent (essence/gasoil), et versements
// du mois (indicateur de capacité de financement), sans imposer de champ supplémentaire :
// tout est dérivé des saisies déjà existantes (Stock, Ventes, Versement, Stations).
const DELAI_LIVRAISON_JOURS = 3; // hypothèse : temps estimé entre commande et livraison

function CommandesReseauView({ db, setDb, profile }) {
  const monthPrefix = todayISO().slice(0, 7);
  const [openFormId, setOpenFormId] = useState(null);
  const [cDate, setCDate] = useState(todayISO());
  const [cProduit, setCProduit] = useState("essence");
  const [cQuantite, setCQuantite] = useState("");
  const [cJustification, setCJustification] = useState("");
  const [cErr, setCErr] = useState("");

  const openForm = (stationId, defaultQte) => {
    setOpenFormId(stationId);
    setCDate(todayISO());
    setCProduit("essence");
    setCQuantite(defaultQte ? String(Math.round(defaultQte)) : "");
    setCJustification("");
    setCErr("");
  };

  const saveCommande = (stationId, financableParProduit) => {
    setCErr("");
    if (!cQuantite || num(cQuantite) <= 0) { setCErr("Indiquez une quantité."); return; }
    const financable = financableParProduit?.[cProduit];
    const depasseFinancement = financable !== null && financable !== undefined && num(cQuantite) > financable;
    if (depasseFinancement && !cJustification.trim()) {
      setCErr("Cette quantité dépasse ce qui est finançable par les versements — indiquez une justification pour la direction.");
      return;
    }
    const row = { id: uid(), stationId, date: cDate, produit: cProduit, quantite: cQuantite, justification: depasseFinancement ? cJustification.trim() : "", statut: "en_cours", timestamp: new Date().toISOString() };
    let next = { ...db, commandesReseau: [...(db.commandesReseau || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "commande_reseau", action: "création", after: { date: cDate, produit: cProduit, quantite: cQuantite, justification: row.justification || undefined } });
    setDb(next);
    setOpenFormId(null);
  };

  const marquerLivree = (c) => {
    let next = { ...db, commandesReseau: db.commandesReseau.map((x) => (x.id === c.id ? { ...x, statut: "livree" } : x)) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: c.stationId, entity: "commande_reseau", action: "modification", after: { statut: "livree", produit: c.produit, quantite: c.quantite } });
    setDb(next);
  };

  const supprimerCommande = (c) => {
    if (!confirm("Supprimer cette commande en cours ?")) return;
    let next = { ...db, commandesReseau: db.commandesReseau.filter((x) => x.id !== c.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: c.stationId, entity: "commande_reseau", action: "suppression", before: { date: c.date, produit: c.produit, quantite: c.quantite } });
    setDb(next);
  };

  const rows = useMemo(() => db.stations.map((s) => {
    const lastStockDate = [...db.stocks].filter((x) => x.stationId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
    const stock = lastStockDate ? computeStock(db.releves, db.stocks, s.id, lastStockDate) : null;

    // Rythme de vente moyen sur 7 jours, par produit — sert à la fois à estimer les jours
    // avant rupture et à répartir le fond de roulement (donné en un seul chiffre total)
    // entre essence et gasoil, au prorata de ce qui se vend réellement.
    let rE = 0, rG = 0;
    const today = new Date(`${todayISO()}T00:00:00`);
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const v = computeVente(db.releves, db.ventes, s.id, dateStr);
      rE += v.essence; rG += v.gasoil;
    }
    rE /= 7; rG /= 7;
    const rTotal = rE + rG;
    const partE = rTotal > 0 ? rE / rTotal : 0.5;
    const partG = rTotal > 0 ? rG / rTotal : 0.5;

    const fondRoulement = num(s.fondRoulement);
    const fondRoulementE = fondRoulement * partE;
    const fondRoulementG = fondRoulement * partG;

    const stockE = stock ? stockAffichable(stock, "essence") : null;
    const stockG = stock ? stockAffichable(stock, "gasoil") : null;

    // Quantité suggérée = ce qui manque pour revenir au fond de roulement, plus une
    // marge couvrant la vente pendant le délai de livraison estimé.
    const manqueE = stockE !== null ? Math.max(0, fondRoulementE - stockE) : null;
    const manqueG = stockG !== null ? Math.max(0, fondRoulementG - stockG) : null;
    const suggEssence = manqueE !== null ? manqueE + rE * DELAI_LIVRAISON_JOURS : null;
    const suggGasoil = manqueG !== null ? manqueG + rG * DELAI_LIVRAISON_JOURS : null;
    const suggTotal = suggEssence !== null && suggGasoil !== null ? suggEssence + suggGasoil : null;

    // Quantité finançable : la direction exige les reçus de versement avant d'accepter
    // une commande — on calcule donc combien de litres les versements accumulés depuis la
    // dernière commande livrée permettent réellement de financer, au prix unitaire le plus
    // récemment saisi dans Ventes. La quantité recommandée ne peut jamais dépasser ça.
    const derniereCommandeLivree = (db.commandesReseau || [])
      .filter((c) => c.stationId === s.id && c.statut === "livree")
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const versementsDepuisLivraison = db.versements
      .filter((v) => v.stationId === s.id && (!derniereCommandeLivree || v.date > derniereCommandeLivree.date))
      .reduce((a, v) => a + versementTotal(v), 0);

    const derniereVente = [...db.ventes].filter((v) => v.stationId === s.id).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const prixEssence = derniereVente ? num(derniereVente.prixEssence) : 0;
    const prixGasoil = derniereVente ? num(derniereVente.prixGasoil) : 0;

    const financableEssence = prixEssence > 0 ? (versementsDepuisLivraison * partE) / prixEssence : null;
    const financableGasoil = prixGasoil > 0 ? (versementsDepuisLivraison * partG) / prixGasoil : null;

    // Quantité finalement recommandée = la plus petite entre ce qui est souhaitable (pour
    // revenir au fond de roulement) et ce qui est réellement finançable par les versements.
    const recoEssence = suggEssence !== null && financableEssence !== null ? Math.min(suggEssence, financableEssence) : suggEssence;
    const recoGasoil = suggGasoil !== null && financableGasoil !== null ? Math.min(suggGasoil, financableGasoil) : suggGasoil;
    const financementInsuffisant = (financableEssence !== null && suggEssence !== null && financableEssence < suggEssence)
      || (financableGasoil !== null && suggGasoil !== null && financableGasoil < suggGasoil);

    const totalVersements = db.versements.filter((v) => v.stationId === s.id && v.date.startsWith(monthPrefix)).reduce((a, v) => a + versementTotal(v), 0);
    const stockTotalActuel = stockE !== null && stockG !== null ? stockE + stockG : null;
    const joursAvantRupture = stockTotalActuel !== null && rTotal > 0 ? stockTotalActuel / rTotal : null;
    const urgent = joursAvantRupture !== null && joursAvantRupture <= DELAI_LIVRAISON_JOURS;

    const commandesEnCours = (db.commandesReseau || []).filter((c) => c.stationId === s.id && c.statut === "en_cours").sort((a, b) => (a.date < b.date ? 1 : -1));

    return { station: s, stock, stockDate: lastStockDate, rE, rG, fondRoulement, fondRoulementE, fondRoulementG, stockE, stockG, suggEssence, suggGasoil, suggTotal, totalVersements, joursAvantRupture, urgent, commandesEnCours, versementsDepuisLivraison, prixEssence, prixGasoil, financableEssence, financableGasoil, recoEssence, recoGasoil, financementInsuffisant, derniereCommandeLivree };
  }), [db.stations, db.releves, db.ventes, db.stocks, db.versements, db.commandesReseau, monthPrefix]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Commandes</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Estimation de la quantité à commander par station, à partir du stock actuel, du fond de roulement, du rythme de vente récent, et de la capacité de financement (versements depuis la dernière livraison). Hypothèse de délai de livraison : {DELAI_LIVRAISON_JOURS} jours.</p>
      </div>

      {db.stations.length === 0 ? (
        <EmptyState icon={Truck} title="Aucune station" />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => {
            const devise = r.station.devise || "GNF";
            return (
              <Card key={r.station.id} className="flex flex-col gap-3" style={r.station.couleur ? { background: `color-mix(in srgb, ${r.station.couleur} 14%, ${C.panel})`, border: `1px solid color-mix(in srgb, ${r.station.couleur} 40%, ${C.border})`, borderLeft: `4px solid ${r.station.couleur}` } : undefined}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold flex items-center gap-1.5">{r.station.couleur && <span style={{ width: 9, height: 9, borderRadius: 999, background: r.station.couleur, flexShrink: 0 }} />}{r.station.nom}</p>
                  {r.urgent && <Pill tone="danger">Urgent</Pill>}
                </div>

                {r.fondRoulement <= 0 ? (
                  <p className="text-xs" style={{ color: C.textFaint }}>Fond de roulement non défini — à saisir dans l'onglet Stations pour activer l'estimation.</p>
                ) : !r.stock ? (
                  <p className="text-xs" style={{ color: C.textFaint }}>Aucun contrôle de stock enregistré.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto smi-scroll">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                            <th className="text-left py-1" style={{ color: C.textMuted }}></th>
                            <th className="text-right py-1" style={{ color: C.textMuted }}>Essence</th>
                            <th className="text-right py-1" style={{ color: C.textMuted }}>Gasoil</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td className="py-1" style={{ color: C.textFaint }}>Stock actuel</td>
                            <td className="py-1 text-right smi-mono">{fmtVol(r.stockE)}</td>
                            <td className="py-1 text-right smi-mono">{fmtVol(r.stockG)}</td>
                          </tr>
                          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td className="py-1" style={{ color: C.textFaint }}>Seuil (fond de roulement)</td>
                            <td className="py-1 text-right smi-mono">{fmtVol(r.fondRoulementE)}</td>
                            <td className="py-1 text-right smi-mono">{fmtVol(r.fondRoulementG)}</td>
                          </tr>
                          <tr>
                            <td className="py-1" style={{ color: C.textFaint }}>Rythme de vente (7j)</td>
                            <td className="py-1 text-right smi-mono">{fmtVol(r.rE)}/j</td>
                            <td className="py-1 text-right smi-mono">{fmtVol(r.rG)}/j</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                      <p className="text-xs uppercase font-semibold mb-1.5" style={{ color: C.textMuted }}>Besoin idéal (pour revenir au fond de roulement)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px]" style={{ color: C.textFaint }}>Essence</p>
                          <GaugeNumber value={fmtVol(r.suggEssence)} tone="amber" />
                        </div>
                        <div>
                          <p className="text-[10px]" style={{ color: C.textFaint }}>Gasoil</p>
                          <GaugeNumber value={fmtVol(r.suggGasoil)} tone="teal" />
                        </div>
                      </div>
                      <p className="text-xs mt-2 pt-2" style={{ color: C.textFaint, borderTop: `1px solid ${C.border}` }}>
                        Total : {fmtVol(r.suggTotal)} L {r.joursAvantRupture !== null && `— ${r.joursAvantRupture.toFixed(1)} j avant rupture estimée`}
                      </p>
                    </div>

                    <div className="rounded-md p-3" style={{ background: r.urgent ? C.dangerSoft : C.amberSoft, border: `1px solid ${r.urgent ? C.danger : C.amberDim}` }}>
                      <p className="text-xs uppercase font-semibold mb-1.5" style={{ color: r.urgent ? C.danger : C.amber }}>Quantité recommandée (finançable par les versements)</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px]" style={{ color: C.textFaint }}>Essence</p>
                          <GaugeNumber value={fmtVol(r.recoEssence)} tone="amber" />
                        </div>
                        <div>
                          <p className="text-[10px]" style={{ color: C.textFaint }}>Gasoil</p>
                          <GaugeNumber value={fmtVol(r.recoGasoil)} tone="teal" />
                        </div>
                      </div>
                      {r.prixEssence <= 0 || r.prixGasoil <= 0 ? (
                        <p className="text-xs mt-2 pt-2" style={{ color: C.textFaint, borderTop: `1px solid ${C.border}` }}>Prix unitaire non trouvé dans Ventes — saisissez au moins une vente pour activer le calcul de financement.</p>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between text-xs mt-2 pt-2" style={{ color: C.textFaint, borderTop: `1px solid ${r.urgent ? C.danger : C.amberDim}` }}>
                            <span>Versements depuis dernière livraison{r.derniereCommandeLivree ? ` (${fmtDateLong(r.derniereCommandeLivree.date)})` : ""}</span>
                            <span className="smi-mono font-semibold" style={{ color: C.text }}>{fmtMontant(r.versementsDepuisLivraison, devise)}</span>
                          </div>
                          {r.financementInsuffisant && (
                            <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: C.danger }}><AlertTriangle size={12} /> Financement insuffisant pour couvrir le besoin idéal — reçus de versement à présenter en conséquence, ou compléter avant de commander.</p>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex items-baseline justify-between text-xs pt-1" style={{ color: C.textFaint }}>
                      <span>Versements du mois (info générale)</span>
                      <span className="smi-mono font-semibold" style={{ color: C.text }}>{fmtMontant(r.totalVersements, devise)}</span>
                    </div>
                  </>
                )}

                <div className="pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Commandes en cours</p>
                    {openFormId !== r.station.id && (
                      <button onClick={() => openForm(r.station.id, (r.recoEssence || 0) + (r.recoGasoil || 0))} className="smi-btn text-xs" style={{ color: C.teal }}><Plus size={13} /> Ajouter</button>
                    )}
                  </div>

                  {r.commandesEnCours.length === 0 && openFormId !== r.station.id && (
                    <p className="text-xs" style={{ color: C.textFaint }}>Aucune commande en cours.</p>
                  )}

                  {r.commandesEnCours.map((c) => (
                    <div key={c.id} className="py-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{fmtDateLong(c.date)} · {c.produit === "essence" ? "Essence" : "Gasoil"} · <span className="smi-mono">{fmtVol(c.quantite)} L</span></span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => marquerLivree(c)} className="smi-btn" style={{ color: C.success }} title="Marquer livrée"><CheckCircle2 size={14} /></button>
                          <button onClick={() => supprimerCommande(c)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      {c.justification && (
                        <p className="text-xs mt-0.5 pl-0.5" style={{ color: C.amber }}>↳ Justification : {c.justification}</p>
                      )}
                    </div>
                  ))}

                  {openFormId === r.station.id && (
                    <div className="rounded-md p-2.5 mt-2 flex flex-col gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                      <div className="grid grid-cols-2 gap-2">
                        <Field label="Date"><TextInput type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} max={todayISO()} /></Field>
                        <Field label="Produit">
                          <SelectInput value={cProduit} onChange={(e) => setCProduit(e.target.value)}>
                            <option value="essence">Essence</option>
                            <option value="gasoil">Gasoil</option>
                          </SelectInput>
                        </Field>
                      </div>
                      <Field label="Quantité commandée (L)"><NumberInput value={cQuantite} onChange={(e) => setCQuantite(e.target.value)} /></Field>
                      {(() => {
                        const financable = cProduit === "essence" ? r.financableEssence : r.financableGasoil;
                        const depasse = financable !== null && financable !== undefined && num(cQuantite) > financable;
                        return depasse ? (
                          <>
                            <p className="text-xs flex items-center gap-1.5" style={{ color: C.amber }}><AlertTriangle size={13} /> Dépasse le finançable ({fmtVol(financable)} L) — une justification est nécessaire pour la direction.</p>
                            <Field label="Justification pour la direction">
                              <textarea className="smi-input w-full rounded-md px-3 py-2 text-sm" rows={2} style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={cJustification} onChange={(e) => setCJustification(e.target.value)} placeholder="ex : Rupture imminente, client professionnel prioritaire à honorer..." />
                            </Field>
                          </>
                        ) : null;
                      })()}
                      {cErr && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {cErr}</p>}
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setOpenFormId(null)}><X size={14} /> Annuler</Button>
                        <Button onClick={() => saveCommande(r.station.id, { essence: r.financableEssence, gasoil: r.financableGasoil })}><CheckCircle2 size={14} /> Enregistrer</Button>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Passations ------------------------------ */

// Document de passation entre gérants — trace qui a remplacé qui, quand, et dans quel état
// (stock, caisse) la station a été transmise. Imprimable pour signature physique par les
// deux parties si besoin.
function PassationsView({ db, setDb, profile }) {
  const [stationId, setStationId] = useState(db.stations[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [gerantSortant, setGerantSortant] = useState("");
  const [gerantEntrant, setGerantEntrant] = useState("");
  const [stockEssence, setStockEssence] = useState("");
  const [stockGasoil, setStockGasoil] = useState("");
  const [caisseMontant, setCaisseMontant] = useState("");
  const [observations, setObservations] = useState("");
  const [err, setErr] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const gerantsStation = (db.gerants || []).filter((g) => g.stationId === stationId);

  // Pré-remplit stock et caisse avec les derniers chiffres connus de la station à la date
  // choisie — l'admin n'a plus qu'à corriger si le comptage physique du jour diffère.
  const preremplir = () => {
    const lastStockDate = [...db.stocks].filter((x) => x.stationId === stationId && x.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
    if (lastStockDate) {
      const st = computeStock(db.releves, db.stocks, stationId, lastStockDate);
      setStockEssence(String(Math.round(stockAffichable(st, "essence"))));
      setStockGasoil(String(Math.round(stockAffichable(st, "gasoil"))));
    }
    const lastCaisseDate = [...db.caisses].filter((x) => x.stationId === stationId && x.date <= date).sort((a, b) => (a.date < b.date ? 1 : -1))[0]?.date;
    if (lastCaisseDate) {
      const c = computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, stationId, lastCaisseDate, db.depenses, db.reglementsClients);
      setCaisseMontant(String(Math.round(c.caisseAttendue)));
    }
  };

  const reset = () => {
    setDate(todayISO()); setGerantSortant(""); setGerantEntrant(""); setStockEssence(""); setStockGasoil(""); setCaisseMontant(""); setObservations(""); setEditingId(null);
  };

  const startEdit = (p) => {
    setErr("");
    setStationId(p.stationId); setDate(p.date); setGerantSortant(p.gerantSortant || ""); setGerantEntrant(p.gerantEntrant || "");
    setStockEssence(p.stockEssence ?? ""); setStockGasoil(p.stockGasoil ?? ""); setCaisseMontant(p.caisseMontant ?? ""); setObservations(p.observations || "");
    setEditingId(p.id);
  };

  const save = () => {
    setErr("");
    if (!stationId) { setErr("Choisissez une station."); return; }
    if (!gerantEntrant.trim()) { setErr("Indiquez le nom du gérant entrant."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const existing = editingId ? db.passations.find((p) => p.id === editingId) : null;
    const row = { id: editingId || uid(), stationId, date, gerantSortant: gerantSortant.trim(), gerantEntrant: gerantEntrant.trim(), stockEssence, stockGasoil, caisseMontant, observations: observations.trim(), timestamp: existing?.timestamp || new Date().toISOString() };
    let next = { ...db, passations: editingId ? db.passations.map((p) => (p.id === editingId ? row : p)) : [...db.passations, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "passation", action: editingId ? "modification" : "création", after: { date, gerantSortant: row.gerantSortant, gerantEntrant: row.gerantEntrant } });
    setDb(next);
    reset();
  };

  const remove = (p) => {
    if (!confirm(`Supprimer cette passation du ${fmtDateLong(p.date)} ?`)) return;
    let next = { ...db, passations: db.passations.filter((x) => x.id !== p.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: p.stationId, entity: "passation", action: "suppression", before: { date: p.date, gerantEntrant: p.gerantEntrant } });
    setDb(next);
    if (editingId === p.id) reset();
  };

  const history = db.passations.slice().sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Passation</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Trace qui a remplacé qui, quand, et dans quel état (stock, caisse) chaque station a été transmise — imprimable pour signature.</p>
      </div>

      <Card className="max-w-md">
        {editingId && (
          <div className="rounded-md p-2.5 mb-3 flex items-center justify-between gap-2" style={{ background: C.tealSoft, border: `1px solid ${C.teal}55` }}>
            <span className="text-xs" style={{ color: C.teal }}>Modification d'une passation existante</span>
            <button onClick={reset} className="smi-btn text-xs" style={{ color: C.teal }}>Annuler</button>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} /></Field>
          <Field label="Date de la passation"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <Field label="Gérant sortant" hint={gerantsStation.length > 0 ? `Actuel(s) : ${gerantsStation.map((g) => g.nom).join(", ")}` : undefined}>
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={gerantSortant} onChange={(e) => setGerantSortant(e.target.value)} placeholder="ex : Amara Camara" />
          </Field>
          <Field label="Gérant entrant">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={gerantEntrant} onChange={(e) => setGerantEntrant(e.target.value)} placeholder="ex : Djamanaty Sylla" />
          </Field>
        </div>
        <div className="flex justify-end mb-2">
          <Button variant="ghost" onClick={preremplir} disabled={!stationId}>Pré-remplir stock/caisse</Button>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <Field label="Stock Essence (L)"><NumberInput value={stockEssence} onChange={(e) => setStockEssence(e.target.value)} /></Field>
          <Field label="Stock Gasoil (L)"><NumberInput value={stockGasoil} onChange={(e) => setStockGasoil(e.target.value)} /></Field>
          <Field label={`Caisse (${devise})`}><NumberInput value={caisseMontant} onChange={(e) => setCaisseMontant(e.target.value)} /></Field>
        </div>
        <Field label="Observations (état des équipements, remarques...)">
          <textarea className="smi-input w-full rounded-md px-3 py-2 text-sm" rows={3} style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="ex : Pompe 2 en panne, réparation prévue le..." />
        </Field>
        {err && <p className="text-xs flex items-center gap-1.5 mt-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
        <div className="flex justify-end mt-3">
          <Button onClick={save}><CheckCircle2 size={16} /> {editingId ? "Mettre à jour" : "Enregistrer la passation"}</Button>
        </div>
      </Card>

      <Card>
        <p className="font-semibold text-sm mb-3">Historique des passations</p>
        {history.length === 0 ? (
          <EmptyState icon={Users} title="Aucune passation enregistrée" />
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((p) => {
              const st = db.stations.find((s) => s.id === p.stationId);
              return (
                <div key={p.id} className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-xs">
                      <p className="font-medium" style={{ color: C.text }}>{fmtDateLong(p.date)} — {st?.nom || "—"}</p>
                      <p style={{ color: C.textMuted }}>{p.gerantSortant || "—"} → {p.gerantEntrant}</p>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button onClick={() => setPrintingId(p.id)} className="smi-btn" style={{ color: C.teal }} title="Imprimer"><Printer size={14} /></button>
                      <button onClick={() => startEdit(p)} className="smi-btn" style={{ color: C.teal }}><Pencil size={14} /></button>
                      <button onClick={() => remove(p)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                  {(p.stockEssence || p.stockGasoil || p.caisseMontant) && (
                    <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>
                      Stock : E {fmtVol(p.stockEssence || 0)} / G {fmtVol(p.stockGasoil || 0)} · Caisse : {fmtMontant(p.caisseMontant || 0, st?.devise || "GNF")}
                    </p>
                  )}
                  {p.observations && <p className="text-xs mt-1 italic" style={{ color: C.textFaint }}>{p.observations}</p>}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {printingId && (() => {
        const p = db.passations.find((x) => x.id === printingId);
        if (!p) return null;
        const st = db.stations.find((s) => s.id === p.stationId);
        return (
          <div className="smi-no-print" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPrintingId(null)}>
            <div onClick={(e) => e.stopPropagation()} className="rounded-lg p-5 w-full max-w-lg smi-print-area" style={{ background: C.panel, border: `1px solid ${C.border}`, maxHeight: "85vh", overflowY: "auto" }}>
              <div className="flex items-center justify-between mb-4 smi-no-print">
                <p className="smi-display text-xl">Fiche de passation</p>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => window.print()}><Printer size={16} /> Imprimer</Button>
                  <button onClick={() => setPrintingId(null)} className="smi-btn" style={{ color: C.textMuted }}><X size={20} /></button>
                </div>
              </div>
              <div className="hidden smi-print-only mb-4">
                <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Fiche de passation</h1>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <p><span style={{ color: C.textFaint }}>Station :</span> <span className="font-semibold">{st?.nom}</span></p>
                <p><span style={{ color: C.textFaint }}>Date :</span> {fmtDateLong(p.date)}</p>
                <p><span style={{ color: C.textFaint }}>Gérant sortant :</span> {p.gerantSortant || "—"}</p>
                <p><span style={{ color: C.textFaint }}>Gérant entrant :</span> {p.gerantEntrant}</p>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="rounded-md p-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <p className="text-xs" style={{ color: C.textFaint }}>Stock Essence</p>
                    <p className="font-semibold smi-mono">{fmtVol(p.stockEssence || 0)} L</p>
                  </div>
                  <div className="rounded-md p-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <p className="text-xs" style={{ color: C.textFaint }}>Stock Gasoil</p>
                    <p className="font-semibold smi-mono">{fmtVol(p.stockGasoil || 0)} L</p>
                  </div>
                  <div className="rounded-md p-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <p className="text-xs" style={{ color: C.textFaint }}>Caisse</p>
                    <p className="font-semibold smi-mono">{fmtMontant(p.caisseMontant || 0, st?.devise || "GNF")}</p>
                  </div>
                </div>
                {p.observations && (
                  <div className="mt-2">
                    <p className="text-xs" style={{ color: C.textFaint }}>Observations</p>
                    <p>{p.observations}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-6 mt-8">
                  <div>
                    <p className="text-xs mb-8" style={{ color: C.textFaint }}>Signature — Gérant sortant</p>
                    <div style={{ borderTop: `1px solid ${C.border}` }} />
                  </div>
                  <div>
                    <p className="text-xs mb-8" style={{ color: C.textFaint }}>Signature — Gérant entrant</p>
                    <div style={{ borderTop: `1px solid ${C.border}` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

/* ---------------------------- Rapport mensuel view --------------------------- */

/* ---------------------------- Rapport hebdomadaire ------------------------------ */

const JOURS_SEMAINE = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

// Renvoie le lundi et le dimanche de la semaine contenant la date donnée (format YYYY-MM-DD).
function getWeekBounds(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = dimanche, 1 = lundi, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x) => x.toISOString().slice(0, 10);
  return { start: fmt(monday), end: fmt(sunday) };
}

function RapportHebdomadaireView({ db, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [refDate, setRefDate] = useState(todayISO());
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";
  const exportPdf = () => window.print();

  const { start, end } = getWeekBounds(refDate);
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  const versementsSemaine = db.versements.filter((v) => (!stationId || v.stationId === stationId) && v.date >= start && v.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.timestamp || "").localeCompare(b.timestamp || "")));
  const bonsSemaine = db.bons.filter((b) => (!stationId || b.stationId === stationId) && b.date >= start && b.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const receptionsSemaine = db.receptions.filter((r) => (!stationId || r.stationId === stationId) && r.date >= start && r.date <= end)
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const jours = useMemo(() => {
    const list = [];
    const d = new Date(`${start}T00:00:00`);
    for (let i = 0; i < 7; i++) {
      const dateStr = d.toISOString().slice(0, 10);
      const entriesJour = versementsSemaine.filter((v) => v.date === dateStr);
      const bancaire = entriesJour.reduce((a, v) => a + num(v.banqueMontant), 0);
      const marchand = entriesJour.reduce((a, v) => a + num(v.paiementMarchandMontant), 0);
      const dg = entriesJour.reduce((a, v) => a + num(v.autreMontant), 0);
      const vente = stationId ? computeVente(db.releves, db.ventes, stationId, dateStr) : null;
      list.push({
        date: dateStr, nomJour: JOURS_SEMAINE[i], bancaire, marchand, dg, total: bancaire + marchand + dg,
        venteEssence: vente?.essence || 0, venteGasoil: vente?.gasoil || 0, ca: vente?.ca || 0,
      });
      d.setDate(d.getDate() + 1);
    }
    return list;
  }, [start, versementsSemaine, stationId, db.releves, db.ventes]);

  const totalSemaine = jours.reduce((acc, j) => ({
    bancaire: acc.bancaire + j.bancaire, marchand: acc.marchand + j.marchand, dg: acc.dg + j.dg, total: acc.total + j.total,
    venteEssence: acc.venteEssence + j.venteEssence, venteGasoil: acc.venteGasoil + j.venteGasoil, ca: acc.ca + j.ca,
  }), { bancaire: 0, marchand: 0, dg: 0, total: 0, venteEssence: 0, venteGasoil: 0, ca: 0 });

  const totalBons = bonsSemaine.reduce((a, b) => a + bonTotal(b), 0);

  // Stock d'ouverture de la semaine : premier contrôle de stock enregistré à partir du
  // lundi (à défaut, le plus récent avant cette date — donc la clôture du vendredi
  // précédent, par exemple).
  const stockDebutSemaine = useMemo(() => {
    if (!stationId) return null;
    const record = [...db.stocks].filter((s) => s.stationId === stationId && s.date >= start).sort((a, b) => (a.date < b.date ? -1 : 1))[0]
      || [...db.stocks].filter((s) => s.stationId === stationId && s.date < start).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!record) return null;
    return { ...computeStock(db.releves, db.stocks, stationId, record.date), date: record.date };
  }, [stationId, start, db.stocks, db.releves]);

  // Stock restant en fin de semaine : dernier contrôle de stock enregistré au plus tard
  // le dimanche de la semaine visée (à défaut, le plus récent avant cette date).
  const stockFinSemaine = useMemo(() => {
    if (!stationId) return null;
    const record = [...db.stocks].filter((s) => s.stationId === stationId && s.date <= end).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!record) return null;
    return { ...computeStock(db.releves, db.stocks, stationId, record.date), date: record.date };
  }, [stationId, end, db.stocks, db.releves]);

  // Commandes en cours (passées mais pas encore livrées) pour la station — information de
  // contexte utile en fin de rapport, indépendamment de la semaine visée : ce qui est
  // encore attendu compte pour la suite, quelle que soit la date à laquelle la commande a
  // été passée.
  const commandesEnCoursSemaine = (db.commandesReseau || []).filter((c) => c.stationId === stationId && c.statut === "en_cours").sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl">Rapport hebdomadaire</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Ventes, versements, bons, livraisons, stock d'ouverture, stock restant, et commandes en cours pour la station.</p>
        </div>
        <Button variant="ghost" onClick={exportPdf}><Printer size={16} /> Exporter en PDF</Button>
      </div>

      <Card className="smi-no-print">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} allowAll={!isGerant} disabled={isGerant} /></Field>
          <Field label="N'importe quelle date de la semaine visée" hint={`Semaine du ${fmtDateLong(start)} au ${fmtDateLong(end)}`}>
            <TextInput type="date" value={refDate} onChange={(e) => setRefDate(e.target.value)} max={todayISO()} />
          </Field>
        </div>
      </Card>

      <Card className="smi-print-area">
        <div className="hidden smi-print-only mb-3">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Rapport hebdomadaire</h1>
          <p style={{ fontSize: 13, color: "#444" }}>{station?.nom || "Toutes stations"} — Semaine du {fmtDateLong(start)} au {fmtDateLong(end)}</p>
        </div>

        <p className="text-sm font-semibold mb-2">1. Ventes de la semaine</p>
        <div className="overflow-x-auto smi-scroll mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th className="text-left py-1.5" style={{ color: C.textMuted }}>Jour</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Essence (L)</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Gasoil (L)</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Chiffre d'affaires</th>
              </tr>
            </thead>
            <tbody>
              {jours.map((j) => (
                <tr key={j.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="py-1.5">{j.nomJour} <span style={{ color: C.textFaint }}>({fmtDateLong(j.date)})</span></td>
                  <td className="py-1.5 text-right smi-mono">{fmtVol(j.venteEssence)}</td>
                  <td className="py-1.5 text-right smi-mono">{fmtVol(j.venteGasoil)}</td>
                  <td className="py-1.5 text-right smi-mono font-semibold">{fmtMontant(j.ca, devise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td className="py-2 font-bold">Total semaine</td>
                <td className="py-2 text-right smi-mono font-bold">{fmtVol(totalSemaine.venteEssence)}</td>
                <td className="py-2 text-right smi-mono font-bold">{fmtVol(totalSemaine.venteGasoil)}</td>
                <td className="py-2 text-right smi-mono font-bold" style={{ color: C.amber }}>{fmtMontant(totalSemaine.ca, devise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-sm font-semibold mb-2 mt-3">2. Versements de la semaine</p>
        {versementsSemaine.length === 0 ? (
          <p className="text-xs mb-4" style={{ color: C.textFaint }}>Aucun versement cette semaine.</p>
        ) : (
          <div className="overflow-x-auto smi-scroll mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Date</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Banque</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>N° de reçu</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Bancaire</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Paiement marchand</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Versement au compte du DG</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {versementsSemaine.map((v) => (
                  <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5">{fmtDateLong(v.date)}</td>
                    <td className="py-1.5">{v.banqueNom || (v.autreLibelle ? `Autre : ${v.autreLibelle}` : "—")}</td>
                    <td className="py-1.5">{v.recuNumero || "—"}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(v.banqueMontant, devise)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(v.paiementMarchandMontant, devise)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(v.autreMontant, devise)}</td>
                    <td className="py-1.5 text-right smi-mono font-semibold">{fmtMontant(versementTotal(v), devise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.border}` }}>
                  <td colSpan={3} className="py-2 font-bold">Total semaine</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalSemaine.bancaire, devise)}</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalSemaine.marchand, devise)}</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalSemaine.dg, devise)}</td>
                  <td className="py-2 text-right smi-mono font-bold" style={{ color: C.amber }}>{fmtMontant(totalSemaine.total, devise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-sm font-semibold mb-2 mt-3">3. Bons de la semaine</p>
        {bonsSemaine.length === 0 ? (
          <p className="text-xs mb-4" style={{ color: C.textFaint }}>Aucun bon cette semaine.</p>
        ) : (
          <div className="overflow-x-auto smi-scroll mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Date</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Libellé</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Quantité (L)</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {bonsSemaine.map((b) => (
                  <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5">{fmtDateLong(b.date)}</td>
                    <td className="py-1.5">{b.libelle}</td>
                    <td className="py-1.5 text-right smi-mono">{num(b.quantite) > 0 ? fmtVol(b.quantite) : "—"}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(bonTotal(b), devise)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.border}` }}>
                  <td colSpan={3} className="py-2 font-bold">Total Bons semaine</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalBons, devise)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="text-sm font-semibold mb-2 mt-3">4. Livraisons (Réceptions) de la semaine</p>
        {receptionsSemaine.length === 0 ? (
          <p className="text-xs mb-4" style={{ color: C.textFaint }}>Aucune livraison cette semaine.</p>
        ) : (
          <div className="overflow-x-auto smi-scroll mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Date</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Produit</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Quantité (L)</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Fournisseur</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>N° Bon</th>
                </tr>
              </thead>
              <tbody>
                {receptionsSemaine.map((r) => (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5">{fmtDateLong(r.date)}</td>
                    <td className="py-1.5">{r.produit === "essence" ? "Essence" : "Gasoil"}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(r.quantite)}</td>
                    <td className="py-1.5">{r.fournisseur || "—"}</td>
                    <td className="py-1.5">{r.numeroBon || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-sm font-semibold mb-2 mt-3">5. Stock d'ouverture de la semaine</p>
        {!stockDebutSemaine ? (
          <p className="text-xs mb-4" style={{ color: C.textFaint }}>Aucun contrôle de stock enregistré autour du {fmtDateLong(start)}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-sm mb-4">
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Essence</p>
              <GaugeNumber value={fmtVol(stockDebutSemaine.stockOuvertureEssence)} tone="amber" />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Gasoil</p>
              <GaugeNumber value={fmtVol(stockDebutSemaine.stockOuvertureGasoil)} tone="teal" />
            </div>
            {stockDebutSemaine.date !== start && (
              <p className="text-xs col-span-2" style={{ color: C.textFaint }}>Contrôle de référence : {fmtDateLong(stockDebutSemaine.date)} (pas de contrôle exactement le {fmtDateLong(start)}).</p>
            )}
          </div>
        )}

        <p className="text-sm font-semibold mb-2 mt-3">6. Stock restant en fin de semaine</p>
        {!stockFinSemaine ? (
          <p className="text-xs" style={{ color: C.textFaint }}>Aucun contrôle de stock enregistré au plus tard le {fmtDateLong(end)}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Essence</p>
              <GaugeNumber value={fmtVol(stockAffichable(stockFinSemaine, "essence"))} tone="amber" />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Gasoil</p>
              <GaugeNumber value={fmtVol(stockAffichable(stockFinSemaine, "gasoil"))} tone="teal" />
            </div>
            {stockFinSemaine.date !== end && (
              <p className="text-xs col-span-2" style={{ color: C.textFaint }}>Dernier contrôle disponible : {fmtDateLong(stockFinSemaine.date)} (pas de contrôle exactement le {fmtDateLong(end)}).</p>
            )}
            <p className="text-[10px] italic col-span-2" style={{ color: C.textFaint }}>Comptage physique constaté si renseigné, sinon stock théorique calculé.</p>
          </div>
        )}

        <p className="text-sm font-semibold mb-2 mt-3">7. Commandes en cours (non livrées)</p>
        {commandesEnCoursSemaine.length === 0 ? (
          <p className="text-xs" style={{ color: C.textFaint }}>Aucune commande en cours pour cette station.</p>
        ) : (
          <div className="overflow-x-auto smi-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Date de commande</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Produit</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Quantité (L)</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Justification (si hors financement)</th>
                </tr>
              </thead>
              <tbody>
                {commandesEnCoursSemaine.map((c) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5">{fmtDateLong(c.date)}</td>
                    <td className="py-1.5">{c.produit === "essence" ? "Essence" : "Gasoil"}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(c.quantite)}</td>
                    <td className="py-1.5">{c.justification || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <QrCode value={appUrl} size={64} />
            <div>
              <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
              <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function RapportMensuelView({ db }) {
  const now = new Date();
  const [stationId, setStationId] = useState("");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const stationsToShow = stationId ? db.stations.filter((s) => s.id === stationId) : db.stations;
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  // useMemo : ce calcul relit et recombine tous les relevés/ventes/versements/bons/stocks
  // du mois pour chaque station à chaque rendu — coûteux quand l'historique grandit. On ne
  // le refait que si les données sources ou les filtres changent réellement.
  const results = useMemo(() => stationsToShow.map((s) => {
    const dates = [...new Set(db.releves.filter((r) => r.stationId === s.id && r.date.startsWith(prefix)).map((r) => r.date))].sort();
    let vEssence = 0, vGasoil = 0, ca = 0;
    const daily = dates.map((d) => {
      const v = computeVente(db.releves, db.ventes, s.id, d);
      vEssence += v.essence; vGasoil += v.gasoil; ca += v.ca;
      return { date: d, ...v };
    });
    const totalVersements = db.versements.filter((v) => v.stationId === s.id && v.date.startsWith(prefix)).reduce((a, v) => a + versementTotal(v), 0);
    const totalBons = db.bons.filter((b) => b.stationId === s.id && b.date.startsWith(prefix)).reduce((a, b) => a + bonTotal(b), 0);
    // Dernière caisse (théorique, fin de mois) = Caisse précédente du début du mois +
    // Chiffre d'affaires du mois − Total Versements − Total Bons. Ce calcul reste correct
    // même quand un versement du mois règle en réalité de l'argent accumulé un mois
    // antérieur, puisqu'on ne compare plus le CA du mois à des versements qui peuvent lui
    // être étrangers — on part du solde réel de départ et on ajoute/retranche seulement ce
    // qui s'est passé ce mois-ci.
    const caissesDuMois = [...db.caisses].filter((x) => x.stationId === s.id && x.date.startsWith(prefix)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const premiereCaisseRecord = caissesDuMois[0];
    const caissePrecedenteDebutMois = premiereCaisseRecord ? num(premiereCaisseRecord.caissePrecedente) : 0;
    const derniereCaisse = caissePrecedenteDebutMois + ca - totalVersements - totalBons;
    // Stock restant : dernier contrôle de stock enregistré dans le mois (à défaut, le plus
    // récent avant la fin du mois).
    const stocksDuMois = [...db.stocks].filter((x) => x.stationId === s.id && x.date.startsWith(prefix)).sort((a, b) => (a.date < b.date ? 1 : -1));
    const stockRecord = stocksDuMois[0] || [...db.stocks].filter((x) => x.stationId === s.id && x.date <= `${prefix}-31`).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const stock = stockRecord ? computeStock(db.releves, db.stocks, s.id, stockRecord.date) : null;
    return { station: s, daily, vEssence, vGasoil, ca, totalVersements, totalBons, derniereCaisse, stock, stockDate: stockRecord?.date };
  }), [stationsToShow, db.releves, db.ventes, db.versements, db.bons, db.caisses, db.stocks, prefix]);

  const devises = new Set(stationsToShow.map((s) => s.devise || "GNF"));

  // Export CSV — donne enfin un livrable exploitable en comptabilité/audit plutôt qu'un
  // simple tableau à l'écran. Génération 100% côté navigateur, aucun envoi réseau.
  const exportCsv = () => {
    const rows = [["Station", "Devise", "Volume Essence (L)", "Volume Gasoil (L)", "Volume Total (L)", "Chiffre d'affaires", "Total Versements", "Total Bons", "Caisse théorique (fin de mois)", "Stock Essence restant (L)", "Stock Gasoil restant (L)"]];
    results.forEach((r) => rows.push([
      r.station.nom, r.station.devise || "GNF", r.vEssence.toFixed(2), r.vGasoil.toFixed(2), (r.vEssence + r.vGasoil).toFixed(2), r.ca.toFixed(2),
      r.totalVersements.toFixed(2), r.totalBons.toFixed(2), r.derniereCaisse.toFixed(2),
      r.stock ? stockAffichable(r.stock, "essence").toFixed(2) : "", r.stock ? stockAffichable(r.stock, "gasoil").toFixed(2) : "",
    ]));
    if (stationId && results[0]) {
      rows.push([]);
      rows.push([`Détail journalier — ${results[0].station.nom}`]);
      rows.push(["Date", "Essence (L)", "Gasoil (L)", "CA"]);
      results[0].daily.forEach((d) => rows.push([d.date, d.essence.toFixed(2), d.gasoil.toFixed(2), d.ca.toFixed(2)]));
    }
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport-${prefix}${stationId ? "-" + (results[0]?.station.nom || "").replace(/\s+/g, "_") : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPdf = () => window.print();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl">Rapport mensuel</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Filtrez par station, mois et année pour consolider volumes, chiffre d'affaires, versements, bons et stock restant.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={exportCsv} disabled={results.length === 0}><Download size={16} /> Exporter en CSV</Button>
          <Button variant="ghost" onClick={exportPdf} disabled={results.length === 0}><Printer size={16} /> Exporter en PDF</Button>
        </div>
      </div>

      <Card className="smi-no-print">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} allowAll /></Field>
          <Field label="Mois">
            <SelectInput value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }).map((_, i) => <option key={i} value={i}>{monthLabel(i)}</option>)}
            </SelectInput>
          </Field>
          <Field label="Année"><NumberInput value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} /></Field>
        </div>
      </Card>

      <div className="smi-print-area flex flex-col gap-4">
        <div className="hidden smi-print-only mb-2">
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Rapport mensuel</h1>
          <p style={{ fontSize: 13, color: "#444" }}>{monthLabel(month)} {year}{stationId && results[0] ? ` — ${results[0].station.nom}` : " — Toutes stations"}</p>
        </div>

      <Card>
        <p className="font-semibold text-sm mb-3">Synthèse — {monthLabel(month)} {year}</p>
        <div className="overflow-x-auto smi-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th className="text-left py-1.5" style={{ color: C.textMuted }}>Station</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Volume Essence</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Volume Gasoil</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Volume Total</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Chiffre d'affaires</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Total Versements</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Total Bons</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Caisse théorique (fin de mois)</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Stock restant (E / G)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const dv = r.station.devise || "GNF";
                return (
                  <tr key={r.station.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5 font-semibold">{r.station.nom}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(r.vEssence)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(r.vGasoil)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(r.vEssence + r.vGasoil)}</td>
                    <td className="py-1.5 text-right smi-mono font-semibold" style={{ color: C.amber }}>{fmtMontant(r.ca, dv)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(r.totalVersements, dv)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(r.totalBons, dv)}</td>
                    <td className="py-1.5 text-right smi-mono font-semibold" style={{ color: r.derniereCaisse < 0 ? C.danger : C.text }}>{fmtMontant(r.derniereCaisse, dv)}</td>
                    <td className="py-1.5 text-right smi-mono">{r.stock ? `${fmtVol(stockAffichable(r.stock, "essence"))} / ${fmtVol(stockAffichable(r.stock, "gasoil"))}` : "—"}</td>
                  </tr>
                );
              })}
              {results.length === 0 && (
                <tr><td colSpan={9} className="py-6 text-center" style={{ color: C.textFaint }}>Aucune donnée pour cette période.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] italic mt-3" style={{ color: C.textFaint }}>Chaque ligne concerne une seule station — les chiffres ne sont jamais additionnés entre stations. « Caisse théorique (fin de mois) » = Caisse précédente du début du mois + Chiffre d'affaires du mois − Total Versements − Total Bons : c'est ce qui devrait rester physiquement en caisse à la fin du mois. Un montant négatif signale un manque à vérifier (plus versé/justifié par des bons que ce qui a été réellement disponible).</p>
      </Card>

      {stationId && results[0]?.daily.length > 0 && (
        <Card>
          <p className="font-semibold text-sm mb-3">Détail journalier — {results[0].station.nom}</p>
          <div className="overflow-x-auto smi-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Date</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Essence</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>Gasoil</th>
                  <th className="text-right py-1.5" style={{ color: C.textMuted }}>CA</th>
                </tr>
              </thead>
              <tbody>
                {results[0].daily.map((d) => (
                  <tr key={d.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5">{fmtDateLong(d.date)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(d.essence)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtVol(d.gasoil)}</td>
                    <td className="py-1.5 text-right smi-mono">{fmtMontant(d.ca, results[0].station.devise || "GNF")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

        <div className="hidden smi-print-only" style={{ marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <QrCode value={appUrl} size={64} />
            <div>
              <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
              <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Rapport journalier ---------------------------- */

function RapportJournalierView({ db, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());
  const appUrl = typeof window !== "undefined" ? window.location.origin : "";

  const rows = useMemo(() => db.stations.map((s) => {
    const v = computeVente(db.releves, db.ventes, s.id, date);
    const stockRec = db.stocks.find((x) => x.stationId === s.id && x.date === date);
    const stock = stockRec ? computeStock(db.releves, db.stocks, s.id, date) : null;
    const caisseRec = db.caisses.find((x) => x.stationId === s.id && x.date === date);
    const caisse = caisseRec ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, s.id, date, db.depenses, db.reglementsClients) : null;
    const inspections = db.inspections.filter((i) => i.stationId === s.id && i.date === date);
    return { station: s, v, stock, caisse, inspections };
  }), [db.stations, db.releves, db.ventes, db.stocks, db.caisses, db.inspections, date]);

  const grandTotal = rows.reduce((a, r) => ({ vEssence: a.vEssence + r.v.essence, vGasoil: a.vGasoil + r.v.gasoil, ca: a.ca + r.v.ca }), { vEssence: 0, vGasoil: 0, ca: 0 });
  const devises = new Set(db.stations.map((s) => s.devise || "GNF"));
  const grandTotalCaDisplay = devises.size <= 1 ? fmtMontant(grandTotal.ca, [...devises][0] || "GNF") : `${grandTotal.ca.toLocaleString("fr-FR")} (multi-devises)`;

  const exportPdf = () => window.print();

  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  // Détail par pompe pour la section "1. Index des pompes" — chaque pompe donne une ligne
  // Essence et une ligne Gasoil (comme dans le modèle papier).
  const pompeLines = useMemo(() => {
    if (!stationId) return [];
    const lines = [];
    db.pompes.filter((p) => p.stationId === stationId).forEach((p) => {
      const r = db.releves.find((x) => x.stationId === stationId && x.pompeId === p.id && x.date === date);
      const oe = num(r?.indexOuvertureEssence), ce = num(r?.indexClotureEssence);
      const og = num(r?.indexOuvertureGasoil), cg = num(r?.indexClotureGasoil);
      if (pompeHas(p, "essence")) lines.push({ pompe: p.nom, produit: "Essence", ouverture: oe, cloture: ce, volume: Math.max(0, ce - oe) });
      if (pompeHas(p, "gasoil")) lines.push({ pompe: p.nom, produit: "Gasoil", ouverture: og, cloture: cg, volume: Math.max(0, cg - og) });
    });
    return lines;
  }, [db.pompes, db.releves, stationId, date]);

  const vJour = stationId ? computeVente(db.releves, db.ventes, stationId, date) : null;
  const stockJour = stationId ? computeStock(db.releves, db.stocks, stationId, date) : null;
  const caisseJour = stationId ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, stationId, date, db.depenses, db.reglementsClients) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl">Rapport journalier</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Rapport détaillé d'une station pour une journée — exportable en PDF.</p>
        </div>
        <Button variant="ghost" onClick={exportPdf}><Printer size={16} /> Exporter en PDF</Button>
      </div>

      <Card className="smi-no-print">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} allowAll={!isGerant} disabled={isGerant} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
        </div>
      </Card>

      {!stationId ? (
        // Aucune station choisie : synthèse comparative de toutes les stations.
        <div className="smi-print-area">
          <div className="hidden smi-print-only mb-4">
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>{nomSociete()} — Rapport journalier</h1>
            <p style={{ fontSize: 13, color: "#444" }}>{fmtDateLong(date)}</p>
          </div>
          <Card>
            <p className="font-semibold text-sm mb-3">Synthèse toutes stations — {fmtDateLong(date)}</p>
            <div className="overflow-x-auto smi-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th className="text-left py-1.5" style={{ color: C.textMuted }}>Station</th>
                    <th className="text-right py-1.5" style={{ color: C.textMuted }}>Essence</th>
                    <th className="text-right py-1.5" style={{ color: C.textMuted }}>Gasoil</th>
                    <th className="text-right py-1.5" style={{ color: C.textMuted }}>CA</th>
                    <th className="text-right py-1.5" style={{ color: C.textMuted }}>Écart stock</th>
                    <th className="text-right py-1.5" style={{ color: C.textMuted }}>Écart caisse</th>
                    <th className="text-right py-1.5" style={{ color: C.textMuted }}>Inspection</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const dv = r.station.devise || "GNF";
                    const ecartStock = r.stock ? (r.stock.ecartEssence ?? 0) + (r.stock.ecartGasoil ?? 0) : null;
                    return (
                      <tr key={r.station.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="py-1.5 font-semibold">{r.station.nom}</td>
                        <td className="py-1.5 text-right smi-mono">{fmtVol(r.v.essence)}</td>
                        <td className="py-1.5 text-right smi-mono">{fmtVol(r.v.gasoil)}</td>
                        <td className="py-1.5 text-right smi-mono font-semibold" style={{ color: C.amber }}>{fmtMontant(r.v.ca, dv)}</td>
                        <td className="py-1.5 text-right smi-mono">{r.stock ? fmtVol(ecartStock) : "—"}</td>
                        <td className="py-1.5 text-right smi-mono">{r.caisse && r.caisse.ecart !== null ? fmtMontant(r.caisse.ecart, dv) : "—"}</td>
                        <td className="py-1.5 text-right">
                          {r.inspections.length === 0 ? "—" : (
                            <Pill tone={r.inspections.some((i) => i.items.some((x) => x.status === "non_conforme")) ? "danger" : "success"}>
                              {r.inspections.length} fait(s)
                            </Pill>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center" style={{ color: C.textFaint }}>Aucune station enregistrée.</td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${C.border}` }}>
                      <td className="py-2 font-bold">Total</td>
                      <td className="py-2 text-right smi-mono font-bold">{fmtVol(grandTotal.vEssence)}</td>
                      <td className="py-2 text-right smi-mono font-bold">{fmtVol(grandTotal.vGasoil)}</td>
                      <td className="py-2 text-right smi-mono font-bold" style={{ color: C.amber }}>{grandTotalCaDisplay}</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>
          <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <QrCode value={appUrl} size={64} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
                <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Station choisie : rapport détaillé au format papier (index pompes, stock, caisse).
        <div className="smi-print-area">
          <Card>
            <div className="mb-3">
              <p className="smi-display text-lg uppercase">Station Service {station?.nom} — Rapport journalier</p>
              <div className="flex gap-6 text-xs mt-1" style={{ color: C.textMuted }}>
                <span>Date : <span className="font-semibold" style={{ color: C.text }}>{fmtDateLong(date)}</span></span>
                <span>Fournisseur : <span className="font-semibold" style={{ color: C.text }}>{station?.fournisseur || "—"}</span></span>
              </div>
            </div>

            <p className="text-sm font-semibold mt-4 mb-2">1. Index des pompes</p>
            <div className="overflow-x-auto smi-scroll">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th className="text-left py-1" style={{ color: C.textMuted }}>Pompe</th>
                    <th className="text-left py-1" style={{ color: C.textMuted }}>Produit</th>
                    <th className="text-right py-1" style={{ color: C.textMuted }}>Index ouverture (L)</th>
                    <th className="text-right py-1" style={{ color: C.textMuted }}>Index clôture (L)</th>
                    <th className="text-right py-1" style={{ color: C.textMuted }}>Volume vendu (L)</th>
                  </tr>
                </thead>
                <tbody>
                  {pompeLines.map((l, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-1">{l.pompe}</td>
                      <td className="py-1">{l.produit}</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(l.ouverture)}</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(l.cloture)}</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(l.volume)}</td>
                    </tr>
                  ))}
                  {pompeLines.length === 0 && <tr><td colSpan={5} className="py-4 text-center" style={{ color: C.textFaint }}>Aucune pompe / aucun relevé pour cette date.</td></tr>}
                </tbody>
              </table>
            </div>

            {vJour && (
              <div className="mt-3 overflow-x-auto smi-scroll">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <th className="text-left py-1" style={{ color: C.textMuted }}>Libellé</th>
                      <th className="text-right py-1" style={{ color: C.textMuted }}>Volume (L)</th>
                      <th className="text-right py-1" style={{ color: C.textMuted }}>Prix unitaire ({devise})</th>
                      <th className="text-right py-1" style={{ color: C.textMuted }}>Montant ({devise})</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-1">Vente Essence</td><td className="py-1 text-right smi-mono">{fmtVol(vJour.essence)}</td>
                      <td className="py-1 text-right smi-mono">{fmtMontant(vJour.prixEssence, devise)}</td><td className="py-1 text-right smi-mono">{fmtMontant(vJour.montantEssence, devise)}</td>
                    </tr>
                    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="py-1">Vente Gasoil</td><td className="py-1 text-right smi-mono">{fmtVol(vJour.gasoil)}</td>
                      <td className="py-1 text-right smi-mono">{fmtMontant(vJour.prixGasoil, devise)}</td><td className="py-1 text-right smi-mono">{fmtMontant(vJour.montantGasoil, devise)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-bold">Vente Totale</td><td className="py-1 text-right smi-mono font-bold">{fmtVol(vJour.essence + vJour.gasoil)}</td>
                      <td></td><td className="py-1 text-right smi-mono font-bold" style={{ color: C.amber }}>{fmtMontant(vJour.ca, devise)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-sm font-semibold mt-5 mb-2">2. Stock carburant</p>
            {stockJour && (
              <>
                <div className="overflow-x-auto smi-scroll">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <th className="text-left py-1" style={{ color: C.textMuted }}>Produit</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Stock ouverture (L)</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Ventes (L)</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Livraisons (L)</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Stock clôture (L)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td className="py-1">Essence</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockJour.stockOuvertureEssence)}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockJour.vol.essence)}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockJour.livraisonEssence)}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockAffichable(stockJour, "essence"))}</td>
                      </tr>
                      <tr>
                        <td className="py-1">Gasoil</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockJour.stockOuvertureGasoil)}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockJour.vol.gasoil)}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockJour.livraisonGasoil)}</td>
                        <td className="py-1 text-right smi-mono">{fmtVol(stockAffichable(stockJour, "gasoil"))}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] italic mt-1" style={{ color: C.textFaint }}>Stock clôture = comptage physique constaté (jaugeage), quand il est renseigné ce jour-là — sinon, stock théorique calculé (ouverture + livraisons − ventes).</p>
              </>
            )}

            <p className="text-sm font-semibold mt-5 mb-2">3. Coupon de Bon, Versement et Caisse</p>
            {caisseJour && (
              <>
                <p className="text-xs font-semibold italic mb-1" style={{ color: C.textMuted }}>Coupon de Bon</p>
                <div className="overflow-x-auto smi-scroll mb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <th className="text-left py-1" style={{ color: C.textMuted }}>Libellé</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Quantité (L)</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Prix unitaire ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Frais de route ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Montant ({devise})</th>
                        <th className="text-center py-1" style={{ color: C.textMuted }}>Photo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caisseJour.bons.map((b) => (
                        <tr key={b.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td className="py-1">{b.libelle || "—"}</td>
                          <td className="py-1 text-right smi-mono">{fmtVol(b.quantite)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(b.prixUnitaire, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(b.fraisRoute, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute), devise)}</td>
                          <td className="py-1 text-center">{b.photo ? <img src={b.photo} alt="" className="smi-print-photo" style={{ width: 36, height: 36, objectFit: "cover", display: "inline-block" }} /> : "—"}</td>
                        </tr>
                      ))}
                      {caisseJour.bons.length === 0 && <tr><td colSpan={6} className="py-2 text-center" style={{ color: C.textFaint }}>Aucune ligne.</td></tr>}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `1px solid ${C.border}` }}>
                        <td colSpan={4} className="py-1 font-bold">Total Bons</td>
                        <td className="py-1 text-right smi-mono font-bold">{fmtMontant(caisseJour.totalBon, devise)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <p className="text-xs font-semibold italic mb-1 mt-3" style={{ color: C.textMuted }}>Coupon de Versement</p>
                <div className="overflow-x-auto smi-scroll mb-2">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <th className="text-left py-1" style={{ color: C.textMuted }}>Libellé</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Versement bancaire ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Paiement marchand ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Versement au compte du DG ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Montant ({devise})</th>
                        <th className="text-center py-1" style={{ color: C.textMuted }}>Photo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caisseJour.versements.map((v) => (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td className="py-1">{v.banqueNom || v.autreLibelle || "—"}{v.recuNumero ? ` (reçu n° ${v.recuNumero})` : ""}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(v.banqueMontant, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(v.paiementMarchandMontant, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(v.autreMontant, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(versementTotal(v), devise)}</td>
                          <td className="py-1 text-center">{v.banquePhoto ? <img src={v.banquePhoto} alt="" className="smi-print-photo" style={{ width: 36, height: 36, objectFit: "cover", display: "inline-block" }} /> : "—"}</td>
                        </tr>
                      ))}
                      {caisseJour.versements.length === 0 && <tr><td colSpan={6} className="py-2 text-center" style={{ color: C.textFaint }}>Aucune ligne.</td></tr>}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `1px solid ${C.border}` }}>
                        <td colSpan={4} className="py-1 font-bold">Total Versement</td>
                        <td className="py-1 text-right smi-mono font-bold">{fmtMontant(caisseJour.totalVersement, devise)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <p className="text-xs font-semibold italic mb-1 mt-3" style={{ color: C.textMuted }}>Caisse</p>
                <div className="overflow-x-auto smi-scroll">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Caisse précédente ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Caisse du jour ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Total Bon ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Paiement marchand ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Caisse attendue ({devise})</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1 text-right smi-mono">{fmtMontant(caisseJour.caissePrecedente, devise)}</td>
                        <td className="py-1 text-right smi-mono">{fmtMontant(caisseJour.caisseDuJour === null ? caisseJour.ca : caisseJour.caisseDuJour, devise)}</td>
                        <td className="py-1 text-right smi-mono">{fmtMontant(caisseJour.totalBon, devise)}</td>
                        <td className="py-1 text-right smi-mono">{fmtMontant(caisseJour.totalPaiementMarchand, devise)}</td>
                        <td className="py-1 text-right smi-mono font-bold" style={{ color: C.amber }}>{fmtMontant(caisseJour.caisseAttendue, devise)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] italic mt-2" style={{ color: C.textFaint }}>Caisse Attendue = Caisse Précédente + Chiffre d'affaires du jour − Total Bon − Paiement marchand − Total Versement (un versement peut être fait en cours de journée, l'argent sort donc réellement de la caisse). Si la caisse est restée plusieurs jours sans être versée puis versée en une fois, le calcul retient le CA du jour comme caisse attendue, plutôt qu'un résultat négatif trompeur.</p>
              </>
            )}
          </Card>
          <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <QrCode value={appUrl} size={64} />
              <div>
                <p style={{ fontSize: 11, fontWeight: 600 }}>{nomSociete()} — {APP_NAME}</p>
                <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------- Sauvegarde & import de données ------------------------- */

// Libellés lisibles des collections, pour l'aperçu avant import.
const COLLECTION_LABELS = {
  stations: "Stations", pompes: "Pompes", releves: "Relevés pompes", ventes: "Ventes (prix)",
  stocks: "Contrôles stock", caisses: "Caisses", inspections: "Inspections", receptions: "Réceptions",
  mouvements: "Mouvements pompiste", versements: "Versements", bons: "Bons", pompistes: "Comptes pompistes",
  gerants: "Comptes gérants", partenaires: "Partenaires", commandesPartenaires: "Commandes partenaires",
  versementsPartenaires: "Versements partenaires", commandesReseau: "Commandes réseau", passations: "Passations", cuves: "Cuves", fournisseurs: "Fournisseurs", paiementsFournisseurs: "Paiements fournisseurs", depenses: "Dépenses", clients: "Clients à crédit", reglementsClients: "Règlements clients", factures: "Factures", parametres: "Paramètres", profils: "Profils de droits", utilisateurs: "Comptes du siège", comptesStations: "Comptes stations",
};

// Pour les saisies journalières, l'application suppose une seule fiche par station et par
// jour (et par pompe pour les relevés). À l'import, une ligne qui tombe sur une fiche déjà
// existante la remplace (en gardant son identifiant) au lieu de créer un doublon.
const NATURAL_KEYS = {
  releves: (r) => `${r.stationId}|${r.pompeId}|${r.date}`,
  ventes: (r) => `${r.stationId}|${r.date}`,
  stocks: (r) => `${r.stationId}|${r.date}`,
  caisses: (r) => `${r.stationId}|${r.date}`,
  // Un versement déjà saisi à la main (même station, même jour, même montant total) n'est
  // pas recréé : il est simplement mis à jour.
  versements: (r) => `${r.stationId}|${r.date}|${versementTotal(r)}`,
  receptions: (r) => `${r.stationId}|${r.date}|${r.produit}|${num(r.quantite)}`,
  bons: (r) => `${r.stationId}|${r.date}|${r.libelle || ""}|${bonTotal(r)}`,
};

// Prépare la fusion d'un fichier importé dans la base actuelle, sans rien enregistrer :
// renvoie la base résultante et un résumé (ajouts / remplacements / lignes ignorées).
// Un fichier préparé hors de l'application (ex. depuis un suivi Excel) ne connaît pas les
// identifiants internes : il peut désigner la station par son nom (stationNom) et la pompe
// par son nom ou son numéro (pompeNom : « Pompe 1 », « P1 »...). On les retrouve ici, de
// façon tolérante (accents, majuscules, préfixe « SMI » ignorés).
const normNom = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\bSMI\b/g, "").replace(/[^A-Z0-9]/g, "");
const numeroPompe = (s) => { const m = String(s || "").match(/\d+/); return m ? Number(m[0]) : null; };

function resolveNoms(db, incoming, warnings) {
  const stations = db.stations || [];
  const findStation = (nom) => {
    const n = normNom(nom);
    if (!n) return null;
    return stations.find((s) => normNom(s.nom) === n) || stations.find((s) => { const m = normNom(s.nom); return m && (m.includes(n) || n.includes(m)); }) || null;
  };
  const findPompe = (stationId, nom) => {
    const list = (db.pompes || []).filter((p) => p.stationId === stationId);
    const n = normNom(nom);
    const byName = list.find((p) => normNom(p.nom) === n);
    if (byName) return byName;
    const num = numeroPompe(nom);
    return num === null ? null : list.find((p) => numeroPompe(p.nom) === num) || null;
  };
  const unknownStations = new Set();
  const unknownPompes = new Set();
  const out = { ...incoming };
  for (const key of COLLECTIONS) {
    if (!Array.isArray(incoming[key])) continue;
    out[key] = incoming[key].map((raw) => {
      if (!raw || typeof raw !== "object" || (!raw.stationNom && !raw.pompeNom)) return raw;
      const { stationNom, pompeNom, ...row } = raw;
      if (!row.stationId && stationNom) {
        const st = findStation(stationNom);
        if (st) row.stationId = st.id; else { unknownStations.add(stationNom); row.stationId = "__inconnue__"; }
      }
      if (!row.pompeId && pompeNom && row.stationId !== "__inconnue__") {
        const po = findPompe(row.stationId, pompeNom);
        if (po) row.pompeId = po.id; else { unknownPompes.add(`${stationNom || ""} ${pompeNom}`.trim()); return null; }
      }
      return row;
    });
  }
  if (unknownStations.size) warnings.push(`Station(s) introuvable(s) dans l'application : ${[...unknownStations].join(", ")}. Créez-les (ou corrigez leur nom) puis réimportez.`);
  if (unknownPompes.size) warnings.push(`Pompe(s) introuvable(s) : ${[...unknownPompes].join(", ")}.`);
  return out;
}

function planImport(db, incomingRaw) {
  const summary = [];
  const warnings = [];
  const incoming = resolveNoms(db, incomingRaw, warnings);
  const next = { ...db };
  const knownStationIds = new Set([...(db.stations || []), ...((incoming.stations) || [])].map((s) => s.id));
  for (const key of COLLECTIONS) {
    const rows = incoming[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const current = [...(db[key] || [])];
    const byId = new Map(current.map((x, i) => [x.id, i]));
    const natKey = NATURAL_KEYS[key];
    const byNat = natKey ? new Map(current.map((x, i) => [natKey(x), i])) : null;
    let added = 0, replaced = 0, skipped = 0;
    for (const raw of rows) {
      if (!raw || typeof raw !== "object") { skipped++; continue; }
      const row = { ...raw };
      if (key !== "stations" && "stationId" in row && row.stationId && !knownStationIds.has(row.stationId)) { skipped++; continue; }
      if (row.date && isFutureDate(row.date)) { skipped++; continue; }
      let idx = row.id ? byId.get(row.id) : undefined;
      if (idx === undefined && byNat) idx = byNat.get(natKey(row));
      if (idx !== undefined) {
        row.id = current[idx].id;
        current[idx] = { ...current[idx], ...row };
        replaced++;
      } else {
        if (!row.id) row.id = uid();
        current.push(row);
        byId.set(row.id, current.length - 1);
        if (byNat) byNat.set(natKey(row), current.length - 1);
        added++;
      }
    }
    next[key] = current;
    summary.push({ key, label: COLLECTION_LABELS[key] || key, added, replaced, skipped });
    if (skipped > 0) warnings.push(`${COLLECTION_LABELS[key] || key} : ${skipped} ligne(s) ignorée(s) (station inconnue, date future ou ligne invalide).`);
  }
  return { next, summary, warnings };
}

function SauvegardeImportCard({ db, setDb, profile }) {
  const fileRef = useRef(null);
  const [plan, setPlan] = useState(null); // { next, summary, warnings, fileName }
  const [msg, setMsg] = useState(null);

  const exportBackup = () => {
    const data = { app: "smi-gestion", version: 1, exportedAt: new Date().toISOString() };
    COLLECTIONS.forEach((k) => { data[k] = db[k] || []; });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sauvegarde-smi-${todayISO()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onFile = async (e) => {
    setMsg(null); setPlan(null);
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) throw new Error("format");
      const p = planImport(db, incoming);
      if (p.summary.length === 0) { setMsg({ type: "err", text: "Ce fichier ne contient aucune donnée reconnue par l'application." }); return; }
      setPlan({ ...p, fileName: file.name });
    } catch {
      setMsg({ type: "err", text: "Fichier illisible. Utilisez un fichier .json de sauvegarde ou préparé pour l'import." });
    }
  };

  const confirmImport = () => {
    if (!plan) return;
    const total = plan.summary.reduce((s, x) => s + x.added + x.replaced, 0);
    const next = withAudit(plan.next, { user: profile?.name, role: profile?.role, stationId: null, entity: "import", action: "import de données", before: null, after: { fichier: plan.fileName, lignes: total } });
    setDb(next);
    setPlan(null);
    setMsg({ type: "ok", text: `Import terminé : ${total} ligne(s) enregistrée(s).` });
  };

  return (
    <Card className="max-w-2xl">
      <h3 className="font-semibold mb-1">Sauvegarde et import de données</h3>
      <p className="text-sm mb-3" style={{ color: C.textMuted }}>
        Téléchargez une copie complète des données, ou importez un fichier .json (sauvegarde, ou saisies préparées hors de l'application). Une fiche du même jour pour la même station est remplacée, pas dupliquée.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={exportBackup}><Download size={16} /> Télécharger une sauvegarde</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload size={16} /> Importer un fichier</Button>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={onFile} />
      </div>
      <p className="text-xs mt-2" style={{ color: C.textMuted }}>La sauvegarde contient aussi les comptes gérants et pompistes : gardez-la en lieu sûr.</p>

      {plan && (
        <div className="mt-4 rounded-md p-3" style={{ background: C.bgAlt, border: `1px solid ${C.border}` }}>
          <p className="text-sm font-semibold mb-2">Aperçu de « {plan.fileName} »</p>
          <table className="w-full text-sm">
            <thead><tr style={{ color: C.textMuted }}><th className="text-left py-1">Données</th><th className="text-right">Ajouts</th><th className="text-right">Remplacements</th><th className="text-right">Ignorées</th></tr></thead>
            <tbody>
              {plan.summary.map((s) => (
                <tr key={s.key}><td className="py-1">{s.label}</td><td className="text-right">{s.added}</td><td className="text-right">{s.replaced}</td><td className="text-right">{s.skipped}</td></tr>
              ))}
            </tbody>
          </table>
          {plan.warnings.map((w, i) => (
            <p key={i} className="text-xs flex items-center gap-1.5 mt-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {w}</p>
          ))}
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="ghost" onClick={() => setPlan(null)}>Annuler</Button>
            <Button onClick={confirmImport}>Confirmer l'import</Button>
          </div>
        </div>
      )}

      {msg && (
        <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: msg.type === "ok" ? C.success : C.danger }}>
          {msg.type === "ok" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {msg.text}
        </p>
      )}
    </Card>
  );
}

/* ------------------------- Espace propriétaire (super-admin) ------------------------- */

// Accessible à l'adresse de l'application suivie de « #proprietaire ». Réservé au
// propriétaire de Gestion StationPro : création et suivi des sociétés clientes.
const SUPER_PWD_KEY = "gsp_super_pwd";
const addMonths = (iso, n) => {
  const base = iso && iso >= todayISO() ? new Date(iso + "T00:00:00") : new Date(todayISO() + "T00:00:00");
  base.setMonth(base.getMonth() + n);
  return base.toISOString().slice(0, 10);
};

function ProprietaireView() {
  const [pwd, setPwd] = useState(() => { try { return sessionStorage.getItem(SUPER_PWD_KEY) || ""; } catch { return ""; } });
  const [pwdInput, setPwdInput] = useState("");
  const [list, setList] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", nom: "", adminPin: "", expireLe: addMonths("", 1), contact: "" });
  const [pinFor, setPinFor] = useState(null);
  const [newPin, setNewPin] = useState("");

  const api = async (body, password = pwd) => {
    const r = await fetch("/api/superadmin", { method: "POST", headers: { "Content-Type": "application/json", "x-super-password": password }, body: JSON.stringify(body) });
    let data = {};
    try { data = await r.json(); } catch { /* vide */ }
    if (r.status === 401) { try { sessionStorage.removeItem(SUPER_PWD_KEY); } catch { /* */ } setPwd(""); }
    if (!r.ok) throw new Error(data.error || `Erreur ${r.status}`);
    return data;
  };

  const refresh = async (password = pwd) => {
    try { const d = await api({ action: "list" }, password); setList(d.tenants); }
    catch (e) { setMsg({ type: "err", text: e.message }); }
  };

  useEffect(() => { if (pwd) refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const unlock = async () => {
    setMsg(null); setBusy(true);
    try {
      const d = await api({ action: "list" }, pwdInput);
      try { sessionStorage.setItem(SUPER_PWD_KEY, pwdInput); } catch { /* */ }
      setPwd(pwdInput); setList(d.tenants); setPwdInput("");
    } catch (e) { setMsg({ type: "err", text: e.message }); }
    finally { setBusy(false); }
  };

  const run = async (body, okText) => {
    setMsg(null); setBusy(true);
    try { await api(body); setMsg({ type: "ok", text: okText }); await refresh(); return true; }
    catch (e) { setMsg({ type: "err", text: e.message }); return false; }
    finally { setBusy(false); }
  };

  const create = async () => {
    const ok = await run({ action: "create", ...form }, `Société « ${form.nom} » créée. Code société : ${form.code.trim().toLowerCase()}`);
    if (ok) setForm({ code: "", nom: "", adminPin: "", expireLe: addMonths("", 1), contact: "" });
  };

  const inputStyle = { background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text };
  const inp = (props) => <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={inputStyle} {...props} />;

  const Msg = () => msg && (
    <p className="text-sm flex items-center gap-1.5 my-3" style={{ color: msg.type === "ok" ? C.success : C.danger }}>
      {msg.type === "ok" ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {msg.text}
    </p>
  );

  if (!pwd) {
    return (
      <div className="smi-root min-h-screen flex items-center justify-center p-6">
        <StyleInjector />
        <Card className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-4"><Logo size={36} /><div><p className="smi-display text-xl leading-none">{APP_NAME}</p><p className="text-xs" style={{ color: C.textMuted }}>Espace propriétaire</p></div></div>
          <Field label="Mot de passe propriétaire">{inp({ type: "password", value: pwdInput, onChange: (e) => setPwdInput(e.target.value), onKeyDown: (e) => { if (e.key === "Enter" && pwdInput) unlock(); } })}</Field>
          <Msg />
          <Button className="w-full justify-center mt-3" disabled={!pwdInput || busy} onClick={unlock}>{busy ? "Vérification…" : "Ouvrir"}</Button>
        </Card>
      </div>
    );
  }

  const today = todayISO();
  const dans7j = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const statut = (t) => t.statut === "suspendu" ? { text: "Suspendu", color: C.danger }
    : (t.expireLe && t.expireLe < today) ? { text: "Expiré", color: C.danger }
    : (t.expireLe && t.expireLe <= dans7j) ? { text: "Expire bientôt", color: C.amber }
    : { text: "Actif", color: C.success };

  return (
    <div className="smi-root min-h-screen p-4 md:p-8">
      <StyleInjector />
      <div className="max-w-5xl mx-auto flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3"><Logo size={36} /><div><p className="smi-display text-2xl leading-none">{APP_NAME}</p><p className="text-xs" style={{ color: C.textMuted }}>Espace propriétaire — sociétés clientes</p></div></div>
          <Button variant="ghost" onClick={() => { try { sessionStorage.removeItem(SUPER_PWD_KEY); } catch { /* */ } setPwd(""); setList(null); }}><LogOut size={14} /> Fermer</Button>
        </div>
        <Msg />

        <Card>
          <h3 className="font-semibold mb-3">Sociétés ({list ? list.length : "…"})</h3>
          {!list ? <Loader2 className="animate-spin" size={20} style={{ color: C.amber }} /> : list.length === 0 ? <p className="text-sm" style={{ color: C.textMuted }}>Aucune société pour l'instant.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr style={{ color: C.textMuted }}><th className="text-left py-1.5 pr-3">Société</th><th className="text-left pr-3">Code</th><th className="text-left pr-3">Statut</th><th className="text-left pr-3">Fin d'abonnement</th><th className="text-right pr-3">Stations</th><th className="text-left pr-3">Dernière saisie</th><th></th></tr></thead>
                <tbody>
                  {list.map((t) => { const st = statut(t); return (
                    <tr key={t.code} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2 pr-3"><p className="font-medium">{t.nom}</p>{t.contact && <p className="text-xs" style={{ color: C.textFaint }}>{t.contact}</p>}</td>
                      <td className="pr-3 smi-mono">{t.code}</td>
                      <td className="pr-3" style={{ color: st.color }}>{st.text}</td>
                      <td className="pr-3">{t.expireLe ? fmtDateLong(t.expireLe) : "Sans limite"}</td>
                      <td className="pr-3 text-right">{t.nbStations}</td>
                      <td className="pr-3 text-xs">{t.derniereSaisie ? new Date(t.derniereSaisie).toLocaleString("fr-FR") : "—"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <Button variant="ghost" disabled={busy} onClick={() => run({ action: "update", code: t.code, expireLe: addMonths(t.expireLe, 1) }, `${t.nom} : prolongé d'un mois.`)}>+1 mois</Button>
                          {t.statut === "suspendu"
                            ? <Button variant="ghost" disabled={busy} onClick={() => run({ action: "update", code: t.code, statut: "actif" }, `${t.nom} : réactivé.`)}>Réactiver</Button>
                            : <Button variant="ghost" disabled={busy} onClick={() => { if (confirm(`Suspendre l'accès de ${t.nom} ?`)) run({ action: "update", code: t.code, statut: "suspendu" }, `${t.nom} : suspendu.`); }}>Suspendre</Button>}
                          <Button variant="ghost" disabled={busy} onClick={() => { setPinFor(t.code); setNewPin(""); }}>Code PIN</Button>
                        </div>
                        {pinFor === t.code && (
                          <div className="flex gap-2 mt-2 justify-end">
                            <input className="smi-input rounded-md px-2 py-1 text-sm w-28" style={inputStyle} type="password" inputMode="numeric" placeholder="Nouveau PIN" value={newPin} onChange={(e) => setNewPin(e.target.value)} />
                            <Button disabled={busy || newPin.trim().length < 4} onClick={async () => { if (await run({ action: "resetPin", code: t.code, adminPin: newPin }, `${t.nom} : code PIN administrateur changé.`)) setPinFor(null); }}>OK</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ); })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="max-w-2xl">
          <h3 className="font-semibold mb-1">Nouvelle société cliente</h3>
          <p className="text-sm mb-3" style={{ color: C.textMuted }}>Communiquez ensuite au client son code société et son code PIN administrateur. Il crée lui-même ses stations, gérants et pompistes.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Nom de la société">{inp({ value: form.nom, onChange: (e) => setForm({ ...form, nom: e.target.value }), placeholder: "ex : Kaloum Pétrole SARL" })}</Field>
            <Field label="Code société" hint="Lettres et chiffres, sans espace. C'est ce que le client tape pour se connecter.">{inp({ value: form.code, onChange: (e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }), placeholder: "ex : kaloumpetrole", autoCapitalize: "none" })}</Field>
            <Field label="Code PIN administrateur (provisoire)">{inp({ value: form.adminPin, onChange: (e) => setForm({ ...form, adminPin: e.target.value }), inputMode: "numeric", placeholder: "4 chiffres minimum" })}</Field>
            <Field label="Fin d'abonnement" hint="Laissez vide pour un accès sans limite.">{inp({ type: "date", value: form.expireLe || "", onChange: (e) => setForm({ ...form, expireLe: e.target.value }) })}</Field>
            <Field label="Contact (facultatif)">{inp({ value: form.contact, onChange: (e) => setForm({ ...form, contact: e.target.value }), placeholder: "Nom et téléphone du responsable" })}</Field>
          </div>
          <div className="flex justify-end mt-4">
            <Button disabled={busy || !form.nom.trim() || form.code.trim().length < 2 || form.adminPin.trim().length < 4} onClick={create}><Plus size={16} /> Créer la société</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------ Profils et droits ------------------------------ */

const PROFILS_PROPOSES = [
  { nom: "Caissier", type: "gerant", modules: ["ventes", "caisse", "versement", "bons", "clients", "rapport_jour"] },
  { nom: "Responsable stock", type: "gerant", modules: ["releve", "stock", "cuves", "reception", "rapport_jour"] },
  { nom: "Comptable (siège)", type: "siege", modules: ["dashboard", "versement", "bons", "clients", "depenses", "fournisseurs", "resultat", "rapport", "rapport_hebdo", "exports"] },
  { nom: "Direction (siège)", type: "siege", modules: ["dashboard", "commandes_reseau", "cuves", "resultat", "rapport", "rapport_hebdo", "rapport_jour", "exports", "journal"] },
];

function modulesPourType(type) {
  const role = type === "siege" ? "admin" : "gerant";
  return TABS.filter((t) => t.key !== "guide" && t.key !== "securite" && (t.roles ? t.roles.includes(role) : (role === "admin" || !t.adminOnly)));
}

function DroitsCard({ db, setDb, profile }) {
  const profils = db.profils || [];
  const users = db.utilisateurs || [];
  const [form, setForm] = useState(null);
  const [uForm, setUForm] = useState(null);
  const [resetId, setResetId] = useState(null);
  const [newPass, setNewPass] = useState("");
  const [err, setErr] = useState("");
  const audit = (next, e) => withAudit(next, { user: profile?.name, role: profile?.role, ...e });

  const saveProfil = () => {
    setErr("");
    if (!form.nom.trim()) { setErr("Indiquez le nom du profil."); return; }
    if (!form.modules.length) { setErr("Cochez au moins un module."); return; }
    const row = { id: form.id || uid(), nom: form.nom.trim(), type: form.type, modules: form.modules };
    setDb(audit({ ...db, profils: form.id ? profils.map((x) => (x.id === row.id ? row : x)) : [...profils, row] }, { entity: "profil", action: form.id ? "modification" : "création", after: { nom: row.nom, modules: row.modules.length } }));
    setForm(null);
  };
  const removeProfil = (x) => {
    if ((db.gerants || []).some((g) => g.profilId === x.id) || users.some((u) => u.profilId === x.id)) { alert("Ce profil est utilisé par un compte : changez d'abord le profil de ces comptes."); return; }
    if (!confirm(`Supprimer le profil « ${x.nom} » ?`)) return;
    setDb(audit({ ...db, profils: profils.filter((p) => p.id !== x.id) }, { entity: "profil", action: "suppression", before: { nom: x.nom } }));
  };
  const creerProposes = () => {
    const nouveaux = PROFILS_PROPOSES.filter((p) => !profils.some((x) => x.nom === p.nom)).map((p) => ({ ...p, id: uid() }));
    setDb(audit({ ...db, profils: [...profils, ...nouveaux] }, { entity: "profil", action: "création", after: { profils: nouveaux.map((p) => p.nom).join(", ") } }));
  };
  const saveUser = () => {
    setErr("");
    if (!uForm.nom.trim()) { setErr("Indiquez le nom."); return; }
    if (!uForm.profilId) { setErr("Choisissez un profil."); return; }
    if (users.some((u) => u.nom.trim().toLowerCase() === uForm.nom.trim().toLowerCase())) { setErr("Un compte porte déjà ce nom."); return; }
    if (uForm.password.trim().length < 6) { setErr("Mot de passe : 6 caractères minimum."); return; }
    const row = { id: uid(), nom: uForm.nom.trim(), profilId: uForm.profilId, passwordHash: hashPin(uForm.password.trim()) };
    setDb(audit({ ...db, utilisateurs: [...users, row] }, { entity: "compte siège", action: "création", after: { nom: row.nom } }));
    setUForm(null);
  };
  const resetUser = (u) => {
    if (newPass.trim().length < 6) { setErr("Mot de passe : 6 caractères minimum."); return; }
    setDb(audit({ ...db, utilisateurs: users.map((x) => (x.id === u.id ? { ...x, passwordHash: hashPin(newPass.trim()) } : x)) }, { entity: "compte siège", action: "nouveau mot de passe", after: { nom: u.nom } }));
    setResetId(null); setNewPass("");
  };
  const changeUserProfil = (u, profilId) => setDb(audit({ ...db, utilisateurs: users.map((x) => (x.id === u.id ? { ...x, profilId } : x)) }, { entity: "compte siège", action: "changement de profil", after: { nom: u.nom } }));
  const removeUser = (u) => {
    if (!confirm(`Supprimer le compte « ${u.nom} » ?`)) return;
    setDb(audit({ ...db, utilisateurs: users.filter((x) => x.id !== u.id) }, { entity: "compte siège", action: "suppression", before: { nom: u.nom } }));
  };
  const toggle = (k) => setForm({ ...form, modules: form.modules.includes(k) ? form.modules.filter((m) => m !== k) : [...form.modules, k] });
  const libelle = (k) => TABS.find((t) => t.key === k)?.label || k;

  return (
    <>
      <Card className="max-w-3xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 className="font-semibold">Profils de droits</h3>
          <div className="flex gap-2">
            {PROFILS_PROPOSES.some((p) => !profils.some((x) => x.nom === p.nom)) && <Button variant="ghost" onClick={creerProposes}>Créer les profils proposés</Button>}
            <Button onClick={() => { setErr(""); setForm({ nom: "", type: "gerant", modules: [] }); }}><Plus size={14} /> Profil</Button>
          </div>
        </div>
        <p className="text-sm mb-3" style={{ color: C.textMuted }}>Un profil « station » limite ce que voit un compte gérant (ex. Caissier, Responsable stock), toujours sur sa seule station. Un profil « siège » s'applique aux comptes du siège, qui voient toutes les stations mais seulement les modules cochés (ex. Comptable, Direction).</p>
        {form && (
          <div className="rounded-md p-3 mb-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <div className="grid md:grid-cols-2 gap-3 mb-3">
              <Field label="Nom du profil"><input className={inputCls} style={inputSty()} value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} /></Field>
              <Field label="S'applique à"><SelectInput value={form.type} disabled={!!form.id} onChange={(e) => setForm({ ...form, type: e.target.value, modules: [] })}><option value="gerant">Comptes de station (gérants)</option><option value="siege">Comptes du siège (toutes stations)</option></SelectInput></Field>
            </div>
            <p className="text-xs uppercase font-semibold mb-2" style={{ color: C.textMuted }}>Modules autorisés</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
              {modulesPourType(form.type).map((t) => <label key={t.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.modules.includes(t.key)} onChange={() => toggle(t.key)} /> {t.label}</label>)}
            </div>
            {err && <p className="text-xs mt-2" style={{ color: C.danger }}>{err}</p>}
            <div className="flex justify-end gap-2 mt-3"><Button variant="ghost" onClick={() => setForm(null)}>Annuler</Button><Button onClick={saveProfil}>Enregistrer</Button></div>
          </div>
        )}
        {profils.length === 0 ? <p className="text-sm" style={{ color: C.textFaint }}>Aucun profil : les gérants ont accès à tous les modules de leur station.</p> : (
          <div className="flex flex-col gap-2">
            {profils.map((x) => (
              <div key={x.id} className="rounded-md p-2.5 flex items-start justify-between gap-2" style={{ border: `1px solid ${C.border}` }}>
                <div className="min-w-0"><p className="text-sm font-medium">{x.nom} <Pill tone={x.type === "siege" ? "teal" : "amber"}>{x.type === "siege" ? "Siège" : "Station"}</Pill></p><p className="text-xs" style={{ color: C.textFaint }}>{x.modules.map(libelle).join(" · ")}</p></div>
                <div className="flex gap-2 flex-shrink-0"><button className="smi-btn" style={{ color: C.teal }} onClick={() => { setErr(""); setForm({ ...x }); }}><Pencil size={14} /></button><button className="smi-btn" style={{ color: C.danger }} onClick={() => removeProfil(x)}><Trash2 size={14} /></button></div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="max-w-3xl">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
          <h3 className="font-semibold">Comptes du siège</h3>
          <Button onClick={() => { setErr(""); setUForm({ nom: "", password: "", profilId: profils.find((x) => x.type === "siege")?.id || "" }); }} disabled={!profils.some((x) => x.type === "siege")}><Plus size={14} /> Compte</Button>
        </div>
        <p className="text-sm mb-3" style={{ color: C.textMuted }}>Pour le comptable, la direction ou un contrôleur : ils se connectent avec le profil « Siège », leur nom et leur mot de passe, sans connaître le code PIN administrateur.{!profils.some((x) => x.type === "siege") && " Créez d'abord un profil « siège »."}</p>
        {uForm && (
          <div className="rounded-md p-3 mb-3 grid md:grid-cols-3 gap-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
            <Field label="Nom"><input className={inputCls} style={inputSty()} value={uForm.nom} onChange={(e) => setUForm({ ...uForm, nom: e.target.value })} /></Field>
            <Field label="Mot de passe"><input className={inputCls} style={inputSty()} type="password" value={uForm.password} onChange={(e) => setUForm({ ...uForm, password: e.target.value })} /></Field>
            <Field label="Profil"><SelectInput value={uForm.profilId} onChange={(e) => setUForm({ ...uForm, profilId: e.target.value })}>{profils.filter((x) => x.type === "siege").map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</SelectInput></Field>
            {err && <p className="text-xs md:col-span-3" style={{ color: C.danger }}>{err}</p>}
            <div className="md:col-span-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setUForm(null)}>Annuler</Button><Button onClick={saveUser}>Créer le compte</Button></div>
          </div>
        )}
        {users.length === 0 ? <p className="text-sm" style={{ color: C.textFaint }}>Aucun compte du siège.</p> : users.map((u) => (
          <div key={u.id} className="flex flex-col gap-1.5 py-1.5" style={{ borderTop: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{u.nom}</span>
              <div className="flex items-center gap-2">
                <select className="smi-select rounded-md px-1 py-0.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={u.profilId} onChange={(e) => changeUserProfil(u, e.target.value)}>{profils.filter((x) => x.type === "siege").map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}</select>
                <button className="smi-btn" style={{ color: C.teal }} onClick={() => { setResetId(resetId === u.id ? null : u.id); setNewPass(""); setErr(""); }}><Lock size={13} /></button>
                <button className="smi-btn" style={{ color: C.danger }} onClick={() => removeUser(u)}><Trash2 size={13} /></button>
              </div>
            </div>
            {resetId === u.id && <div className="flex gap-2"><input className="smi-input flex-1 rounded-md px-2 py-1.5 text-xs" style={inputSty()} type="password" placeholder="Nouveau mot de passe" value={newPass} onChange={(e) => setNewPass(e.target.value)} /><Button onClick={() => resetUser(u)}>Valider</Button></div>}
            {resetId === u.id && err && <p className="text-xs" style={{ color: C.danger }}>{err}</p>}
          </div>
        ))}
      </Card>
    </>
  );
}

/* ---------------------------------- Sécurité ---------------------------------- */

function SecuriteView({ db, setDb, profile }) {
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [msg, setMsg] = useState(null); // { type: "ok" | "err", text }
  const [busy, setBusy] = useState(false);

  const changePin = async () => {
    setMsg(null);
    if (newPin.trim().length < 4) { setMsg({ type: "err", text: "Le nouveau code doit faire au moins 4 chiffres." }); return; }
    if (newPin.trim() !== confirmPin.trim()) { setMsg({ type: "err", text: "La confirmation ne correspond pas au nouveau code." }); return; }
    setBusy(true);
    try {
      const r = await storage.get(ADMIN_PIN_KEY);
      const currentHash = r?.value;
      if (hashPin(oldPin.trim()) !== currentHash) { setMsg({ type: "err", text: "Code PIN actuel incorrect." }); setBusy(false); return; }
      await storage.set(ADMIN_PIN_KEY, hashPin(newPin.trim()));
      setMsg({ type: "ok", text: "Code PIN administrateur mis à jour." });
      setOldPin(""); setNewPin(""); setConfirmPin("");
    } catch {
      setMsg({ type: "err", text: "Impossible de vérifier le code PIN pour le moment. Réessayez." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Sécurité</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Changer le code PIN administrateur. Pour les codes PIN de station, rendez-vous dans Stations.</p>
      </div>

      <Card className="max-w-md">
        <div className="flex flex-col gap-3">
          <Field label="Code PIN actuel">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="••••" />
          </Field>
          <Field label="Nouveau code PIN">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="••••" />
          </Field>
          <Field label="Confirmer le nouveau code PIN">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={confirmPin} onChange={(e) => setConfirmPin(e.target.value)} placeholder="••••" />
          </Field>
        </div>

        {msg && (
          <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: msg.type === "ok" ? C.success : C.danger }}>
            {msg.type === "ok" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />} {msg.text}
          </p>
        )}

        <div className="flex justify-end mt-4">
          <Button onClick={changePin} disabled={busy || !oldPin || !newPin || !confirmPin}>
            {busy ? "Vérification…" : "Changer le code PIN"}
          </Button>
        </div>
      </Card>

      {profile?.role === "admin" && !profile?.siege && <DroitsCard db={db} setDb={setDb} profile={profile} />}
      {profile?.role === "admin" && !profile?.siege && <SauvegardeImportCard db={db} setDb={setDb} profile={profile} />}
    </div>
  );
}

/* --------------------------------- Guide d'utilisation ------------------------------- */

const GUIDE_SECTIONS = [
  {
    key: "mouvements", title: "Mouvements Pompiste", adminOnly: false,
    text: "Réservé au gérant et aux pompistes. Le gérant y crée les comptes pompistes (pompe assignée, nom, mot de passe) — le pompiste se connecte ensuite avec ce nom et ce mot de passe. Pour la pompe gérée : le relevé du jour s'affiche automatiquement avec la valeur de la vente. Chaque décaissement (espèce ou mobile) et chaque bon ajouté recalcule automatiquement le total. Sa caisse = valeur de la vente − décaissements − bons. Si le résultat est 0, il n'y a pas de manquant ; un résultat négatif signale un manquant à régulariser.",
  },
  {
    key: "releve", title: "Relevé Pompes", adminOnly: false,
    text: "Chaque jour, pour chaque pompe : saisissez l'index de clôture (essence et/ou gasoil). L'index d'ouverture se remplit automatiquement avec la clôture du relevé précédent — vous n'avez normalement rien à corriger, sauf en cas de remise à zéro du compteur. Le volume vendu est calculé automatiquement.",
  },
  {
    key: "ventes", title: "Ventes", adminOnly: false,
    text: "Indiquez le prix de vente du jour pour l'essence et le gasoil. Les volumes viennent automatiquement du Relevé Pompes ; le chiffre d'affaires du jour (CA) est calculé pour vous et sert de base à la Caisse.",
  },
  {
    key: "stock", title: "Contrôle Stock", adminOnly: false,
    text: "Le stock d'ouverture du jour reprend automatiquement le stock PHYSIQUE constaté la veille (pas le stock théorique) — pour que le comptage réel serve de référence d'un jour sur l'autre. Le comptage physique du jour est pré-rempli avec ce même point de départ ; corrigez-le selon le comptage réel une fois les livraisons et ventes prises en compte, puisqu'il deviendra à son tour le stock d'ouverture du lendemain. L'écart entre stock théorique calculé et stock physique s'affiche automatiquement — un écart important mérite une vérification.",
  },
  {
    key: "cuves", title: "Cuves", adminOnly: false,
    text: "L'administrateur déclare les cuves de chaque station : produit, capacité, seuil d'alerte et seuil critique (par défaut 25 % et 10 % de la capacité). Le niveau de chaque cuve vient du dernier Contrôle Stock (stock physique jaugé, sinon stock théorique). Vous voyez le remplissage en %, la place libre avant une livraison, et le nombre de jours avant rupture au rythme des 7 derniers jours. Les cuves en alerte apparaissent aussi en haut du Tableau de bord, et la place libre s'affiche lors d'une Réception.",
  },
  {
    key: "compte_station", title: "Compte station", adminOnly: false,
    text: "Pour les stations dont les versements paient le carburant reçu du fournisseur. L'administrateur paramètre une fois : date de début du suivi, stock de roulement de départ, prix de cession essence et gasoil, fournisseur concerné et ajustement de reprise éventuel. L'appli calcule le total à verser (stock de départ + réceptions au prix de cession), les versements, bons et dépenses payées par la caisse, et le reste à verser. Le contrôle compare ce reste à ce que la station détient (stock restant + caisse non versée) en tenant compte de sa marge, et signale un manquant. Le tableau « livraison par livraison » montre quelles livraisons sont soldées.",
  },
  {
    key: "exports", title: "Exports", adminOnly: true,
    text: "Choisissez une période libre (du… au…) et, si besoin, une station, puis téléchargez en CSV (ouvrable dans Excel) : la synthèse journalière (litres, chiffre d'affaires, stocks, écarts, versements, bons, dépenses, caisse attendue et comptée), les relevés de pompes, réceptions, versements, bons, dépenses, règlements clients, paiements fournisseurs et le journal des saisies.",
  },
  {
    key: "clients", title: "Clients à crédit", adminOnly: false,
    text: "L'administrateur crée les clients en compte (entreprises, flottes), avec un plafond de crédit facultatif. Le carburant vendu à crédit se saisit dans Bons en choisissant le client (produit, immatriculation, n° de bon ; le prix du jour est proposé). Le solde de chaque client se met à jour seul, avec une alerte à 80 % du plafond. « Encaisser » enregistre un règlement ; s'il est reçu en espèces dans la caisse d'une station, il s'ajoute à la caisse attendue du jour. L'administrateur émet une facture numérotée (FAC-année-n°) pour une période et l'imprime ou l'enregistre en PDF ; le relevé montre tous les bons et règlements.",
  },
  {
    key: "depenses", title: "Dépenses", adminOnly: false,
    text: "Chaque dépense a une catégorie (salaires, électricité, maintenance, taxes…), un montant, un mode de paiement et un bénéficiaire. Celles saisies par un gérant restent « en attente » jusqu'à validation par l'administrateur, qui peut aussi les refuser. Une dépense payée en espèces avec l'argent de la caisse de la station est déduite de la caisse attendue du jour. Filtre par mois, station, catégorie et statut, et export CSV.",
  },
  {
    key: "fournisseurs", title: "Fournisseurs", adminOnly: true,
    text: "Fiche de chaque fournisseur et ce que vous lui devez. Lors d'une Réception, l'administrateur choisit le fournisseur, le prix d'achat par litre et le montant payé à la livraison : le reste s'ajoute à la dette. Le bouton Payer enregistre un règlement ultérieur (et la station qui a payé). Le détail montre toutes les livraisons et tous les paiements.",
  },
  {
    key: "resultat", title: "Résultat", adminOnly: true,
    text: "Sur la période de votre choix, par station ou pour tout le réseau : chiffre d'affaires, coût du carburant vendu (litres vendus × prix d'achat moyen des livraisons), marge brute, dépenses validées par catégorie et résultat. Affiche aussi les achats de la période, les bons et les dettes fournisseurs. Export CSV et PDF.",
  },
  {
    key: "caisse", title: "Caisse", adminOnly: false,
    text: "« Caisse précédente » se saisit manuellement chaque jour (mettez 0 si tout l'argent a été versé la veille). « Caisse du jour » se pré-remplit avec le CA du jour, à corriger selon le comptage réel. Les totaux « Bons » et « Versements » du jour s'affichent automatiquement — ils se saisissent désormais uniquement dans les onglets dédiés Bons et Versement, plus dans Caisse, pour éviter toute double saisie. Bon, Paiement marchand et Versement réduisent tous les trois la caisse attendue, puisqu'un versement peut être fait en cours de journée (anticipation d'une grosse recette).",
  },
  {
    key: "inspection", title: "Inspection", adminOnly: false,
    text: "Grille de contrôle standard (propreté, sécurité incendie, état des pompes, hygiène, EPI, maintenance, éclairage...). Pour chaque point : Conforme, Non conforme (avec remarque), ou N/A si le point ne s'applique pas à cette station ce jour-là. L'historique des inspections passées reste consultable en dessous.",
  },
  {
    key: "reception", title: "Réception", adminOnly: false,
    text: "À chaque livraison de carburant : produit, quantité, fournisseur, numéro de bon, et une photo du bon de livraison prise directement avec l'appareil photo du téléphone. Sert de preuve et d'historique des livraisons.",
  },
  {
    key: "versement", title: "Versement", adminOnly: false,
    text: "Enregistrement des dépôts du jour : versement bancaire (nom de la banque, montant, photo du reçu), paiement marchand, et versement au compte du DG (avec libellé). Le cumul du jour se calcule automatiquement, même si les versements sont saisis séparément.",
  },
  {
    key: "bons", title: "Bons", adminOnly: false,
    text: "Enregistrement des bons de carburant (non payés en espèces) : libellé, quantité, prix unitaire, frais de route. Le montant et le cumul du jour se calculent automatiquement.",
  },
  {
    key: "rapport_jour", title: "Rapport journalier", adminOnly: false,
    text: "Rapport détaillé d'une station pour une journée précise : index des pompes, ventes, stock, coupon de bon/versement, et synthèse caisse — exactement dans le format papier habituel. Bouton « Exporter en PDF » pour l'enregistrer ou l'imprimer.",
  },
  {
    key: "rapport_hebdo", title: "Rapport hebdomadaire", adminOnly: false,
    text: "Récapitulatif complet d'une semaine complète (lundi à dimanche) : ventes (essence/gasoil/CA) jour par jour, versements (Bancaire, Paiement marchand, Versement au compte du DG) avec le détail banque et n° de reçu de chaque versement, bons de la semaine, livraisons reçues, stock d'ouverture (lundi), stock restant (dimanche), et commandes en cours (passées mais pas encore livrées, saisies dans l'onglet Commandes). Choisissez n'importe quelle date de la semaine visée — les bornes se calculent automatiquement. Exportable en PDF comme les autres rapports.",
  },
  {
    key: "dashboard", title: "Tableau de bord", adminOnly: true,
    text: "En haut, la vue financière (filtrable par station, sur le jour, 7 jours ou le mois) : chiffre d'affaires, valeur du stock en cuve, dépenses, versements, dettes fournisseurs, résultat de l'année avec le détail mois par mois (ventes, coût du carburant, dépenses, résultat), et la courbe des entrées et sorties des 7 derniers jours. En dessous, vue d'ensemble du réseau : volumes et chiffre d'affaires du mois en cours, station par station, mis à jour automatiquement à chaque saisie d'un gérant. Chaque station affiche aussi son suivi Fond de roulement (défini dans Stations) : stock total actuel, rythme de vente moyen des 7 derniers jours, et nombre de jours estimés avant rupture — avec une alerte en haut de page dès qu'une station passe sous son seuil, pour déclencher une commande à temps.",
  },
  {
    key: "commandes_reseau", title: "Commandes", adminOnly: true,
    text: "Estimation de la quantité à commander par station, essence et gasoil séparément. « Besoin idéal » = ce qui manque pour revenir au fond de roulement (seuil défini dans Stations), plus une marge pour le délai de livraison estimé (3 jours). « Quantité recommandée » = ce besoin idéal plafonné par ce qui est réellement finançable, puisque la direction exige les reçus de versement avant d'accepter une commande : le montant des versements accumulés depuis la dernière commande marquée « livrée » est divisé par le prix unitaire le plus récent saisi dans Ventes pour obtenir des litres finançables. Une alerte apparaît si le financement ne couvre pas le besoin idéal. Section « Commandes en cours » : enregistrez une commande passée (date, produit, quantité) — elle reste visible tant qu'elle n'est pas marquée « livrée », et apparaît aussi dans le Rapport hebdomadaire de la station.",
  },
  {
    key: "stations", title: "Stations", adminOnly: true,
    text: "Créez et modifiez les stations du réseau (nom, localisation, fournisseur, devise) — 4 pompes sont créées automatiquement avec chaque nouvelle station. Vous pouvez aussi lui assigner une couleur, reprise sur ses cartes dans Stations, Tableau de bord et Commandes pour la repérer facilement. C'est aussi ici que vous créez les comptes gérants (nom, mot de passe, station, et éventuellement un partenaire assigné).",
  },
  {
    key: "passations", title: "Passation", adminOnly: true,
    text: "Enregistre chaque changement de gérant dans une station : qui remplace qui, à quelle date, et dans quel état (stock essence/gasoil, caisse) la station a été transmise, avec un bouton « Pré-remplir stock/caisse » qui reprend les derniers chiffres connus. Chaque passation peut être imprimée sous forme de fiche avec lignes de signature pour le gérant sortant et le gérant entrant.",
  },
  {
    key: "partenaires", title: "Partenaires", adminOnly: false,
    text: "Suivi des clients/stations partenaires qui ne sont pas sous le contrôle quotidien strict du réseau (pas de relevé, stock ou caisse) — seulement leurs commandes et versements. L'admin gère la liste des clients ; un gérant peut être assigné à un client précis (depuis Stations) et n'accède alors qu'à ce client. Chaque commande indique la quantité commandée, livrée, et le prix ; le tableau de bord du client affiche volume commandé, volume livré, valeur commandée et montant versé, avec le reste à livrer et le reste à payer calculés automatiquement.",
  },
  {
    key: "pompes", title: "Pompes", adminOnly: true,
    text: "Créez les pompes de chaque station — nécessaire avant de pouvoir saisir des relevés.",
  },
  {
    key: "rapport", title: "Rapport mensuel", adminOnly: true,
    text: "Synthèse consolidée sur un mois, filtrable par station, avec export CSV pour la comptabilité.",
  },
  {
    key: "journal", title: "Journal des saisies", adminOnly: true,
    text: "Traçabilité complète : qui a créé, modifié ou supprimé quoi, sur quelle station, et à quelle heure. Filtrable par station.",
  },
  {
    key: "securite", title: "Sécurité", adminOnly: true,
    text: "Profils de droits : limitez les modules d'un compte gérant (Caissier, Responsable stock…) ou créez des comptes du siège (Comptable, Direction…) qui voient toutes les stations mais seulement les modules cochés, avec leur propre mot de passe. Changez votre code PIN administrateur (ancien code requis). Les codes PIN de station se changent depuis Stations. Vous pouvez aussi y télécharger une sauvegarde complète des données, ou importer un fichier .json de saisies (aperçu avant confirmation ; une fiche du même jour pour la même station est remplacée, pas dupliquée ; un versement identique — même jour, même montant — n'est pas recréé).",
  },
];

function GuideView({ profile }) {
  const isAdmin = profile.role === "admin";
  const isPompiste = profile.role === "pompiste";
  const [openKey, setOpenKey] = useState(isPompiste ? "mouvements" : isAdmin ? "dashboard" : "releve");
  // Un pompiste n'a accès qu'à Mouvements Pompiste (et ce guide) — inutile de lui montrer
  // les modules qu'il ne peut de toute façon pas ouvrir.
  const sections = isPompiste
    ? GUIDE_SECTIONS.filter((s) => s.key === "mouvements")
    : isAdmin
    ? GUIDE_SECTIONS
    : GUIDE_SECTIONS.filter((s) => !s.adminOnly);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl flex items-center gap-2"><BookOpen size={22} /> Guide d'utilisation</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>
          {isAdmin
            ? "Un aperçu rapide de chaque module de l'application. Cliquez sur un module pour dérouler son explication."
            : "Un aperçu rapide de chaque écran auquel vous avez accès. Cliquez sur un module pour dérouler son explication."}
        </p>
      </div>

      <Card>
        <div className="flex flex-col gap-2">
          {sections.map((s) => {
            const open = openKey === s.key;
            return (
              <div key={s.key} className="rounded-md" style={{ border: `1px solid ${C.border}` }}>
                <button onClick={() => setOpenKey(open ? null : s.key)} className="smi-btn w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left">
                  <span className="text-sm font-medium flex items-center gap-2">
                    {s.title}
                    {s.adminOnly && <Pill tone="amber">Admin</Pill>}
                  </span>
                  <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", color: C.textFaint }} />
                </button>
                {open && (
                  <p className="text-sm px-3 pb-3" style={{ color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>{s.text}</p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <p className="text-sm font-semibold mb-1">Pour bien démarrer</p>
          <p className="text-sm" style={{ color: C.textMuted }}>
            1. Créez vos stations (Stations) — 2. Ajoutez les pompes de chaque station (Pompes) —
            3. Partagez le lien de l'application à vos gérants, chacun choisit sa station à la connexion.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ Journal des saisies ---------------------------- */

const AUDIT_LABELS = { station: "Station", pompe: "Pompe", releve: "Relevé pompe", vente: "Vente", stock: "Contrôle stock", caisse: "Caisse", inspection: "Inspection", reception: "Réception", mouvement: "Mouvement pompiste", versement: "Versement", bon: "Bon", pompiste_compte: "Compte pompiste", gerant_compte: "Compte gérant", partenaire: "Client partenaire", commande_partenaire: "Commande partenaire", versement_partenaire: "Versement partenaire", commande_reseau: "Commande réseau", passation: "Passation" };

/* ------------------------------ Exports (période libre) ------------------------------ */

function ExportsView({ db }) {
  const [du, setDu] = useState(todayISO().slice(0, 8) + "01");
  const [au, setAu] = useState(todayISO());
  const [stationId, setStationId] = useState("");
  const stNom = (id) => db.stations.find((x) => x.id === id)?.nom || "";
  const pompeNom = (id) => db.pompes.find((x) => x.id === id)?.nom || "";
  const inP = (r) => r.date >= du && r.date <= au && (!stationId || r.stationId === stationId);
  const suffixe = `${stationId ? stNom(stationId).replace(/\s+/g, "_") + "-" : ""}${du}_${au}`;
  const cliNom = (id) => (db.clients || []).find((c) => c.id === id)?.nom || "";
  const fourNom = (id) => (db.fournisseurs || []).find((f) => f.id === id)?.nom || "";

  // Synthèse jour par jour et station par station : l'essentiel d'un rapport de période.
  const synthese = () => {
    const cles = new Set();
    [db.releves, db.stocks, db.caisses, db.versements].forEach((l) => l.filter(inP).forEach((r) => cles.add(`${r.date}|${r.stationId}`)));
    return [...cles].sort().map((k) => {
      const [d, sid] = k.split("|");
      const v = computeVente(db.releves, db.ventes, sid, d);
      const st = computeStock(db.releves, db.stocks, sid, d);
      const c = computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, sid, d, db.depenses, db.reglementsClients);
      return [d, stNom(sid), v.essence, v.gasoil, Math.round(v.ca), st.record ? stockAffichable(st, "essence") : "", st.record ? stockAffichable(st, "gasoil") : "", st.ecartEssence ?? "", st.ecartGasoil ?? "", Math.round(c.totalVersement), Math.round(c.totalBon), Math.round(c.totalDepenses || 0), Math.round(c.caisseAttendue), c.caisseDuJour ?? "", c.ecart ?? ""];
    });
  };

  const jeux = [
    { k: "synthese", t: "Synthèse journalière", d: "Litres, chiffre d'affaires, stocks, écarts, versements, bons, dépenses et caisse, par jour et par station.", n: () => synthese().length,
      run: () => exportCsv(`synthese-${suffixe}`, ["Date", "Station", "Essence vendue (L)", "Gasoil vendu (L)", "Chiffre d'affaires", "Stock essence", "Stock gasoil", "Écart essence (L)", "Écart gasoil (L)", "Versements", "Bons", "Dépenses (caisse)", "Caisse attendue", "Caisse comptée", "Écart de caisse"], synthese()) },
    { k: "releves", t: "Relevés des pompes", d: "Index d'ouverture et de clôture, pompe par pompe.", n: () => db.releves.filter(inP).length,
      run: () => exportCsv(`releves-${suffixe}`, ["Date", "Station", "Pompe", "Ouverture essence", "Clôture essence", "Ouverture gasoil", "Clôture gasoil", "Litres"], db.releves.filter(inP).sort((a, b) => (a.date < b.date ? -1 : 1)).map((r) => [r.date, stNom(r.stationId), pompeNom(r.pompeId), r.indexOuvertureEssence, r.indexClotureEssence, r.indexOuvertureGasoil, r.indexClotureGasoil, Math.max(0, num(r.indexClotureEssence) - num(r.indexOuvertureEssence)) + Math.max(0, num(r.indexClotureGasoil) - num(r.indexOuvertureGasoil))])) },
    { k: "receptions", t: "Réceptions", d: "Livraisons de carburant, fournisseur, prix d'achat et montant payé.", n: () => db.receptions.filter(inP).length,
      run: () => exportCsv(`receptions-${suffixe}`, ["Date", "Station", "Produit", "Quantité (L)", "Fournisseur", "N° bon", "Prix d'achat", "Montant", "Payé à la livraison"], db.receptions.filter(inP).map((r) => [r.date, stNom(r.stationId), r.produit, num(r.quantite), r.fournisseur || fourNom(r.fournisseurId), r.numeroBon, r.prixAchat || prixCessionDefaut(db, r.stationId, r.produit) || "", Math.round(montantReception(r, db)) || "", r.montantPaye])) },
    { k: "versements", t: "Versements", d: "Versements bancaires, paiements marchands, versements au compte du DG.", n: () => db.versements.filter(inP).length,
      run: () => exportCsv(`versements-${suffixe}`, ["Date", "Station", "Banque", "N° reçu", "Versement bancaire", "Paiement marchand", "Compte du DG", "Libellé DG", "Total"], db.versements.filter(inP).map((v) => [v.date, stNom(v.stationId), v.banqueNom, v.recuNumero, v.banqueMontant, v.paiementMarchandMontant, v.autreMontant, v.autreLibelle, versementTotal(v)])) },
    { k: "bons", t: "Bons", d: "Bons internes et ventes à crédit (client, véhicule, n° de bon).", n: () => db.bons.filter(inP).length,
      run: () => exportCsv(`bons-${suffixe}`, ["Date", "Station", "Libellé", "Client", "Produit", "Immatriculation", "N° bon", "Quantité", "Prix", "Frais de route", "Total"], db.bons.filter(inP).map((b) => [b.date, stNom(b.stationId), b.libelle, cliNom(b.clientId), b.produit, b.immatriculation, b.numeroBon, b.quantite, b.prixUnitaire, b.fraisRoute, bonTotal(b)])) },
    { k: "depenses", t: "Dépenses", d: "Toutes les dépenses avec catégorie et statut.", n: () => (db.depenses || []).filter(inP).length,
      run: () => exportCsv(`depenses-${suffixe}`, ["Date", "Station", "Catégorie", "Bénéficiaire", "Description", "Mode", "Payée par la caisse", "Montant", "Statut"], (db.depenses || []).filter(inP).map((d) => [d.date, stNom(d.stationId), d.categorie, d.beneficiaire, d.description, d.mode, d.payeeParCaisse ? "oui" : "non", num(d.montant), d.statut])) },
    { k: "reglements", t: "Règlements clients", d: "Encaissements des clients à crédit.", n: () => (db.reglementsClients || []).filter((r) => r.date >= du && r.date <= au && (!stationId || r.stationId === stationId)).length,
      run: () => exportCsv(`reglements-clients-${suffixe}`, ["Date", "Client", "Montant", "Mode", "Station", "Reçu en caisse", "Note"], (db.reglementsClients || []).filter((r) => r.date >= du && r.date <= au && (!stationId || r.stationId === stationId)).map((r) => [r.date, cliNom(r.clientId), num(r.montant), r.mode, stNom(r.stationId), r.encaisseEnCaisse ? "oui" : "non", r.note])) },
    { k: "paiements", t: "Paiements fournisseurs", d: "Règlements faits aux fournisseurs.", n: () => (db.paiementsFournisseurs || []).filter((r) => r.date >= du && r.date <= au && (!stationId || r.stationId === stationId)).length,
      run: () => exportCsv(`paiements-fournisseurs-${suffixe}`, ["Date", "Fournisseur", "Montant", "Mode", "Station", "Note"], (db.paiementsFournisseurs || []).filter((r) => r.date >= du && r.date <= au && (!stationId || r.stationId === stationId)).map((r) => [r.date, fourNom(r.fournisseurId), num(r.montant), r.mode, stNom(r.stationId), r.note])) },
    { k: "journal", t: "Journal des saisies", d: "Qui a saisi, modifié ou supprimé quoi, et quand.", n: () => (db.audit || []).filter((a) => a.ts.slice(0, 10) >= du && a.ts.slice(0, 10) <= au && (!stationId || a.stationId === stationId)).length,
      run: () => exportCsv(`journal-${suffixe}`, ["Date et heure", "Utilisateur", "Rôle", "Station", "Élément", "Action", "Détail"], (db.audit || []).filter((a) => a.ts.slice(0, 10) >= du && a.ts.slice(0, 10) <= au && (!stationId || a.stationId === stationId)).map((a) => [new Date(a.ts).toLocaleString("fr-FR"), a.user, a.role, stNom(a.stationId), a.entity, a.action, JSON.stringify(a.after || a.before || "")])) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Exports</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Toutes les données sur la période de votre choix, en fichiers CSV qui s'ouvrent dans Excel.</p>
      </div>
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
          <Field label="Du"><TextInput type="date" value={du} onChange={(e) => setDu(e.target.value)} /></Field>
          <Field label="Au"><TextInput type="date" value={au} onChange={(e) => setAu(e.target.value)} /></Field>
          <Field label="Station"><SelectInput value={stationId} onChange={(e) => setStationId(e.target.value)}><option value="">Toutes</option>{db.stations.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</SelectInput></Field>
          <div className="flex gap-1 flex-wrap">
            {[["Ce mois", todayISO().slice(0, 8) + "01"], ["Mois dernier", null], ["Cette année", todayISO().slice(0, 4) + "-01-01"]].map(([l, a]) => (
              <Button key={l} variant="ghost" onClick={() => {
                if (a) { setDu(a); setAu(todayISO()); return; }
                const d = new Date(`${todayISO().slice(0, 8)}01T12:00:00`); d.setDate(0);
                setAu(d.toISOString().slice(0, 10)); setDu(d.toISOString().slice(0, 8) + "01");
              }}>{l}</Button>
            ))}
          </div>
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-3">
        {jeux.map((j) => {
          const n = j.n();
          return (
            <Card key={j.k} className="flex items-center justify-between gap-3">
              <div className="min-w-0"><p className="font-semibold text-sm">{j.t} <span className="text-xs font-normal" style={{ color: C.textFaint }}>· {n} ligne{n > 1 ? "s" : ""}</span></p><p className="text-xs" style={{ color: C.textMuted }}>{j.d}</p></div>
              <Button variant="ghost" disabled={n === 0} onClick={j.run}><Download size={16} /> CSV</Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function AuditLogView({ db }) {
  const entries = db.audit || [];
  const [stationFilter, setStationFilter] = useState("");
  const filtered = stationFilter ? entries.filter((e) => e.stationId === stationFilter) : entries;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Journal des saisies</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Traçabilité des créations, modifications et suppressions — qui a fait quoi et quand. Les {AUDIT_MAX} dernières actions sont conservées.</p>
      </div>

      <Card>
        <Field label="Filtrer par station"><StationSelect stations={db.stations} value={stationFilter} onChange={setStationFilter} allowAll /></Field>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={History} title="Aucune action enregistrée" hint="Le journal se remplit automatiquement à chaque saisie." />
        ) : (
          <div className="overflow-x-auto smi-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Date/heure</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Utilisateur</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Station</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Élément</th>
                  <th className="text-left py-1.5" style={{ color: C.textMuted }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="py-1.5 smi-mono text-xs">{new Date(e.ts).toLocaleString("fr-FR")}</td>
                    <td className="py-1.5">{e.user} <span style={{ color: C.textFaint }}>({e.role === "admin" ? "admin" : e.role === "pompiste" ? "pompiste" : "gérant"})</span></td>
                    <td className="py-1.5" style={{ color: C.textMuted }}>{db.stations.find((s) => s.id === e.stationId)?.nom || "—"}</td>
                    <td className="py-1.5">{AUDIT_LABELS[e.entity] || e.entity}</td>
                    <td className="py-1.5"><Pill tone={e.action === "suppression" ? "danger" : e.action === "création" ? "success" : "muted"}>{e.action}</Pill></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------------------------- App shell -------------------------------- */

// Onglets visibles : ceux du rôle, puis, si le compte a un profil de droits, seulement
// les modules cochés dans ce profil. Le guide reste toujours visible.
function compteDuProfil(db, profile) {
  if (profile.siege) return (db.utilisateurs || []).find((u) => u.id === profile.compteId);
  if (profile.role === "gerant") return (db.gerants || []).find((g) => (profile.compteId ? g.id === profile.compteId : g.nom === profile.name && g.stationId === profile.stationId));
  return null;
}
function ongletsAutorises(db, profile) {
  const base = TABS.filter((t) => (t.roles ? t.roles.includes(profile.role) : (profile.role === "admin" || !t.adminOnly)));
  const compte = compteDuProfil(db, profile);
  const pr = compte?.profilId ? (db.profils || []).find((x) => x.id === compte.profilId) : null;
  if (profile.siege) {
    // Compte du siège : uniquement les modules de son profil, jamais la Sécurité.
    const mods = new Set(pr?.modules || []);
    return base.filter((t) => t.key === "guide" || (t.key !== "securite" && mods.has(t.key)));
  }
  if (!pr) return base;
  const mods = new Set(pr.modules || []);
  return base.filter((t) => t.key === "guide" || mods.has(t.key));
}

const TABS = [
  { key: "guide", label: "Guide d'utilisation", icon: BookOpen, adminOnly: false },
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, adminOnly: true },
  { key: "commandes_reseau", label: "Commandes", icon: Truck, adminOnly: true },
  { key: "stations", label: "Stations", icon: Building2, adminOnly: true },
  { key: "passations", label: "Passation", icon: Users, adminOnly: true },
  { key: "partenaires", label: "Partenaires", icon: Users, roles: ["admin", "gerant"] },
  { key: "pompes", label: "Pompes", icon: Gauge, adminOnly: true },
  { key: "releve", label: "Relevé Pompes", icon: Fuel, adminOnly: false },
  { key: "ventes", label: "Ventes", icon: Wallet, adminOnly: false },
  { key: "stock", label: "Contrôle Stock", icon: Warehouse, adminOnly: false },
  { key: "cuves", label: "Cuves", icon: Droplet, roles: ["admin", "gerant"] },
  { key: "caisse", label: "Caisse", icon: Wallet, adminOnly: false },
  { key: "inspection", label: "Inspection", icon: ClipboardCheck, adminOnly: false },
  { key: "reception", label: "Réception", icon: Truck, adminOnly: false },
  { key: "versement", label: "Versement", icon: Landmark, adminOnly: false },
  { key: "compte_station", label: "Compte station", icon: Landmark, roles: ["admin", "gerant"] },
  { key: "bons", label: "Bons", icon: Wallet, adminOnly: false },
  { key: "clients", label: "Clients à crédit", icon: Users, roles: ["admin", "gerant"] },
  { key: "depenses", label: "Dépenses", icon: Wallet, roles: ["admin", "gerant"] },
  { key: "fournisseurs", label: "Fournisseurs", icon: Truck, adminOnly: true },
  { key: "mouvements", label: "Mouvements Pompiste", icon: Users, roles: ["gerant", "pompiste"] },
  { key: "resultat", label: "Résultat", icon: LayoutDashboard, adminOnly: true },
  { key: "rapport", label: "Rapport mensuel", icon: CalendarRange, adminOnly: true },
  { key: "rapport_jour", label: "Rapport journalier", icon: Printer, adminOnly: false },
  { key: "rapport_hebdo", label: "Rapport hebdomadaire", icon: CalendarRange, adminOnly: false },
  { key: "exports", label: "Exports", icon: Download, adminOnly: true },
  { key: "journal", label: "Journal des saisies", icon: History, adminOnly: true },
  { key: "securite", label: "Sécurité", icon: Lock, adminOnly: true },
];

export default function App() {
  const [hash, setHash] = useState(() => (typeof window !== "undefined" ? window.location.hash : ""));
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  if (hash === "#proprietaire") return <ProprietaireView />;
  return <AppSociete />;
}

function AppSociete() {
  const { db, setDb, profile, setProfile, ready, error, retrySave, logoutReason } = useSmiStorage();
  const [tab, setTab] = useState("guide");
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);

  useEffect(() => {
    // Réglages d'affichage personnels (thème, taille, couleur, police) — appliqués dès le
    // premier rendu, avant même la connexion, pour que l'écran de connexion en profite
    // aussi.
    applyDisplaySettings(loadDisplaySettings());
  }, []);

  useEffect(() => {
    // Le guide s'affiche en premier à chaque connexion, quel que soit le rôle — l'accès
    // aux modules reste ensuite à un clic dans le menu.
    setTab("guide");
  }, [profile?.role]);

  if (!ready) {
    return (
      <div className="smi-root min-h-screen flex items-center justify-center">
        <StyleInjector />
        <Loader2 className="animate-spin" style={{ color: C.amber }} size={28} />
      </div>
    );
  }

  if (!profile || !db) {
    return <LoginScreen onLoggedIn={() => setProfile(getSession()?.profile)} reason={logoutReason} />;
  }

  const visibleTabs = ongletsAutorises(db, profile);
  const stationName = profile.stationId ? db.stations.find((s) => s.id === profile.stationId)?.nom : null;

  const renderTab = () => {
    if (!visibleTabs.some((t) => t.key === tab)) return <GuideView profile={profile} />;
    switch (tab) {
      case "guide": return <GuideView profile={profile} />;
      case "dashboard": return <DashboardView db={db} />;
      case "commandes_reseau": return <CommandesReseauView db={db} setDb={setDb} profile={profile} />;
      case "stations": return <StationsView db={db} setDb={setDb} profile={profile} />;
      case "passations": return <PassationsView db={db} setDb={setDb} profile={profile} />;
      case "partenaires": return <PartenairesView db={db} setDb={setDb} profile={profile} />;
      case "pompes": return <PompesView db={db} setDb={setDb} profile={profile} />;
      case "releve": return <RelevePompesView db={db} setDb={setDb} profile={profile} />;
      case "ventes": return <VentesView db={db} setDb={setDb} profile={profile} />;
      case "stock": return <StockView db={db} setDb={setDb} profile={profile} />;
      case "cuves": return <CuvesView db={db} setDb={setDb} profile={profile} />;
      case "clients": return <ClientsView db={db} setDb={setDb} profile={profile} />;
      case "compte_station": return <CompteStationView db={db} setDb={setDb} profile={profile} />;
      case "depenses": return <DepensesView db={db} setDb={setDb} profile={profile} />;
      case "fournisseurs": return <FournisseursView db={db} setDb={setDb} profile={profile} />;
      case "resultat": return <ResultatView db={db} />;
      case "caisse": return <CaisseView db={db} setDb={setDb} profile={profile} />;
      case "inspection": return <InspectionView db={db} setDb={setDb} profile={profile} />;
      case "reception": return <ReceptionView db={db} setDb={setDb} profile={profile} />;
      case "versement": return <VersementView db={db} setDb={setDb} profile={profile} />;
      case "bons": return <BonsView db={db} setDb={setDb} profile={profile} />;
      case "mouvements": return <MouvementsPompisteView db={db} setDb={setDb} profile={profile} />;
      case "rapport": return <RapportMensuelView db={db} />;
      case "rapport_jour": return <RapportJournalierView db={db} profile={profile} />;
      case "rapport_hebdo": return <RapportHebdomadaireView db={db} profile={profile} />;
      case "exports": return <ExportsView db={db} />;
      case "journal": return <AuditLogView db={db} />;
      case "securite": return <SecuriteView db={db} setDb={setDb} profile={profile} />;
      default: return null;
    }
  };

  return (
    <div className="smi-root min-h-screen flex flex-col md:flex-row">
      <StyleInjector />

      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 p-4 gap-4 smi-no-print" style={{ background: C.bgAlt, borderRight: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 px-1">
          <Logo size={30} />
          <div>
            <p className="smi-display text-xl leading-none">{nomSociete()}</p>
            <p className="text-xs" style={{ color: C.textFaint }}>{APP_NAME}</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="smi-btn flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-left transition-colors"
              style={{ background: tab === t.key ? C.amberSoft : "transparent", color: tab === t.key ? C.amber : C.textMuted, border: `1px solid ${tab === t.key ? C.amberDim : "transparent"}` }}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="text-xs" style={{ color: C.textFaint }}>
            <p className="font-semibold" style={{ color: C.textMuted }}>{profile.siege ? `Siège — ${profile.name}` : profile.role === "admin" ? "Administrateur" : profile.role === "pompiste" ? "Pompiste" : "Gérant"}</p>
            {stationName && <p>{stationName}</p>}
          </div>
          <Button variant="ghost" onClick={() => setShowDisplaySettings(true)}><Settings2 size={14} /> Affichage</Button>
          <Button variant="ghost" onClick={() => setProfile(null)}><LogOut size={14} /> Se déconnecter</Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 smi-no-print" style={{ background: C.bgAlt, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <p className="smi-display text-lg leading-none">{nomSociete()}</p>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowDisplaySettings(true)} className="smi-btn" style={{ color: C.textMuted }}><Settings2 size={16} /></button>
          <button onClick={() => setProfile(null)} className="smi-btn" style={{ color: C.textMuted }}><LogOut size={16} /></button>
        </div>
      </header>

      {showDisplaySettings && <DisplaySettingsPanel onClose={() => setShowDisplaySettings(false)} />}

      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto">
        {error && (
          <div className="mb-4 rounded-md px-3 py-2 text-sm flex items-center justify-between gap-2" style={{ background: C.dangerSoft, color: C.danger, border: `1px solid ${C.danger}` }}>
            <span className="flex items-center gap-2"><AlertTriangle size={14} /> {error}</span>
            <Button variant="danger" onClick={retrySave}>Réessayer</Button>
          </div>
        )}
        {renderTab()}
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 flex overflow-x-auto smi-scroll smi-no-print" style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}` }}>
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="smi-btn flex flex-col items-center gap-0.5 px-3.5 py-2 text-[10px] font-medium shrink-0"
            style={{ color: tab === t.key ? C.amber : C.textFaint }}
          >
            <t.icon size={17} /> {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
