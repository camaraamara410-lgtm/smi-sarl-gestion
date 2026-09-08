import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Fuel, Gauge, Warehouse, Wallet, LayoutDashboard, CalendarRange,
  Building2, Settings2, LogOut, Plus, Trash2, Pencil, AlertTriangle,
  CheckCircle2, X, Loader2, ChevronRight, MapPin, Droplet, Lock, Download, History,
  ClipboardCheck, Printer, ChevronDown, Truck, Camera, BookOpen, Landmark, Users
} from "lucide-react";
import { storage, isStorageDegraded, hasLocalStorage } from "./storage.js";
import QRCode from "qrcode";

/* =========================================================================
   SMI SARL — Gestion quotidienne du réseau de stations-service
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
  body * { visibility: hidden; }
  .smi-print-area, .smi-print-area * { visibility: visible; }
  .smi-print-area { position: absolute; top: 0; left: 0; width: 100%; }
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
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
   Main tendue orange sur cercle bleu — identité SMI SARL. */
function Logo({ size = 28 }) {
  // Icône officielle de marque (fournie par l'utilisateur), utilisée à l'identique
  // dans l'app, comme favicon et comme icône installable — cohérence totale.
  return <img src="/icon-192.png" width={size} height={size} alt="" aria-hidden="true" style={{ borderRadius: size * 0.22, display: "block" }} />;
}

/* ---------------------------- Helpers -------------------------------- */

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

function sumBons(bons) {
  return (bons || []).reduce((a, b) => a + num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute), 0);
}
function sumVersements(versements) {
  return (versements || []).reduce((a, v) => a + num(v.versementBancaire) + num(v.codeMarchand) + num(v.autreVersement), 0);
}

function computeCaisse(releves, ventes, caisses, bonsColl, versementsColl, stationId, date) {
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
  let caisseAttendue = caissePrecedente + ca - totalBon - totalPaiementMarchand - totalVersement;
  // Cas normal, pas une erreur : la caisse peut rester plusieurs jours sans être versée
  // (2, 3, 4 jours...), puis être versée en une seule fois — ce versement dépasse alors
  // forcément le CA d'un seul jour. Dans ce cas, on ne peut plus dire ce qu'il reste
  // précisément dans le tiroir avec les seules données de ce jour-là ; on retient
  // simplement le CA du jour comme caisse attendue, plutôt qu'un négatif trompeur.
  if (caisseAttendue < 0) caisseAttendue = ca;
  const caisseDuJour = c.caisseDuJour === undefined || c.caisseDuJour === "" ? null : num(c.caisseDuJour);
  const ecart = caisseDuJour === null ? null : caisseDuJour - caisseAttendue;
  return { record: c.id ? c : null, ca, caissePrecedente, totalBon, totalVersement, totalPaiementMarchand, caisseAttendue, caisseDuJour, ecart, bons, versements };
}

/* --------------------------- Persistence hook -------------------------- */

const DB_KEY = "smi_sarl_db_v1";
const PROFILE_KEY = "smi_sarl_profile_v1";
const emptyDb = { stations: [], pompes: [], releves: [], ventes: [], stocks: [], caisses: [], inspections: [], receptions: [], mouvements: [], versements: [], bons: [], pompistes: [], gerants: [], partenaires: [], commandesPartenaires: [], versementsPartenaires: [], audit: [] };
const COLLECTIONS = ["stations", "pompes", "releves", "ventes", "stocks", "caisses", "inspections", "receptions", "mouvements", "versements", "bons", "pompistes", "gerants", "partenaires", "commandesPartenaires", "versementsPartenaires"];

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
  const [profile, setProfileState] = useState(undefined); // undefined = loading, null = none set
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  // baseDbRef garde la dernière version connue comme "commune" (juste après chargement ou
  // écriture réussie), pour servir de référence à la fusion à 3 lors de la prochaine écriture.
  const baseDbRef = useRef(emptyDb);

  useEffect(() => {
    (async () => {
      let loadedDb = emptyDb;
      try {
        const r = await storage.get(DB_KEY);
        if (r?.value) loadedDb = { ...emptyDb, ...JSON.parse(r.value) };
      } catch {
        try { await storage.set(DB_KEY, JSON.stringify(emptyDb)); } catch { /* le prochain enregistrement réessaiera */ }
      }
      let loadedProfile = null;
      try {
        const r2 = await storage.get(PROFILE_KEY);
        if (r2?.value) loadedProfile = JSON.parse(r2.value);
      } catch { /* pas de profil enregistré */ }
      baseDbRef.current = loadedDb;
      setDbState(loadedDb);
      setProfileState(loadedProfile);
      setReady(true);
      // Après la première tentative de chargement, on sait si l'API distante répond ou non.
      if (isStorageDegraded()) {
        setError(hasLocalStorage
          ? "Stockage partagé indisponible pour l'instant : les données sont enregistrées dans ce navigateur uniquement (pas de partage entre postes)."
          : "Stockage indisponible pour l'instant : les données ne seront conservées que le temps de cette session.");
      }
    })();
  }, []);

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

  const persistProfile = useCallback(async (next) => {
    setProfileState(next);
    try {
      if (next === null) await storage.delete(PROFILE_KEY);
      else await storage.set(PROFILE_KEY, JSON.stringify(next));
    } catch { /* non bloquant : le profil se redemandera si besoin */ }
  }, []);

  return { db, setDb: persistDb, profile, setProfile: persistProfile, ready, error, retrySave };
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

