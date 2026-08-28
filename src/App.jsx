import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Fuel, Gauge, Warehouse, Wallet, LayoutDashboard, CalendarRange,
  Building2, Settings2, LogOut, Plus, Trash2, Pencil, AlertTriangle,
  CheckCircle2, X, Loader2, ChevronRight, MapPin, Droplet, Lock, Download, History,
  ClipboardCheck, Printer, ChevronDown, Truck, Camera, BookOpen,
  Users, Banknote, Ticket
} from "lucide-react";
import { storage, isStorageDegraded, hasLocalStorage } from "./storage.js";

/* =========================================================================
   SMI SARL — Gestion quotidienne du réseau de stations-service
   Design : tableau de bord "poste de contrôle" — fond pétrole sombre,
   lectures façon compteur de pompe (chiffres ambrés tabulaires),
   essence = ambre, gasoil = sarcelle. Extensible par construction :
   stations et pompes sont des enregistrements, jamais des champs figés.
   ========================================================================= */

const C = {
  bg: "#0E1512",
  bgAlt: "#0A0F0D",
  panel: "#161F1A",
  panelAlt: "#1D2921",
  border: "#2A3A30",
  borderLight: "#3A4C40",
  amber: "#E8A33D",
  amberDim: "#8A6224",
  amberSoft: "#3A2E18",
  teal: "#3FA7A0",
  tealSoft: "#16302E",
  text: "#F1EEE6",
  textMuted: "#93A398",
  textFaint: "#5E6E64",
  danger: "#D9695F",
  dangerSoft: "#3A2220",
  success: "#5FAE6E",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap');
.smi-root { font-family: 'Inter', system-ui, sans-serif; background:${C.bg}; color:${C.text}; }
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
}
`;

function StyleInjector() {
  return <style dangerouslySetInnerHTML={{ __html: FONTS }} />;
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
function sumVersementsBancaires(versements) {
  return (versements || []).reduce((a, v) => a + num(v.versementBancaire), 0);
}
function sumAutresVersements(versements) {
  return (versements || []).reduce((a, v) => a + num(v.autreVersement), 0);
}

function computeCaisse(releves, ventes, caisses, stationId, date) {
  const c = findCaisse(caisses, stationId, date) || {};
  const ca = computeVente(releves, ventes, stationId, date).ca;
  const caissePrecedente = num(c.caissePrecedente);
  // Rétro-compatibilité : les anciennes saisies avaient un total unique (totalBon/
  // totalVersement) au lieu de lignes détaillées — on ne recalcule depuis les lignes
  // que si elles existent, sinon on retombe sur l'ancien total simple. Le détail
  // bancaire/autre n'existe que depuis les lignes ; les anciennes saisies sans lignes
  // n'ont pas cette ventilation et remontent 0 sur ces deux sous-totaux.
  const bons = c.bons || [];
  const versements = c.versements || [];
  const totalBon = c.bons ? sumBons(bons) : num(c.totalBon);
  const totalVersement = c.versements ? sumVersements(versements) : num(c.totalVersement);
  const totalVersementBancaire = sumVersementsBancaires(versements);
  const totalAutreVersement = sumAutresVersements(versements);
  const totalPaiementMarchand = num(c.totalPaiementMarchand);
  // Le versement (dépôt bancaire du jour) n'entre plus dans le calcul de la caisse
  // attendue : il ne fait que documenter où est allée une partie de la caisse déjà
  // comptée, contrairement au Bon et au Paiement marchand qui, eux, réduisent
  // effectivement l'argent liquide encaissé.
  const caisseAttendue = caissePrecedente + ca - totalBon - totalPaiementMarchand;
  const caisseDuJour = c.caisseDuJour === undefined || c.caisseDuJour === "" ? null : num(c.caisseDuJour);
  const ecart = caisseDuJour === null ? null : caisseDuJour - caisseAttendue;
  return { record: c.id ? c : null, ca, caissePrecedente, totalBon, totalVersement, totalVersementBancaire, totalAutreVersement, totalPaiementMarchand, caisseAttendue, caisseDuJour, ecart, bons, versements };
}

function sumVersementsPompiste(items) {
  return (items || []).reduce((a, d) => a + num(d.montant), 0);
}
function sumBonsPompe(items) {
  return (items || []).reduce((a, b) => a + num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute), 0);
}

// Caisse d'un pompiste = valeur des volumes vendus à SA pompe (au prix du jour fixé
// par le gérant) − ses versements − ses bons, pour une pompe et une date données.
// Contrairement à la Caisse "station" (qui part d'un comptage manuel + caisse
// précédente reportée), la caisse pompiste est entièrement recalculée depuis les
// relevés d'index : elle sert de contrôle du liquide qu'un pompiste doit remettre.
function computeCaissePompiste(releves, ventes, versementsPompiste, bonsPompe, stationId, pompeId, date) {
  const rows = releves.filter((r) => r.stationId === stationId && r.pompeId === pompeId && r.date === date);
  let essence = 0, gasoil = 0;
  rows.forEach((r) => {
    essence += Math.max(0, num(r.indexClotureEssence) - num(r.indexOuvertureEssence));
    gasoil += Math.max(0, num(r.indexClotureGasoil) - num(r.indexOuvertureGasoil));
  });
  const v = findVente(ventes, stationId, date);
  const prixDefini = !!v;
  const prixEssence = v ? num(v.prixEssence) : 0;
  const prixGasoil = v ? num(v.prixGasoil) : 0;
  const montantEssence = essence * prixEssence;
  const montantGasoil = gasoil * prixGasoil;
  const montantVente = montantEssence + montantGasoil;
  const vItems = (versementsPompiste || []).filter((d) => d.stationId === stationId && d.pompeId === pompeId && d.date === date);
  const bItems = (bonsPompe || []).filter((b) => b.stationId === stationId && b.pompeId === pompeId && b.date === date);
  const totalVersementPompiste = sumVersementsPompiste(vItems);
  const totalBon = sumBonsPompe(bItems);
  const caisse = montantVente - totalVersementPompiste - totalBon;
  return {
    essence, gasoil, volumeTotal: essence + gasoil, releveCount: rows.length,
    prixDefini, prixEssence, prixGasoil, montantEssence, montantGasoil, montantVente,
    versementsPompiste: vItems, bonsPompe: bItems, totalVersementPompiste, totalBon, caisse,
  };
}

/* --------------------------- Persistence hook -------------------------- */

const DB_KEY = "smi_sarl_db_v1";
const PROFILE_KEY = "smi_sarl_profile_v1";
const emptyDb = { stations: [], pompes: [], pompistes: [], releves: [], ventes: [], stocks: [], caisses: [], versementsPompiste: [], bonsPompe: [], inspections: [], receptions: [], audit: [] };
const COLLECTIONS = ["stations", "pompes", "pompistes", "releves", "ventes", "stocks", "caisses", "versementsPompiste", "bonsPompe", "inspections", "receptions"];

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
      style={{ background: bg, color, border: `1px solid ${color}44` }}
    >
      <span>{value}</span>
      {unit && <span className="text-xs font-medium opacity-70">{unit}</span>}
    </div>
  );
}

function Pill({ children, tone = "muted" }) {
  const color = { muted: C.textMuted, amber: C.amber, teal: C.teal, danger: C.danger, success: C.success }[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ color, background: `${color}1A`, border: `1px solid ${color}44` }}>
      {children}
    </span>
  );
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
  const [stationId, setStationId] = useState("");
  const [pompeId, setPompeId] = useState("");
  const [pompisteId, setPompisteId] = useState("");
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

  const station = db.stations.find((s) => s.id === stationId);
  const stationHasPin = !!station?.pinHash;
  const isFirstAdmin = role === "admin" && adminPinHash === null;
  const isPompiste = role === "pompiste";
  const stationPompistes = db.pompistes.filter((p) => p.stationId === stationId);
  const selectedPompiste = db.pompistes.find((p) => p.id === pompisteId);
  const pompisteHasPin = !!selectedPompiste?.pinHash;

  const canSubmit = !busy && adminPinHash !== undefined
    && (isPompiste ? !!pompisteId : name.trim().length > 0)
    && (role === "admin" ? true : !!stationId);

  const submit = async () => {
    setErr("");
    if (isPompiste) {
      if (!pompisteId) { setErr("Sélectionnez votre nom dans la liste."); return; }
    } else if (!name.trim()) { setErr("Indiquez votre nom : il apparaîtra dans le journal des saisies."); return; }
    setBusy(true);
    try {
      if (role === "admin") {
        if (isFirstAdmin) {
          if (pin.trim().length < 4) { setErr("Choisissez un code PIN d'au moins 4 chiffres (première connexion admin)."); setBusy(false); return; }
          const h = hashPin(pin.trim());
          await storage.set(ADMIN_PIN_KEY, h, true);
        } else {
          const h = hashPin(pin.trim());
          if (h !== adminPinHash) { setErr("Code PIN administrateur incorrect."); setBusy(false); return; }
        }
      } else if (isPompiste && pompisteHasPin) {
        const h = hashPin(pin.trim());
        if (h !== selectedPompiste.pinHash) { setErr("Code PIN incorrect."); setBusy(false); return; }
      } else if (!isPompiste && stationHasPin) {
        const h = hashPin(pin.trim());
        if (h !== station.pinHash) { setErr("Code PIN de station incorrect."); setBusy(false); return; }
      }
      if (isPompiste) {
        onSet({ role, stationId, pompeId: selectedPompiste.pompeId, pompisteId, name: selectedPompiste.nom });
      } else {
        onSet({ role, stationId: role === "admin" ? null : stationId, pompeId: role === "admin" ? null : pompeId || null, name: name.trim() });
      }
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
          {[{ k: "admin", label: "Administrateur", hint: "Vue complète" }, { k: "gerant", label: "Gérant", hint: "Sa station" }, { k: "pompiste", label: "Pompiste", hint: "Sa pompe" }].map((r) => (
            <button
              key={r.k}
              onClick={() => { setRole(r.k); setPompisteId(""); setPin(""); setErr(""); }}
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
          <div className="flex flex-col gap-3 mb-4">
            <Field label="Station affectée">
              <StationSelect stations={db.stations} value={stationId} onChange={setStationId} />
            </Field>
            {db.stations.length === 0 && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}>
                <AlertTriangle size={13} /> Aucune station créée. Un administrateur doit d'abord en ajouter une.
              </p>
            )}
            <Field label="Pompe assignée (optionnel)" hint="Laissez vide pour choisir la pompe à chaque saisie.">
              <PompeSelect pompes={db.pompes} stationId={stationId} value={pompeId} onChange={setPompeId} />
            </Field>
          </div>
        )}

        {role === "pompiste" && (
          <div className="flex flex-col gap-3 mb-4">
            <Field label="Station affectée">
              <StationSelect stations={db.stations} value={stationId} onChange={(v) => { setStationId(v); setPompisteId(""); }} />
            </Field>
            {db.stations.length === 0 && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}>
                <AlertTriangle size={13} /> Aucune station créée. Un administrateur doit d'abord en ajouter une.
              </p>
            )}
            {stationId && (
              <Field label="Votre nom" hint="La liste est gérée par le gérant de la station (onglet Pompistes).">
                <SelectInput value={pompisteId} onChange={(e) => setPompisteId(e.target.value)}>
                  <option value="" disabled>{stationPompistes.length ? "Sélectionner votre nom" : "Aucun pompiste enregistré pour cette station"}</option>
                  {stationPompistes.map((p) => {
                    const pompe = db.pompes.find((x) => x.id === p.pompeId);
                    return <option key={p.id} value={p.id}>{p.nom} — {pompe?.nom || "pompe supprimée"}</option>;
                  })}
                </SelectInput>
              </Field>
            )}
            {stationId && stationPompistes.length === 0 && (
              <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}>
                <AlertTriangle size={13} /> Demandez au gérant de vous créer depuis l'onglet « Pompistes ».
              </p>
            )}
          </div>
        )}

        {role !== "pompiste" && (
          <Field label="Votre nom" hint="Utilisé pour identifier vos saisies dans le journal.">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} value={name} onChange={(e) => setName(e.target.value)} placeholder="ex : Mamadou Diallo" />
          </Field>
        )}

        {role === "admin" && (
          <Field label={isFirstAdmin ? "Créer le code PIN administrateur" : "Code PIN administrateur"} hint={isFirstAdmin ? "Première connexion : ce code sera demandé à chaque accès admin." : undefined}>
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
          </Field>
        )}

        {role === "gerant" && stationHasPin && (
          <Field label="Code PIN de la station">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
          </Field>
        )}
        {role === "gerant" && stationId && !stationHasPin && (
          <p className="text-xs mb-2" style={{ color: C.textFaint }}>Aucun code PIN défini pour cette station — accès libre (un administrateur peut en définir un depuis Stations).</p>
        )}
        {isPompiste && pompisteId && pompisteHasPin && (
          <Field label="Votre code PIN">
            <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" />
          </Field>
        )}
        {isPompiste && pompisteId && !pompisteHasPin && (
          <p className="text-xs mb-2" style={{ color: C.textFaint }}>Aucun code PIN défini pour vous — accès libre (le gérant peut en définir un depuis Pompistes).</p>
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

  const save = () => {
    if (!form.nom?.trim()) return;
    setSaving(true);
    const before = form.id ? db.stations.find((s) => s.id === form.id) : null;
    const record = { ...form, devise: form.devise || "GNF" };
    if (pinInput.trim()) record.pinHash = hashPin(pinInput.trim());
    if (!record.id) record.id = uid();
    let next = { ...db };
    if (before) next.stations = db.stations.map((s) => (s.id === record.id ? record : s));
    else next.stations = [...db.stations, record];
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: record.id, entity: "station", action: before ? "modification" : "création", before: before ? { nom: before.nom } : null, after: { nom: record.nom } });
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
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom de la station"><TextInput value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. SMI Kaloum" /></Field>
            <Field label="Fournisseur carburant"><TextInput value={form.fournisseur || ""} onChange={(e) => setForm({ ...form, fournisseur: e.target.value })} placeholder="Ex. Total Guinée" /></Field>
            <Field label="Localisation"><TextInput value={form.localisation || ""} onChange={(e) => setForm({ ...form, localisation: e.target.value })} placeholder="Ex. Conakry, Kaloum" /></Field>
            <Field label="Devise"><TextInput value={form.devise ?? "GNF"} onChange={(e) => setForm({ ...form, devise: e.target.value })} /></Field>
            <Field label={form.pinHash ? "Changer le code PIN de la station" : "Code PIN de la station (optionnel)"} hint={form.pinHash ? "Un code est déjà défini ; laissez vide pour le conserver." : "Demandé au gérant à la connexion s'il est défini."}>
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
          {db.stations.map((s) => (
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
              <p className="text-xs flex items-center gap-1" style={{ color: s.pinHash ? C.success : C.textFaint }}><Lock size={11} /> {s.pinHash ? "Code PIN activé" : "Aucun code PIN"}</p>
              <div className="flex gap-2 mt-1">
                <Button variant="ghost" onClick={() => setForm(s)}><Pencil size={14} /> Modifier</Button>
                <Button variant="danger" onClick={() => remove(s.id)}><Trash2 size={14} /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Pompes view ------------------------------ */

function PompesView({ db, setDb, profile }) {
  const [form, setForm] = useState(null);

  const save = () => {
    if (!form.nom?.trim() || !form.stationId) return;
    let next = { ...db };
    if (form.id) next.pompes = db.pompes.map((p) => (p.id === form.id ? form : p));
    else next.pompes = [...db.pompes, { ...form, id: uid() }];
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: form.stationId, entity: "pompe", action: form.id ? "modification" : "création", after: { nom: form.nom } });
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
        <Button onClick={() => setForm({ stationId: db.stations[0]?.id || "" })} disabled={db.stations.length === 0}><Plus size={16} /> Nouvelle pompe</Button>
      </div>

      {db.stations.length === 0 && <EmptyState icon={Gauge} title="Créez d'abord une station" hint="Les pompes doivent être rattachées à une station existante." />}

      {form && (
        <Card>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom de la pompe"><TextInput value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. P1" /></Field>
            <Field label="Station associée"><StationSelect stations={db.stations} value={form.stationId} onChange={(v) => setForm({ ...form, stationId: v })} /></Field>
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
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {db.pompes.map((p) => (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <td className="px-3 py-2 font-semibold">{p.nom}</td>
                  <td className="px-3 py-2" style={{ color: C.textMuted }}>{db.stations.find((s) => s.id === p.stationId)?.nom || "—"}</td>
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
  const isPompiste = profile.role === "pompiste";
  const lockStation = isGerant || isPompiste;
  const lockPompe = isPompiste || (isGerant && !!profile.pompeId);
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

  const save = () => {
    setErr("");
    // Verrouillage défense-en-profondeur : un gérant écrit toujours sur SA station,
    // même si l'état local a été altéré (le sélecteur est désactivé côté UI, mais on
    // ne fait pas confiance qu'à ça).
    const effStationId = lockStation ? profile.stationId : stationId;
    const effPompeId = lockPompe ? profile.pompeId : pompeId;
    if (!effStationId || !effPompeId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    if (idxOE !== "" && idxCE !== "" && num(idxCE) < num(idxOE)) { setErr("L'index de clôture essence est inférieur à l'index d'ouverture — vérifiez la saisie (compteur remis à zéro ?)."); return; }
    if (idxOG !== "" && idxCG !== "" && num(idxCG) < num(idxOG)) { setErr("L'index de clôture gasoil est inférieur à l'index d'ouverture — vérifiez la saisie."); return; }
    const row = { id: existing?.id || uid(), stationId: effStationId, pompeId: effPompeId, date, indexOuvertureEssence: idxOE, indexClotureEssence: idxCE, indexOuvertureGasoil: idxOG, indexClotureGasoil: idxCG };
    let next = { ...db, releves: existing ? db.releves.map((r) => (r.id === existing.id ? row : r)) : [...db.releves, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "releve", action: existing ? "modification" : "création", before: existing ? { indexClotureEssence: existing.indexClotureEssence, indexClotureGasoil: existing.indexClotureGasoil } : null, after: { date, pompeId: effPompeId, indexClotureEssence: idxCE, indexClotureGasoil: idxCG } });
    setDb(next);
  };

  const removeRow = (r) => {
    let next = { ...db, releves: db.releves.filter((x) => x.id !== r.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: r.stationId, entity: "releve", action: "suppression", before: { date: r.date, pompeId: r.pompeId } });
    setDb(next);
  };

  const dayRows = db.releves.filter((r) => r.stationId === stationId && r.date === date && (!isPompiste || r.pompeId === profile.pompeId));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Relevé Pompes</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Une ligne = une pompe pour un jour. Ventes calculées automatiquement à partir des index.</p>
      </div>

      <Card>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Station"><StationSelect stations={db.stations} value={stationId} onChange={setStationId} disabled={lockStation} /></Field>
          <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
          <Field label="Pompe"><PompeSelect pompes={db.pompes} stationId={stationId} value={pompeId} onChange={setPompeId} disabled={lockPompe} /></Field>
          <div className="flex items-end">{existing && <Pill tone="teal">Relevé existant — modification</Pill>}</div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
            <p className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: C.amber }}><Droplet size={13} /> Essence</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Index ouverture" hint={!existing && previousReleve ? "Repris de la clôture précédente" : undefined}><NumberInput value={idxOE} onChange={(e) => setIdxOE(e.target.value)} /></Field>
              <Field label="Index clôture"><NumberInput value={idxCE} onChange={(e) => setIdxCE(e.target.value)} /></Field>
            </div>
            <div className="mt-2"><GaugeNumber value={fmtVol(ve)} tone="amber" /></div>
          </div>
          <div className="rounded-md p-3" style={{ background: C.tealSoft, border: `1px solid ${C.teal}55` }}>
            <p className="text-xs font-semibold uppercase mb-2 flex items-center gap-1.5" style={{ color: C.teal }}><Droplet size={13} /> Gasoil</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Index ouverture" hint={!existing && previousReleve ? "Repris de la clôture précédente" : undefined}><NumberInput value={idxOG} onChange={(e) => setIdxOG(e.target.value)} /></Field>
              <Field label="Index clôture"><NumberInput value={idxCG} onChange={(e) => setIdxCG(e.target.value)} /></Field>
            </div>
            <div className="mt-2"><GaugeNumber value={fmtVol(vg)} tone="teal" /></div>
          </div>
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
          <p className="font-semibold text-sm">{isPompiste ? "Ma pompe — " : ""}Relevés du {fmtDateLong(date)}</p>
          {!isPompiste && (
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: C.textMuted }}>Cumul station/jour</span>
              <GaugeNumber value={fmtVol(cumul.total)} tone="amber" />
            </div>
          )}
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
          <div className="rounded-md p-3" style={{ background: C.tealSoft, border: `1px solid ${C.teal}55` }}>
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
      setOuvE(prevComputed ? String(prevComputed.stockClotureEssence) : "");
      setOuvG(prevComputed ? String(prevComputed.stockClotureGasoil) : "");
      setLivE(""); setLivG(""); setPhysE(""); setPhysG("");
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
        <p className="text-sm" style={{ color: C.textMuted }}>Stock de clôture calculé automatiquement ; le comptage physique révèle l'écart.</p>
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
              <Field label="Stock ouverture (L)"><NumberInput value={r.ouv} onChange={(e) => r.setOuv(e.target.value)} /></Field>
              <Field label="Livraison (L)"><NumberInput value={r.liv} onChange={(e) => r.setLiv(e.target.value)} /></Field>
              <Field label="Ventes du jour (auto)"><div className="pt-1"><GaugeNumber value={fmtVol(r.vente)} tone={r.tone} /></div></Field>
              <Field label="Stock clôture (auto)"><div className="pt-1"><GaugeNumber value={fmtVol(r.close)} tone={r.tone} /></div></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <Field label="Comptage physique (L)" hint="Optionnel — active le calcul d'écart"><NumberInput value={r.phys} onChange={(e) => r.setPhys(e.target.value)} /></Field>
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
  const c = computeCaisse(db.releves, db.ventes, db.caisses, stationId, date);

  const [precedente, setPrecedente] = useState("");
  const [duJour, setDuJour] = useState("");
  const [bons, setBons] = useState([]);
  const [versements, setVersements] = useState([]);
  const [paiementMarchand, setPaiementMarchand] = useState("");

  useEffect(() => {
    if (c.record) {
      setPrecedente(c.record.caissePrecedente ?? ""); setDuJour(c.record.caisseDuJour ?? "");
      setBons(c.record.bons || (c.record.totalBon ? [{ id: uid(), libelle: "Bon", quantite: "", prixUnitaire: "", fraisRoute: c.record.totalBon }] : []));
      setVersements(c.record.versements || (c.record.totalVersement ? [{ id: uid(), libelle: "Versement", versementBancaire: c.record.totalVersement, codeMarchand: "", autreVersement: "" }] : []));
      setPaiementMarchand(c.record.totalPaiementMarchand ?? "");
    } else {
      // Saisie manuelle obligatoire : le jour où le gérant verse tout l'argent déclaré,
      // il met 0 ici — on ne présume plus que la caisse précédente se reporte
      // automatiquement, puisque ça dépend de ce qui a réellement été laissé en caisse.
      setPrecedente("");
      // Pré-rempli avec le CA du jour (calculé depuis les ventes) — modifiable si le
      // comptage réel du gérant diffère.
      setDuJour(c.ca ? String(c.ca) : "");
      setBons([]); setVersements([]); setPaiementMarchand("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, date]);

  const addBon = () => setBons((p) => [...p, { id: uid(), libelle: "", quantite: "", prixUnitaire: "", fraisRoute: "" }]);
  const updateBon = (id, field, val) => setBons((p) => p.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
  const removeBon = (id) => setBons((p) => p.filter((b) => b.id !== id));

  const addVersement = () => setVersements((p) => [...p, { id: uid(), libelle: "", versementBancaire: "", codeMarchand: "", autreVersement: "" }]);
  const updateVersement = (id, field, val) => setVersements((p) => p.map((v) => (v.id === id ? { ...v, [field]: val } : v)));
  const removeVersement = (id) => setVersements((p) => p.filter((v) => v.id !== id));

  const live = computeCaisse(db.releves, db.ventes, [...db.caisses.filter((x) => x.id !== c.record?.id), { stationId, date, caissePrecedente: precedente, caisseDuJour: duJour, bons, versements, totalPaiementMarchand: paiementMarchand }], stationId, date);
  const [err, setErr] = useState("");
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) return;
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = { id: c.record?.id || uid(), stationId: effStationId, date, caissePrecedente: precedente, caisseDuJour: duJour, bons, versements, totalPaiementMarchand: paiementMarchand };
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

        {/* Coupon de Bon — lignes détaillées (libellé, quantité, prix unitaire, frais de route) */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Coupon de Bon</p>
            <Button variant="ghost" onClick={addBon}><Plus size={14} /> Ajouter une ligne</Button>
          </div>
          {bons.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Aucune ligne de bon.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {bons.map((b) => {
                const montant = num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute);
                return (
                  <div key={b.id} className="rounded-md p-2.5 grid gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, gridTemplateColumns: "1.4fr 0.8fr 0.9fr 0.9fr auto" }}>
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} placeholder="Libellé (ex : Citerne BI 7077)" value={b.libelle} onChange={(e) => updateBon(b.id, "libelle", e.target.value)} />
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Quantité (L)" value={b.quantite} onChange={(e) => updateBon(b.id, "quantite", e.target.value)} />
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder={`Prix unit. (${devise})`} value={b.prixUnitaire} onChange={(e) => updateBon(b.id, "prixUnitaire", e.target.value)} />
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Frais de route" value={b.fraisRoute} onChange={(e) => updateBon(b.id, "fraisRoute", e.target.value)} />
                    <button onClick={() => removeBon(b.id)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={14} /></button>
                    <p className="text-xs col-span-5 text-right" style={{ color: C.textFaint }}>Montant : <span className="smi-mono">{fmtMontant(montant, devise)}</span></p>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-right mt-1.5 font-semibold" style={{ color: C.textMuted }}>Total Bons : <span className="smi-mono">{fmtMontant(live.totalBon, devise)}</span></p>
        </div>

        {/* Coupon de Versement — lignes détaillées (versement bancaire / code marchand / autre) */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Coupon de Versement</p>
            <Button variant="ghost" onClick={addVersement}><Plus size={14} /> Ajouter une ligne</Button>
          </div>
          {versements.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Aucune ligne de versement.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {versements.map((v) => {
                const montant = num(v.versementBancaire) + num(v.codeMarchand) + num(v.autreVersement);
                return (
                  <div key={v.id} className="rounded-md p-2.5 grid gap-2" style={{ background: C.panelAlt, border: `1px solid ${C.border}`, gridTemplateColumns: "1.2fr 0.9fr 0.9fr 0.9fr auto" }}>
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} placeholder="Libellé" value={v.libelle} onChange={(e) => updateVersement(v.id, "libelle", e.target.value)} />
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Versement bancaire" value={v.versementBancaire} onChange={(e) => updateVersement(v.id, "versementBancaire", e.target.value)} />
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Code marchand" value={v.codeMarchand} onChange={(e) => updateVersement(v.id, "codeMarchand", e.target.value)} />
                    <input className="smi-input rounded-md px-2 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Autre versement" value={v.autreVersement} onChange={(e) => updateVersement(v.id, "autreVersement", e.target.value)} />
                    <button onClick={() => removeVersement(v.id)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={14} /></button>
                    <p className="text-xs col-span-5 text-right" style={{ color: C.textFaint }}>Montant : <span className="smi-mono">{fmtMontant(montant, devise)}</span></p>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-right mt-1.5 font-semibold" style={{ color: C.textMuted }}>Total Versements : <span className="smi-mono">{fmtMontant(live.totalVersement, devise)}</span></p>
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

/* ------------------------- Bloc réutilisable : caisse d'un pompiste ------------------------
   Utilisé à la fois par le pompiste lui-même (Ma Caisse) et par le gérant, pour chaque
   pompiste de sa station (onglet Pompistes). La caisse du pompiste ne dépend que de SA
   pompe : volumes vendus (au prix du jour fixé côté Ventes) − ses versements − ses bons. */
function PompisteCaisseBlock({ db, setDb, profile, stationId, pompeId, date, devise, canEdit = true }) {
  const c = computeCaissePompiste(db.releves, db.ventes, db.versementsPompiste, db.bonsPompe, stationId, pompeId, date);

  const [libV, setLibV] = useState("");
  const [montV, setMontV] = useState("");
  const [libB, setLibB] = useState("");
  const [qteB, setQteB] = useState("");
  const [puB, setPuB] = useState("");
  const [frB, setFrB] = useState("");
  const [err, setErr] = useState("");

  const addVersementPompiste = () => {
    setErr("");
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    if (!montV || num(montV) <= 0) { setErr("Indiquez un montant de versement valide."); return; }
    const row = { id: uid(), stationId, pompeId, date, libelle: libV.trim(), montant: montV };
    let next = { ...db, versementsPompiste: [...db.versementsPompiste, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "versementPompiste", action: "création", after: { date, libelle: row.libelle, montant: montV } });
    setDb(next);
    setLibV(""); setMontV("");
  };
  const removeVersementPompiste = (row) => {
    let next = { ...db, versementsPompiste: db.versementsPompiste.filter((d) => d.id !== row.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "versementPompiste", action: "suppression", before: { date: row.date, libelle: row.libelle, montant: row.montant } });
    setDb(next);
  };

  const addBon = () => {
    setErr("");
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const montant = num(qteB) * num(puB) + num(frB);
    if (montant <= 0) { setErr("Indiquez une quantité/prix ou des frais de route pour ce bon."); return; }
    const row = { id: uid(), stationId, pompeId, date, libelle: libB.trim(), quantite: qteB, prixUnitaire: puB, fraisRoute: frB };
    let next = { ...db, bonsPompe: [...db.bonsPompe, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "bonPompe", action: "création", after: { date, libelle: row.libelle, montant } });
    setDb(next);
    setLibB(""); setQteB(""); setPuB(""); setFrB("");
  };
  const removeBon = (row) => {
    let next = { ...db, bonsPompe: db.bonsPompe.filter((b) => b.id !== row.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "bonPompe", action: "suppression", before: { date: row.date, libelle: row.libelle } });
    setDb(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="rounded-md p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.textMuted }}>Volume vendu (relevé)</p>
          <GaugeNumber value={fmtVol(c.volumeTotal)} />
          {c.releveCount === 0 && <p className="text-xs mt-1.5" style={{ color: C.textFaint }}>Aucun relevé saisi ce jour pour cette pompe.</p>}
        </div>
        <div className="rounded-md p-3" style={{ background: C.tealSoft, border: `1px solid ${C.teal}55` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.teal }}>Valeur des ventes</p>
          <GaugeNumber value={fmtMontant(c.montantVente, devise)} tone="teal" />
          {!c.prixDefini && <p className="text-xs mt-1.5" style={{ color: C.danger }}>Prix du jour non défini par le gérant (onglet Ventes).</p>}
        </div>
        <div className="rounded-md p-3" style={{ background: C.amberSoft, border: `1px solid ${C.amberDim}` }}>
          <p className="text-xs uppercase font-semibold mb-1" style={{ color: C.amber }}>Sa caisse (attendue)</p>
          <GaugeNumber value={fmtMontant(c.caisse, devise)} tone="amber" size="lg" />
        </div>
      </div>
      <p className="text-xs text-center" style={{ color: C.textFaint }}>
        Caisse = valeur des volumes vendus ({fmtMontant(c.montantVente, devise)}) − versements ({fmtMontant(c.totalVersementPompiste, devise)}) − bons ({fmtMontant(c.totalBon, devise)})
      </p>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Banknote size={15} /> Versements pompiste</p>
          {canEdit && (
            <div className="flex flex-col gap-2 mb-3">
              <input className="smi-input rounded-md px-2.5 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} placeholder="Libellé (ex : remise au gérant)" value={libV} onChange={(e) => setLibV(e.target.value)} />
              <div className="flex gap-2">
                <input className="smi-input rounded-md px-2.5 py-1.5 text-xs flex-1" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder={`Montant (${devise})`} value={montV} onChange={(e) => setMontV(e.target.value)} />
                <Button onClick={addVersementPompiste}><Plus size={14} /></Button>
              </div>
            </div>
          )}
          {c.versementsPompiste.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Aucun versement ce jour.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {c.versementsPompiste.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-md px-2.5 py-1.5" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                  <span className="text-xs" style={{ color: C.textMuted }}>{d.libelle || "—"}</span>
                  <div className="flex items-center gap-2">
                    <span className="smi-mono text-xs font-semibold">{fmtMontant(d.montant, devise)}</span>
                    {canEdit && <button onClick={() => removeVersementPompiste(d)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={12} /></button>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-right mt-2 font-semibold" style={{ color: C.textMuted }}>Total : <span className="smi-mono">{fmtMontant(c.totalVersementPompiste, devise)}</span></p>
        </Card>

        <Card>
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Ticket size={15} /> Bons</p>
          {canEdit && (
            <div className="flex flex-col gap-2 mb-3">
              <input className="smi-input rounded-md px-2.5 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} placeholder="Libellé (ex : Véhicule BI 7077)" value={libB} onChange={(e) => setLibB(e.target.value)} />
              <div className="grid grid-cols-3 gap-2">
                <input className="smi-input rounded-md px-2.5 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Qté (L)" value={qteB} onChange={(e) => setQteB(e.target.value)} />
                <input className="smi-input rounded-md px-2.5 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Prix unit." value={puB} onChange={(e) => setPuB(e.target.value)} />
                <input className="smi-input rounded-md px-2.5 py-1.5 text-xs" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="number" placeholder="Frais route" value={frB} onChange={(e) => setFrB(e.target.value)} />
              </div>
              <Button onClick={addBon} className="justify-center"><Plus size={14} /> Ajouter le bon</Button>
            </div>
          )}
          {c.bonsPompe.length === 0 ? (
            <p className="text-xs" style={{ color: C.textFaint }}>Aucun bon ce jour.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {c.bonsPompe.map((b) => {
                const montant = num(b.quantite) * num(b.prixUnitaire) + num(b.fraisRoute);
                return (
                  <div key={b.id} className="flex items-center justify-between rounded-md px-2.5 py-1.5" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                    <span className="text-xs" style={{ color: C.textMuted }}>{b.libelle || "—"}</span>
                    <div className="flex items-center gap-2">
                      <span className="smi-mono text-xs font-semibold">{fmtMontant(montant, devise)}</span>
                      {canEdit && <button onClick={() => removeBon(b)} className="smi-btn" style={{ color: C.danger }}><Trash2 size={12} /></button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-right mt-2 font-semibold" style={{ color: C.textMuted }}>Total : <span className="smi-mono">{fmtMontant(c.totalBon, devise)}</span></p>
        </Card>
      </div>
      {err && <p className="text-xs flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}
    </div>
  );
}

/* -------------------------------- Ma Caisse (pompiste) ------------------------------- */

function CaissePompisteView({ db, setDb, profile }) {
  const [date, setDate] = useState(todayISO());
  const station = db.stations.find((s) => s.id === profile.stationId);
  const pompe = db.pompes.find((p) => p.id === profile.pompeId);
  const devise = station?.devise || "GNF";

  if (!profile.pompeId || !profile.stationId) {
    return <EmptyState icon={Fuel} title="Aucune pompe assignée" hint="Contactez votre gérant pour être associé à une pompe." />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="smi-display text-2xl flex items-center gap-2"><Wallet size={22} /> Ma Caisse</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>{station?.nom} — Pompe {pompe?.nom || "—"}. Saisissez d'abord votre relevé du jour (onglet Relevé Pompes).</p>
        </div>
        <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
      </div>

      <PompisteCaisseBlock db={db} setDb={setDb} profile={profile} stationId={profile.stationId} pompeId={profile.pompeId} date={date} devise={devise} canEdit />
    </div>
  );
}

/* -------------------------------- Pompistes (gérant) --------------------------------- */

function PompistesView({ db, setDb, profile }) {
  const stationId = profile.stationId;
  const [form, setForm] = useState(null);
  const [pinInput, setPinInput] = useState("");
  const [formErr, setFormErr] = useState("");
  const [date, setDate] = useState(todayISO());
  const [openId, setOpenId] = useState(null);
  const station = db.stations.find((s) => s.id === stationId);
  const devise = station?.devise || "GNF";
  const stationPompes = db.pompes.filter((p) => p.stationId === stationId);
  const stationPompistes = db.pompistes.filter((p) => p.stationId === stationId);

  const save = () => {
    setFormErr("");
    if (!form.nom?.trim() || !form.pompeId) return;
    const before = form.id ? db.pompistes.find((p) => p.id === form.id) : null;
    // Chaque pompiste doit avoir son propre code PIN — c'est ce qui protège sa caisse
    // quand plusieurs personnes se relaient sur la même pompe (rotation par équipes).
    if (!pinInput.trim() && !before?.pinHash) {
      setFormErr("Chaque pompiste doit avoir un code PIN personnel (au moins 4 chiffres).");
      return;
    }
    if (pinInput.trim() && pinInput.trim().length < 4) {
      setFormErr("Le code PIN doit contenir au moins 4 chiffres.");
      return;
    }
    const record = { ...form, stationId, nom: form.nom.trim() };
    if (pinInput.trim()) record.pinHash = hashPin(pinInput.trim());
    if (!record.id) record.id = uid();
    let next = { ...db };
    next.pompistes = before ? db.pompistes.map((p) => (p.id === record.id ? record : p)) : [...db.pompistes, record];
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "pompiste", action: before ? "modification" : "création", before: before ? { nom: before.nom } : null, after: { nom: record.nom } });
    setDb(next);
    setForm(null);
    setPinInput("");
  };

  const remove = (id) => {
    const p = db.pompistes.find((x) => x.id === id);
    if (!confirm(`Supprimer ${p?.nom} de la liste des pompistes ? Ses relevés, versements et bons passés restent conservés.`)) return;
    let next = { ...db, pompistes: db.pompistes.filter((x) => x.id !== id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId, entity: "pompiste", action: "suppression", before: { nom: p?.nom } });
    setDb(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="smi-display text-2xl flex items-center gap-2"><Users size={22} /> Pompistes</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Plusieurs pompistes peuvent se relayer sur une même pompe : renommez un pompiste existant (icône crayon) si une personne remplace durablement une autre, ou créez-en un second sur la même pompe pour un roulement d'équipes. Chacun n'alimente que la caisse de sa propre pompe et doit avoir son propre code PIN.</p>
        </div>
        <Button onClick={() => { setForm({ pompeId: stationPompes[0]?.id || "" }); setPinInput(""); setFormErr(""); }} disabled={stationPompes.length === 0}><Plus size={16} /> Nouveau pompiste</Button>
      </div>

      {stationPompes.length === 0 && <EmptyState icon={Gauge} title="Aucune pompe sur votre station" hint="Demandez à un administrateur de créer les pompes de votre station." />}

      {form && (
        <Card>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Nom du pompiste"><TextInput value={form.nom || ""} onChange={(e) => setForm({ ...form, nom: e.target.value })} placeholder="Ex. Ibrahima Bah" /></Field>
            <Field label="Pompe gérée"><PompeSelect pompes={stationPompes} stationId={stationId} value={form.pompeId} onChange={(v) => setForm({ ...form, pompeId: v })} /></Field>
            <Field label={form.pinHash ? "Changer le code PIN" : "Code PIN (obligatoire)"} hint={form.pinHash ? "Un code est déjà défini ; laissez vide pour le conserver, ou tapez-en un nouveau pour le remplacer." : "Au moins 4 chiffres — demandé au pompiste à chaque connexion."}>
              <input className="smi-input w-full rounded-md px-3 py-2 text-sm" style={{ background: C.bgAlt, border: `1px solid ${C.border}`, color: C.text }} type="password" inputMode="numeric" value={pinInput} onChange={(e) => setPinInput(e.target.value)} placeholder="••••" />
            </Field>
          </div>
          {formErr && <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: C.danger }}><AlertTriangle size={13} /> {formErr}</p>}
          <div className="flex gap-2 mt-4">
            <Button onClick={save}><CheckCircle2 size={16} /> Enregistrer</Button>
            <Button variant="ghost" onClick={() => { setForm(null); setPinInput(""); setFormErr(""); }}><X size={16} /> Annuler</Button>
          </div>
        </Card>
      )}

      {stationPompistes.length === 0 ? (
        <EmptyState icon={Users} title="Aucun pompiste enregistré" hint="Ajoutez un pompiste pour chaque pompe de votre station." />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Caisse par pompiste</p>
            <Field label="Date"><TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayISO()} /></Field>
          </div>
          <div className="flex flex-col gap-3">
            {stationPompistes.map((p) => {
              const pompe = db.pompes.find((x) => x.id === p.pompeId);
              const c = computeCaissePompiste(db.releves, db.ventes, db.versementsPompiste, db.bonsPompe, stationId, p.pompeId, date);
              const open = openId === p.id;
              return (
                <Card key={p.id}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-semibold flex items-center gap-2">{p.nom} <Pill tone="teal">{pompe?.nom || "pompe supprimée"}</Pill> {p.pinHash && <Pill tone="muted"><Lock size={10} /> PIN</Pill>}</p>
                      <p className="text-xs mt-0.5" style={{ color: C.textFaint }}>{fmtVol(c.volumeTotal)} vendus · caisse attendue <span className="smi-mono font-semibold" style={{ color: C.amber }}>{fmtMontant(c.caisse, devise)}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" onClick={() => setOpenId(open ? null : p.id)}>{open ? "Réduire" : "Détails"} <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none" }} /></Button>
                      <Button variant="ghost" onClick={() => { setForm(p); setPinInput(""); setFormErr(""); }}><Pencil size={13} /></Button>
                      <Button variant="danger" onClick={() => remove(p.id)}><Trash2 size={13} /></Button>
                    </div>
                  </div>
                  {open && (
                    <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
                      <PompisteCaisseBlock db={db} setDb={setDb} profile={profile} stationId={stationId} pompeId={p.pompeId} date={date} devise={devise} canEdit />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------ Inspection view ----------------------------- */

/* ------------------------------- Réception view ----------------------------- */

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
    setQuantite(""); setFournisseur(""); setNumeroBon(""); setPhoto(null);
  };

  const save = () => {
    setErr("");
    const effStationId = isGerant ? profile.stationId : stationId;
    if (!effStationId) { setErr("Choisissez une station."); return; }
    if (!quantite || num(quantite) <= 0) { setErr("Indiquez une quantité valide."); return; }
    if (isFutureDate(date)) { setErr("La date ne peut pas être dans le futur."); return; }
    const row = { id: uid(), stationId: effStationId, date, produit, quantite, fournisseur, numeroBon, photo, timestamp: new Date().toISOString() };
    let next = { ...db, receptions: [...db.receptions, row] };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: effStationId, entity: "reception", action: "création", after: { produit, quantite, fournisseur, numeroBon } });
    setDb(next);
    reset();
  };

  const removeReception = (r) => {
    if (!confirm("Supprimer cette réception ?")) return;
    let next = { ...db, receptions: db.receptions.filter((x) => x.id !== r.id) };
    next = withAudit(next, { user: profile?.name, role: profile?.role, stationId: r.stationId, entity: "reception", action: "suppression", before: { produit: r.produit, quantite: r.quantite } });
    setDb(next);
  };

  const history = db.receptions
    .filter((r) => (isGerant ? r.stationId === profile.stationId : (!stationId || r.stationId === stationId)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.timestamp || "").localeCompare(a.timestamp || "")));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl flex items-center gap-2"><Truck size={22} /> Réception</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Enregistrement d'une livraison de carburant, avec photo du bon comme preuve.</p>
      </div>

      <Card className="max-w-md">
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
              {photo ? "Reprendre la photo" : "Prendre une photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoChange} />
            </label>
            {photo && (
              <div className="mt-2">
                <img src={photo} alt="Bon de livraison" className="rounded-md" style={{ maxHeight: 140, border: `1px solid ${C.border}` }} />
              </div>
            )}
          </Field>
        </div>

        {err && <p className="text-xs flex items-center gap-1.5 mt-3" style={{ color: C.danger }}><AlertTriangle size={13} /> {err}</p>}

        <div className="flex justify-end mt-4">
          <Button onClick={save}><CheckCircle2 size={16} /> Valider</Button>
        </div>
      </Card>

      <Card>
        <p className="font-semibold text-sm mb-3">Historique des réceptions</p>
        {history.length === 0 ? (
          <EmptyState icon={Truck} title="Aucune réception enregistrée" hint="Les livraisons enregistrées apparaîtront ici." />
        ) : (
          <div className="flex flex-col gap-2">
            {history.map((r) => (
              <div key={r.id} className="rounded-md p-3 flex items-center gap-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                {r.photo ? (
                  <img src={r.photo} alt="" className="rounded-md flex-shrink-0" style={{ width: 48, height: 48, objectFit: "cover", border: `1px solid ${C.border}` }} />
                ) : (
                  <div className="rounded-md flex items-center justify-center flex-shrink-0" style={{ width: 48, height: 48, background: C.panel, border: `1px solid ${C.border}`, color: C.textFaint }}><Truck size={18} /></div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{r.produit === "essence" ? "Essence" : "Gasoil"} — {fmtVol(r.quantite)}</p>
                  <p className="text-xs truncate" style={{ color: C.textFaint }}>{fmtDateLong(r.date)} · {db.stations.find((s) => s.id === r.stationId)?.nom || "—"} · {r.fournisseur || "—"} {r.numeroBon ? `· Bon n° ${r.numeroBon}` : ""}</p>
                </div>
                {!isGerant && <button onClick={() => removeReception(r)} className="smi-btn flex-shrink-0" style={{ color: C.danger }}><Trash2 size={14} /></button>}
              </div>
            ))}
          </div>
        )}
      </Card>
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
    const caisse = lastCaisseDate ? computeCaisse(db.releves, db.ventes, db.caisses, s.id, lastCaisseDate) : null;
    // Totaux du mois côté Caisse du gérant — c'est cette caisse-là, tenue par le gérant,
    // qui remonte à l'administrateur ; distincte des versements/bons individuels de
    // chaque pompiste (onglet Pompistes, réservé au gérant).
    const caisseDatesThisMonth = [...new Set(db.caisses.filter((c) => c.stationId === s.id && c.date.startsWith(monthPrefix)).map((c) => c.date))];
    let totalBonGerant = 0, totalVersementBancaireGerant = 0, totalPaiementMarchandGerant = 0, totalAutreVersementGerant = 0;
    caisseDatesThisMonth.forEach((d) => {
      const c = computeCaisse(db.releves, db.ventes, db.caisses, s.id, d);
      totalBonGerant += c.totalBon;
      totalVersementBancaireGerant += c.totalVersementBancaire;
      totalPaiementMarchandGerant += c.totalPaiementMarchand;
      totalAutreVersementGerant += c.totalAutreVersement;
    });
    return { station: s, vEssence, vGasoil, ca, stock, stockDate: lastStockDate, caisse, caisseDate: lastCaisseDate, totalBonGerant, totalVersementBancaireGerant, totalPaiementMarchandGerant, totalAutreVersementGerant };
  }), [db.stations, db.releves, db.ventes, db.stocks, db.caisses, monthPrefix]);

  const totalCA = rows.reduce((a, r) => a + r.ca, 0);
  const totalVol = rows.reduce((a, r) => a + r.vEssence + r.vGasoil, 0);
  const totalVersementBancaireReseau = rows.reduce((a, r) => a + r.totalVersementBancaireGerant, 0);
  const totalBonsReseau = rows.reduce((a, r) => a + r.totalBonGerant, 0);
  const totalPaiementMarchandReseau = rows.reduce((a, r) => a + r.totalPaiementMarchandGerant, 0);
  const totalAutreVersementReseau = rows.reduce((a, r) => a + r.totalAutreVersementGerant, 0);
  // Un réseau peut mélanger des stations en devises différentes : le total ne peut alors
  // pas être affiché comme un simple montant unique sans induire en erreur.
  const devises = new Set(db.stations.map((s) => s.devise || "GNF"));
  const monoDevise = devises.size <= 1;
  const uniqueDevise = [...devises][0] || "GNF";
  const totalCADisplay = monoDevise ? fmtMontant(totalCA, uniqueDevise) : `${totalCA.toLocaleString("fr-FR")} (multi-devises, voir par station)`;
  const totalVersementBancaireDisplay = monoDevise ? fmtMontant(totalVersementBancaireReseau, uniqueDevise) : `${totalVersementBancaireReseau.toLocaleString("fr-FR")} (multi-devises)`;
  const totalBonsDisplay = monoDevise ? fmtMontant(totalBonsReseau, uniqueDevise) : `${totalBonsReseau.toLocaleString("fr-FR")} (multi-devises)`;
  const totalPaiementMarchandDisplay = monoDevise ? fmtMontant(totalPaiementMarchandReseau, uniqueDevise) : `${totalPaiementMarchandReseau.toLocaleString("fr-FR")} (multi-devises)`;
  const totalAutreVersementDisplay = monoDevise ? fmtMontant(totalAutreVersementReseau, uniqueDevise) : `${totalAutreVersementReseau.toLocaleString("fr-FR")} (multi-devises)`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl">Tableau de bord</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>Cumuls du mois en cours ({monthLabel(new Date().getMonth())}) — mise à jour automatique à chaque saisie.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card><p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Volume réseau (mois)</p><div className="mt-1"><GaugeNumber value={fmtVol(totalVol)} size="lg" tone="teal" /></div></Card>
        <Card><p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Chiffre d'affaires réseau (mois)</p><div className="mt-1"><GaugeNumber value={totalCADisplay} size="lg" tone="amber" /></div></Card>
        <Card><p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Total bon (mois)</p><div className="mt-1"><GaugeNumber value={totalBonsDisplay} size="lg" /></div></Card>
        <Card><p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Total versement bancaire (mois)</p><div className="mt-1"><GaugeNumber value={totalVersementBancaireDisplay} size="lg" /></div></Card>
        <Card><p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Total paiement marchand (mois)</p><div className="mt-1"><GaugeNumber value={totalPaiementMarchandDisplay} size="lg" /></div></Card>
        <Card><p className="text-xs uppercase font-semibold" style={{ color: C.textMuted }}>Total autre versement (mois)</p><div className="mt-1"><GaugeNumber value={totalAutreVersementDisplay} size="lg" /></div></Card>
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
              <div className="grid grid-cols-2 gap-2 pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <div><p className="text-xs" style={{ color: C.textFaint }}>Total bon (mois)</p><GaugeNumber value={fmtMontant(r.totalBonGerant, devise)} /></div>
                <div><p className="text-xs" style={{ color: C.textFaint }}>Total versement bancaire (mois)</p><GaugeNumber value={fmtMontant(r.totalVersementBancaireGerant, devise)} /></div>
                <div><p className="text-xs" style={{ color: C.textFaint }}>Total paiement marchand (mois)</p><GaugeNumber value={fmtMontant(r.totalPaiementMarchandGerant, devise)} /></div>
                <div><p className="text-xs" style={{ color: C.textFaint }}>Total autre versement (mois)</p><GaugeNumber value={fmtMontant(r.totalAutreVersementGerant, devise)} /></div>
              </div>
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

function RapportMensuelView({ db }) {
  const now = new Date();
  const [stationId, setStationId] = useState("");
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());

  const stationsToShow = stationId ? db.stations.filter((s) => s.id === stationId) : db.stations;
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;

  // useMemo : ce calcul relit et recombine tous les relevés/ventes du mois pour chaque
  // station à chaque rendu — coûteux quand l'historique grandit. On ne le refait que si
  // les données sources ou les filtres changent réellement.
  const results = useMemo(() => stationsToShow.map((s) => {
    const dates = [...new Set(db.releves.filter((r) => r.stationId === s.id && r.date.startsWith(prefix)).map((r) => r.date))].sort();
    let vEssence = 0, vGasoil = 0, ca = 0;
    const daily = dates.map((d) => {
      const v = computeVente(db.releves, db.ventes, s.id, d);
      vEssence += v.essence; vGasoil += v.gasoil; ca += v.ca;
      return { date: d, ...v };
    });
    return { station: s, daily, vEssence, vGasoil, ca };
  }), [stationsToShow, db.releves, db.ventes, prefix]);

  const grandTotal = results.reduce((a, r) => ({ vEssence: a.vEssence + r.vEssence, vGasoil: a.vGasoil + r.vGasoil, ca: a.ca + r.ca }), { vEssence: 0, vGasoil: 0, ca: 0 });
  const devises = new Set(stationsToShow.map((s) => s.devise || "GNF"));
  const grandTotalCaDisplay = devises.size <= 1 ? fmtMontant(grandTotal.ca, [...devises][0] || "GNF") : `${grandTotal.ca.toLocaleString("fr-FR")} (multi-devises)`;

  // Export CSV — donne enfin un livrable exploitable en comptabilité/audit plutôt qu'un
  // simple tableau à l'écran. Génération 100% côté navigateur, aucun envoi réseau.
  const exportCsv = () => {
    const rows = [["Station", "Devise", "Volume Essence (L)", "Volume Gasoil (L)", "Volume Total (L)", "Chiffre d'affaires"]];
    results.forEach((r) => rows.push([r.station.nom, r.station.devise || "GNF", r.vEssence.toFixed(2), r.vGasoil.toFixed(2), (r.vEssence + r.vGasoil).toFixed(2), r.ca.toFixed(2)]));
    rows.push(["Total", "", grandTotal.vEssence.toFixed(2), grandTotal.vGasoil.toFixed(2), (grandTotal.vEssence + grandTotal.vGasoil).toFixed(2), grandTotal.ca.toFixed(2)]);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="smi-display text-2xl">Rapport mensuel</h2>
          <p className="text-sm" style={{ color: C.textMuted }}>Filtrez par station, mois et année pour consolider volumes et chiffre d'affaires.</p>
        </div>
        <Button variant="ghost" onClick={exportCsv} disabled={results.length === 0}><Download size={16} /> Exporter en CSV</Button>
      </div>

      <Card>
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
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.station.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="py-1.5 font-semibold">{r.station.nom}</td>
                  <td className="py-1.5 text-right smi-mono">{fmtVol(r.vEssence)}</td>
                  <td className="py-1.5 text-right smi-mono">{fmtVol(r.vGasoil)}</td>
                  <td className="py-1.5 text-right smi-mono">{fmtVol(r.vEssence + r.vGasoil)}</td>
                  <td className="py-1.5 text-right smi-mono font-semibold" style={{ color: C.amber }}>{fmtMontant(r.ca, r.station.devise || "GNF")}</td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center" style={{ color: C.textFaint }}>Aucune donnée pour cette période.</td></tr>
              )}
            </tbody>
            {results.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: `2px solid ${C.border}` }}>
                  <td className="py-2 font-bold">Total</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtVol(grandTotal.vEssence)}</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtVol(grandTotal.vGasoil)}</td>
                  <td className="py-2 text-right smi-mono font-bold">{fmtVol(grandTotal.vEssence + grandTotal.vGasoil)}</td>
                  <td className="py-2 text-right smi-mono font-bold" style={{ color: C.amber }}>{grandTotalCaDisplay}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
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
    </div>
  );
}

/* ------------------------------ Rapport journalier ---------------------------- */

function RapportJournalierView({ db, profile }) {
  const isGerant = profile.role === "gerant";
  const [stationId, setStationId] = useState(isGerant ? profile.stationId : (db.stations[0]?.id || ""));
  const [date, setDate] = useState(todayISO());

  const rows = useMemo(() => db.stations.map((s) => {
    const v = computeVente(db.releves, db.ventes, s.id, date);
    const stockRec = db.stocks.find((x) => x.stationId === s.id && x.date === date);
    const stock = stockRec ? computeStock(db.releves, db.stocks, s.id, date) : null;
    const caisseRec = db.caisses.find((x) => x.stationId === s.id && x.date === date);
    const caisse = caisseRec ? computeCaisse(db.releves, db.ventes, db.caisses, s.id, date) : null;
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
      lines.push({ pompe: p.nom, produit: "Essence", ouverture: oe, cloture: ce, volume: Math.max(0, ce - oe) });
      lines.push({ pompe: p.nom, produit: "Gasoil", ouverture: og, cloture: cg, volume: Math.max(0, cg - og) });
    });
    return lines;
  }, [db.pompes, db.releves, stationId, date]);

  const vJour = stationId ? computeVente(db.releves, db.ventes, stationId, date) : null;
  const stockJour = stationId ? computeStock(db.releves, db.stocks, stationId, date) : null;
  const caisseJour = stationId ? computeCaisse(db.releves, db.ventes, db.caisses, stationId, date) : null;

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
                        </tr>
                      ))}
                      {caisseJour.bons.length === 0 && <tr><td colSpan={5} className="py-2 text-center" style={{ color: C.textFaint }}>Aucune ligne.</td></tr>}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `1px solid ${C.border}` }}>
                        <td colSpan={4} className="py-1 font-bold">Total Bons</td>
                        <td className="py-1 text-right smi-mono font-bold">{fmtMontant(caisseJour.totalBon, devise)}</td>
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
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Code marchand ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Autre versement ({devise})</th>
                        <th className="text-right py-1" style={{ color: C.textMuted }}>Montant ({devise})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {caisseJour.versements.map((v) => (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                          <td className="py-1">{v.libelle || "—"}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(v.versementBancaire, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(v.codeMarchand, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(v.autreVersement, devise)}</td>
                          <td className="py-1 text-right smi-mono">{fmtMontant(num(v.versementBancaire) + num(v.codeMarchand) + num(v.autreVersement), devise)}</td>
                        </tr>
                      ))}
                      {caisseJour.versements.length === 0 && <tr><td colSpan={5} className="py-2 text-center" style={{ color: C.textFaint }}>Aucune ligne.</td></tr>}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `1px solid ${C.border}` }}>
                        <td colSpan={4} className="py-1 font-bold">Total Versement</td>
                        <td className="py-1 text-right smi-mono font-bold">{fmtMontant(caisseJour.totalVersement, devise)}</td>
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
                <p className="text-[10px] italic mt-2" style={{ color: C.textFaint }}>Caisse Attendue = Caisse Précédente + Chiffre d'affaires du jour − Total Bon − Paiement marchand (le Versement n'est pas déduit : il documente le dépôt d'une partie de la caisse déjà comptée)</p>
              </>
            )}
          </Card>
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
    key: "releve", title: "Relevé Pompes", roles: ["admin", "gerant", "pompiste"],
    text: "Chaque jour, pour chaque pompe : saisissez l'index de clôture (essence et/ou gasoil). L'index d'ouverture se remplit automatiquement avec la clôture du relevé précédent — vous n'avez normalement rien à corriger, sauf en cas de remise à zéro du compteur. Le volume vendu est calculé automatiquement. Un pompiste ne voit et ne saisit que le relevé de sa propre pompe.",
  },
  {
    key: "ma_caisse", title: "Ma Caisse", roles: ["pompiste"],
    text: "Votre caisse du jour = valeur des volumes vendus à votre pompe (au prix fixé par le gérant) − vos versements − vos bons. Saisissez d'abord votre relevé du jour, puis ajoutez ici vos versements (argent que vous remettez en cours de journée) et vos bons (carburant non payé en espèces) : la caisse attendue se recalcule automatiquement.",
  },
  {
    key: "pompistes", title: "Pompistes", roles: ["gerant"],
    text: "Créez un pompiste par personne (nom + PIN obligatoire, au moins 4 chiffres) et associez-le à une pompe. En cas de roulement d'équipes sur la même pompe, renommez un pompiste existant ou créez-en un second sur cette pompe. Pour chaque pompiste, consultez le détail de sa caisse du jour (ou d'une date passée) : volumes vendus, versements, bons, et caisse attendue. Vous pouvez aussi ajouter ou corriger des lignes de versement/bon à sa place si besoin. Attention : la caisse d'une pompe pour une date donnée cumule tout ce qui a été saisi ce jour-là sur cette pompe, quel que soit le pompiste connecté.",
  },
  {
    key: "ventes", title: "Ventes", roles: ["admin", "gerant"],
    text: "Indiquez le prix de vente du jour pour l'essence et le gasoil. Les volumes viennent automatiquement du Relevé Pompes ; le chiffre d'affaires du jour (CA) est calculé pour vous et sert de base à la Caisse (station) et à la caisse de chaque pompiste.",
  },
  {
    key: "stock", title: "Contrôle Stock", roles: ["admin", "gerant"],
    text: "Le stock d'ouverture reprend automatiquement la clôture de la veille. Indiquez les livraisons reçues et le stock physique mesuré (par jaugeage) : l'écart entre stock théorique et stock physique s'affiche automatiquement — un écart important mérite une vérification.",
  },
  {
    key: "caisse", title: "Caisse", roles: ["admin", "gerant"],
    text: "« Caisse précédente » se saisit manuellement chaque jour (mettez 0 si tout l'argent a été versé la veille). « Caisse du jour » se pré-remplit avec le CA du jour, à corriger selon le comptage réel. Ajoutez une ligne dans « Coupon de Bon » pour chaque bon (carburant non payé en espèces) et dans « Coupon de Versement » pour chaque dépôt bancaire ou paiement par code marchand. Le Versement ne réduit pas la caisse attendue (il documente juste où est allé l'argent déjà compté) ; seuls le Bon et le Paiement marchand la réduisent réellement. Cette caisse est celle de la station dans son ensemble, distincte de la caisse individuelle de chaque pompiste.",
  },
  {
    key: "inspection", title: "Inspection", roles: ["admin", "gerant"],
    text: "Grille de contrôle standard (propreté, sécurité incendie, état des pompes, hygiène, EPI, maintenance, éclairage...). Pour chaque point : Conforme, Non conforme (avec remarque), ou N/A si le point ne s'applique pas à cette station ce jour-là. L'historique des inspections passées reste consultable en dessous.",
  },
  {
    key: "reception", title: "Réception", roles: ["admin", "gerant"],
    text: "À chaque livraison de carburant : produit, quantité, fournisseur, numéro de bon, et une photo du bon de livraison prise directement avec l'appareil photo du téléphone. Sert de preuve et d'historique des livraisons.",
  },
  {
    key: "rapport_jour", title: "Rapport journalier", roles: ["admin", "gerant"],
    text: "Rapport détaillé d'une station pour une journée précise : index des pompes, ventes, stock, coupon de bon/versement, et synthèse caisse — exactement dans le format papier habituel. Bouton « Exporter en PDF » pour l'enregistrer ou l'imprimer.",
  },
  {
    key: "dashboard", title: "Tableau de bord", roles: ["admin"],
    text: "Vue d'ensemble du réseau : volumes et chiffre d'affaires du mois en cours, station par station, mis à jour automatiquement à chaque saisie d'un gérant.",
  },
  {
    key: "stations", title: "Stations", roles: ["admin"],
    text: "Créez et modifiez les stations du réseau (nom, localisation, fournisseur, devise). Vous pouvez définir un code PIN par station, demandé au gérant à la connexion.",
  },
  {
    key: "pompes", title: "Pompes", roles: ["admin"],
    text: "Créez les pompes de chaque station — nécessaire avant de pouvoir saisir des relevés ou d'y assigner un pompiste.",
  },
  {
    key: "rapport", title: "Rapport mensuel", roles: ["admin"],
    text: "Synthèse consolidée sur un mois, filtrable par station, avec export CSV pour la comptabilité.",
  },
  {
    key: "journal", title: "Journal des saisies", roles: ["admin"],
    text: "Traçabilité complète : qui a créé, modifié ou supprimé quoi, sur quelle station, et à quelle heure. Filtrable par station.",
  },
  {
    key: "securite", title: "Sécurité", roles: ["admin"],
    text: "Changez votre code PIN administrateur (ancien code requis). Les codes PIN de station se changent depuis Stations, les codes PIN de pompiste depuis Pompistes.",
  },
];

function GuideView({ profile }) {
  const role = profile.role;
  const defaultKey = role === "pompiste" ? "ma_caisse" : role === "gerant" ? "releve" : "dashboard";
  const [openKey, setOpenKey] = useState(defaultKey);
  const sections = GUIDE_SECTIONS.filter((s) => s.roles.includes(role));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="smi-display text-2xl flex items-center gap-2"><BookOpen size={22} /> Guide d'utilisation</h2>
        <p className="text-sm" style={{ color: C.textMuted }}>
          {role === "admin"
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
                    {s.roles.length === 1 && s.roles[0] !== "pompiste" && <Pill tone="amber">{s.roles[0] === "admin" ? "Admin" : "Gérant"}</Pill>}
                    {s.roles.length === 1 && s.roles[0] === "pompiste" && <Pill tone="teal">Pompiste</Pill>}
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

      {role === "admin" && (
        <Card>
          <p className="text-sm font-semibold mb-1">Pour bien démarrer</p>
          <p className="text-sm" style={{ color: C.textMuted }}>
            1. Créez vos stations (Stations) — 2. Ajoutez les pompes de chaque station (Pompes) —
            3. Partagez le lien de l'application à vos gérants, chacun choisit sa station à la connexion.
            Chaque gérant pourra ensuite créer ses pompistes (onglet Pompistes) et leur partager le même lien.
          </p>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------ Journal des saisies ---------------------------- */

const AUDIT_LABELS = { station: "Station", pompe: "Pompe", pompiste: "Pompiste", releve: "Relevé pompe", vente: "Vente", stock: "Contrôle stock", caisse: "Caisse", versementPompiste: "Versement pompiste", bonPompe: "Bon pompiste", inspection: "Inspection", reception: "Réception" };

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

// Chaque onglet déclare explicitement les rôles qui y ont accès. Le module Pompistes
// (gestion de la liste + supervision de leur caisse) est une fonctionnalité du gérant :
// il ne s'affiche ni côté administrateur, ni côté pompiste. Le pompiste, lui, n'a accès
// qu'à sa pompe (Relevé Pompes, verrouillé sur sa pompe) et à sa propre caisse (Ma Caisse).
const TABS = [
  { key: "guide", label: "Guide d'utilisation", icon: BookOpen, roles: ["admin", "gerant", "pompiste"] },
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, roles: ["admin"] },
  { key: "stations", label: "Stations", icon: Building2, roles: ["admin"] },
  { key: "pompes", label: "Pompes", icon: Gauge, roles: ["admin"] },
  { key: "pompistes", label: "Pompistes", icon: Users, roles: ["gerant"] },
  { key: "releve", label: "Relevé Pompes", icon: Fuel, roles: ["admin", "gerant", "pompiste"] },
  { key: "ma_caisse", label: "Ma Caisse", icon: Wallet, roles: ["pompiste"] },
  { key: "ventes", label: "Ventes", icon: Wallet, roles: ["admin", "gerant"] },
  { key: "stock", label: "Contrôle Stock", icon: Warehouse, roles: ["admin", "gerant"] },
  { key: "caisse", label: "Caisse", icon: Wallet, roles: ["admin", "gerant"] },
  { key: "inspection", label: "Inspection", icon: ClipboardCheck, roles: ["admin", "gerant"] },
  { key: "reception", label: "Réception", icon: Truck, roles: ["admin", "gerant"] },
  { key: "rapport", label: "Rapport mensuel", icon: CalendarRange, roles: ["admin"] },
  { key: "rapport_jour", label: "Rapport journalier", icon: Printer, roles: ["admin", "gerant"] },
  { key: "journal", label: "Journal des saisies", icon: History, roles: ["admin"] },
  { key: "securite", label: "Sécurité", icon: Lock, roles: ["admin"] },
];

export default function App() {
  const { db, setDb, profile, setProfile, ready, error, retrySave } = useSmiStorage();
  const [tab, setTab] = useState("guide");

  useEffect(() => {
    // Le guide s'affiche en premier à chaque connexion, quel que soit le rôle — l'accès
    // aux modules reste ensuite à un clic dans le menu.
    if (profile?.role === "admin" || profile?.role === "gerant" || profile?.role === "pompiste") setTab("guide");
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

  const visibleTabs = TABS.filter((t) => t.roles.includes(profile.role));
  const stationName = profile.stationId ? db.stations.find((s) => s.id === profile.stationId)?.nom : null;
  const pompeName = profile.role === "pompiste" && profile.pompeId ? db.pompes.find((p) => p.id === profile.pompeId)?.nom : null;

  const renderTab = () => {
    switch (tab) {
      case "guide": return <GuideView profile={profile} />;
      case "dashboard": return <DashboardView db={db} />;
      case "stations": return <StationsView db={db} setDb={setDb} profile={profile} />;
      case "pompes": return <PompesView db={db} setDb={setDb} profile={profile} />;
      case "pompistes": return <PompistesView db={db} setDb={setDb} profile={profile} />;
      case "releve": return <RelevePompesView db={db} setDb={setDb} profile={profile} />;
      case "ma_caisse": return <CaissePompisteView db={db} setDb={setDb} profile={profile} />;
      case "ventes": return <VentesView db={db} setDb={setDb} profile={profile} />;
      case "stock": return <StockView db={db} setDb={setDb} profile={profile} />;
      case "caisse": return <CaisseView db={db} setDb={setDb} profile={profile} />;
      case "inspection": return <InspectionView db={db} setDb={setDb} profile={profile} />;
      case "reception": return <ReceptionView db={db} setDb={setDb} profile={profile} />;
      case "rapport": return <RapportMensuelView db={db} />;
      case "rapport_jour": return <RapportJournalierView db={db} profile={profile} />;
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
            <p>{profile.name}</p>
            {stationName && <p>{stationName}{pompeName ? ` — ${pompeName}` : ""}</p>}
          </div>
          <Button variant="ghost" onClick={() => setProfile(null)}><LogOut size={14} /> Changer de profil</Button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3" style={{ background: C.bgAlt, borderBottom: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2">
          <Logo size={24} />
          <p className="smi-display text-lg leading-none">SMI SARL</p>
        </div>
        <button onClick={() => setProfile(null)} className="smi-btn" style={{ color: C.textMuted }}><LogOut size={16} /></button>
      </header>

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
