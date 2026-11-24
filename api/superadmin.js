import crypto from "node:crypto";
import { cols, keyFor, hashPin, normCode, readJsonBody, DB_KEY, ADMIN_PIN_KEY, LEGACY_CODE } from "./_lib.js";

// Espace propriétaire (Gestion StationPro) : gestion des sociétés clientes.
// Protégé par le mot de passe SUPERADMIN_PASSWORD (variable Vercel, jamais dans le code).

function checkPassword(req) {
  const expected = process.env.SUPERADMIN_PASSWORD || "";
  const given = String(req.headers["x-super-password"] || "");
  if (expected.length < 10) return "SUPERADMIN_PASSWORD n'est pas configuré (10 caractères minimum).";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b) ? null : "Mot de passe incorrect.";
}

const isDate = (s) => s === null || s === "" || /^\d{4}-\d{2}-\d{2}$/.test(String(s));

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Méthode non autorisée" }); }
  const bad = checkPassword(req);
  if (bad) {
    await new Promise((r) => setTimeout(r, 800)); // ralentit les essais au hasard
    return res.status(401).json({ error: bad });
  }
  try {
    const { action, ...p } = readJsonBody(req);
    const { kv, tenants } = await cols();

    if (action === "list") {
      const list = await tenants.find({}).sort({ createdAt: 1 }).toArray();
      const out = [];
      for (const t of list) {
        const doc = await kv.findOne({ _id: keyFor(t, DB_KEY) });
        let nbStations = 0;
        try { nbStations = (JSON.parse(doc?.value || "{}").stations || []).length; } catch { /* base vide */ }
        out.push({ code: t._id, nom: t.nom, statut: t.statut, expireLe: t.expireLe || null, legacy: !!t.legacy, createdAt: t.createdAt, contact: t.contact || "", nbStations, derniereSaisie: doc?.updatedAt || null });
      }
      return res.status(200).json({ tenants: out });
    }

    if (action === "create") {
      const code = normCode(p.code);
      const nom = String(p.nom || "").trim();
      const pin = String(p.adminPin || "").trim();
      if (code.length < 2) return res.status(400).json({ error: "Code société : 2 caractères minimum (lettres, chiffres, tiret)." });
      if (!nom) return res.status(400).json({ error: "Indiquez le nom de la société." });
      if (pin.length < 4) return res.status(400).json({ error: "Code PIN administrateur : 4 chiffres minimum." });
      if (!isDate(p.expireLe)) return res.status(400).json({ error: "Date de fin invalide." });
      if (await tenants.findOne({ _id: code })) return res.status(409).json({ error: "Ce code société existe déjà." });
      const t = { _id: code, nom, statut: "actif", expireLe: p.expireLe || null, legacy: code === LEGACY_CODE, contact: String(p.contact || "").trim(), createdAt: new Date().toISOString() };
      await tenants.insertOne(t);
      await kv.updateOne({ _id: keyFor(t, ADMIN_PIN_KEY) }, { $set: { value: hashPin(pin), updatedAt: new Date().toISOString() } }, { upsert: true });
      return res.status(200).json({ ok: true });
    }

    if (action === "update") {
      const code = normCode(p.code);
      const t = await tenants.findOne({ _id: code });
      if (!t) return res.status(404).json({ error: "Société introuvable." });
      const set = {};
      if (p.nom !== undefined) { if (!String(p.nom).trim()) return res.status(400).json({ error: "Nom vide." }); set.nom = String(p.nom).trim(); }
      if (p.statut !== undefined) { if (!["actif", "suspendu"].includes(p.statut)) return res.status(400).json({ error: "Statut invalide." }); set.statut = p.statut; }
      if (p.expireLe !== undefined) { if (!isDate(p.expireLe)) return res.status(400).json({ error: "Date de fin invalide." }); set.expireLe = p.expireLe || null; }
      if (p.contact !== undefined) set.contact = String(p.contact).trim();
      await tenants.updateOne({ _id: code }, { $set: set });
      return res.status(200).json({ ok: true });
    }

    if (action === "resetPin") {
      const code = normCode(p.code);
      const t = await tenants.findOne({ _id: code });
      if (!t) return res.status(404).json({ error: "Société introuvable." });
      const pin = String(p.adminPin || "").trim();
      if (pin.length < 4) return res.status(400).json({ error: "Code PIN administrateur : 4 chiffres minimum." });
      await kv.updateOne({ _id: keyFor(t, ADMIN_PIN_KEY) }, { $set: { value: hashPin(pin), updatedAt: new Date().toISOString() } }, { upsert: true });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Action inconnue." });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
