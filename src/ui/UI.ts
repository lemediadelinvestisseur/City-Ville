import type { AppContext, PlacementInfo } from '@/app/context';
import { DEV_TOOLS, GAME_TITLE, GAME_VERSION } from '@/config';
import { findQuestHint, type HintTarget } from '@/core/hints';
import { DAY_NIGHT_MODES, dayNightAt, type DayNightMode } from '@/core/dayNight';
import type { BuildingDef, CropDef, FailReason, Reward, TripDef } from '@/core/types';
import { CHUNK_SIZE, DAILY_STREAK_DAYS, ENERGY_REGEN_SEC, dailyReward, xpForLevel } from '@/data/balance';
import { findBuildingDef, getBuildingDef } from '@/data/buildings';
import { CROPS } from '@/data/crops';
import type { StoreProduct } from '@/data/products';
import { getQuestDef } from '@/data/quests';
import { isEastChunk } from '@/data/terrain';
import { ArtKey } from '@/render/art/library';
import { Bubble } from './Bubbles';
import { BuildMenu } from './BuildMenu';
import { CropPicker } from './CropPicker';
import { h, icon, type Child } from './dom';
import { FlyingRewards } from './FlyingRewards';
import { formatClock, formatDuration, formatNumber } from './format';
import { Hud } from './Hud';
import { Icons } from './icons';
import { failMessage } from './messages';
import { Modals } from './Modals';
import { QuestTracker, questIcon } from './QuestTracker';
import { Shop, type ShopTab } from './Shop';
import { SocialUi, type SocialOptions } from './SocialUi';
import { Toasts } from './Toasts';
import { TripPicker } from './TripPicker';

type Mode = 'play' | 'edit';

export interface UiOptions {
  onReset: () => void;
  social: SocialOptions;
}

/** Interface HTML superposée au jeu : relie le moteur, le monde et les composants. */
export class UI {
  readonly root: HTMLElement;
  private hud: Hud;
  private quests: QuestTracker;
  private toasts = new Toasts();
  private modals: Modals;
  private buildMenu: BuildMenu;
  private cropPicker: CropPicker;
  private tripPicker: TripPicker;
  private bubble: Bubble;
  private shop: Shop;
  private flying: FlyingRewards;
  readonly social: SocialUi;
  private dock = h('nav', { class: 'dock', attrs: { 'aria-label': 'Actions' } });
  private placebar = h('div', { class: 'placebar' });
  private banner = h('div', { class: 'banner' });
  private buildButton!: HTMLButtonElement;
  private socialButton?: HTMLButtonElement;
  private dailyOffered: string | null = null;
  private editButton!: HTMLButtonElement;
  private mode: Mode = 'play';
  private plantCropId: string | null = null;
  private plantTarget: number | null = null;
  private placement: PlacementInfo | null = null;
  private hint: HintTarget | null = null;
  /** Outils de test et boutique : réservés au compte testeur (et au développement). */
  private tester = false;

  constructor(
    parent: HTMLElement,
    private readonly ctx: AppContext,
    private readonly options: UiOptions,
  ) {
    const { game, art, payments } = ctx;
    this.root = h('div', { class: 'ui' });
    this.hud = new Hud(game, (target) => this.openShop(target === 'cash' ? 'cash' : 'coins'));
    this.quests = new QuestTracker(game, art, (id) => this.showQuest(id));
    this.modals = new Modals((open) => ctx.bus.emit('ui:modalOpen', open));
    this.buildMenu = new BuildMenu(
      game,
      art,
      (defId) => this.startPlacement(defId),
      (reason, missing, def) => this.onBuildBlocked(reason, missing, def),
      () => this.refreshDock(),
    );
    this.cropPicker = new CropPicker(
      game,
      art,
      (crop) => this.plant(crop),
      () => this.refreshDock(),
    );
    this.tripPicker = new TripPicker(
      game,
      art,
      (id, trip) => this.sendBoat(id, trip),
      () => this.refreshDock(),
    );
    this.bubble = new Bubble(game, {
      speedUp: (id) => this.speedUp(id),
      move: (id) => {
        this.bubble.close();
        ctx.bus.emit('ui:startMove', { entityId: id });
      },
      sell: (id) => this.confirmSell(id),
    });
    this.shop = new Shop(
      game,
      payments,
      (text, kind) => this.toasts.show(text, kind),
      () => undefined,
    );
    this.flying = new FlyingRewards(this.hud);
    this.social = new SocialUi({
      ctx,
      modals: this.modals,
      toasts: this.toasts,
      social: options.social,
      onLayoutChange: () => this.refreshDock(),
      closeTransient: () => this.closeTransient(),
    });

    this.buildDock();
    this.root.append(
      this.hud.el,
      this.quests.el,
      this.toasts.el,
      this.banner,
      this.bubble.el,
      this.dock,
      this.placebar,
      this.buildMenu.el,
      this.cropPicker.el,
      this.tripPicker.el,
      this.social.panel.el,
      this.social.edgePill,
      this.social.visitBar.el,
      this.flying.el,
      this.shop.el,
      this.modals.el,
    );
    parent.append(this.root);
    this.subscribe();
    window.setInterval(() => this.tick(), 500);
    this.refreshDock();
  }

