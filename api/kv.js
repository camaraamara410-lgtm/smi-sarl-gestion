import { cols, loadTenant, keyFor, verifySession, bearer, readJsonBody, ADMIN_PIN_KEY } from "./_lib.js";

// Fonction serveur : lecture / écriture des données d'UNE société.
// Chaque appel doit porter la session délivrée par /api/login. Le serveur en déduit la
// société et préfixe lui-même la clé : impossible d'atteindre les données d'une autre
// société, même en modifiant l'application dans le navigateur.
// La chaîne MONGODB_URI reste côté serveur (jamais envoyée au navigateur).

export default async function handler(req, res) {
  try {
    const session = verifySession(bearer(req));
    if (!session) return res.status(401).json({ error: "Session expirée. Reconnectez-vous." });

    const { kv, tenants } = await cols();
    const { tenant, error, status } = await loadTenant(tenants, session.t);
    if (error) return res.status(status === 404 ? 401 : status).json({ error });

    const body = req.method === "POST" ? readJsonBody(req) : {};
    const key = req.method === "POST" ? body.key : req.query.key;
    if (!key || typeof key !== "string") return res.status(400).json({ error: "key manquant" });
    if (key.startsWith("__")) return res.status(403).json({ error: "Clé réservée." });
    if (key === ADMIN_PIN_KEY && session.role !== "admin") return res.status(403).json({ error: "Réservé à l'administrateur." });

    const id = keyFor(tenant, key);

    if (req.method === "GET") {
      const doc = await kv.findOne({ _id: id });
      if (!doc) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ key, value: doc.value });
    }

    if (req.method === "POST") {
      await kv.updateOne({ _id: id }, { $set: { value: body.value, updatedAt: new Date().toISOString(), updatedBy: session.name || null } }, { upsert: true });
      return res.status(200).json({ key, value: body.value });
    }

    if (req.method === "DELETE") {
      if (session.role !== "admin") return res.status(403).json({ error: "Réservé à l'administrateur." });
      await kv.deleteOne({ _id: id });
      return res.status(200).json({ key, deleted: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
