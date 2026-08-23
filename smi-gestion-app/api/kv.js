import { MongoClient } from "mongodb";

// Fonction serverless Vercel : proxy sécurisé entre le site (navigateur) et MongoDB Atlas.
// La chaîne de connexion (MONGODB_URI) contient un mot de passe — elle ne doit JAMAIS être
// exposée au navigateur. En la lisant ici (côté serveur, sans préfixe VITE_), elle reste
// secrète : seul ce fichier, exécuté sur les serveurs de Vercel, y a accès.
//
// Le client web (src/storage.js) appelle cette fonction via /api/kv au lieu de parler à
// MongoDB directement.
//
// Protection par jeton d'application (APP_TOKEN) : sans ce jeton dans l'en-tête de chaque
// requête, l'API refuse de répondre. Ça bloque tout robot ou visiteur qui tomberait
// simplement sur l'adresse de l'API sans jamais avoir chargé l'application elle-même.
// Honnêteté sur la limite : ce jeton est inclus dans le code JavaScript envoyé au
// navigateur (nécessaire pour que l'app puisse l'utiliser) — une personne qui inspecte
// délibérément ce code peut donc le retrouver. Ce n'est pas une authentification
// utilisateur réelle, mais ça relève sérieusement la barrière par rapport à une API
// totalement ouverte, et bloque l'immense majorité des accès non désirés.

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
  const expectedToken = process.env.APP_TOKEN;
  if (expectedToken) {
    const provided = req.headers["x-app-token"];
    if (provided !== expectedToken) {
      return res.status(401).json({ error: "Non autorisé." });
    }
  }
  // Si APP_TOKEN n'est pas configuré côté serveur, l'API reste ouverte (comportement
  // précédent) — ça évite de casser l'application si la variable n'a pas encore été
  // ajoutée, mais la protection ne s'active réellement qu'une fois APP_TOKEN défini
  // sur Vercel (voir README).

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
