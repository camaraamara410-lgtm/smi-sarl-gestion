# SMI SARL — Gestion réseau stations-service

Application de gestion pour un réseau de stations-service (relevés de pompes, ventes, stock,
caisse, rapport mensuel), avec accès par code PIN (administrateur + par station) et journal
d'audit des saisies.

Vraie application web déployable pour un usage en équipe sur n'importe quel appareil — les
données sont stockées dans une vraie base de données partagée (MongoDB Atlas), accessible à
toute l'équipe en même temps, **sans compte requis pour les utilisateurs**, et **sans carte
bancaire nécessaire pour vous** à la création.

---

## Comment ça marche (en bref)

Le site web (ce que voit l'utilisateur) ne parle jamais directement à la base de données —
il passe par une petite fonction qui tourne sur les serveurs de Vercel (`api/kv.js`), qui
elle seule connaît le mot de passe de la base. C'est plus sûr, et ça évite d'exposer une clé
d'accès dans le code visible par les visiteurs.

```
Téléphone du gérant → site web (Vercel) → api/kv.js (Vercel) → MongoDB Atlas
```

---

## 1. Créer la base de données (MongoDB Atlas — gratuit, sans carte bancaire)

1. Allez sur [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
   et créez un compte (email ou Google). Aucune carte n'est demandée.
2. Au moment de créer votre premier cluster, choisissez l'option gratuite **M0** (parfois
   affichée comme "Free" ou "Shared"). Choisissez une région proche de vous.
3. Créez un **utilisateur de base de données** : Atlas vous le demande normalement pendant la
   création du cluster (nom d'utilisateur + mot de passe — notez-les précieusement).
4. Dans **Network Access** (menu de gauche), cliquez **Add IP Address** > **Allow Access from
   Anywhere** (`0.0.0.0/0`). C'est nécessaire car Vercel n'a pas d'adresse IP fixe.
5. Une fois le cluster créé (1-3 minutes), cliquez **Connect** > **Drivers**. Copiez la
   chaîne de connexion affichée (elle ressemble à
   `mongodb+srv://utilisateur:<password>@cluster0.xxxxx.mongodb.net/...`).
6. Remplacez `<password>` dans cette chaîne par le mot de passe noté à l'étape 3. Gardez
   cette chaîne complète de côté — c'est votre `MONGODB_URI`, utilisée à l'étape 3 ci-dessous.

---

## 2. Tester en local (optionnel mais recommandé avant de déployer)

Prérequis : [Node.js](https://nodejs.org) version 18 ou plus.

Pour tester avec la fonction serveur incluse (`api/kv.js`), le plus simple est d'utiliser la
CLI Vercel plutôt que `npm run dev` seul (qui ne lance pas les fonctions `/api`) :

```bash
npm install -g vercel
npm install
cp .env.example .env
# Ouvrez .env et collez votre MONGODB_URI (étape 1.6)
vercel dev
```

Ouvrez l'adresse affichée. Créez votre code PIN administrateur pour vérifier que tout
fonctionne, puis créez une station de test — vérifiez dans MongoDB Atlas > Browse Collections
que les données apparaissent dans `smi_gestion.smi_kv`.

---

## 3. Déployer sur Vercel (gratuit, sans carte bancaire non plus)

### Option A — via l'interface Vercel (la plus simple, sans ligne de commande)

1. Mettez ce projet sur GitHub :
   - Créez un dépôt vide sur [github.com/new](https://github.com/new)
   - Depuis le dossier du projet :
     ```bash
     git init
     git add .
     git commit -m "Première version"
     git branch -M main
     git remote add origin <URL_DE_VOTRE_DEPOT_GITHUB>
     git push -u origin main
     ```
2. Allez sur [vercel.com](https://vercel.com), connectez-vous avec votre compte GitHub.
3. **Add New** > **Project** > sélectionnez le dépôt que vous venez de créer.
4. Vercel détecte automatiquement Vite + les fonctions dans `api/` — ne changez rien aux
   réglages de build.
5. Avant de cliquer "Deploy", ouvrez la section **Environment Variables** et ajoutez :
   - `MONGODB_URI` → la chaîne de connexion complète (étape 1.6)
6. Cliquez **Deploy**. Après 1-2 minutes, Vercel vous donne un lien du type
   `https://smi-sarl-gestion.vercel.app` — c'est le lien à partager avec votre équipe.

### Option B — via la ligne de commande

```bash
vercel login
vercel                 # suit les instructions
vercel env add MONGODB_URI production
vercel --prod
```

---

## 4. Après le déploiement

- **Premier accès** : ouvrez le lien, choisissez "Administrateur", entrez votre nom et créez
  votre code PIN (4 chiffres minimum).
- **Créer les stations** : depuis l'onglet Stations, ajoutez chaque station du réseau, avec
  éventuellement un code PIN propre à chaque station pour les gérants.
- **Accès des gérants** : chaque gérant ouvre le même lien, choisit "Gérant", sa station, et
  le code PIN de la station — aucun compte n'est nécessaire pour eux, seulement le lien.
- **Mettre à jour l'application plus tard** : modifiez le code, `git push` — Vercel redéploie
  automatiquement.

---

## Limites à connaître

- **Sécurité des codes PIN** : hachés avant stockage, mais protection légère (pas de session
  serveur, pas de blocage après essais répétés). Suffisant pour éviter les accès accidentels
  entre postes d'une équipe de confiance ; pas une sécurité de niveau bancaire.
- **Accès à la fonction serveur** : `api/kv.js` n'a aucune vérification d'identité au-delà des
  codes PIN gérés par l'application elle-même — n'importe qui connaissant l'adresse de votre
  site peut appeler cette API. Adapté à un usage d'équipe restreinte ; pas une sécurité
  renforcée au niveau infrastructure.
- **Quota gratuit MongoDB M0** : 512 Mo de stockage — largement suffisant pour des années de
  relevés/ventes/stock/caisse d'un réseau de quelques stations.
- **Sauvegardes** : pensez aux exports CSV réguliers (bouton dans Rapport mensuel) pour garder
  une copie de vos données en dehors de l'application.

---

## Structure du projet

```
src/
  App.jsx           → toute l'application (interface + logique métier)
  storage.js         → couche de stockage (appelle /api/kv)
  main.jsx, index.css → point d'entrée React / styles de base
api/
  kv.js              → fonction serveur Vercel : lit/écrit dans MongoDB Atlas
.env.example           → modèle de la variable d'environnement à renseigner
```
