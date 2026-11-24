import { cols, loadTenant, keyFor, hashPin, signSession, publicTenant, readJsonBody, DB_KEY, ADMIN_PIN_KEY } from "./_lib.js";

// Connexion : code société + profil (administrateur, gérant, pompiste) + nom + code.
// Le serveur vérifie tout lui-même et renvoie une session signée, propre à l'appareil.
// Après 5 essais ratés, le compte est bloqué 15 minutes (protection contre les essais
// de codes au hasard).

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Méthode non autorisée" }); }
  try {
    const { societe, role, name, pin } = readJsonBody(req);
    const { kv, tenants } = await cols();
    const { tenant, error, status } = await loadTenant(tenants, societe, { autoCreateLegacy: true });
    if (error) return res.status(status).json({ error });

    if (!["admin", "siege", "gerant", "pompiste"].includes(role)) return res.status(400).json({ error: "Profil inconnu." });
    const nom = String(name || "").trim();
    const code = String(pin || "").trim();
    if (!nom) return res.status(400).json({ error: role === "admin" ? "Indiquez votre nom : il apparaîtra dans le journal des saisies." : "Indiquez votre nom d'utilisateur." });
    if (!code) return res.status(400).json({ error: role === "admin" ? "Indiquez le code PIN administrateur." : "Indiquez votre mot de passe." });

    const failKey = keyFor(tenant, `__echecs::${role}::${nom.toLowerCase()}`);
    const fails = await kv.findOne({ _id: failKey });
    if (fails?.value?.lockedUntil && fails.value.lockedUntil > Date.now()) {
      return res.status(429).json({ error: "Trop d'essais incorrects. Réessayez dans 15 minutes." });
    }
    const fail = async (msg) => {
      const count = (fails?.value?.count || 0) + 1;
      const value = count >= MAX_FAILS ? { count: 0, lockedUntil: Date.now() + LOCK_MS } : { count };
      await kv.updateOne({ _id: failKey }, { $set: { value } }, { upsert: true });
      return res.status(401).json({ error: msg });
    };

    let profile;
    if (role === "admin") {
      const doc = await kv.findOne({ _id: keyFor(tenant, ADMIN_PIN_KEY) });
      if (!doc?.value) {
        // Aucun code administrateur encore défini pour cette société : le premier
        // administrateur le crée (normalement, il est fixé à la création de la société).
        if (code.length < 4) return res.status(400).json({ error: "Choisissez un code PIN d'au moins 4 chiffres (première connexion admin)." });
        await kv.updateOne({ _id: keyFor(tenant, ADMIN_PIN_KEY) }, { $set: { value: hashPin(code), updatedAt: new Date().toISOString() } }, { upsert: true });
      } else if (hashPin(code) !== doc.value) {
        return fail("Code PIN administrateur incorrect.");
      }
      profile = { role, stationId: null, pompeId: null, name: nom };
    } else {
      const dbDoc = await kv.findOne({ _id: keyFor(tenant, DB_KEY) });
      let data = {};
      try { data = dbDoc?.value ? JSON.parse(dbDoc.value) : {}; } catch { data = {}; }
      const list = role === "gerant" ? (data.gerants || []) : role === "siege" ? (data.utilisateurs || []) : (data.pompistes || []);
      const h = hashPin(code);
      const acct = list.find((a) => String(a.nom || "").trim().toLowerCase() === nom.toLowerCase() && a.passwordHash === h);
      if (!acct) return fail("Nom ou mot de passe incorrect.");
      // Compte du siège : vue « administrateur » dans l'application (toutes stations), limitée
      // aux modules de son profil ; côté serveur, sa session garde le rôle « siege » et ne
      // donne pas accès au code PIN administrateur.
      profile = role === "gerant"
        ? { role, stationId: acct.stationId, pompeId: acct.pompeId || null, partenaireId: acct.partenaireId || null, name: acct.nom, compteId: acct.id }
        : role === "siege"
          ? { role: "admin", siege: true, stationId: null, pompeId: null, name: acct.nom, compteId: acct.id }
          : { role, stationId: acct.stationId, pompeId: acct.pompeId, name: acct.nom, compteId: acct.id };
    }

    if (fails) await kv.deleteOne({ _id: failKey });
    const token = signSession({ t: tenant._id, role: profile.siege ? "siege" : profile.role, stationId: profile.stationId || null, name: profile.name });
    return res.status(200).json({ token, profile, tenant: publicTenant(tenant) });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
