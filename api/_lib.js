import { MongoClient } from "mongodb";
import crypto from "node:crypto";

// Outils partagés par les fonctions serveur (les fichiers commençant par « _ » ne sont pas
// exposés comme adresses publiques par Vercel).
//
// Gestion StationPro est une seule application partagée par plusieurs sociétés clientes.
// Chaque société a un code (ex. « smi ») et ses propres données. Le serveur vérifie la
// connexion, délivre une session signée, puis préfixe chaque clé de données par le code de
// la société : une société ne peut jamais lire ni écrire les données d'une autre.

const DB_NAME = "smi_gestion";
const KV = "smi_kv";
const TENANTS = "tenants";

export const DB_KEY = "smi_sarl_db_v1";
export const ADMIN_PIN_KEY = "smi_sarl_admin_pin_v1";
// Société historique : ses données existantes sont gardées telles quelles (clés sans
// préfixe), pour que la mise à jour ne demande aucune migration.
export const LEGACY_CODE = (process.env.LEGACY_TENANT_CODE || "smi").toLowerCase();

let clientPromise = null;
export async function cols() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI n'est pas configuré sur le serveur.");
    clientPromise = new MongoClient(uri).connect();
  }
  const db = (await clientPromise).db(DB_NAME);
  return { kv: db.collection(KV), tenants: db.collection(TENANTS) };
}

// Même empreinte que côté application (compatibilité avec les codes déjà enregistrés).
export function hashPin(pin) {
  const s = String(pin);
  let h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (c + 1), 2166136261) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

export const normCode = (c) => String(c || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-]/g, "");

export function keyFor(tenant, key) {
  return tenant.legacy ? key : `${tenant._id}::${key}`;
}

/* ------------------------------ Sessions signées ------------------------------ */

function secret() {
  // Pas de repli sur APP_TOKEN : cet ancien jeton était visible dans le code du navigateur.
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 20) throw new Error("SESSION_SECRET n'est pas configuré sur le serveur (20 caractères minimum).");
  return s;
}
const b64 = (buf) => Buffer.from(buf).toString("base64url");
const SESSION_DAYS = 30;

export function signSession(payload) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + SESSION_DAYS * 86400000 }));
  const sig = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = b64(crypto.createHmac("sha256", secret()).update(body).digest());
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

export function bearer(req) {
  const h = req.headers["authorization"] || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

/* ------------------------------ Sociétés ------------------------------ */

// Renvoie { tenant } si la société peut se connecter, sinon { error, status }.
export async function loadTenant(tenants, code, { autoCreateLegacy = false } = {}) {
  const id = normCode(code);
  if (!id) return { error: "Indiquez le code de votre société.", status: 400 };
  let t = await tenants.findOne({ _id: id });
  if (!t && autoCreateLegacy && id === LEGACY_CODE) {
    // Première connexion après la mise à jour : la société historique est créée
    // automatiquement et reprend ses données existantes.
    t = { _id: id, nom: process.env.LEGACY_TENANT_NAME || "SMI SARL", statut: "actif", expireLe: null, legacy: true, createdAt: new Date().toISOString() };
    await tenants.insertOne(t);
  }
  if (!t) return { error: "Code société inconnu.", status: 404 };
  if (t.statut === "suspendu") return { error: "L'accès de votre société est suspendu. Contactez Gestion StationPro.", status: 403 };
  if (t.expireLe && t.expireLe < new Date().toISOString().slice(0, 10)) return { error: "L'abonnement de votre société a expiré. Contactez Gestion StationPro pour le renouveler.", status: 403 };
  return { tenant: t };
}

export function publicTenant(t) {
  return { code: t._id, nom: t.nom, expireLe: t.expireLe || null };
}

export function readJsonBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === "string") { try { return JSON.parse(b); } catch { return {}; } }
  return b;
}
