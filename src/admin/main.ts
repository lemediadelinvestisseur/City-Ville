import './admin.css';
import { ConvexClient } from 'convex/browser';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { LANGUAGES } from '@/data/languages';
import { newDeviceToken } from '@/services/online/Backend';
import { barChart, lineChart } from './charts';
import { demoChat, demoDashboard, demoTeam } from './demo';
import { TARGET_DAYS, type AdminChat, type Dashboard, type Team } from './types';

/**
 * Interface admin. Accès réservé au compte administrateur (rôle « admin »,
 * unique, désigné en ligne de commande : voir convex/roles.ts). On s'y connecte :
 *  - automatiquement dans le navigateur où l'on joue avec ce compte ;
 *  - ou avec un code de transfert (Réglages › Compte du jeu), qui associe ce
 *    navigateur au compte le temps de la session admin.
 */

/** Clé de l'appareil du jeu (même site) et clé propre à une connexion par code. */
const GAME_TOKEN_KEY = 'city-ville:device';
const ADMIN_TOKEN_KEY = 'city-ville:admin-device';
/** Après « Se déconnecter », on n'utilise plus automatiquement la clé du jeu. */
const SKIP_GAME_KEY = 'city-ville:admin-skip-game';

const root = document.getElementById('admin') as HTMLElement;
const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined;
const client = convexUrl ? new ConvexClient(convexUrl) : null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  ...children: Array<Node | string | null>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of children) if (child !== null) node.append(child);
  return node;
}

