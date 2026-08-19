import { MongoClient } from "mongodb";

// Fonction serverless Vercel : proxy sécurisé entre le site (navigateur) et MongoDB Atlas.
// La chaîne de connexion (MONGODB_URI) contient un mot de passe — elle ne doit JAMAIS être
// exposée au navigateur. En la lisant ici (côté serveur, sans préfixe VITE_), elle reste
// secrète : seul ce fichier, exécuté sur les serveurs de Vercel, y a accès.
//
// Le client web (src/storage.js) appelle cette fonction via /api/kv au lieu de parler à
// MongoDB directement.

const DB_NAME = "smi_gestion";
const COLLECTION = "smi_kv";

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI n'est pas configuré sur le serveur.");
    clientPromise = new MongoClient(uri).connect();
  }
  return clientPromise;
}

export default async function handler(req, res) {
  try {
    const client = await getClient();
    const col = client.db(DB_NAME).collection(COLLECTION);

    if (req.method === "GET") {
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: "key manquant" });
      const doc = await col.findOne({ _id: key });
      if (!doc) return res.status(404).json({ error: "not found" });
      return res.status(200).json({ key, value: doc.value });
    }

    if (req.method === "POST") {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: "key manquant" });
      await col.updateOne({ _id: key }, { $set: { value, updatedAt: new Date().toISOString() } }, { upsert: true });
      return res.status(200).json({ key, value });
    }

    if (req.method === "DELETE") {
      const key = req.query.key;
      if (!key) return res.status(400).json({ error: "key manquant" });
      await col.deleteOne({ _id: key });
      return res.status(200).json({ key, deleted: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Méthode non autorisée" });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
