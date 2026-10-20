import type { AppContext } from '@/app/context';
import { PSEUDO_MAX, validatePseudo } from '@/core/pseudo';
import type { Reward } from '@/core/types';
import { formatList, language, t, type Language } from '@/i18n';
import { isNativeApp } from '@/services/native';
import type { Backend, Me, Profile, Visit } from '@/services/online/Backend';
import { h, icon, rich } from './dom';
import { formatDuration, formatNumber } from './format';
import { rewardChips } from './DailyPanel';
import { itemChip, itemEmoji } from './items';
import { itemName } from '@/i18n/content';
import { producibleItems } from '@/core/orders';
import { SOCIAL, communityReward } from '@/data/social';
import { Icons } from './icons';
import { MarketView } from './MarketView';
import { backendErrorMessage, pseudoErrorMessage } from './messages';
import type { Modals } from './Modals';
import { NeighborsPanel } from './NeighborsPanel';
import type { Notices } from './Notices';
import { languageName, showLanguagePicker, showPseudoForm } from './Onboarding';
import type { Toasts } from './Toasts';
import { VisitBar } from './VisitBar';

/** Ce que l'application fournit à l'interface sociale. */
export interface SocialOptions {
  backend: Backend;
  /** Démarre la synchronisation en ligne (une fois le joueur identifié). */
  startSync: () => void;
  /** Affiche la ville d'un autre joueur à la place de la sienne. */
  openVisit: (visit: Visit) => void;
  closeVisit: () => void;
  /** Récupère une ville par code de transfert (remplace la partie locale). */
  redeemTransfer: (code: string) => Promise<void>;
  /** Après suppression du compte : efface la partie locale et redémarre. */
  wipeLocal: () => void;
  /** Change la langue du jeu (enregistre le choix puis recharge si besoin). */
  setLanguage: (code: Language) => void;
}

interface Deps {
  ctx: AppContext;
  modals: Modals;
  toasts: Toasts;
  social: SocialOptions;
  notices: () => Notices;
  /** À appeler quand un panneau s'ouvre ou se ferme (barre d'actions). */
  onLayoutChange: () => void;
  closeTransient: () => void;
}

/** Interface sociale : inscription, voisins, visites, compte. */
export class SocialUi {
  readonly panel: NeighborsPanel;
  readonly visitBar: VisitBar;
  readonly edgePill: HTMLButtonElement;
  private visiting: Visit | null = null;
  private loadingVisit = false;
  private readonly market: MarketView;
  /** Récoltes pas encore envoyées au défi de quartier. */
  private pendingHarvests = 0;
  /** Profil du joueur connecté (rôle compris), connu après le premier appel au serveur. */
  me: Me | null = null;