  /** À appeler une fois le monde prêt. */
  start(): void {
    this.setTester(import.meta.env.DEV);
    // Inscription (pseudo) d'abord, puis l'introduction du tutoriel.
    this.social.start(() => {
      if (!this.ctx.game.state.tutorial.introSeen) this.showIntro();
      else this.offerDailyReward();
      // L'app peut rester ouverte en arrière-plan d'un jour à l'autre.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.ctx.game.state.tutorial.introSeen) this.offerDailyReward();
      });
      this.options.social.backend
        .me()
        .then((me) => this.setTester(me.tester || import.meta.env.DEV))
        .catch(() => undefined);
    });
  }

  /** Affiche ou masque la boutique et les outils de test. */
  setTester(on: boolean): void {
    this.tester = on;
    document.body.classList.toggle('is-tester', on);
  }

  // ———————————————————————————— Câblage ————————————————————————————

  private subscribe(): void {
    const { game, bus } = this.ctx;
    game.events.on('change', () => {
      this.hud.refresh();
      this.quests.refresh();
      this.buildMenu.refresh();
      this.shop.refresh();
      this.checkPlantMode();
    });
    game.events.on('levelUp', ({ level, reward, unlocked }) => this.showLevelUp(level, reward, unlocked));
    game.events.on('questCompleted', ({ questId, reward }) => this.showQuestCompleted(questId, reward));
    game.events.on('questStarted', ({ questId }) => {
      if (!game.state.tutorial.introSeen) return;
      this.quests.markNew(questId);
      const quest = getQuestDef(questId);
      this.toasts.show(`Nouvel objectif : ${quest.title}`, 'info', {
        label: 'Voir',
        onClick: () => this.showQuest(questId),
      });
    });
    game.events.on('constructionComplete', (entity) => {
      this.toasts.show(`Construction terminée : ${getBuildingDef(entity.defId).name} !`, 'success');
    });
    game.events.on('expanded', () => this.toasts.show('Nouvelle zone débloquée !', 'success'));

    bus.on('world:entityInfo', ({ entityId, screen, action }) => {
      this.closeTransient();
      if (action.type === 'plant') {
        this.plantTarget = entityId;
        this.cropPicker.open();
        this.refreshDock();
      } else if (action.type === 'sendBoat') {
        this.tripPicker.open(entityId);
      } else {
        this.bubble.showInfo(entityId, screen);
      }
    });
    bus.on('world:editSelect', (selection) => {
      if (selection) this.bubble.showEdit(selection.entityId, selection.screen);
      else this.bubble.close();
    });
    bus.on('world:edge', (near) => this.social.setEdge(near));
    bus.on('world:lockedTap', ({ cx, cy }) => this.offerExpansion(cx, cy));
    bus.on('world:emptyTap', () => this.closeTransient());
    bus.on('world:cameraMoved', () => this.bubble.close());
    bus.on('world:fail', ({ reason, missing }) => this.onFail(reason, missing));
    bus.on('world:placement', (info) => {
      this.placement = info;
      if (info) this.closeTransient();
      this.refreshDock();
    });
    bus.on('world:hint', (hint) => {
      this.hint = hint;
      this.refreshDock();
    });
    bus.on('fx:reward', ({ screen, reward }) => this.flying.launch(screen, reward));
    bus.on('world:drops', (reward) => this.hud.hold(reward));
    bus.on('fx:pickup', ({ screen, reward }) => this.flying.launch(screen, reward, () => this.hud.release(reward)));
  }

  private tick(): void {
    this.hud.refreshTimer();
    this.bubble.tick();
  }

  private closeTransient(): void {
    this.bubble.close();
    this.buildMenu.close();
    this.cropPicker.close();
    this.tripPicker.close();
    this.social.panel.close();
  }

  // ———————————————————————————— Barre d'actions ————————————————————————————

  private buildDock(): void {
    const button = (label: string, svg: string, className: string, onClick: () => void) =>
      h(
        'button',
        { class: `dock__btn ${className}`, onClick },
        h('span', { class: 'dock__icon', html: svg }),
        h('span', { class: 'dock__label', text: label }),
      );
    this.buildButton = button('Construire', Icons.build, 'dock__btn--build', () => this.toggleBuildMenu());
    this.editButton = button('Déplacer', Icons.move, 'dock__btn--edit', () =>
      this.setMode(this.mode === 'edit' ? 'play' : 'edit'),
    );
    this.dock.append(
      this.buildButton,
      this.editButton,
      (this.socialButton = button('Voisins', Icons.population, 'dock__btn--social', () => this.social.openNeighbors())),
      button('Boutique', Icons.shop, 'dock__btn--shop', () => this.openShop('cash')),
      button('Réglages', Icons.settings, 'dock__btn--settings', () => this.showSettings()),
    );
  }

  private toggleBuildMenu(): void {
    if (this.buildMenu.isOpen) {
      this.buildMenu.close();
      return;
    }
    this.bubble.close();
    this.cropPicker.close();
    this.exitPlantMode();
    if (this.mode === 'edit') this.setMode('play');
    const focus = this.hint?.kind === 'shop' ? { defId: this.hint.defId, category: this.hint.category } : undefined;
    this.buildMenu.open(focus);
    this.refreshDock();
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.closeTransient();
    this.exitPlantMode();
    this.ctx.bus.emit('ui:setMode', mode);
    this.refreshDock();
  }

  private refreshDock(): void {
    const placing = this.placement !== null;
    this.dock.classList.toggle(
      'is-hidden',
      placing ||
        this.buildMenu.isOpen ||
        this.cropPicker.isOpen ||
        this.tripPicker.isOpen ||
        this.social.panel.isOpen ||
        this.social.isVisiting,
    );
    this.placebar.classList.toggle('is-open', placing);
    this.editButton.classList.toggle('is-active', this.mode === 'edit');
    this.buildButton.classList.toggle('is-hint', this.hint?.kind === 'shop' && !this.buildMenu.isOpen);
    this.socialButton?.classList.toggle('is-hint', this.hint?.kind === 'social' && !this.social.panel.isOpen);
    this.renderPlacebar();
    this.renderBanner();
  }

  private renderPlacebar(): void {
    const info = this.placement;
    this.placebar.replaceChildren();
    if (!info) return;
    const def = getBuildingDef(info.defId);
    const cost = info.moving
      ? h('span', { class: 'placebar__cost', text: 'Déplacement gratuit' })
      : def.cost.cash
        ? h('span', { class: 'placebar__cost' }, icon(Icons.cash), ` ${formatNumber(def.cost.cash)}`)
        : h('span', { class: 'placebar__cost' }, icon(Icons.coin), ` ${formatNumber(def.cost.coins ?? 0)}`);
    const status = info.valid
      ? h('span', {
          class: 'placebar__status is-ok',
          text:
            def.id === 'road'
              ? 'Touchez la route pour la poser, glissez pour en tracer'
              : 'Touchez la carte pour choisir l’emplacement',
        })
      : h('span', {
          class: 'placebar__status is-bad',
          text: info.reason ? failMessage(info.reason) : 'Emplacement invalide',
        });
    this.placebar.append(
      h(
        'button',
        {
          class: 'round-btn round-btn--cancel',
          attrs: { 'aria-label': 'Annuler' },
          onClick: () => this.ctx.bus.emit('ui:cancelPlacement', undefined),
        },
        icon(Icons.close),
      ),
      h('div', { class: 'placebar__info' }, h('span', { class: 'placebar__name', text: def.name }), cost, status),
      (() => {
        const ok = h(
          'button',
          {
            class: 'round-btn round-btn--ok',
            attrs: { 'aria-label': 'Placer ici' },
            onClick: () => this.ctx.bus.emit('ui:confirmPlacement', undefined),
          },
          icon(Icons.check),
        );
        if (!info.valid) ok.classList.add('is-disabled');
        return ok;
      })(),
    );
  }

  private renderBanner(): void {
    this.banner.replaceChildren();
    let text = '';
    let onDone: (() => void) | null = null;
    if (this.placement) {
      text = '';
    } else if (this.plantCropId) {
      const crop = CROPS.find((c) => c.id === this.plantCropId);
      text = `Plantation : ${crop?.name ?? ''} · touchez les champs vides`;
      onDone = () => this.exitPlantMode();
    } else if (this.mode === 'edit') {
      text = 'Touchez une construction à déplacer ou à vendre';
      onDone = () => this.setMode('play');
    }
    this.banner.classList.toggle('is-open', text !== '');
    if (!text) return;
    this.banner.append(h('span', { text }));
    if (onDone)
      this.banner.append(h('button', { class: 'btn btn--small btn--primary', text: 'Terminer', onClick: onDone }));
  }

  // ———————————————————————————— Actions ————————————————————————————

  private startPlacement(defId: string): void {
    this.closeTransient();
    this.ctx.bus.emit('ui:startPlacement', { defId });
  }

  private onBuildBlocked(reason: FailReason, missing: number | undefined, def: BuildingDef): void {
    if (reason === 'levelLocked') this.toasts.show(`${def.name} : niveau ${def.requires?.level} requis.`, 'error');
    else if (reason === 'populationLocked')
      this.toasts.show(`${def.name} : il faut ${def.requires?.population} habitants.`, 'error');
    else this.onFail(reason, missing);
  }

  private onFail(reason: FailReason, missing?: number): void {
    switch (reason) {
      case 'notEnoughEnergy':
        this.showEnergyEmpty();
        return;
      case 'notEnoughCoins':
        this.toasts.show(
          failMessage(reason, missing),
          'error',
          this.tester ? { label: 'Boutique', onClick: () => this.openShop('coins') } : undefined,
        );
        return;
      case 'notEnoughCash':
        this.toasts.show(
          failMessage(reason, missing),
          'error',
          this.tester ? { label: 'Obtenir', onClick: () => this.openShop('cash') } : undefined,
        );
        return;
      default:
        this.toasts.show(failMessage(reason, missing), 'error');
    }
  }

  private plant(crop: CropDef): void {
    const target = this.plantTarget;
    if (target === null) return;
    const result = this.ctx.game.plant(target, crop.id);
    if (!result.ok) {
      if (result.reason === 'levelLocked')
        this.toasts.show(`${crop.name} : niveau ${crop.requires?.level} requis.`, 'error');
      else this.onFail(result.reason, result.missing);
      return;
    }
    this.cropPicker.close();
    this.plantTarget = null;
    this.plantCropId = crop.id;
    this.ctx.bus.emit('ui:plantMode', { cropId: crop.id });
    this.checkPlantMode();
    this.refreshDock();
  }

  private sendBoat(entityId: number, trip: TripDef): void {
    const result = this.ctx.game.sendBoat(entityId, trip.id);
    if (!result.ok) {
      if (result.reason === 'levelLocked')
        this.toasts.show(`${trip.name} : niveau ${trip.requires?.level} requis.`, 'error');
      else this.onFail(result.reason, result.missing);
      return;
    }
    this.tripPicker.close();
    this.toasts.show(`Le bateau part en mer : retour dans ${formatDuration(trip.durationSec)}.`, 'info');
  }

  private checkPlantMode(): void {
    if (!this.plantCropId) return;
    const hasEmpty = this.ctx.game.state.entities.some((e) => e.farm && e.farm.cropId === null);
    if (!hasEmpty) this.exitPlantMode();
  }

  private exitPlantMode(): void {
    if (!this.plantCropId) return;
    this.plantCropId = null;
    this.ctx.bus.emit('ui:plantMode', { cropId: null });
    this.refreshDock();
  }

  private speedUp(entityId: number): void {
    const result = this.ctx.game.speedUp(entityId);
    if (result.ok) this.bubble.close();
    else this.onFail(result.reason, result.missing);
  }

  private confirmSell(entityId: number): void {
    const { game } = this.ctx;
    const entity = game.getEntity(entityId);
    if (!entity) return;
    const def = getBuildingDef(entity.defId);
    const refund = game.sellValue(entity);
    this.bubble.close();
    this.modals.show({
      title: refund > 0 ? `Vendre : ${def.name} ?` : `Retirer : ${def.name} ?`,
      body: h('p', {
        text:
          refund > 0
            ? `Vous récupérerez ${formatNumber(refund)} pièces.`
            : 'Cette construction sera retirée de la carte.',
      }),
      buttons: [
        { label: 'Annuler', kind: 'secondary' },
        {
          label: refund > 0 ? 'Vendre' : 'Retirer',
          kind: 'danger',
          onClick: () => {
            const result = game.sell(entityId);
            if (!result.ok) this.onFail(result.reason);
          },
        },
      ],
    });
  }

  private openShop(tab: ShopTab): void {
    if (!this.tester) return;
    this.closeTransient();
    this.shop.open(tab);
  }

  // ———————————————————————————— Fenêtres ————————————————————————————

  private rewardChips(reward: Reward): HTMLElement {
    const chips: Child[] = [];
    const chip = (svg: string, text: string) => h('span', { class: 'chip' }, icon(svg), text);
    if (reward.coins) chips.push(chip(Icons.coin, `+${formatNumber(reward.coins)}`));
    if (reward.cash) chips.push(chip(Icons.cash, `+${formatNumber(reward.cash)}`));
    if (reward.xp) chips.push(chip(Icons.xp, `+${formatNumber(reward.xp)} XP`));
    if (reward.goods) chips.push(chip(Icons.goods, `+${formatNumber(reward.goods)}`));
    if (reward.energy) chips.push(chip(Icons.energy, `+${formatNumber(reward.energy)}`));
    return h('div', { class: 'chips' }, ...chips);
  }

  private taskList(questId: string): HTMLElement {
    const { game } = this.ctx;
    const progress = game.state.quests.active.find((q) => q.id === questId);
    const def = getQuestDef(questId);
    const status = progress
      ? game.questTaskStatus(progress)
      : def.tasks.map(() => ({ value: 1, target: 1, done: true }));
    return h(
      'ul',
      { class: 'tasks' },
      ...def.labels.map((label, i) => {
        const s = status[i];
        return h(
          'li',
          { class: `task${s?.done ? ' is-done' : ''}` },
          h('span', { class: 'task__check', html: s?.done ? Icons.check : '' }),
          h('span', { class: 'task__label', text: label }),
          s && s.target > 1
            ? h('span', { class: 'task__count', text: `${formatNumber(s.value)}/${formatNumber(s.target)}` })
            : null,
        );
      }),
    );
  }

  /** Fenêtre « Cadeau du jour », une fois par jour (date locale du joueur). */
  private offerDailyReward(): void {
    const { game } = this.ctx;
    const today = localDay(new Date());
    const status = game.dailyStatus(today);
    if (!status.available || this.dailyOffered === today) return;
    this.dailyOffered = today;
    const days = Array.from({ length: DAILY_STREAK_DAYS }, (_, i) => i + 1).map((day) => {
      const reward = dailyReward(day, game.state.level);
      const state = day < status.day ? ' is-done' : day === status.day ? ' is-today' : '';
      return h(
        'div',
        { class: `daily__day${state}` },
        h('span', { class: 'daily__label', text: `Jour ${day}` }),
        icon(reward.cash ? Icons.cash : Icons.coin),
        h('span', { class: 'daily__amount', text: reward.cash ? `+${reward.cash}` : formatNumber(reward.coins) }),
      );
    });
    this.modals.show({
      title: 'Cadeau du jour',
      kicker: status.day > 1 ? `Série : ${status.day} jours d’affilée` : 'Revenez chaque jour !',
      avatar: true,
      body: [
        h('p', {
          text: 'Connectez-vous chaque jour pour faire grimper la série : le 7e jour, des billets vous attendent. Un jour manqué, et la série repart à zéro.',
        }),
        h('div', { class: 'daily' }, ...days),
        this.rewardChips(status.reward),
      ],
      buttons: [
        {
          label: 'Récupérer',
          onClick: () => {
            const result = game.claimDailyReward(today);
            if (result.ok) this.toasts.show(`Cadeau du jour ${result.day} récupéré !`, 'success');
          },
        },
      ],
    });
  }

  private showIntro(): void {
    const { game } = this.ctx;
    const quest = getQuestDef('welcome');
    this.modals.show({
      title: `Bienvenue à ${GAME_TITLE} !`,
      kicker: 'Léa, votre adjointe',
      avatar: true,
      dismissible: false,
      body: [
        h('p', { text: quest.intro }),
        h(
          'ul',
          { class: 'tips' },
          h('li', {}, icon(Icons.energy), 'Encaisser et récolter coûtent 1 énergie, qui se recharge avec le temps.'),
          h(
            'li',
            {},
            icon(Icons.clock),
            'Les chantiers avancent tout seuls : revenez inaugurer vos bâtiments une fois terminés.',
          ),
          h(
            'li',
            {},
            icon(Icons.goods),
            'Récoltez vos champs pour obtenir des marchandises et approvisionner vos commerces.',
          ),
          h('li', {}, icon(Icons.population), 'Glissez pour vous déplacer, pincez (ou molette) pour zoomer.'),
        ),
        this.taskList('welcome'),
      ],
      buttons: [{ label: 'C’est parti !', onClick: () => game.markIntroSeen() }],
    });
  }

  private showQuest(questId: string): void {
    const def = getQuestDef(questId);
    const progress = this.ctx.game.state.quests.active.find((q) => q.id === questId);
    // L'aide est calculée pour CET objectif, pas pour le premier de la liste.
    const hint = progress ? findQuestHint(this.ctx.game, progress) : null;
    const buttons: Array<{ label: string; kind?: 'primary' | 'secondary'; onClick?: () => void }> = [];
    if (hint) {
      buttons.push({
        label: 'Montre-moi',
        kind: 'secondary',
        onClick: () => this.showHint(hint),
      });
    }
    buttons.push({ label: 'OK' });
    this.modals.show({
      title: def.title,
      kicker: 'Objectif',
      avatar: true,
      body: [
        h('p', { text: def.intro }),
        this.taskList(questId),
        h('div', { class: 'modal__section-title', text: 'Récompense' }),
        this.rewardChips(def.reward),
      ],
      buttons,
    });
  }

  private showHint(hint: HintTarget): void {
    if (hint.kind === 'entity') {
      this.ctx.bus.emit('ui:focusEntity', { entityId: hint.entityId });
    } else if (hint.kind === 'shop') {
      this.buildMenu.open({ defId: hint.defId, category: hint.category });
    } else if (hint.kind === 'social') {
      this.social.openNeighbors(hint.tab);
    } else {
      this.ctx.bus.emit('ui:focusTile', { x: (hint.cx + 0.5) * CHUNK_SIZE, y: (hint.cy + 0.5) * CHUNK_SIZE });
      this.toasts.show('Touchez le panneau « À vendre » pour agrandir la ville.', 'info');
    }
    this.refreshDock();
  }

  private showQuestCompleted(questId: string, reward: Reward): void {
    const def = getQuestDef(questId);
    this.modals.show({
      title: def.title,
      kicker: 'Objectif accompli !',
      className: 'modal--celebrate',
      body: [h('div', { class: 'celebrate-icon' }, questIcon(this.ctx.art, def.icon)), this.rewardChips(reward)],
      buttons: [{ label: 'Super !' }],
    });
  }

  private showLevelUp(level: number, reward: Reward, unlocked: string[]): void {
    const items = unlocked.map((id) => {
      const building = findBuildingDef(id);
      const crop = CROPS.find((c) => c.id === id);
      const src = building
        ? this.ctx.art.iconUrl(ArtKey.building(id), 96)
        : this.ctx.art.iconUrl(ArtKey.cropIcon(id), 96);
      return h(
        'div',
        { class: 'unlock' },
        h('img', { attrs: { src, alt: '' } }),
        h('span', { text: building?.name ?? crop?.name ?? id }),
      );
    });
    this.modals.show({
      title: `Niveau ${level} !`,
      kicker: 'Niveau supérieur',
      className: 'modal--celebrate modal--level',
      body: [
        h('div', { class: 'level-badge', html: Icons.xp }, h('span', { text: String(level) })),
        this.rewardChips(reward),
        h('p', { class: 'muted', text: 'Énergie rechargée !' }),
        items.length ? h('div', { class: 'modal__section-title', text: 'Nouveautés débloquées' }) : null,
        items.length ? h('div', { class: 'unlocks' }, ...items) : null,
      ],
      buttons: [{ label: 'Génial !' }],
    });
  }

  private offerExpansion(cx: number, cy: number): void {
    const { game } = this.ctx;
    this.closeTransient();
    const info = game.expansionInfo(cx, cy);
    if (info.status === 'unavailable') {
      this.toasts.show('Achetez d’abord une zone voisine de la ville.', 'info');
      return;
    }
    if (info.status !== 'purchasable') return;
    const levelOk = game.state.level >= info.level;
    const needsBridge = info.reason === 'needsBridge';
    const east = isEastChunk(cx);
    this.modals.show({
      title: east ? 'La rive est' : 'Agrandir la ville',
      kicker: 'Nouvelle zone',
      body: [
        h('p', {
          text: east
            ? 'De l’autre côté du bras de mer, une nouvelle rive attend vos habitants. Un pont permet de la rejoindre.'
            : 'Débloquez une nouvelle zone de 8 × 8 cases pour construire encore plus !',
        }),
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, icon(Icons.coin), formatNumber(info.coins))),
        levelOk
          ? null
          : h('p', { class: 'warn', text: `Niveau ${info.level} requis (vous êtes niveau ${game.state.level}).` }),
        levelOk && needsBridge
          ? h('p', { class: 'warn', text: 'Construisez d’abord un pont (menu Construire › Routes).' })
          : null,
      ],
      buttons: [
        { label: 'Plus tard', kind: 'secondary' },
        {
          label: 'Acheter',
          disabled: !levelOk || needsBridge,
          onClick: () => {
            const result = game.buyExpansion(cx, cy);
            if (!result.ok) this.onFail(result.reason, result.missing);
          },
        },
      ],
    });
  }

  private showEnergyEmpty(): void {
    const { game } = this.ctx;
    const next = game.nextEnergyAt();
    const wait = next !== null ? formatClock((next - game.now()) / 1000) : '';
    const buy = (offerId: string) => () => {
      const result = game.buyCashOffer(offerId);
      if (result.ok) this.toasts.show('Énergie rechargée !', 'success');
      else this.onFail(result.reason, result.missing);
    };
    this.modals.show({
      title: 'Plus d’énergie !',
      kicker: 'Énergie',
      body: [
        h(
          'p',
          {},
          `Chaque action coûte 1 énergie. Vous en regagnez 1 toutes les ${formatDuration(ENERGY_REGEN_SEC)}`,
          wait ? ` (prochaine dans ${wait}).` : '.',
        ),
        h('p', { class: 'muted', text: 'Astuce : chaque passage de niveau recharge entièrement l’énergie.' }),
      ],
      buttons: [
        { label: 'Attendre', kind: 'secondary' },
        { label: '+5 · 4 cash', kind: 'gold', onClick: buy('energy_5') },
        { label: 'Max · 10 cash', kind: 'gold', onClick: buy('energy_full') },
      ],
    });
  }

  private showSettings(): void {
    const { game } = this.ctx;
    this.closeTransient();
    const devButtons =
      DEV_TOOLS && this.tester
        ? [
            h('div', { class: 'modal__section-title', text: 'Outils de test (prototype)' }),
            h(
              'div',
              { class: 'dev-tools' },
              h('button', {
                class: 'btn btn--small btn--secondary',
                text: '+1 000 pièces',
                onClick: () => game.devGrant({ coins: 1000 }),
              }),
              h('button', {
                class: 'btn btn--small btn--secondary',
                text: '+20 cash',
                onClick: () => game.devGrant({ cash: 20 }),
              }),
              h('button', {
                class: 'btn btn--small btn--secondary',
                text: 'Énergie au max',
                onClick: () => game.devGrant({ energy: Math.max(0, game.derived().energyMax - game.state.energy) }),
              }),
              h('button', {
                class: 'btn btn--small btn--secondary',
                text: '+50 marchandises',
                onClick: () => game.devGrant({ goods: 50 }),
              }),
              h('button', {
                class: 'btn btn--small btn--secondary',
                text: 'Niveau suivant',
                onClick: () => game.devGrant({ xp: Math.max(0, xpForLevel(game.state.level + 1) - game.state.xp) }),
              }),
              h('button', {
                class: 'btn btn--small btn--secondary',
                text: 'Avancer de 10 min',
                onClick: () => {
                  game.devSkipTime(10 * 60 * 1000);
                  this.toasts.show('10 minutes ont passé…', 'info');
                },
              }),
            ),
          ]
        : [];
    this.modals.show({
      title: 'Réglages',
      body: [
        h(
          'div',
          { class: 'settings' },
          this.soundToggle(),
          this.dayNightToggle(),
          this.social.accountSection(),
          h('button', {
            class: 'btn btn--secondary',
            text: 'Revoir l’introduction',
            onClick: () => this.replayIntro(),
          }),
          h('button', { class: 'btn btn--danger', text: 'Recommencer la partie', onClick: () => this.confirmReset() }),
        ),
        ...devButtons,
        h('p', {
          class: 'muted small',
          text: `${GAME_TITLE} · version ${GAME_VERSION} · prototype (graphismes provisoires)`,
        }),
      ],
      buttons: [{ label: 'Fermer' }],
    });
  }

  private soundToggle(): HTMLButtonElement {
    const { sound } = this.ctx;
    const label = () => (sound.muted ? 'Son : désactivé' : 'Son : activé');
    const toggle = h('button', {
      class: 'btn btn--secondary',
      text: label(),
      onClick: () => {
        sound.setMuted(!sound.muted);
        toggle.textContent = label();
      },
    });
    return toggle;
  }

  private dayNightToggle(): HTMLElement {
    const { prefs, bus } = this.ctx;
    const names: Record<DayNightMode, string> = {
      cycle: 'Jour / nuit : cycle de 30 min',
      real: 'Jour / nuit : heure réelle',
      off: 'Jour / nuit : toujours le jour',
    };
    const status = h('span', { class: 'muted settings__hint' });
    const describe = () => {
      const date = new Date();
      const state = dayNightAt(Date.now(), prefs.dayNight, date.getHours() + date.getMinutes() / 60);
      if (prefs.dayNight === 'off') status.textContent = '';
      else {
        const wait = formatDuration((state.nextChangeAt - Date.now()) / 1000);
        status.textContent =
          state.phase === 'day'
            ? `Il fait jour — la nuit tombe dans ${wait}.`
            : state.phase === 'night'
              ? `Il fait nuit — le jour se lève dans ${wait}.`
              : state.phase === 'dusk'
                ? 'Le soleil se couche…'
                : 'Le soleil se lève…';
      }
    };
    const toggle = h('button', {
      class: 'btn btn--secondary',
      text: names[prefs.dayNight],
      onClick: () => {
        const next = DAY_NIGHT_MODES[(DAY_NIGHT_MODES.indexOf(prefs.dayNight) + 1) % DAY_NIGHT_MODES.length] ?? 'cycle';
        prefs.setDayNight(next);
        bus.emit('ui:dayNightMode', next);
        toggle.textContent = names[next];
        describe();
      },
    });
    describe();
    return h('div', { class: 'settings__row' }, toggle, status);
  }

  private replayIntro(): void {
    this.modals.close();
    setTimeout(() => this.showIntro(), 250);
  }

  private confirmReset(): void {
    this.modals.close();
    setTimeout(
      () =>
        this.modals.show({
          title: 'Recommencer ?',
          body: h('p', { text: 'Toute votre progression sera effacée. Cette action est définitive.' }),
          buttons: [
            { label: 'Annuler', kind: 'secondary' },
            { label: 'Tout effacer', kind: 'danger', onClick: () => this.options.onReset() },
          ],
        }),
      250,
    );
  }

  /** La partie a été modifiée dans un autre onglet : on impose un rechargement. */
  showStale(reload: () => void): void {
    this.modals.show({
      title: 'Partie ouverte ailleurs',
      kicker: 'Sauvegarde',
      urgent: true,
      dismissible: false,
      body: h('p', {
        text: 'Votre ville a été modifiée dans un autre onglet. Rechargez la page pour reprendre la partie la plus récente.',
      }),
      buttons: [{ label: 'Recharger', onClick: reload }],
    });
  }

  /** Confirmation du paiement simulé (fournisseur de test). */
  confirmTestPurchase(product: StoreProduct): Promise<boolean> {
    return new Promise((resolve) => {
      let answered = false;
      const answer = (value: boolean) => () => {
        answered = true;
        resolve(value);
      };
      this.modals.show({
        title: 'Paiement simulé',
        kicker: 'Mode test',
        urgent: true,
        body: [
          h('p', {}, h('strong', { text: product.title }), ` — ${product.description}`),
          h('p', {
            class: 'muted',
            text: 'Aucun paiement réel ne sera effectué. Dans la version finale, cette étape ouvrira le paiement sécurisé de l’App Store, de Google Play ou du site web.',
          }),
        ],
        buttons: [
          { label: 'Annuler', kind: 'secondary', onClick: answer(false) },
          { label: `Payer ${product.priceLabel} (test)`, kind: 'gold', onClick: answer(true) },
        ],
        onClose: () => {
          if (!answered) resolve(false);
        },
      });
    });
  }
}

/** Date locale au format AAAA-MM-JJ (le jour change à minuit pour le joueur). */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
