// Cette couche remplace window.storage (qui n'existe que dans l'environnement Artifact de
// Claude) par une vraie base de données partagée (MongoDB Atlas, via la fonction serveur
// /api/kv), pour que toute l'équipe voie les mêmes données depuis n'importe quel appareil,
// sans avoir besoin d'un compte Claude. L'interface exposée (get/set/delete par clé) reste
// identique à celle utilisée par le reste de l'application, donc aucune autre partie du
// code n'a besoin de changer.
//
// En développement local sans le backend configuré (npm run dev sans /api fonctionnel), ou
// si l'appel réseau échoue, on bascule automatiquement sur localStorage puis sur la mémoire,
// pour que l'application reste testable.
//
// Chaque appel inclut le jeton d'application (VITE_APP_TOKEN) dans l'en-tête x-app-token,
// vérifié côté serveur par api/kv.js — voir la note de sécurité dans ce fichier.

const APP_TOKEN = import.meta.env.VITE_APP_TOKEN || "";

function localStorageWorks() {
  try {
    const t = "__smi_probe__";
    localStorage.setItem(t, "1");
    localStorage.removeItem(t);
    return true;
  } catch {
    return false;
  }
}
const hasLocalStorage = typeof window !== "undefined" && typeof localStorage !== "undefined" && localStorageWorks();
const memoryStore = new Map();
let apiReachable = true; // repasse à false dès qu'un appel réseau échoue, pour ne pas retenter inutilement à chaque saisie

async function storageGet(key) {
  if (apiReachable) {
    try {
      const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { headers: { "x-app-token": APP_TOKEN } });
      if (r.status === 404) throw new Error("not found");
      if (!r.ok) throw new Error(`API error ${r.status}`);
      const data = await r.json();
      return { key, value: data.value };
    } catch (e) {
      if (e.message === "not found") throw e;
      apiReachable = false; // panne réseau/serveur : on bascule sur le repli pour la suite de la session
    }
  }
  if (hasLocalStorage) {
    const raw = localStorage.getItem(key);
    if (raw !== null) return { key, value: raw };
  }
  if (memoryStore.has(key)) return { key, value: memoryStore.get(key) };
  throw new Error("not found");
}

async function storageSet(key, value) {
  if (apiReachable) {
    try {
      const r = await fetch("/api/kv", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-app-token": APP_TOKEN },
        body: JSON.stringify({ key, value }),
      });
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return { key, value };
    } catch {
      apiReachable = false;
    }
  }
  if (hasLocalStorage) {
    localStorage.setItem(key, value);
    return { key, value };
  }
  memoryStore.set(key, value);
  return { key, value };
}

async function storageDelete(key) {
  if (apiReachable) {
    try {
      const r = await fetch(`/api/kv?key=${encodeURIComponent(key)}`, { method: "DELETE", headers: { "x-app-token": APP_TOKEN } });
      if (!r.ok) throw new Error(`API error ${r.status}`);
      return { key, deleted: true };
    } catch {
      apiReachable = false;
    }
  }
  if (hasLocalStorage) localStorage.removeItem(key);
  memoryStore.delete(key);
  return { key, deleted: true };
}

export const storage = { get: storageGet, set: storageSet, delete: storageDelete };

// Fonction (pas une constante figée) : reflète l'état réel au moment de l'appel, puisque
// apiReachable peut changer après le chargement initial du module (ex. panne réseau
// détectée en cours de session).
export function isStorageDegraded() {
  return !apiReachable;
}
export { hasLocalStorage };
