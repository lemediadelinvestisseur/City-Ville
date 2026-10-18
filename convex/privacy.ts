/**
 * Politique de confidentialité, servie en HTML par la route HTTP
 * GET /confidentialite (voir http.ts). Son adresse publique est celle à
 * renseigner dans App Store Connect.
 */

/** Adresse de contact pour les demandes RGPD (à remplacer avant la publication). */
export const PRIVACY_CONTACT = 'contact@exemple.fr';

/** Date de dernière mise à jour affichée sur la page. */
export const PRIVACY_UPDATED = '18 octobre 2026';

export function privacyHtml(contact = PRIVACY_CONTACT, updated = PRIVACY_UPDATED): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CityVille — Confidentialité</title>
<style>
  :root { color-scheme: light dark; --bg: #f6f8f2; --fg: #1f2a1c; --muted: #5b6b56; --card: #fff; --accent: #2e7d32; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141a13; --fg: #e8eee4; --muted: #a3b19c; --card: #1d251b; --accent: #81c784; } }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 24px 16px 48px; }
  h1 { font-size: 1.7rem; margin: 0 0 4px; }
  h2 { font-size: 1.15rem; margin: 28px 0 8px; color: var(--accent); }
  .muted { color: var(--muted); }
  section { background: var(--card); border-radius: 14px; padding: 4px 18px 12px; margin-top: 16px; }
  ul { padding-left: 20px; }
  a { color: var(--accent); }
</style>
</head>
<body>
<main>
<h1>Politique de confidentialité</h1>
<p class="muted">CityVille — dernière mise à jour : ${updated}</p>

<section>
<h2>En bref</h2>
<ul>
  <li>Pas de publicité, pas de traceur publicitaire, pas de revente de données.</li>
  <li>Aucun e-mail, numéro de téléphone ni nom réel n’est demandé : vous jouez sous un pseudo.</li>
  <li>Vous pouvez supprimer votre compte et toutes vos données à tout moment depuis le jeu.</li>
</ul>
</section>

<section>
<h2>Données collectées</h2>
<ul>
  <li><strong>Profil</strong> : pseudo, nom de votre ville, niveau, expérience et nombre d’habitants (affichés aux autres joueurs dans le classement et la liste de voisins).</li>
  <li><strong>Sauvegarde</strong> : l’état de votre ville, pour la retrouver sur un autre appareil.</li>
  <li><strong>Clé d’appareil</strong> : une clé secrète générée sur votre appareil ; le serveur n’en conserve qu’une empreinte chiffrée. Elle remplace un mot de passe.</li>
  <li><strong>Statistiques de jeu</strong> : début et durée des sessions, plateforme (iOS, web) et évènements de jeu anonymes (niveau atteint, achat de terrain…), pour équilibrer le jeu.</li>
  <li><strong>Fonctions sociales</strong> : vos voisins, l’aide apportée, vos annonces au marché, ainsi que les signalements et blocages que vous effectuez.</li>
  <li><strong>Chat</strong> : les messages que vous publiez dans les salons, visibles des autres joueurs et de la modération. Ils sont supprimés automatiquement après 30 jours.</li>
  <li><strong>Langue</strong> : la langue choisie dans les réglages, pour afficher le jeu et le bon salon de chat.</li>
</ul>
<p>Sur votre appareil, le jeu enregistre aussi une copie locale de la sauvegarde et vos réglages (son, vibrations, mode nuit, rappels). Les rappels sont des notifications locales programmées par l’appareil : aucune donnée n’est envoyée pour cela.</p>
</section>

<section>
<h2>Pourquoi</h2>
<p>Ces données servent uniquement à faire fonctionner le jeu (sauvegarde, voisins, marché, classement), à le modérer et à l’améliorer. La base légale est l’exécution du service que vous utilisez et notre intérêt légitime à prévenir la triche et les abus.</p>
</section>

<section>
<h2>Hébergement et durée de conservation</h2>
<p>Les données sont hébergées par Convex dans l’Union européenne (Irlande, région eu-west-1). Elles sont conservées tant que votre compte existe. Les comptes inactifs depuis plus de deux ans pourront être supprimés.</p>
</section>

<section>
<h2>Achats</h2>
<p>Les achats intégrés éventuels sont traités par Apple ; nous ne recevons jamais vos coordonnées bancaires.</p>
</section>

<section>
<h2>Enfants</h2>
<p>Le jeu ne demande aucune donnée d’identité. Les pseudos et noms de ville sont filtrés, et chaque joueur peut être signalé ou bloqué.</p>
</section>

<section>
<h2>Vos droits</h2>
<p>Conformément au RGPD, vous pouvez accéder à vos données, les rectifier, les supprimer ou vous opposer à leur traitement.</p>
<ul>
  <li><strong>Supprimer votre compte</strong> : Réglages → Compte → « Supprimer mon compte ». Profil, sauvegarde, voisins, annonces et statistiques sont effacés immédiatement.</li>
  <li><strong>Toute autre demande</strong> : écrivez à <a href="mailto:${contact}">${contact}</a> en indiquant votre pseudo.</li>
</ul>
<p>Vous pouvez aussi déposer une réclamation auprès de la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>).</p>
</section>
</main>
</body>
</html>`;
}
