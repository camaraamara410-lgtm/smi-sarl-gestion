// Couche de stockage de Gestion StationPro.
//
// Les données vivent dans MongoDB Atlas, derrière la fonction serveur /api/kv. Chaque appel
// porte la session obtenue à la connexion (/api/login) : le serveur en déduit la société
// et ne donne accès qu'à ses données à elle.
//
// La session (qui est connecté sur CET appareil) est gardée dans le navigateur, jamais
// dans la base partagée : chaque téléphone a sa propre connexion.
//
// Si le réseau tombe, on bascule sur une copie locale (localStorage, puis mémoire) pour
// que la saisie reste possible ; elle est renvoyée au serveur à la prochaine écriture.

const SESSION_KEY = "gsp_session_v1";

function localStorageWorks() {
  try {
    const t = "__gsp_probe__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}
const hasLocalStorage = typeof window !== "undefined" && typeof localStorage !== "undefined" && localStorageWorks();
const memoryStore = new Map();
let lastNetworkFailure = 0; // après une panne réseau, on réessaie le serveur toutes les 30 secondes
const RETRY_MS = 30000;
const apiReachableNow = () => Date.now() - lastNetworkFailure > RETRY_MS;
let memorySession = null;

/* ------------------------------ Session ------------------------------ */

export function getSession() {
  if (hasLocalStorage) {
    try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  return memorySession;
}

export function setSession(s) {
  memorySession = s;
  lastNetworkFailure = 0;
  if (hasLocalStorage) {
    try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* stockage local indisponible */ }
  }
}

// Session refusée par le serveur (expirée, société suspendue...) : on déconnecte
// l'appareil et on prévient l'application, qui ré-affiche l'écran de connexion.
function sessionRejected(message) {
  setSession(null);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gsp-logout", { detail: message }));
}

export async function login({ societe, role, name, pin }) {
  let r;
  try {
    r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ societe, role, name, pin }) });
  } catch {
    throw new Error("Pas de connexion internet. Vérifiez le réseau et réessayez.");
  }
  let data = {};
  try { data = await r.json(); } catch { /* réponse vide */ }
  if (!r.ok) throw new Error(data.error || "Connexion impossible pour le moment. Réessayez.");
  setSession({ token: data.token, profile: data.profile, tenant: data.tenant });
  return data;
}

/* ------------------------------ Données ------------------------------ */

function headers(json) {
  const s = getSession();
  const h = { Authorization: `Bearer ${s?.token || ""}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// Les copies locales sont rangées par société, pour ne jamais mélanger deux sociétés
// utilisées sur le même appareil.
const localKey = (key) => `gsp::${getSession()?.tenant?.code || "_"}::${key}`;

async function handleAuth(r) {
  if (r.status === 401 || r.status === 403) {
    let msg = "Session expirée. Reconnectez-vous.";
    try { msg = (await r.json()).error || msg; } catch { /* pas de détail */ }
    sessionRejected(msg);
    const e = new Error(msg); e.auth = true; throw e;
  }
}

async function storageGet(key) {
  if (apiReachableNow()) {
    try {
      const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { headers: headers(false) });
      await handleAuth(r);
      if (r.status === 404) throw new Error("not found");
      if (!r.ok) throw new Error(`API error ${r.status}`);
      const data = await r.json();
      return { key, value: data.value };
    } catch (e) {
      if (e.message === "not found" || e.auth) throw e;
      lastNetworkFailure = Date.now();
    }
  }
  if (hasLocalStorage) {
    const raw = localStorage.getItem(localKey(key));
    if (raw !== null) return { key, value: raw };
  }
  if (memoryStore.has(localKey(key))) return { key, value: memoryStore.get(localKey(key)) };
  throw new Error("not found");
}

async function storageSet(key, value) {
  if (apiReachableNow()) {
    try {
      const r = await fetch("/api/kv", { method: "POST", headers: headers(true), body: JSON.stringify({ key, value }) });
      await handleAuth(r);
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return { key, value };
    } catch (e) {
      if (e.auth) throw e;
      lastNetworkFailure = Date.now();
    }
  }
  if (hasLocalStorage) {
    localStorage.setItem(localKey(key), value);
    return { key, value };
  }
  memoryStore.set(localKey(key), value);
  return { key, value };
}

async function storageDelete(key) {
  if (apiReachableNow()) {
    try {
      const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { method: "DELETE", headers: headers(false) });
      await handleAuth(r);
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return { key, deleted: true };
    } catch (e) {
      if (e.auth) throw e;
      lastNetworkFailure = Date.now();
    }
  }
  if (hasLocalStorage) localStorage.removeItem(localKey(key));
  memoryStore.delete(localKey(key));
  return { key, deleted: true };
}

export const storage = { get: storageGet, set: storageSet, delete: storageDelete };

export function isStorageDegraded() {
  return !apiReachableNow();
}
export { hasLocalStorage };
