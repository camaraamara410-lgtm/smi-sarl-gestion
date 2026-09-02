// Service worker minimal : ne met rien en cache pour l'instant (l'application a de toute
// façon besoin du réseau pour parler à la base de données partagée MongoDB via /api/kv).
// Sa seule utilité ici est de satisfaire la condition technique que certains navigateurs
// exigent pour proposer "Ajouter à l'écran d'accueil" / "Installer l'application".
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  // Laisse passer toutes les requêtes normalement (pas de cache).
});
