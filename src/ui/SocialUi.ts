import type { AppContext } from '@/app/context';
import { PSEUDO_MAX, validatePseudo } from '@/core/pseudo';
import type { Reward } from '@/core/types';
import { formatList, language, t, type Language } from '@/i18n';
import { isNativeApp } from '@/services/native';
import type { Backend, Me, Profile, Visit } from '@/services/online/Backend';
import { h, icon, rich } from './dom';
import { formatDuration } from './format';
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
  /** Profil du joueur connecté (rôle compris), connu après le premier appel au serveur. */
  me: Me | null = null;

  constructor(private readonly deps: Deps) {
    const { social, toasts } = deps;
    this.panel = new NeighborsPanel(social.backend, {
      visit: (profile) => void this.visit(profile),
      help: (profile) => this.help(profile),
      toast: (text, kind) => toasts.show(text, kind),
      onToggle: () => deps.onLayoutChange(),
      market: () => market.render(),
    });
    const market = new MarketView(
      deps.ctx.game,
      social.backend,
      (text, kind) => toasts.show(text, kind),
      () => this.panel.refresh(),
    );
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

  openNeighbors(): void {
    this.deps.closeTransient();
    this.edgePill.classList.remove('is-visible');
    this.panel.open('neighbors');
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
      this.visiting = visit;
      social.openVisit(visit);
      this.visitBar.show(visit);
      document.body.classList.add('is-visiting');
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
