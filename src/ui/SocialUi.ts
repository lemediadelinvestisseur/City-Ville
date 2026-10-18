import type { AppContext } from '@/app/context';
import type { Reward } from '@/core/types';
import { backendErrorMessage, type Backend, type Profile, type Visit } from '@/services/online/Backend';
import { PSEUDO_MAX, pseudoErrorMessage, validatePseudo } from '@/core/pseudo';
import { h, icon } from './dom';
import { formatDuration, formatNumber } from './format';
import { Icons } from './icons';
import type { Modals } from './Modals';
import { MarketView } from './MarketView';
import { NeighborsPanel } from './NeighborsPanel';
import { showPseudoForm } from './Onboarding';
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
}

interface Deps {
  ctx: AppContext;
  modals: Modals;
  toasts: Toasts;
  social: SocialOptions;
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
        toasts.show(`${this.visiting.profile.pseudo} est maintenant votre voisin !`, 'success');
      },
      report: () => this.confirmReport(),
      block: () => this.confirmBlock(),
      leave: () => this.leaveVisit(),
      toast: (text, kind) => toasts.show(text, kind),
    });
    this.edgePill = h(
      'button',
      { class: 'edge-pill', onClick: () => this.openNeighbors() },
      icon(Icons.population),
      ' Voir mes voisins',
    );
  }

  get isVisiting(): boolean {
    return this.visiting !== null;
  }

  /** Inscription si nécessaire, puis la suite (introduction du tutoriel). */
  start(next: () => void): void {
    const { social, modals, ctx } = this.deps;
    if (social.backend.isRegistered()) {
      social.startSync();
      next();
      return;
    }
    const open = () =>
      showPseudoForm(modals, social.backend, ctx.game, {
        onDone: () => {
          social.startSync();
          next();
        },
        onTransfer: (code) => social.redeemTransfer(code),
        onBack: () => setTimeout(open, 220),
      });
    open();
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
    toasts.show(`Merci pour ${profile.pseudo} ! +${formatNumber(reward.coins ?? 0)} pièces`, 'success');
  }

  private async visit(profile: Profile): Promise<void> {
    if (this.loadingVisit) return;
    const { social, toasts } = this.deps;
    this.loadingVisit = true;
    toasts.show(`En route vers ${profile.cityName}…`, 'info');
    try {
      const visit = await social.backend.visit(profile.id);
      if (!visit.data) {
        toasts.show(`${profile.pseudo} n’a pas encore construit sa ville.`, 'info');
        return;
      }
      this.panel.close();
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
      ['pseudo', 'Pseudo inapproprié'],
      ['ville', 'Nom de ville inapproprié'],
      ['autre', 'Autre comportement'],
    ];
    modals.show({
      title: `Signaler ${visit.profile.pseudo}`,
      body: h('p', { text: 'Notre équipe examinera le signalement. Merci de nous aider à garder le jeu agréable.' }),
      buttons: [
        ...reasons.map(([reason, label]) => ({
          label,
          kind: 'secondary' as const,
          onClick: () => {
            social.backend
              .report(visit.profile.id, reason)
              .then(() => toasts.show('Signalement envoyé. Merci !', 'success'))
              .catch((e: unknown) => toasts.show(backendErrorMessage(e), 'error'));
          },
        })),
        { label: 'Annuler', kind: 'secondary' },
      ],
    });
  }

  private confirmBlock(): void {
    const visit = this.visiting;
    if (!visit) return;
    const { modals, social, toasts } = this.deps;
    modals.show({
      title: `Bloquer ${visit.profile.pseudo} ?`,
      body: h('p', {
        text: 'Vous ne vous verrez plus : ni voisins, ni suggestions, ni visites. Vous pourrez le débloquer plus tard.',
      }),
      buttons: [
        { label: 'Annuler', kind: 'secondary' },
        {
          label: 'Bloquer',
          kind: 'danger',
          onClick: () => {
            social.backend
              .block(visit.profile.id)
              .then(() => {
                toasts.show(`${visit.profile.pseudo} est bloqué.`, 'info');
                this.leaveVisit();
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
      title: 'Deux versions de votre ville',
      kicker: 'Synchronisation',
      dismissible: false,
      urgent: true,
      body: h('p', {
        text: `Votre ville a aussi été modifiée sur un autre appareil (il y a ${ago}). Quelle version voulez-vous garder ? L’autre sera remplacée.`,
      }),
      buttons: [
        { label: 'Celle de l’autre appareil', kind: 'secondary', onClick: () => choose('remote') },
        { label: 'Celle-ci', onClick: () => choose('local') },
      ],
    });
  }

  showHelpsReceived(helpers: string[], reward: Reward): void {
    const names = helpers.length > 1 ? `${helpers.slice(0, -1).join(', ')} et ${helpers.at(-1)}` : helpers[0];
    this.deps.toasts.show(
      `${names ?? 'Vos voisins'} ${helpers.length > 1 ? 'vous ont' : 'vous a'} donné un coup de main : +${formatNumber(reward.coins ?? 0)} pièces !`,
      'success',
    );
  }

  /** Section « Compte » des réglages. */
  accountSection(): HTMLElement {
    const { social } = this.deps;
    const name = h('strong', { text: '…' });
    social.backend
      .me()
      .then((me) => {
        name.textContent = me.pseudo;
      })
      .catch(() => {
        name.textContent = 'hors ligne';
      });
    const buttons: HTMLElement[] = [
      h('button', { class: 'btn btn--secondary', text: 'Changer de pseudo', onClick: () => this.renameForm() }),
    ];
    if (social.backend.kind === 'convex') {
      buttons.push(
        h('button', {
          class: 'btn btn--secondary',
          text: 'Code de transfert (autre appareil)',
          onClick: () => this.showTransferCode(),
        }),
      );
    }
    buttons.push(
      h('button', { class: 'btn btn--danger', text: 'Supprimer mon compte', onClick: () => this.confirmDelete() }),
    );
    const privacy = privacyUrl();
    if (privacy) {
      buttons.push(
        h('a', {
          class: 'settings__link',
          text: 'Politique de confidentialité',
          attrs: { href: privacy, target: '_blank', rel: 'noopener' },
        }),
      );
    }
    return h(
      'div',
      { class: 'settings__account' },
      h('div', { class: 'modal__section-title', text: 'Compte' }),
      h('p', { class: 'settings__who' }, 'Connecté en tant que ', name),
      social.backend.kind === 'local'
        ? h('p', {
            class: 'muted settings__hint',
            text: 'Mode démo hors-ligne : vos voisins sont fictifs, rien n’est envoyé sur Internet.',
          })
        : null,
      ...buttons,
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
          title: 'Changer de pseudo',
          className: 'modal--form',
          body: [input, error],
          buttons: [
            { label: 'Annuler', kind: 'secondary' },
            {
              label: 'Valider',
              onClick: () => {
                const problem = validatePseudo(input.value);
                if (problem) {
                  error.textContent = pseudoErrorMessage(problem);
                  return false;
                }
                social.backend
                  .rename(input.value)
                  .then((pseudo) => toasts.show(`Vous vous appelez maintenant ${pseudo}.`, 'success'))
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
              title: 'Code de transfert',
              body: [
                h('p', { text: 'Sur votre nouvel appareil, choisissez « J’ai déjà une ville » et saisissez :' }),
                h('p', { class: 'transfer-code', text: code }),
                h('p', { class: 'muted', text: 'Valable 24 heures, une seule fois. Ne le partagez avec personne.' }),
              ],
              buttons: [{ label: 'Compris' }],
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
          title: 'Supprimer votre compte ?',
          body: h('p', {
            text: 'Votre pseudo, votre ville, vos voisins et toutes vos données seront définitivement effacés, sur cet appareil comme sur nos serveurs. Les achats ne sont pas remboursés.',
          }),
          buttons: [
            { label: 'Annuler', kind: 'secondary' },
            {
              label: 'Tout supprimer',
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