function RoleGate({ db, onSet }) {
  const [role, setRole] = useState("admin");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [adminPinHash, setAdminPinHash] = useState(undefined); // undefined = chargement, null = pas encore défini
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await storage.get(ADMIN_PIN_KEY, true);
        setAdminPinHash(r?.value || null);
      } catch { setAdminPinHash(null); }
    })();
  }, []);

  const isFirstAdmin = role === "admin" && adminPinHash === null;

  const canSubmit = !busy && adminPinHash !== undefined
    && ((role === "pompiste" || role === "gerant") ? (name.trim().length > 0 && pin.trim().length > 0) : name.trim().length > 0);

  const submit = async () => {
    setErr("");
    if (!name.trim()) { setErr((role === "pompiste" || role === "gerant") ? "Indiquez votre nom d'utilisateur." : "Indiquez votre nom : il apparaîtra dans le journal des saisies."); return; }
    setBusy(true);
    try {
      if (role === "pompiste") {
        if (!pin.trim()) { setErr("Indiquez votre mot de passe."); setBusy(false); return; }
        const h = hashPin(pin.trim());
        const acct = db.pompistes.find((p) => p.nom.trim().toLowerCase() === name.trim().toLowerCase() && p.passwordHash === h);
        if (!acct) { setErr("Nom ou mot de passe incorrect."); setBusy(false); return; }
        onSet({ role, stationId: acct.stationId, pompeId: acct.pompeId, name: acct.nom });
        return;
      }
      if (role === "gerant") {
        if (!pin.trim()) { setErr("Indiquez votre mot de passe."); setBusy(false); return; }
        const h = hashPin(pin.trim());
        const acct = (db.gerants || []).find((g) => g.nom.trim().toLowerCase() === name.trim().toLowerCase() && g.passwordHash === h);
        if (!acct) { setErr("Nom ou mot de passe incorrect."); setBusy(false); return; }
        onSet({ role, stationId: acct.stationId, pompeId: acct.pompeId || null, partenaireId: acct.partenaireId || null, name: acct.nom });
        return;
      }
      if (role === "admin") {
        if (isFirstAdmin) {
          if (pin.trim().length < 4) { setErr("Choisissez un code PIN d'au moins 4 chiffres (première connexion admin)."); setBusy(false); return; }
          const h = hashPin(pin.trim());
          await storage.set(ADMIN_PIN_KEY, h, true);
        } else {
          const h = hashPin(pin.trim());
          if (h !== adminPinHash) { setErr("Code PIN administrateur incorrect."); setBusy(false); return; }
        }
      }
      onSet({ role, stationId: null, pompeId: null, name: name.trim() });
    } catch {
      setErr("Impossible de vérifier le code PIN pour le moment (problème de connexion au stockage). Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="smi-root min-h-screen flex items-center justify-center p-6">
      <StyleInjector />
      <Card className="w-full max-w-md" style={{ background: C.panel }}>
        <div className="flex items-center gap-3 mb-1">
          <Logo size={40} />
          <div>
            <p className="smi-display text-2xl leading-none">SMI SARL</p>
            <p className="text-xs" style={{ color: C.textMuted }}>Réseau stations-service · GNF</p>
          </div>
        </div>
        <p className="text-sm mt-4 mb-3" style={{ color: C.textMuted }}>Choisissez votre profil d'accès pour continuer.</p>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {[{ k: "admin", label: "Administrateur", hint: "Vue complète" }, { k: "gerant", label: "Gérant", hint: "Saisie de sa station" }, { k: "pompiste", label: "Pompiste", hint: "Sa pompe uniquement" }].map((r) => (
            <button
              key={r.k}
              onClick={() => setRole(r.k)}
              className="smi-btn rounded-md p-3 text-left transition-colors"
              style={{
                background: role === r.k ? C.amberSoft : C.bgAlt,
                border: `1px solid ${role === r.k ? C.amber : C.border}`,
              }}
            >
              <p className="font-semibold text-sm" style={{ color: role === r.k ? C.amber : C.text }}>{r.label}</p>
              <p className="text-xs mt-0.5" style={{ color: C.textFaint }}>{r.hint}</p>
            </button>
          ))}
        </div>

        {role === "gerant" && (
          <p className="text-xs mb-3" style={{ color: C.textFaint }}>
            Votre compte est créé par un administrateur depuis l'onglet Stations. Entrez ci-dessous le nom et le mot de passe qu'il vous a communiqués.
          </p>
        )}

        {role === "pompiste" && (
          <p className="text-xs mb-3" style={{ color: C.textFaint }}>
            Votre compte (pompe assignée) est créé par votre gérant depuis l'onglet Mouvements Pompiste. Entrez ci-dessous le nom et le mot de passe qu'il vous a communiqués.
          </p>
        )}

        <Field label={(role === "pompiste" || role === "gerant") ? "Nom d'utilisateur" : "Votre nom"} hint={(role === "pompiste" || role === "gerant") ? undefined : "Utilisé pour identifier vos saisies dans le journal."}>
          <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={name} onChange={(e) => setName(e.target.value)} placeholder={(role === "pompiste" || role === "gerant") ? "ex : Mamadou Diallo" : "ex : Mamadou Diallo"} />
        </Field>

        {role === "admin" && (
          <Field label={isFirstAdmin ? "Créer le code PIN administrateur" : "Code PIN administrateur"} hint={isFirstAdmin ? "Première connexion : ce code sera demandé à chaque accès admin." : undefined}>
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
          </Field>
        )}

        {(role === "pompiste" || role === "gerant") && (
          <Field label="Mot de passe">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
          </Field>
        )}

        {err && (
          <p className="text-xs flex items-center gap-1.5 mb-3" style={{ color: C.danger }}>
            <AlertTriangle size={13} /> {err}
          </p>
        )}

        <Button
          className="w-full justify-center"
          disabled={!canSubmit}
          onClick={submit}
        >
          {busy ? "Vérification…" : "Continuer"} <ChevronRight size={16} />
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
    const row = { id: uid(), stationId: acctStationId, pompeId: null, partenaireId: acctPartenaireId || null, nom: acctNom.trim(), passwordHash: hashPin(acctPassword.trim()) };
    let next = { ...db, gerants: [...(db.gerants || []), row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: acctStationId, entity: "gerant_compte", action: "création", after: { nom: row.nom } });
    setDb(next);
    setAcctNom(""); setAcctPassword(""); setAcctPartenaireId("");
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
            <Field label="Nom de la station"><TextInput value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. SMI Kaloum" /></Field>
            <Field label="Fournisseur carburant"><TextInput value={form.fournisseur || ""} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })} placeholder="Ex. Total Guinée" /></Field>
            <Field label="Localisation"><TextInput value={form.localisation || ""} onChange={(e) => setForm({ ...form, localisation: e.target.value })} placeholder="Ex. Conakry, Kaloum" /></Field>
            <Field label="Devise"><TextInput value={form.devise ?? "GNF"} onChange={(e) => setForm({ ...form, devise: e.target.value })} /></Field>
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
              <Card key={s.id} className="flex flex-col gap-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{s.nom}</p>
                    <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: C.textMuted }}><MapPin size={12} /> {s.localisation || "—"}</p>
                  </div>
                  <Pill tone="amber">{s.devise || "GNF"}</Pill>
                </div>
                <p className="text-xs" style={{ color: C.textFaint }}>Fournisseur : {s.fournisseur || "—"}</p>
                <p className="text-xs" style={{ color: C.textFaint }}>{db.pompes.filter((p) => p.stationId === s.id).length} pompe(s)</p>
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
        {acctErr && <p className="text-xs flex items-center gap-1.5 mt-2 mb-2" style={{ color: C.danger }}><AlertTriangle size={13} /> {acctErr}</p>}
        <div className="flex justify-end mt-3"><Button onClick={createGerantAccount}><Plus size={15} /> Créer le compte</Button></div>

        {db.gerants?.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-4 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
            <p className="text-xs font-semibold mb-1" style={{ color: C.textMuted }}>Tous les comptes gérants</p>
            {db.gerants.map((acct) => (
              <div key={acct.id} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span>{acct.nom} — <span style={{ color: C.textFaint }}>{db.stations.find((s) => s.id === acct.stationId)?.nom || "—"}{acct.partenaireId ? ` · Partenaire : ${(db.partenaires || []).find((p) => p.id === acct.partenaireId)?.nom || "—"}` : ""}</span></span>
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
  const c = computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, stationId, date);

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

  const live = computeCaisse(db.releves, db.ventes, [...db.caisses.filter((x) => x.id !== c.record?.id), { stationId, date, caissePrecedente: precedente, caisseDuJour: duJour, totalPaiementMarchand: paiementMarchand }], db.bons, db.versements, stationId, date);
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SMI SARL — Historique des versements</h1>
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
            <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
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
    setLibelle(""); setQuantite(""); setPrixUnitaire(""); setFraisRoute(""); setPhoto(null); setEditingId(null);
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
    setPhoto(b.photo || null);
    setEditingId(b.id);
  };

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) { setErr("Choisissez une station."); return; }
    if (!libelle.trim()) { setErr("Indiquez un libellé pour ce bon."); return; }
    if (total <= 0) { setErr("Indiquez une quantité et un prix, ou des frais de route."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const existing = editingId ? db.bons.find((b) => b.id === editingId) : null;
    const row = { id: editingId || uid(), stationId: effStationId, date, libelle: libelle.trim(), quantite, prixUnitaire, fraisRoute, photo, timestamp: existing?.timestamp || new Date().toISOString() };
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SMI SARL — Historique des bons</h1>
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
            <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
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
    setQuantite(""); setFournisseur(""); setNumeroBon(""); setPhoto(null); setEditingId(null);
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
    const row = { id: editingId || uid(), stationId: effStationId, date, produit, quantite, fournisseur, numeroBon, photo, timestamp: existing?.timestamp || new Date().toISOString() };
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
          <Field label="Quantité (L)"><NumberInput value={quantite} onChange={(e) => setQuantite(e.target.value)} /></Field>
          <Field label="Fournisseur">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
          </Field>
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SMI SARL — Historique des réceptions</h1>
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
            <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
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
    const caisse = lastCaisseDate ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, s.id, lastCaisseDate) : null;
    const totalVersements = db.versements.filter((v) => v.stationId === s.id && v.date.startsWith(monthPrefix)).reduce((a, v) => a + versementTotal(v), 0);
    return { station: s, vEssence, vGasoil, ca, stock, stockDate: lastStockDate, caisse, caisseDate: lastCaisseDate, totalVersements };
  }), [db.stations, db.releves, db.ventes, db.stocks, db.caisses, db.versements, monthPrefix]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Tableau de bord</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Cumuls du mois en cours ({monthLabel(new Date().getMonth())}), station par station — mise à jour automatique à chaque saisie.</p>
      </div>

      {db.stations.length === 0 ? (
        <EmptyState icon={LayoutDashboard} title="Aucune donnée à afficher" hint="Ajoutez des stations et saisissez des relevés pour alimenter le tableau de bord." />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((r) => {
            const devise = r.station.devise || "GNF";
            return (
            <Card key={r.station.id} className="flex flex-col gap-3 smi-live" style={{ animationName: "none" }}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{r.station.nom}</p>
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
                      <GaugeNumber value={`E ${fmtVol(r.stock.stockClotureEssence)}`} tone="amber" />
                      <GaugeNumber value={`G ${fmtVol(r.stock.stockClotureGasoil)}`} tone="teal" />
                    </div>
                  ) : <p className="text-xs mt-1" style={{ color: C.textFaint }}>Aucun contrôle</p>}
                </div>
                <div>
                  <p className="text-xs" style={{ color: C.textFaint }}>Dernière caisse {r.caisseDate ? `(${fmtDateLong(r.caisseDate)})` : ""}</p>
                  {r.caisse ? <div className="mt-1"><GaugeNumber value={fmtMontant(r.caisse.caisseAttendue, devise)} /></div> : <p className="text-xs mt-1" style={{ color: C.textFaint }}>Aucune caisse</p>}
                </div>
              </div>
            </Card>
          );})}
        </div>
      )}
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

  const versementsSemaine = db.versements.filter((v) => (!stationId || v.stationId === stationId) && v.date >= start && v.date <= end);
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

  // Stock restant en fin de semaine : dernier contrôle de stock enregistré au plus tard
  // le dimanche de la semaine visée (à défaut, le plus récent avant cette date).
  const stockFinSemaine = useMemo(() => {
    if (!stationId) return null;
    const record = [...db.stocks].filter((s) => s.stationId === stationId && s.date <= end).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!record) return null;
    return { ...computeStock(db.releves, db.stocks, stationId, record.date), date: record.date };
  }, [stationId, end, db.stocks, db.releves]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap smi-no-print">
        <div>
          <h2 className="smi-display text-2xl">Rapport hebdomadaire</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Ventes, versements, bons, livraisons et stock restant sur la semaine (lundi à dimanche).</p>
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SMI SARL — Rapport hebdomadaire</h1>
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
        <div className="overflow-x-auto smi-scroll mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                <th className="text-left py-1.5" style={{ color: C.textMuted }}>Jour</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Bancaire</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Paiement marchand</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Versement au compte du DG</th>
                <th className="text-right py-1.5" style={{ color: C.textMuted }}>Total du jour</th>
              </tr>
            </thead>
            <tbody>
              {jours.map((j) => (
                <tr key={j.date} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="py-1.5">{j.nomJour} <span style={{ color: C.textFaint }}>({fmtDateLong(j.date)})</span></td>
                  <td className="py-1.5 text-right smi-mono">{fmtMontant(j.bancaire, devise)}</td>
                  <td className="py-1.5 text-right smi-mono">{fmtMontant(j.marchand, devise)}</td>
                  <td className="py-1.5 text-right smi-mono">{fmtMontant(j.dg, devise)}</td>
                  <td className="py-1.5 text-right smi-mono font-semibold">{fmtMontant(j.total, devise)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}` }}>
                <td className="py-2 font-bold">Total semaine</td>
                <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalSemaine.bancaire, devise)}</td>
                <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalSemaine.marchand, devise)}</td>
                <td className="py-2 text-right smi-mono font-bold">{fmtMontant(totalSemaine.dg, devise)}</td>
                <td className="py-2 text-right smi-mono font-bold" style={{ color: C.amber }}>{fmtMontant(totalSemaine.total, devise)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

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

        <p className="text-sm font-semibold mb-2 mt-3">5. Stock restant en fin de semaine</p>
        {!stockFinSemaine ? (
          <p className="text-xs" style={{ color: C.textFaint }}>Aucun contrôle de stock enregistré au plus tard le {fmtDateLong(end)}.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 max-w-sm">
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Essence</p>
              <GaugeNumber value={fmtVol(stockFinSemaine.stockClotureEssence)} tone="amber" />
            </div>
            <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
              <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Gasoil</p>
              <GaugeNumber value={fmtVol(stockFinSemaine.stockClotureGasoil)} tone="teal" />
            </div>
            {stockFinSemaine.date !== end && (
              <p className="text-xs col-span-2" style={{ color: C.textFaint }}>Dernier contrôle disponible : {fmtDateLong(stockFinSemaine.date)} (pas de contrôle exactement le {fmtDateLong(end)}).</p>
            )}
          </div>
        )}

        <div className="hidden smi-print-only" style={{ marginTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <QrCode value={appUrl} size={64} />
            <div>
              <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
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
      r.stock ? r.stock.stockClotureEssence.toFixed(2) : "", r.stock ? r.stock.stockClotureGasoil.toFixed(2) : "",
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
          <h1 style={{ fontSize: 20, fontWeight: 700 }}>SMI SARL — Rapport mensuel</h1>
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
                    <td className="py-1.5 text-right smi-mono">{r.stock ? `${fmtVol(r.stock.stockClotureEssence)} / ${fmtVol(r.stock.stockClotureGasoil)}` : "—"}</td>
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
              <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
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
    const caisse = caisseRec ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, s.id, date) : null;
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
  const caisseJour = stationId ? computeCaisse(db.releves, db.ventes, db.caisses, db.bons, db.versements, stationId, date) : null;

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
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>SMI SARL — Rapport journalier</h1>
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
                <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
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
                      <td className="py-1 text-right smi-mono">{fmtVol(stockJour.stockClotureEssence)}</td>
                    </tr>
                    <tr>
                      <td className="py-1">Gasoil</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(stockJour.stockOuvertureGasoil)}</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(stockJour.vol.gasoil)}</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(stockJour.livraisonGasoil)}</td>
                      <td className="py-1 text-right smi-mono">{fmtVol(stockJour.stockClotureGasoil)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
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
                <p style={{ fontSize: 11, fontWeight: 600 }}>SMI SARL — Gestion réseau stations-service</p>
                <p style={{ fontSize: 10, color: "#555" }}>Scannez pour ouvrir l'application — {appUrl}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Sécurité ---------------------------------- */

function SecuriteView({ profile }) {
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
    text: "Récapitulatif complet d'une semaine complète (lundi à dimanche) : ventes (essence/gasoil/CA) jour par jour, versements (Bancaire, Paiement marchand, Versement au compte du DG), bons de la semaine, livraisons reçues, et stock restant au dimanche. Choisissez n'importe quelle date de la semaine visée — les bornes se calculent automatiquement. Exportable en PDF comme les autres rapports.",
  },
  {
    key: "dashboard", title: "Tableau de bord", adminOnly: true,
    text: "Vue d'ensemble du réseau : volumes et chiffre d'affaires du mois en cours, station par station, mis à jour automatiquement à chaque saisie d'un gérant.",
  },
  {
    key: "stations", title: "Stations", adminOnly: true,
    text: "Créez et modifiez les stations du réseau (nom, localisation, fournisseur, devise) — 4 pompes sont créées automatiquement avec chaque nouvelle station. C'est aussi ici que vous créez les comptes gérants (nom, mot de passe, station, et éventuellement un partenaire assigné).",
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
    text: "Changez votre code PIN administrateur (ancien code requis). Les codes PIN de station se changent depuis Stations.",
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

const AUDIT_LABELS = { station: "Station", pompe: "Pompe", releve: "Relevé pompe", vente: "Vente", stock: "Contrôle stock", caisse: "Caisse", inspection: "Inspection", reception: "Réception", mouvement: "Mouvement pompiste", versement: "Versement", bon: "Bon", pompiste_compte: "Compte pompiste", gerant_compte: "Compte gérant", partenaire: "Client partenaire", commande_partenaire: "Commande partenaire", versement_partenaire: "Versement partenaire" };

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

const TABS = [
  { key: "guide", label: "Guide d'utilisation", icon: BookOpen, adminOnly: false },
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, adminOnly: true },
  { key: "stations", label: "Stations", icon: Building2, adminOnly: true },
  { key: "partenaires", label: "Partenaires", icon: Users, roles: ["admin", "gerant"] },
  { key: "pompes", label: "Pompes", icon: Gauge, adminOnly: true },
  { key: "releve", label: "Relevé Pompes", icon: Fuel, adminOnly: false },
  { key: "ventes", label: "Ventes", icon: Wallet, adminOnly: false },
  { key: "stock", label: "Contrôle Stock", icon: Warehouse, adminOnly: false },
  { key: "caisse", label: "Caisse", icon: Wallet, adminOnly: false },
  { key: "inspection", label: "Inspection", icon: ClipboardCheck, adminOnly: false },
  { key: "reception", label: "Réception", icon: Truck, adminOnly: false },
  { key: "versement", label: "Versement", icon: Landmark, adminOnly: false },
  { key: "bons", label: "Bons", icon: Wallet, adminOnly: false },
  { key: "mouvements", label: "Mouvements Pompiste", icon: Users, roles: ["gerant", "pompiste"] },
  { key: "rapport", label: "Rapport mensuel", icon: CalendarRange, adminOnly: true },
  { key: "rapport_jour", label: "Rapport journalier", icon: Printer, adminOnly: false },
  { key: "rapport_hebdo", label: "Rapport hebdomadaire", icon: CalendarRange, adminOnly: false },
  { key: "journal", label: "Journal des saisies", icon: History, adminOnly: true },
  { key: "securite", label: "Sécurité", icon: Lock, adminOnly: true },
];

export default function App() {
  const { db, setDb, profile, setProfile, ready, error, retrySave } = useSmiStorage();
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

  if (!profile) {
    return <RoleGate db={db} onSet={setProfile} />;
  }

  const visibleTabs = TABS.filter((t) => (t.roles ? t.roles.includes(profile.role) : (profile.role === "admin" || !t.adminOnly)));
  const stationName = profile.stationId ? db.stations.find((s) => s.id === profile.stationId)?.nom : null;

  const renderTab = () => {
    switch (tab) {
      case "guide": return <GuideView profile={profile} />;
      case "dashboard": return <DashboardView db={db} />;
      case "stations": return <StationsView db={db} setDb={setDb} profile={profile} />;
      case "partenaires": return <PartenairesView db={db} setDb={setDb} profile={profile} />;
      case "pompes": return <PompesView db={db} setDb={setDb} profile={profile} />;
      case "releve": return <RelevePompesView db={db} setDb={setDb} profile={profile} />;
      case "ventes": return <VentesView db={db} setDb={setDb} profile={profile} />;
      case "stock": return <StockView db={db} setDb={setDb} profile={profile} />;
      case "caisse": return <CaisseView db={db} setDb={setDb} profile={profile} />;
      case "inspection": return <InspectionView db={db} setDb={setDb} profile={profile} />;
      case "reception": return <ReceptionView db={db} setDb={setDb} profile={profile} />;
      case "versement": return <VersementView db={db} setDb={setDb} profile={profile} />;
      case "bons": return <BonsView db={db} setDb={setDb} profile={profile} />;
      case "mouvements": return <MouvementsPompisteView db={db} setDb={setDb} profile={profile} />;
      case "rapport": return <RapportMensuelView db={db} />;
      case "rapport_jour": return <RapportJournalierView db={db} profile={profile} />;
      case "rapport_hebdo": return <RapportHebdomadaireView db={db} profile={profile} />;
      case "journal": return <AuditLogView db={db} />;
      case "securite": return <SecuriteView profile={profile} />;
      default: return null;
    }
  };

  return (
    <div className="smi-root min-h-screen flex flex-col md:flex-row">
      <StyleInjector />

      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex md:flex-col w-64 shrink-0 p-4 gap-4" style={{ background: C.bgAlt, borderRight: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 px-1">
          <Logo size={30} />
          <div>
            <p className="smi-display text-xl leading-none">SMI SARL</p>
            <p className="text-xs" style={{ color: C.textFaint }}>Réseau stations-service</p>
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
            <p className="font-semibold" style={{ color: C.textMuted }}>{profile.role === "admin" ? "Administrateur" : profile.role === "pompiste" ? "Pompiste" : "Gérant"}</p>
            {stationName && <p>{stationName}</p>}
          </div>
          <Button variant="ghost" onClick={() => setShowDisplaySettings(true)}><Settings2 size={14} /> Affichage</Button>
          <Button variant="ghost" onClick={() => setProfile(null)}><LogOut size={14} /> Changer de profil</Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3" style={{ background: C.bgAlt, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <p className="smi-display text-lg leading-none">SMI SARL</p>
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
      <nav className="md:hidden fixed bottom-0 inset-x-0 flex overflow-x-auto smi-scroll" style={{ background: C.bgAlt, borderTop: `1px solid ${C.border}` }}>
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
