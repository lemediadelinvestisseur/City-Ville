import './admin.css';
import { ConvexClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { barChart, lineChart } from './charts';
import { demoDashboard } from './demo';
import { TARGET_DAYS, type Dashboard } from './types';

const KEY_STORAGE = 'city-ville:admin-key';
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
function ago(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
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

let days = 30;
let unsubscribe: (() => void) | null = null;

function render(data: Dashboard, key: string, demo: boolean): void {
  root.replaceChildren();
  const { totals } = data;
  const header = el(
    'header',
    'top',
    el('h1', '', 'City Ville — Tableau de bord'),
    el(
      'span',
      `badge${demo ? ' badge--demo' : ''}`,
      demo ? 'Données de démonstration' : `Temps réel · ${new Date(data.generatedAt).toLocaleTimeString('fr-FR')}`,
    ),
  );
  const range = el('div', 'range');
  for (const d of [7, 30, 90]) {
    const b = el('button', d === days ? 'is-active' : '', `${d} jours`);
    b.addEventListener('click', () => {
      days = d;
      start(key);
    });
    range.append(b);
  }
  if (!demo) {
    const out = el('button', 'logout', 'Se déconnecter');
    out.addEventListener('click', () => {
      sessionStorage.removeItem(KEY_STORAGE);
      unsubscribe?.();
      login();
    });
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
      data.platforms.sort((a, b) => b.count - a.count).map((p) => [p.platform, num(p.count)]),
    ),
  );

  const action = (label: string, run: () => Promise<unknown>, danger = false) => {
    const b = el('button', `mini${danger ? ' mini--danger' : ''}`, label);
    b.disabled = demo;
    b.addEventListener('click', () => {
      b.disabled = true;
      void run().finally(() => {
        b.disabled = false;
      });
    });
    return b;
  };
  /** Bascule « testeur » : outils de test et boutique visibles dans le jeu pour ce compte. */
  const testerButton = (id: string, tester: boolean) =>
    action(
      tester ? 'Testeur ✓' : 'Rendre testeur',
      () =>
        client?.mutation(api.admin.setTester, { key, playerId: id as Id<'players'>, tester: !tester }) ??
        Promise.resolve(),
    );
  const searchInput = el('input', 'login__input');
  searchInput.placeholder = 'Pseudo…';
  const searchResults = el('div');
  searchInput.addEventListener('input', () => {
    const text = searchInput.value;
    if (!client || text.trim().length < 2) {
      searchResults.replaceChildren();
      return;
    }
    void client.query(api.admin.findPlayers, { key, text }).then((players) => {
      searchResults.replaceChildren(
        table(
          ['Pseudo', 'Niveau', 'Testeur'],
          players.map((p) => [p.pseudo, String(p.level), testerButton(p.id, p.tester)]),
        ),
      );
    });
  });
  const search = card(
    'Trouver un joueur',
    el(
      'p',
      'muted',
      'Le compte « testeur » voit la boutique (paiements simulés) et les outils de test. Active-le sur ton propre compte uniquement.',
    ),
    searchInput,
    searchResults,
  );
  const recent = card(
    'Derniers joueurs connectés',
    table(
      ['Pseudo', 'Niveau', 'Habitants', 'Inscrit', 'Vu', 'Jours actifs', 'Testeur', ''],
      data.recentPlayers.map((p) => [
        el('span', p.suspicious ? 'flag' : '', `${p.pseudo}${p.suspicious ? ' ⚠' : ''}${p.banned ? ' (banni)' : ''}`),
        String(p.level),
        num(p.population),
        ago(p.createdAt),
        ago(p.lastSeenAt),
        String(p.activeDays),
        testerButton(p.id, p.tester),
        action(
          p.banned ? 'Débannir' : 'Bannir',
          () =>
            client?.mutation(api.admin.setBanned, { key, playerId: p.id as Id<'players'>, banned: !p.banned }) ??
            Promise.resolve(),
          !p.banned,
        ),
      ]),
    ),
    el('p', 'muted', '⚠ : progression invraisemblable détectée dans une sauvegarde (triche possible).'),
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
              action(
                'Classer',
                () =>
                  client?.mutation(api.admin.resolveReport, { key, reportId: r.id as Id<'reports'> }) ??
                  Promise.resolve(),
              ),
              action(
                'Réinitialiser le pseudo',
                () =>
                  client?.mutation(api.admin.resetPseudo, { key, playerId: r.targetId as Id<'players'> }) ??
                  Promise.resolve(),
              ),
              action(
                'Bannir',
                () =>
                  client?.mutation(api.admin.setBanned, { key, playerId: r.targetId as Id<'players'>, banned: true }) ??
                  Promise.resolve(),
                true,
              ),
            );
            return [r.target, r.reporter, r.reason, ago(r.createdAt), actions];
          }),
        )
      : el('p', 'muted', 'Aucun signalement en attente.'),
  );

  root.append(
    header,
    kpis,
    el('div', 'grid', activity, playtime),
    cohorts,
    el('div', 'grid', levels, pace),
    el('div', 'grid', funnel, platforms),
    search,
    recent,
    reports,
  );
}

function start(key: string): void {
  unsubscribe?.();
  if (!client) {
    render(demoDashboard(days), key, true);
    return;
  }
  root.replaceChildren(el('p', 'loading', 'Chargement…'));
  // Abonnement temps réel : le tableau se met à jour tout seul.
  unsubscribe = client.onUpdate(
    api.admin.dashboard,
    { key, days },
    (data) => {
      sessionStorage.setItem(KEY_STORAGE, key);
      render(data, key, false);
    },
    () => {
      sessionStorage.removeItem(KEY_STORAGE);
      login('Clé admin refusée.');
    },
  );
}

function login(error = ''): void {
  root.replaceChildren();
  const input = el('input', 'login__input');
  input.type = 'password';
  input.placeholder = 'Clé admin';
  input.autocomplete = 'current-password';
  const button = el('button', 'login__btn', 'Entrer');
  const form = el(
    'form',
    'login',
    el('h1', '', 'City Ville — Admin'),
    el('p', 'muted', 'Saisissez la clé ADMIN_KEY définie dans les variables d’environnement Convex.'),
    input,
    button,
    error ? el('p', 'login__error', error) : null,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (input.value.trim()) start(input.value.trim());
  });
  root.append(form);
  input.focus();
}

const saved = sessionStorage.getItem(KEY_STORAGE);
if (!client) start('');
else if (saved) start(saved);
else login();