const pct = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)} %`);
const num = (value: number) => new Intl.NumberFormat('fr-FR').format(Math.round(value));
const dec = (value: number) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(value);
const shortDay = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const languageName = (code: string | null) =>
  code === null || code === '?' ? 'inconnue' : (LANGUAGES.find((l) => l.code === code)?.name ?? code);
function ago(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

function errorText(error: unknown): string {
  const code = error instanceof ConvexError ? String(error.data) : '';
  if (code === 'forbidden') return 'Action refusée (droits insuffisants).';
  if (code === 'notFound') return 'Joueur introuvable.';
  if (code === 'invalidCode') return 'Code invalide ou expiré.';
  if (code === 'invalidText') return 'Message vide ou non autorisé.';
  return 'Erreur : réessayez.';
}

function card(title: string, ...content: Array<Node | string | null>): HTMLElement {
  return el('section', 'card', el('h2', '', title), ...content);
}

function kpi(label: string, value: string, hint = ''): HTMLElement {
  return el(
    'div',
    'kpi',
    el('span', 'kpi__value', value),
    el('span', 'kpi__label', label),
    hint ? el('span', 'kpi__hint', hint) : null,
  );
}

function table(head: string[], rows: Array<Array<Node | string>>): HTMLElement {
  const t = el('table', 'table');
  const tr = el('tr');
  for (const h of head) tr.append(el('th', '', h));
  t.append(el('thead', '', tr));
  const body = el('tbody');
  for (const row of rows) {
    const line = el('tr');
    for (const cell of row) line.append(el('td', '', cell));
    body.append(line);
  }
  t.append(body);
  return el('div', 'table-wrap', t);
}

function heat(value: number | null): HTMLElement {
  const cell = el('span', 'heat', pct(value));
  if (value !== null) cell.style.background = `rgba(47, 127, 209, ${Math.min(1, value * 1.6)})`;
  if (value !== null && value > 0.3) cell.style.color = '#fff';
  return cell;
}

/** Session admin : clé utilisée et son origine. */
interface Session {
  token: string;
  pseudo: string;
  /** Clé créée par un code de transfert (à révoquer à la déconnexion). */
  own: boolean;
}

let days = 30;
let session: Session | null = null;
let stops: Array<() => void> = [];
let latest: { dashboard: Dashboard | null; team: Team; chat: AdminChat } = { dashboard: null, team: [], chat: [] };
const flash = el('p', 'flash');

function notify(text: string, bad = false): void {
  flash.textContent = text;
  flash.classList.toggle('is-bad', bad);
  flash.classList.add('is-on');
  window.setTimeout(() => flash.classList.remove('is-on'), 3500);
}

function render(demo: boolean): void {
  const data = latest.dashboard;
  if (!data) return;
  const token = session?.token ?? '';
  root.replaceChildren();
  const { totals } = data;
  const header = el(
    'header',
    'top',
    el('h1', '', 'City Ville — Tableau de bord'),
    el(
      'span',
      `badge${demo ? ' badge--demo' : ''}`,
      demo
        ? 'Données de démonstration'
        : `Temps réel · ${new Date(data.generatedAt).toLocaleTimeString('fr-FR')} · ${session?.pseudo ?? ''}`,
    ),
  );
  const range = el('div', 'range');
  for (const d of [7, 30, 90]) {
    const b = el('button', d === days ? 'is-active' : '', `${d} jours`);
    b.addEventListener('click', () => {
      days = d;
      if (session) start(session);
      else startDemo();
    });
    range.append(b);
  }
  if (!demo) {
    const out = el('button', 'logout', 'Se déconnecter');
    out.addEventListener('click', () => void logout());
    range.append(out);
  }
  header.append(range);

  const kpis = el(
    'div',
    'kpis',
    kpi('Joueurs inscrits', num(totals.players), `+${num(totals.newToday)} aujourd’hui`),
    kpi('Actifs aujourd’hui', num(totals.dau), `${num(totals.wau)} sur 7 j · ${num(totals.mau)} sur 30 j`),
    kpi('Retour le lendemain (J1)', pct(totals.retentionD1), 'objectif : 40 %'),
    kpi('Retour à 7 jours (J7)', pct(totals.retentionD7), 'objectif : 15 %'),
    kpi('Retour à 30 jours (J30)', pct(totals.retentionD30), 'objectif : 6 %'),
    kpi('Durée moyenne d’une session', `${dec(totals.avgSessionMin)} min`),
    kpi('Sessions par joueur et par jour', dec(totals.sessionsPerActiveDay)),
    kpi('Messages du chat aujourd’hui', num(data.chat.messagesToday), `${num(data.chat.authorsToday)} auteurs`),
  );

  const labels = data.daily.map((d) => shortDay(d.day));
  const activity = card(
    'Joueurs par jour',
    el('div', 'legend', el('span', 'dot dot--blue', 'Actifs'), el('span', 'dot dot--green', 'Nouveaux')),
    barChart(labels, [
      { label: 'Actifs', color: '#2f7fd1', values: data.daily.map((d) => d.activePlayers) },
      { label: 'Nouveaux', color: '#43a047', values: data.daily.map((d) => d.newPlayers) },
    ]),
  );
  const playtime = card(
    'Temps de jeu moyen par joueur actif (min / jour)',
    lineChart(
      labels,
      data.daily.map((d) => d.avgPlayMinPerActive),
      '#f57c00',
    ),
  );

  const cohorts = card(
    'Rétention par date d’inscription',
    el('p', 'muted', 'Part des joueurs inscrits ce jour-là qui reviennent 1, 3, 7, 14 et 30 jours après.'),
    table(
      ['Inscription', 'Joueurs', 'J1', 'J3', 'J7', 'J14', 'J30'],
      [...data.cohorts]
        .reverse()
        .map((c) => [shortDay(c.day), num(c.size), heat(c.d1), heat(c.d3), heat(c.d7), heat(c.d14), heat(c.d30)]),
    ),
  );

  const levels = card(
    'Répartition des niveaux',
    barChart(
      data.levelDistribution.map((l) => `N${l.level}`),
      [{ label: 'Joueurs', color: '#8e24aa', values: data.levelDistribution.map((l) => l.count) }],
      140,
    ),
  );
  const pace = card(
    'Rythme de progression',
    el(
      'p',
      'muted',
      'Médiane des jours nécessaires pour atteindre un niveau, comparée à l’objectif (≈ 3 semaines pour le niveau 30).',
    ),
    table(
      ['Niveau', 'Joueurs', 'Médiane réelle', 'Objectif'],
      data.levelPace
        .filter((p) => p.level % 5 === 0 || p.level <= 5)
        .map((p) => [
          String(p.level),
          num(p.players),
          `${dec(p.medianDays)} j`,
          TARGET_DAYS[p.level] ? `${dec(TARGET_DAYS[p.level] ?? 0)} j` : '—',
        ]),
    ),
  );
  const funnel = card(
    'Objectifs du tutoriel (entonnoir)',
    el(
      'p',
      'muted',
      'Part des nouveaux joueurs de la période ayant terminé chaque objectif : repère où les gens décrochent.',
    ),
    el(
      'div',
      'funnel',
      ...data.questFunnel.map((q) => {
        const bar = el('span', 'funnel__bar');
        bar.style.width = `${Math.min(100, q.ratio * 100)}%`;
        return el(
          'div',
          'funnel__row',
          el('span', 'funnel__label', q.title),
          el('span', 'funnel__track', bar),
          el('span', 'funnel__value', pct(q.ratio)),
        );
      }),
    ),
  );
  const platforms = card(
    'Plateformes (sessions)',
    table(
      ['Plateforme', 'Sessions'],
      [...data.platforms].sort((a, b) => b.count - a.count).map((p) => [p.platform, num(p.count)]),
    ),
  );
  const languages = card(
    'Langues des joueurs',
    table(
      ['Langue', 'Joueurs'],
      data.languages.map((l) => [languageName(l.language), num(l.count)]),
    ),
  );

  const action = (label: string, run: () => Promise<unknown>, danger = false) => {
    const b = el('button', `mini${danger ? ' mini--danger' : ''}`, label);
    b.disabled = demo;
    b.addEventListener('click', () => {
      b.disabled = true;
      void run()
        .catch((e: unknown) => notify(errorText(e), true))
        .finally(() => {
          b.disabled = false;
        });
    });
    return b;
  };
  const mutate = client ?? null;
  const recent = card(
    'Derniers joueurs connectés',
    table(
      ['Pseudo', 'Niveau', 'Habitants', 'Langue', 'Inscrit', 'Vu', 'Jours actifs', ''],
      data.recentPlayers.map((p) => [
        el(
          'span',
          p.suspicious ? 'flag' : '',
          `${p.pseudo}${p.role === 'admin' ? ' ★' : p.role === 'moderator' ? ' (modo)' : ''}${p.suspicious ? ' ⚠' : ''}${p.banned ? ' (banni)' : ''}`,
        ),
        String(p.level),
        num(p.population),
        languageName(p.language),
        ago(p.createdAt),
        ago(p.lastSeenAt),
        String(p.activeDays),
        p.role === 'admin'
          ? ''
          : action(
              p.banned ? 'Débannir' : 'Bannir',
              async () =>
                mutate?.mutation(api.admin.setBanned, { token, playerId: p.id as Id<'players'>, banned: !p.banned }),
              !p.banned,
            ),
      ]),
    ),
    el(
      'p',
      'muted',
      '★ : administrateur · ⚠ : progression invraisemblable détectée dans une sauvegarde (triche possible).',
    ),
  );
  const reports = card(
    `Signalements à traiter (${data.reports.length})`,
    data.reports.length
      ? table(
          ['Signalé', 'Par', 'Motif', 'Quand', ''],
          data.reports.map((r) => {
            const actions = el(
              'span',
              'actions',
              action('Classer', async () =>
                mutate?.mutation(api.admin.resolveReport, { token, reportId: r.id as Id<'reports'> }),
              ),
              r.messageId
                ? action('Supprimer le message', async () => {
                    await mutate?.mutation(api.chat.remove, {
                      token,
                      messageId: r.messageId as Id<'chatMessages'>,
                    });
                    await mutate?.mutation(api.admin.resolveReport, { token, reportId: r.id as Id<'reports'> });
                  })
                : action('Réinitialiser le pseudo', async () =>
                    mutate?.mutation(api.admin.resetPseudo, { token, playerId: r.targetId as Id<'players'> }),
                  ),
              action(
                'Bannir',
                async () =>
                  mutate?.mutation(api.admin.setBanned, { token, playerId: r.targetId as Id<'players'>, banned: true }),
                true,
              ),
            );
            return [r.target, r.reporter, r.reason, ago(r.createdAt), actions];
          }),
        )
      : el('p', 'muted', 'Aucun signalement en attente.'),
  );

  // ——— Annonce à tous les joueurs ———
  const text = el('textarea', 'field');
  text.maxLength = 200;
  text.rows = 3;
  text.placeholder = 'Ex. : Nouvelle mise à jour ce soir à 20 h : le port industriel arrive !';
  const target = el('select', 'field');
  target.append(el('option', '', 'Tous les joueurs (salon Monde)'));
  target.options[0]!.value = '';
  for (const l of LANGUAGES) {
    const option = el('option', '', `Joueurs en ${l.name}`);
    option.value = l.code;
    target.append(option);
  }
  const send = action('Envoyer l’annonce', async () => {
    if (!text.value.trim()) return;
    await mutate?.mutation(api.admin.announce, {
      token,
      text: text.value,
      ...(target.value ? { language: target.value } : {}),
    });
    text.value = '';
    notify('Annonce envoyée : elle s’affiche en fenêtre chez les joueurs concernés.');
  });
  const announce = card(
    'Annonce aux joueurs',
    el(
      'p',
      'muted',
      'Affichée en fenêtre à chaque joueur concerné (tout de suite s’il joue, sinon à sa prochaine visite), rangée dans ses notifications et mise en avant dans le chat. 200 caractères maximum.',
    ),
    el('div', 'form', text, target, send),
  );

  // ——— Équipe de modération ———
  const pseudo = el('input', 'field');
  pseudo.placeholder = 'Pseudo du futur modérateur';
  const addModerator = action('Nommer modérateur', async () => {
    if (!pseudo.value.trim()) return;
    const result = await mutate?.mutation(api.roles.setModerator, { token, pseudo: pseudo.value, moderator: true });
    pseudo.value = '';
    if (result) notify(`${result.pseudo} est maintenant modérateur.`);
  });
  const team = card(
    'Équipe',
    el(
      'p',
      'muted',
      'Les modérateurs peuvent supprimer des messages du chat et rendre un joueur muet, depuis le jeu. Ils n’ont accès ni à cette interface ni aux données. Le rôle d’administrateur ne se donne qu’en ligne de commande (voir docs/MISE_EN_LIGNE.md).',
    ),
    table(
      ['Pseudo', 'Rôle', 'Vu', ''],
      latest.team.map((m) => [
        m.pseudo,
        m.role === 'admin' ? 'Administrateur' : 'Modérateur',
        ago(m.lastSeenAt),
        m.role === 'moderator'
          ? action(
              'Retirer',
              async () => mutate?.mutation(api.roles.setModerator, { token, pseudo: m.pseudo, moderator: false }),
              true,
            )
          : '',
      ]),
    ),
    el('div', 'form form--inline', pseudo, addModerator),
  );

  // ——— Modération du chat ———
  const chat = card(
    'Chat : derniers messages',
    latest.chat.length
      ? table(
          ['Salon', 'Pseudo', 'Message', 'Quand', ''],
          latest.chat.map((m) => [
            m.channel === 'world' ? 'Monde' : languageName(m.channel.slice(5)),
            `${m.pseudo}${m.kind === 'announcement' ? ' (annonce)' : ''}`,
            el('span', m.deleted ? 'deleted' : '', m.text),
            ago(m.createdAt),
            m.deleted
              ? 'supprimé'
              : el(
                  'span',
                  'actions',
                  action(
                    'Supprimer',
                    async () => mutate?.mutation(api.chat.remove, { token, messageId: m.id as Id<'chatMessages'> }),
                    true,
                  ),
                  m.kind === 'message' && !m.role
                    ? action('Muet 24 h', async () =>
                        mutate?.mutation(api.chat.mute, {
                          token,
                          playerId: m.playerId as Id<'players'>,
                          minutes: 1440,
                        }),
                      )
                    : null,
                ),
          ]),
        )
      : el('p', 'muted', 'Aucun message pour le moment.'),
  );

  root.append(
    header,
    flash,
    kpis,
    el('div', 'grid', activity, playtime),
    cohorts,
    el('div', 'grid', levels, pace),
    el('div', 'grid', funnel, el('div', 'stack', platforms, languages)),
    el('div', 'grid', announce, team),
    chat,
    recent,
    reports,
  );
}

function stop(): void {
  for (const unsubscribe of stops) unsubscribe();
  stops = [];
}

function startDemo(): void {
  stop();
  latest = { dashboard: demoDashboard(days), team: demoTeam(), chat: demoChat() };
  render(true);
}

/** Abonnements temps réel : le tableau se met à jour tout seul. */
function start(current: Session): void {
  stop();
  if (!client) return;
  session = current;
  root.replaceChildren(el('p', 'loading', 'Chargement…'));
  const { token } = current;
  const refused = () => {
    stop();
    void logout('Accès refusé : ce compte n’est pas (ou plus) l’administrateur.');
  };
  stops.push(
    client.onUpdate(
      api.admin.dashboard,
      { token, days },
      (data) => {
        latest.dashboard = data;
        render(false);
      },
      refused,
    ),
    client.onUpdate(
      api.roles.team,
      { token },
      (team) => {
        latest.team = team;
        render(false);
      },
      () => undefined,
    ),
    client.onUpdate(
      api.admin.recentChat,
      { token },
      (chat) => {
        latest.chat = chat;
        render(false);
      },
      () => undefined,
    ),
  );
}

async function logout(error = ''): Promise<void> {
  stop();
  const current = session;
  session = null;
  latest = { dashboard: null, team: [], chat: [] };
  if (current?.own) {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    await client?.mutation(api.players.logout, { token: current.token }).catch(() => undefined);
  } else {
    // Clé du jeu : on la laisse au jeu, mais on ne s'en sert plus ici.
    sessionStorage.setItem(SKIP_GAME_KEY, '1');
  }
  login(error);
}

/** Vérifie qu'une clé appartient bien à l'administrateur, puis ouvre le tableau de bord. */
async function tryToken(token: string, own: boolean): Promise<boolean> {
  if (!client) return false;
  try {
    const me = await client.query(api.admin.whoami, { token });
    start({ token, pseudo: me.pseudo, own });
    return true;
  } catch {
    return false;
  }
}

function login(error = ''): void {
  root.replaceChildren();
  const input = el('input', 'login__input');
  input.placeholder = 'ABCD-EFGH-JKLM';
  input.autocomplete = 'one-time-code';
  input.maxLength = 14;
  const button = el('button', 'login__btn', 'Se connecter');
  const message = el('p', 'login__error', error);
  const form = el(
    'form',
    'login',
    el('h1', '', 'City Ville — Admin'),
    el(
      'p',
      'muted',
      'Réservé au compte administrateur. Ouvrez cette page dans le navigateur où vous jouez avec ce compte, ou saisissez un code de transfert (dans le jeu : Réglages › Compte › Code de transfert).',
    ),
    input,
    button,
    message,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const code = input.value.trim();
    if (!code || !client) return;
    button.disabled = true;
    message.textContent = '';
    const token = newDeviceToken();
    client
      .mutation(api.players.redeemTransferCode, { code, token, platform: 'admin' })
      .then(async () => {
        if (await tryToken(token, true)) {
          localStorage.setItem(ADMIN_TOKEN_KEY, token);
          sessionStorage.removeItem(SKIP_GAME_KEY);
          return;
        }
        // Pas l'administrateur : la clé créée par le code est aussitôt révoquée.
        await client.mutation(api.players.logout, { token }).catch(() => undefined);
        message.textContent = 'Ce compte n’est pas l’administrateur.';
      })
      .catch((e: unknown) => {
        message.textContent = errorText(e);
      })
      .finally(() => {
        button.disabled = false;
      });
  });
  root.append(form);
  input.focus();
}

async function boot(): Promise<void> {
  if (!client) {
    startDemo();
    return;
  }
  root.replaceChildren(el('p', 'loading', 'Connexion…'));
  const own = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (own && (await tryToken(own, true))) return;
  if (own) localStorage.removeItem(ADMIN_TOKEN_KEY);
  const game = sessionStorage.getItem(SKIP_GAME_KEY) ? null : localStorage.getItem(GAME_TOKEN_KEY);
  if (game && (await tryToken(game, false))) return;
  login(game ? 'Le compte de ce navigateur n’est pas l’administrateur.' : '');
}

void boot();
