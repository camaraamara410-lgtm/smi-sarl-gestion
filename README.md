# Gestion StationPro

Application web de gestion de réseaux de stations-service : relevés de pompes, ventes,
stock, réceptions, caisse, versements, bons, rapports journaliers, hebdomadaires et
mensuels.

Une seule application, partagée par plusieurs **sociétés clientes**. Chaque société a son
code, ses données et ses utilisateurs (administrateur, gérants, pompistes). Une société
ne voit jamais les données d'une autre : le serveur le vérifie à chaque appel.

```
Téléphone → site (Vercel) → api/login.js, api/kv.js, api/superadmin.js (Vercel) → MongoDB Atlas
```

## Variables Vercel (Project Settings → Environment Variables)

| Variable | Rôle |
|---|---|
| `MONGODB_URI` | Connexion à MongoDB Atlas (déjà en place). |
| `SESSION_SECRET` | Clé secrète des sessions : longue chaîne aléatoire, 20 caractères minimum. |
| `SUPERADMIN_PASSWORD` | Mot de passe de l'espace propriétaire, 10 caractères minimum. |
| `LEGACY_TENANT_CODE` | Facultatif. Code de la société historique (`smi` par défaut). |
| `LEGACY_TENANT_NAME` | Facultatif. Son nom affiché (`SMI SARL` par défaut). |

`APP_TOKEN` et `VITE_APP_TOKEN` ne servent plus et peuvent être supprimées.
Après avoir ajouté ou modifié une variable, relancez un déploiement (Deployments → ⋯ → Redeploy).

## Connexion

- **Sociétés clientes** : adresse de l'application → code société, profil, nom, code.
- **Espace propriétaire** : adresse de l'application suivie de `#proprietaire`
  (ex. `https://mon-appli.vercel.app/#proprietaire`) → créer une société, la suspendre,
  la réactiver, prolonger l'abonnement, changer son code PIN administrateur.

La société historique (`smi`) garde ses données et son code PIN existants : elle est
créée automatiquement à sa première connexion.

## Sécurité

- Connexion vérifiée par le serveur ; session signée, valable 30 jours, propre à chaque appareil.
- Après 5 essais de code incorrects, le compte est bloqué 15 minutes.
- Abonnement expiré ou société suspendue : accès refusé, déconnexion immédiate.

## Développement local

```bash
npm install
cp .env.example .env   # puis renseignez les valeurs
npx vercel dev
```