  constructor(private readonly deps: Deps) {
    const { social, toasts } = deps;
    this.panel = new NeighborsPanel(social.backend, {
      visit: (profile) => void this.visit(profile),
      help: (profile) => this.help(profile),
      toast: (text, kind) => toasts.show(text, kind),
      onToggle: () => deps.onLayoutChange(),
      market: () => this.market.render(),
      quarter: () => this.quarter(),
    });
    this.market = new MarketView(
      deps.ctx.game,
      social.backend,
      (text, kind) => toasts.show(text, kind),
      () => this.panel.refresh(),
    );
    // Chaque récolte compte pour le défi de quartier (envoyé par paquets).
    deps.ctx.game.events.on('gameplay', (event) => {
      if (event.type === 'harvest') this.pendingHarvests++;
    });
    window.setInterval(() => this.flushHarvests(), 60_000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushHarvests();
    });
    this.visitBar = new VisitBar({
      help: async () => {
        if (this.visiting) await this.help(this.visiting.profile);
      },
      addNeighbor: async () => {
        if (!this.visiting) return;
        await social.backend.addNeighbor(this.visiting.profile.id);
        toasts.show(t('neighbors.nowNeighbor', { pseudo: this.visiting.profile.pseudo }), 'success');
      },
      report: () => this.confirmReport(),
      block: () => {
        if (this.visiting) this.confirmBlock(this.visiting.profile.id, this.visiting.profile.pseudo, true);
      },
      leave: () => this.leaveVisit(),
      like: async () => {
        if (!this.visiting) return 0;
        return social.backend.like(this.visiting.profile.id);
      },
      likeStatus: (id) => social.backend.likeStatus(id),
      toast: (text, kind) => toasts.show(text, kind),
    });
    this.edgePill = h(
      'button',
      { class: 'edge-pill', onClick: () => this.openNeighbors() },
      icon(Icons.population),
      ` ${t('neighbors.edge')}`,
    );
  }

  get isVisiting(): boolean {
    return this.visiting !== null;
  }

  /** Inscription si nécessaire (langue, puis pseudo), puis la suite (introduction du tutoriel). */
  start(next: () => void): void {
    const { social, modals, ctx } = this.deps;
    if (social.backend.isRegistered()) {
      social.startSync();
      this.refreshMe();
      this.claimRequest();
      next();
      return;
    }
    const onDone = () => {
      social.startSync();
      this.refreshMe();
      next();
    };
    const pickLanguage = () => showLanguagePicker(modals, { dismissible: false, onPick: (code) => chosen(code) });
    const chosen = (code: Language) => {
      social.setLanguage(code);
      if (code === language()) setTimeout(open, 220);
    };
    const open = (): void =>
      showPseudoForm(modals, social.backend, ctx.game, {
        onDone,
        onTransfer: (code) => social.redeemTransfer(code),
        onBack: () => setTimeout(open, 220),
        onChangeLanguage: pickLanguage,
      });
    // Première ouverture : la langue d'abord (proposée d'après l'appareil).
    if (ctx.prefs.language === null) pickLanguage();
    else open();
  }

  /** Profil à jour (rôle, langue enregistrée sur le serveur). */
  private refreshMe(): void {
    const { backend } = this.deps.social;
    backend
      .me()
      .then((me) => {
        this.me = me;
        if (me.language !== language()) void backend.setLanguage(language()).catch(() => undefined);
      })
      .catch(() => undefined);
  }

  setEdge(near: boolean): void {
    this.edgePill.classList.toggle('is-visible', near && !this.visiting && !this.panel.isOpen);
  }

  /** Ouvre le marché avec ce produit prêt à être mis en vente. */
  openMarket(item: string): void {
    this.market.preselect = item;
    this.openNeighbors('market');
  }

  private flushHarvests(): void {
    const { backend } = this.deps.social;
    if (this.pendingHarvests <= 0 || !backend.isRegistered()) return;
    const amount = this.pendingHarvests;
    this.pendingHarvests = 0;
    backend.contribute(amount).catch(() => {
      this.pendingHarvests += amount;
    });
  }

  /** Ce que les voisins ont envoyé pour ma demande arrive dans l'entrepôt. */
  private claimRequest(): void {
    const { social, ctx } = this.deps;
    social.backend
      .claimRequest()
      .then(({ item, qty }) => {
        if (!item || qty <= 0) return;
        ctx.game.receiveItems({ [item]: qty });
        this.deps
          .notices()
          .post(
            'neighbor',
            t('requests.received', { n: qty, item: `${itemEmoji(item)} ${itemName(item)}` }),
            { kind: 'neighbors' },
            Icons.population,
            'success',
          );
      })
      .catch(() => undefined);
  }

  /** En tête de l'onglet Voisins : défi de la semaine, ma demande, celles des voisins. */
  private async quarter(): Promise<HTMLElement> {
    const { social, ctx, toasts } = this.deps;
    const { backend } = social;
    const game = ctx.game;
    this.flushHarvests();
    const [community, mine, others] = await Promise.all([
      backend.community(),
      backend.myRequest(),
      backend.neighborRequests(),
    ]);
    const wrap = h('div', { class: 'quarter' });

    // Défi de quartier.
    const ratio = Math.min(1, community.total / Math.max(1, community.goal));
    const claim = h('button', {
      class: 'btn btn--gold btn--small',
      text: community.claimed ? t('daily.claimed') : t('daily.claim'),
      onClick: () => {
        claim.setAttribute('disabled', '');
        backend
          .claimCommunity()
          .then(() => {
            const reward = communityReward(game.state.level);
            game.grantReward(reward);
            toasts.show(t('community.claimed'), 'success');
            this.panel.refresh();
          })
          .catch((e: unknown) => {
            claim.removeAttribute('disabled');
            toasts.show(backendErrorMessage(e), 'error');
          });
      },
    });
    if (!community.claimable) claim.setAttribute('disabled', '');
    wrap.append(
      h(
        'div',
        { class: 'quarter__card' },
        h('div', { class: 'quarter__title' }, '🏘️ ', t('community.title')),
        h('p', { class: 'muted small', text: t('community.intro') }),
        h(
          'div',
          { class: 'daily__progress' },
          h('div', { class: 'progress' }, h('div', { class: 'progress__fill', style: `width:${ratio * 100}%` })),
          h('span', {
            class: 'daily__count',
            text: `${formatNumber(community.total)}/${formatNumber(community.goal)}`,
          }),
        ),
        h(
          'div',
          { class: 'quarter__row' },
          h('span', { class: 'muted small', text: t('community.mine', { n: formatNumber(community.mine) }) }),
          rewardChips(communityReward(game.state.level)),
          claim,
        ),
      ),
    );

    // Ma demande aux voisins.
    const myCard = h(
      'div',
      { class: 'quarter__card' },
      h('div', { class: 'quarter__title' }, '📮 ', t('requests.mine')),
    );
    if (mine && mine.received < mine.qty && mine.expiresAt > Date.now()) {
      myCard.append(
        h(
          'div',
          { class: 'quarter__row' },
          itemChip(mine.item, mine.qty),
          h('span', { class: 'muted small', text: t('requests.progress', { n: mine.received, total: mine.qty }) }),
        ),
      );
    } else if (mine && mine.toClaim > 0) {
      myCard.append(h('p', { class: 'muted small', text: t('requests.done') }));
    } else {
      myCard.append(this.requestForm(), h('p', { class: 'muted small', text: t('requests.hint') }));
    }
    if (mine && mine.toClaim > 0) {
      myCard.append(
        h('button', {
          class: 'btn btn--gold btn--small',
          text: t('requests.collect', { n: mine.toClaim }),
          onClick: () => {
            this.claimRequest();
            setTimeout(() => this.panel.refresh(), 300);
          },
        }),
      );
    }
    wrap.append(myCard);

    // Demandes des voisins.
    if (others.length > 0) {
      const card = h(
        'div',
        { class: 'quarter__card' },
        h('div', { class: 'quarter__title' }, '🤝 ', t('requests.others')),
      );
      for (const request of others) {
        const left = request.qty - request.received;
        const give = Math.min(left, game.itemCount(request.item));
        const button = h('button', {
          class: 'btn btn--primary btn--small',
          text: give > 0 ? t('requests.give', { n: give }) : t('requests.none'),
          onClick: () => {
            button.setAttribute('disabled', '');
            // Les produits quittent la ville seulement si le serveur accepte l'envoi.
            if (game.itemCount(request.item) < give) return;
            backend
              .giveToRequest(request.id, give)
              .then(() => {
                const result = game.giveToNeighbor(request.item, give);
                if (result.ok) {
                  toasts.show(
                    t('requests.thanks', { pseudo: request.profile.pseudo, coins: result.reward.coins ?? 0 }),
                    'success',
                  );
                }
                this.panel.refresh();
              })
              .catch((e: unknown) => {
                button.removeAttribute('disabled');
                toasts.show(backendErrorMessage(e), 'error');
              });
          },
        });
        if (give <= 0) button.setAttribute('disabled', '');
        card.append(
          h(
            'div',
            { class: 'quarter__row' },
            h('strong', { text: request.profile.pseudo }),
            itemChip(request.item, left, game),
            h('span', {
              class: 'muted small',
              text: t('requests.progress', { n: request.received, total: request.qty }),
            }),
            button,
          ),
        );
      }
      wrap.append(card);
    }
    return wrap;
  }

  /** Petit formulaire « demander N × produit » (produits que la ville sait produire). */
  private requestForm(): HTMLElement {
    const { social, ctx, toasts } = this.deps;
    const select = h('select', { class: 'field__input' });
    for (const id of producibleItems(ctx.game.state)) {
      select.append(h('option', { text: `${itemEmoji(id)} ${itemName(id)}`, attrs: { value: id } }));
    }
    const qty = h('select', { class: 'field__input' });
    for (const n of [10, 20, 50, 100]) qty.append(h('option', { text: String(n), attrs: { value: String(n) } }));
    qty.value = '20';
    const send = h('button', {
      class: 'btn btn--primary btn--small',
      text: t('requests.ask'),
      onClick: () => {
        send.setAttribute('disabled', '');
        social.backend
          .createRequest(select.value, Math.max(SOCIAL.requestMinQty, Number(qty.value)))
          .then(() => {
            toasts.show(t('requests.sent'), 'success');
            this.panel.refresh();
          })
          .catch((e: unknown) => {
            send.removeAttribute('disabled');
            toasts.show(backendErrorMessage(e), 'error');
          });
      },
    });
    return h('div', { class: 'quarter__row quarter__form' }, qty, select, send);
  }

  openNeighbors(tab: 'neighbors' | 'market' = 'neighbors'): void {
    this.deps.closeTransient();
    this.edgePill.classList.remove('is-visible');
    this.panel.open(tab);
  }

  private async help(profile: Profile): Promise<void> {
    const { social, ctx, toasts } = this.deps;
    await social.backend.help(profile.id);
    const reward = ctx.game.rewardHelpGiven();
    toasts.show(t('social.thanksHelp', { pseudo: profile.pseudo, coins: reward.coins ?? 0 }), 'success');
  }

  /** Visite la ville d'un joueur connu seulement par son identifiant (depuis le chat). */
  visitPlayer(playerId: string, pseudo: string): void {
    void this.visit({ id: playerId, pseudo, cityName: '', level: 0, population: 0, lastSeenAt: 0 });
  }

  private async visit(profile: Profile): Promise<void> {
    if (this.loadingVisit) return;
    const { social, toasts } = this.deps;
    this.loadingVisit = true;
    toasts.show(t('social.travel', { city: profile.cityName || profile.pseudo }), 'info');
    try {
      const visit = await social.backend.visit(profile.id);
      if (!visit.data) {
        toasts.show(t('social.noCity', { pseudo: profile.pseudo }), 'info');
        return;
      }
      this.deps.closeTransient();
      // Le bandeau (et son bouton de retour) s'affiche avant tout : on peut toujours rentrer chez soi.
      this.visiting = visit;
      this.visitBar.show(visit);
      document.body.classList.add('is-visiting');
      try {
        social.openVisit(visit);
      } catch (error) {
        this.leaveVisit();
        throw error;
      }
      this.deps.ctx.game.visitedNeighbor();
      this.edgePill.classList.remove('is-visible');
      this.deps.onLayoutChange();
    } catch (error) {
      toasts.show(backendErrorMessage(error), 'error');
    } finally {
      this.loadingVisit = false;
    }
  }

  leaveVisit(): void {
    if (!this.visiting) return;
    this.visiting = null;
    this.deps.social.closeVisit();
    this.visitBar.hide();
    document.body.classList.remove('is-visiting');
    this.deps.onLayoutChange();
  }

  private confirmReport(): void {
    const visit = this.visiting;
    if (!visit) return;
    const { modals, social, toasts } = this.deps;
    const reasons: Array<[string, string]> = [
      ['pseudo', t('report.pseudo')],
      ['ville', t('report.city')],
      ['autre', t('report.other')],
    ];
    modals.show({
      title: t('report.title', { pseudo: visit.profile.pseudo }),
      body: h('p', { text: t('report.body') }),
      buttons: [
        ...reasons.map(([reason, label]) => ({
          label,
          kind: 'secondary' as const,
          onClick: () => {
            social.backend
              .report(visit.profile.id, reason)
              .then(() => toasts.show(t('report.sent'), 'success'))
              .catch((e: unknown) => toasts.show(backendErrorMessage(e), 'error'));
          },
        })),
        { label: t('common.cancel'), kind: 'secondary' },
      ],
    });
  }

  /** Bloque un joueur après confirmation (depuis une visite ou le chat). */
  confirmBlock(playerId: string, pseudo: string, leave = false): void {
    const { modals, social, toasts } = this.deps;
    modals.show({
      title: t('block.title', { pseudo }),
      body: h('p', { text: t('block.body') }),
      buttons: [
        { label: t('common.cancel'), kind: 'secondary' },
        {
          label: t('block.confirm'),
          kind: 'danger',
          onClick: () => {
            social.backend
              .block(playerId)
              .then(() => {
                toasts.show(t('block.done', { pseudo }), 'info');
                if (leave) this.leaveVisit();
              })
              .catch((e: unknown) => toasts.show(backendErrorMessage(e), 'error'));
          },
        },
      ],
    });
  }

  /** Une version plus récente existe sur un autre appareil. */
  askConflict(remote: { revision: number; savedAt: number }, choose: (keep: 'local' | 'remote') => void): void {
    const ago = formatDuration(Math.max(0, (Date.now() - remote.savedAt) / 1000));
    this.deps.modals.show({
      title: t('conflict.title'),
      kicker: t('conflict.kicker'),
      dismissible: false,
      urgent: true,
      body: h('p', { text: t('conflict.body', { ago }) }),
      buttons: [
        { label: t('conflict.remote'), kind: 'secondary', onClick: () => choose('remote') },
        { label: t('conflict.local'), onClick: () => choose('local') },
      ],
    });
  }

  showHelpsReceived(helpers: string[], reward: Reward): void {
    const names = helpers.length ? formatList(helpers) : t('helps.someone');
    // « Vos voisins » (personne de nommé) appelle aussi le pluriel.
    const text = t(helpers.length === 1 ? 'helps.one' : 'helps.many', { names, coins: reward.coins ?? 0 });
    const gift = Object.entries(reward.items ?? {})
      .map(([id, qty]) => `${qty} ${itemEmoji(id)}`)
      .join(' ');
    if (gift) {
      this.deps
        .notices()
        .post(
          'neighbor',
          `${text} ${t('helps.gift', { items: gift })}`,
          { kind: 'neighbors' },
          Icons.population,
          'success',
        );
      return;
    }
    this.deps.notices().post('neighbor', text, { kind: 'neighbors' }, Icons.population, 'success');
  }

  /** Section « Compte » des réglages. */
  accountSection(): HTMLElement {
    const { social } = this.deps;
    const name = h('strong', { text: this.me?.pseudo ?? '…' });
    const role = h('span', { class: 'settings__role' });
    const adminButton = h('button', {
      class: 'btn btn--gold',
      text: t('settings.admin'),
      onClick: () => window.open('./admin.html', '_blank', 'noopener'),
    });
    const showRole = (me: Me) => {
      name.textContent = me.pseudo;
      role.textContent = me.role
        ? ` · ${t(me.role === 'admin' ? 'account.role.admin' : 'account.role.moderator')}`
        : '';
      // L'interface admin n'est proposée qu'au compte administrateur, dans un navigateur (pas dans l'appli).
      const show = me.role === 'admin' && social.backend.kind === 'convex' && !isNativeApp();
      adminButton.style.display = show ? '' : 'none';
    };
    adminButton.style.display = 'none';
    if (this.me) showRole(this.me);
    social.backend
      .me()
      .then((me) => {
        this.me = me;
        showRole(me);
      })
      .catch(() => {
        if (!this.me) name.textContent = t('common.offline');
      });
    const buttons: HTMLElement[] = [
      h(
        'button',
        {
          class: 'btn btn--secondary',
          onClick: () => this.changeLanguage(),
        },
        icon(Icons.globe),
        ` ${t('lang.setting', { language: languageName(language()) })}`,
      ),
      h('button', { class: 'btn btn--secondary', text: t('account.rename'), onClick: () => this.renameForm() }),
    ];
    if (social.backend.kind === 'convex') {
      buttons.push(
        h('button', {
          class: 'btn btn--secondary',
          text: t('account.transfer'),
          onClick: () => this.showTransferCode(),
        }),
      );
    }
    buttons.push(
      h('button', { class: 'btn btn--danger', text: t('account.delete'), onClick: () => this.confirmDelete() }),
    );
    const privacy = privacyUrl();
    if (privacy) {
      buttons.push(
        h('a', {
          class: 'settings__link',
          text: t('account.privacy'),
          attrs: { href: privacy, target: '_blank', rel: 'noopener' },
        }),
      );
    }
    return h(
      'div',
      { class: 'settings__account' },
      h('div', { class: 'modal__section-title', text: t('account.title') }),
      h('p', { class: 'settings__who' }, rich('account.loggedAs', { name }), role),
      social.backend.kind === 'local' ? h('p', { class: 'muted settings__hint', text: t('account.demo') }) : null,
      adminButton,
      ...buttons,
    );
  }

  private changeLanguage(): void {
    const { modals, social } = this.deps;
    modals.close();
    setTimeout(
      () =>
        showLanguagePicker(modals, {
          dismissible: true,
          title: t('lang.changeTitle'),
          onPick: (code) => {
            if (code === language()) return;
            // Le serveur garde la langue (salon du chat, annonces ciblées) ; le jeu recharge ensuite.
            void social.backend
              .setLanguage(code)
              .catch(() => undefined)
              .finally(() => social.setLanguage(code));
          },
        }),
      220,
    );
  }

  private renameForm(): void {
    const { modals, social, toasts } = this.deps;
    modals.close();
    const input = h('input', { class: 'field__input', attrs: { maxlength: String(PSEUDO_MAX + 4) } });
    const error = h('p', { class: 'form-error' });
    setTimeout(
      () =>
        modals.show({
          title: t('account.rename'),
          className: 'modal--form',
          body: [input, error],
          buttons: [
            { label: t('common.cancel'), kind: 'secondary' },
            {
              label: t('common.validate'),
              onClick: () => {
                const problem = validatePseudo(input.value);
                if (problem) {
                  error.textContent = pseudoErrorMessage(problem);
                  return false;
                }
                social.backend
                  .rename(input.value)
                  .then((pseudo) => toasts.show(t('account.renamed', { pseudo }), 'success'))
                  .catch((e: unknown) => toasts.show(backendErrorMessage(e), 'error'));
                return true;
              },
            },
          ],
        }),
      220,
    );
  }

  private showTransferCode(): void {
    const { modals, social, toasts } = this.deps;
    social.backend
      .createTransferCode()
      .then(({ code }) => {
        modals.close();
        setTimeout(
          () =>
            modals.show({
              title: t('account.transferTitle'),
              body: [
                h('p', { text: t('account.transferBody') }),
                h('p', { class: 'transfer-code', text: code }),
                h('p', { class: 'muted', text: t('account.transferNote') }),
              ],
              buttons: [{ label: t('common.gotIt') }],
            }),
          220,
        );
      })
      .catch((e: unknown) => toasts.show(backendErrorMessage(e), 'error'));
  }

  private confirmDelete(): void {
    const { modals, social, toasts } = this.deps;
    modals.close();
    setTimeout(
      () =>
        modals.show({
          title: t('account.deleteTitle'),
          body: h('p', { text: t('account.deleteBody') }),
          buttons: [
            { label: t('common.cancel'), kind: 'secondary' },
            {
              label: t('account.deleteConfirm'),
              kind: 'danger',
              onClick: () => {
                social.backend
                  .deleteAccount()
                  .then(() => social.wipeLocal())
                  .catch((e: unknown) => toasts.show(backendErrorMessage(e), 'error'));
              },
            },
          ],
        }),
      220,
    );
  }
}

/** Page de confidentialité servie par Convex (…convex.cloud → …convex.site/confidentialite). */
function privacyUrl(): string | null {
  const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
  return url ? url.replace(/\.convex\.cloud\/?$/, '.convex.site') + '/confidentialite' : null;
}
