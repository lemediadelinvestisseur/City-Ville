import type { AppContext, PlacementInfo } from '@/app/context';
import type { InboxStore, InboxTarget } from '@/app/inbox';
import type { ReminderScheduler } from '@/app/reminders';
import { DEV_TOOLS, GAME_TITLE, GAME_VERSION } from '@/config';
import { findQuestHint, type HintTarget } from '@/core/hints';
import { DAY_NIGHT_MODES, dayNightAt, type DayNightMode } from '@/core/dayNight';
import type { KeyValueStorage } from '@/core/save';
import type { BuildingDef, CropDef, FailReason, Reward, TripDef } from '@/core/types';
import { CHUNK_SIZE, ENERGY_REGEN_SEC, xpForLevel } from '@/data/balance';
import { findBuildingDef, getBuildingDef } from '@/data/buildings';
import { CROPS } from '@/data/crops';
import { findCashOffer, type StoreProduct } from '@/data/products';
import { getQuestDef } from '@/data/quests';
import { isEastChunk } from '@/data/terrain';
import { t } from '@/i18n';
import {
  buildingName,
  cropName,
  productDescription,
  productTitle,
  questIntro,
  questLabels,
  questTitle,
  tripName,
} from '@/i18n/content';
import { ArtKey } from '@/render/art/library';
import type { DeviceNotifier } from '@/services/notifications';
import { Bubble } from './Bubbles';
import { BuildMenu } from './BuildMenu';
import { ChatPanel } from './ChatPanel';
import { CropPicker } from './CropPicker';
import { DailyPanel, rewardChips } from './DailyPanel';
import { h, icon } from './dom';
import { FlyingRewards } from './FlyingRewards';
import { formatClock, formatDuration } from './format';
import { Hud } from './Hud';
import { Icons } from './icons';
import { InboxPanel } from './InboxPanel';
import { failMessage } from './messages';
import { Modals } from './Modals';
import { Notices } from './Notices';
import { NotificationsUi } from './NotificationsUi';
import { QuestTracker, questIcon } from './QuestTracker';
import { Shop, type ShopTab } from './Shop';
import { SideButtons, type SideButton } from './SideButtons';
import { SocialUi, type SocialOptions } from './SocialUi';
import { Toasts } from './Toasts';
import { TripPicker } from './TripPicker';

type Mode = 'play' | 'edit';

const ANNOUNCEMENT_SEEN_KEY = 'city-ville:announcement-seen';

export interface UiOptions {
  onReset: () => void;
  social: SocialOptions;
  storage: KeyValueStorage;
  inbox: InboxStore;
  notifier: DeviceNotifier;
  reminders: ReminderScheduler;
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
  private side: SideButtons;
  private chat: ChatPanel;
  private inboxPanel: InboxPanel;
  private daily: DailyPanel;
  private notices: Notices;
  private notifications: NotificationsUi;
  private dock = h('nav', { class: 'dock', attrs: { 'aria-label': t('dock.aria') } });
  private placebar = h('div', { class: 'placebar' });
  private banner = h('div', { class: 'banner' });
  private buildButton!: HTMLButtonElement;
  private editButton!: HTMLButtonElement;
  private mode: Mode = 'play';
  private plantCropId: string | null = null;
  private plantTarget: number | null = null;
  private placement: PlacementInfo | null = null;
  private hint: HintTarget | null = null;
  private announcementSeen: number;
  /** Joueur identifié : les raccourcis (chat, notifications, défis) apparaissent. */
  private started = false;

  constructor(
    parent: HTMLElement,
    private readonly ctx: AppContext,
    private readonly options: UiOptions,
  ) {
    const { game, art, payments, prefs } = ctx;
    this.root = h('div', { class: 'ui' });
    this.announcementSeen = Number(options.storage.getItem(ANNOUNCEMENT_SEEN_KEY) ?? '0') || 0;
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
    this.side = new SideButtons((which) => this.openSide(which));
    this.social = new SocialUi({
      ctx,
      modals: this.modals,
      toasts: this.toasts,
      social: options.social,
      notices: () => this.notices,
      onLayoutChange: () => this.refreshDock(),
      closeTransient: () => this.closeTransient(),
    });
    this.notices = new Notices({
      game,
      toasts: this.toasts,
      inbox: options.inbox,
      side: this.side,
      storage: options.storage,
      go: (target) => this.go(target),
    });
    this.chat = new ChatPanel(options.social.backend, this.modals, options.storage, {
      toast: (text, kind) => this.toasts.show(text, kind),
      visit: (playerId, pseudo) => this.social.visitPlayer(playerId, pseudo),
      block: (playerId, pseudo) => this.social.confirmBlock(playerId, pseudo),
      onToggle: () => this.refreshDock(),
      onUnread: (unread) => this.side.setBadge('chat', unread),
      onAnnouncement: (at) => this.onAnnouncement(at),
    });
    this.inboxPanel = new InboxPanel(options.inbox, {
      go: (target) => this.go(target),
      onToggle: () => this.refreshDock(),
    });
    this.daily = new DailyPanel(game, this.modals);
    this.notifications = new NotificationsUi({
      game,
      notifier: options.notifier,
      prefs,
      scheduler: options.reminders,
      modals: this.modals,
      toast: (text, kind) => this.toasts.show(text, kind),
    });
    options.inbox.events.on('change', () => this.refreshSide());

    this.buildDock();
    this.root.append(
      this.hud.el,
      this.quests.el,
      this.side.el,
      this.toasts.el,
      this.banner,
      this.bubble.el,
      this.dock,
      this.placebar,
      this.buildMenu.el,
      this.cropPicker.el,
      this.tripPicker.el,
      this.social.panel.el,
      this.chat.el,
      this.inboxPanel.el,
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
    this.refreshSide();
  }

  /** À appeler une fois le monde prêt. */
  start(): void {
    // Inscription (langue, pseudo) d'abord, puis l'introduction du tutoriel.
    this.social.start(() => {
      this.started = true;
      this.refreshDock();
      if (!this.ctx.game.state.tutorial.introSeen) this.showIntro();
      else this.notices.welcomeBack();
      this.chat.watch();
      this.options.reminders.start();
    });
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
      this.refreshSide();
    });
    game.events.on('levelUp', ({ level, reward, unlocked }) => this.showLevelUp(level, reward, unlocked));
    game.events.on('questCompleted', ({ questId, reward }) => this.showQuestCompleted(questId, reward));
    game.events.on('questStarted', ({ questId }) => {
      if (!game.state.tutorial.introSeen) return;
      this.quests.markNew(questId);
      this.toasts.show(
        t('toast.newQuest', { title: questTitle(questId) }),
        'info',
        { label: t('common.see'), onClick: () => this.showQuest(questId) },
        { icon: Icons.trophy },
      );
    });
    game.events.on('constructionComplete', (entity) => {
      this.toasts.show(t('toast.built', { name: buildingName(entity.defId) }), 'success', undefined, {
        icon: Icons.build,
      });
    });
    game.events.on('expanded', () =>
      this.toasts.show(t('toast.expanded'), 'success', undefined, { icon: Icons.expand }),
    );

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
    this.chat.close();
    this.inboxPanel.close();
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
    this.buildButton = button(t('dock.build'), Icons.build, 'dock__btn--build', () => this.toggleBuildMenu());
    this.editButton = button(t('dock.move'), Icons.move, 'dock__btn--edit', () =>
      this.setMode(this.mode === 'edit' ? 'play' : 'edit'),
    );
    this.dock.append(
      this.buildButton,
      this.editButton,
      button(t('dock.neighbors'), Icons.population, 'dock__btn--social', () => this.social.openNeighbors()),
      button(t('dock.shop'), Icons.shop, 'dock__btn--shop', () => this.openShop('cash')),
      button(t('dock.settings'), Icons.settings, 'dock__btn--settings', () => this.showSettings()),
    );
  }

  private toggleBuildMenu(): void {
    if (this.buildMenu.isOpen) {
      this.buildMenu.close();
      return;
    }
    this.bubble.close();
    this.cropPicker.close();
    this.chat.close();
    this.inboxPanel.close();
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
    const panelOpen =
      this.buildMenu.isOpen ||
      this.cropPicker.isOpen ||
      this.tripPicker.isOpen ||
      this.social.panel.isOpen ||
      this.chat.isOpen ||
      this.inboxPanel.isOpen;
    this.dock.classList.toggle('is-hidden', placing || panelOpen || this.social.isVisiting);
    this.side.el.classList.toggle(
      'is-hidden',
      !this.started || placing || this.social.isVisiting || this.mode === 'edit',
    );
    this.placebar.classList.toggle('is-open', placing);
    this.editButton.classList.toggle('is-active', this.mode === 'edit');
    this.buildButton.classList.toggle('is-hint', this.hint?.kind === 'shop' && !this.buildMenu.isOpen);
    this.renderPlacebar();
    this.renderBanner();
  }

  /** Boutons latéraux : défis du jour (s'ils sont débloqués) et pastilles. */
  private refreshSide(): void {
    const daily = this.ctx.game.dailyInfo();
    this.side.setVisible('daily', daily.available);
    this.side.setBadge('daily', daily.claimable);
    this.side.setBadge('inbox', this.options.inbox.unread());
  }

  private openSide(which: SideButton): void {
    const wasOpen = which === 'chat' ? this.chat.isOpen : which === 'inbox' ? this.inboxPanel.isOpen : false;
    this.closeTransient();
    if (this.mode === 'edit') this.setMode('play');
    if (wasOpen) return;
    if (which === 'daily') this.daily.open();
    else if (which === 'inbox') this.inboxPanel.open();
    else this.chat.open();
  }

  /** Mène là où un message renvoie (construction, défis, chat, voisins). */
  private go(target: InboxTarget): void {
    if (this.social.isVisiting) this.social.leaveVisit();
    this.closeTransient();
    if (target.kind === 'entity') {
      if (this.ctx.game.getEntity(target.entityId)) this.ctx.bus.emit('ui:focusEntity', { entityId: target.entityId });
    } else if (target.kind === 'daily') this.daily.open();
    else if (target.kind === 'chat') this.chat.open();
    else this.social.openNeighbors();
  }

  private renderPlacebar(): void {
    const info = this.placement;
    this.placebar.replaceChildren();
    if (!info) return;
    const def = getBuildingDef(info.defId);
    const cost = info.moving
      ? h('span', { class: 'placebar__cost', text: t('place.freeMove') })
      : def.cost.cash
        ? h('span', { class: 'placebar__cost' }, icon(Icons.cash), ` ${def.cost.cash}`)
        : h('span', { class: 'placebar__cost' }, icon(Icons.coin), ` ${def.cost.coins ?? 0}`);
    const status = info.valid
      ? h('span', {
          class: 'placebar__status is-ok',
          text: def.id === 'road' ? t('place.roadHint') : t('place.tapHint'),
        })
      : h('span', {
          class: 'placebar__status is-bad',
          text: info.reason ? failMessage(info.reason) : t('place.invalid'),
        });
    this.placebar.append(
      h(
        'button',
        {
          class: 'round-btn round-btn--cancel',
          attrs: { 'aria-label': t('common.cancel') },
          onClick: () => this.ctx.bus.emit('ui:cancelPlacement', undefined),
        },
        icon(Icons.close),
      ),
      h(
        'div',
        { class: 'placebar__info' },
        h('span', { class: 'placebar__name', text: buildingName(def) }),
        cost,
        status,
      ),
      (() => {
        const ok = h(
          'button',
          {
            class: 'round-btn round-btn--ok',
            attrs: { 'aria-label': t('place.confirm') },
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
      text = t('banner.planting', { crop: crop ? cropName(crop) : '' });
      onDone = () => this.exitPlantMode();
    } else if (this.mode === 'edit') {
      text = t('banner.edit');
      onDone = () => this.setMode('play');
    }
    this.banner.classList.toggle('is-open', text !== '');
    if (!text) return;
    this.banner.append(h('span', { text }));
    if (onDone)
      this.banner.append(
        h('button', { class: 'btn btn--small btn--primary', text: t('common.finish'), onClick: onDone }),
      );
  }

  // ———————————————————————————— Actions ————————————————————————————

  private startPlacement(defId: string): void {
    this.closeTransient();
    this.ctx.bus.emit('ui:startPlacement', { defId });
  }

  private onBuildBlocked(reason: FailReason, missing: number | undefined, def: BuildingDef): void {
    const name = buildingName(def);
    if (reason === 'levelLocked') {
      this.toasts.show(t('toast.levelRequired', { name, level: def.requires?.level ?? 1 }), 'error');
    } else if (reason === 'populationLocked') {
      this.toasts.show(t('toast.populationRequired', { name, population: def.requires?.population ?? 0 }), 'error');
    } else this.onFail(reason, missing);
  }

  private onFail(reason: FailReason, missing?: number): void {
    switch (reason) {
      case 'notEnoughEnergy':
        this.showEnergyEmpty();
        return;
      case 'notEnoughCoins':
        this.toasts.show(failMessage(reason, missing), 'error', {
          label: t('dock.shop'),
          onClick: () => this.openShop('coins'),
        });
        return;
      case 'notEnoughCash':
        this.toasts.show(failMessage(reason, missing), 'error', {
          label: t('toast.getCash'),
          onClick: () => this.openShop('cash'),
        });
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
      if (result.reason === 'levelLocked') {
        this.toasts.show(t('toast.levelRequired', { name: cropName(crop), level: crop.requires?.level ?? 1 }), 'error');
      } else this.onFail(result.reason, result.missing);
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
      if (result.reason === 'levelLocked') {
        this.toasts.show(t('toast.levelRequired', { name: tripName(trip), level: trip.requires?.level ?? 1 }), 'error');
      } else this.onFail(result.reason, result.missing);
      return;
    }
    this.tripPicker.close();
    this.toasts.show(t('toast.boatSent', { duration: formatDuration(trip.durationSec) }), 'info', undefined, {
      icon: Icons.boat,
    });
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
    const name = buildingName(entity.defId);
    const refund = game.sellValue(entity);
    this.bubble.close();
    this.modals.show({
      title: refund > 0 ? t('sell.title', { name }) : t('sell.removeTitle', { name }),
      body: h('p', { text: refund > 0 ? t('sell.refund', { coins: refund }) : t('sell.removeBody') }),
      buttons: [
        { label: t('common.cancel'), kind: 'secondary' },
        {
          label: refund > 0 ? t('sell.sell') : t('sell.remove'),
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
    this.closeTransient();
    this.shop.open(tab);
  }

  // ———————————————————————————— Fenêtres ————————————————————————————

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
      ...questLabels(def).map((label, i) => {
        const s = status[i];
        return h(
          'li',
          { class: `task${s?.done ? ' is-done' : ''}` },
          h('span', { class: 'task__check', html: s?.done ? Icons.check : '' }),
          h('span', { class: 'task__label', text: label }),
          s && s.target > 1 ? h('span', { class: 'task__count', text: `${s.value}/${s.target}` }) : null,
        );
      }),
    );
  }

  private showIntro(): void {
    const { game } = this.ctx;
    const quest = getQuestDef('welcome');
    this.modals.show({
      title: t('intro.title', { game: GAME_TITLE }),
      kicker: t('intro.kicker'),
      avatar: true,
      dismissible: false,
      body: [
        h('p', { text: questIntro(quest) }),
        h(
          'ul',
          { class: 'tips' },
          h('li', {}, icon(Icons.energy), t('intro.tipEnergy')),
          h('li', {}, icon(Icons.clock), t('intro.tipBuild')),
          h('li', {}, icon(Icons.goods), t('intro.tipGoods')),
          h('li', {}, icon(Icons.population), t('intro.tipCamera')),
        ),
        this.taskList('welcome'),
      ],
      buttons: [{ label: t('intro.start'), onClick: () => game.markIntroSeen() }],
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
        label: t('quest.showMe'),
        kind: 'secondary',
        onClick: () => this.showHint(hint),
      });
    }
    buttons.push({ label: t('common.ok') });
    this.modals.show({
      title: questTitle(def),
      kicker: t('quest.kicker'),
      avatar: true,
      body: [
        h('p', { text: questIntro(def) }),
        this.taskList(questId),
        h('div', { class: 'modal__section-title', text: t('quest.reward') }),
        rewardChips(def.reward),
      ],
      buttons,
    });
  }

  private showHint(hint: HintTarget): void {
    if (hint.kind === 'entity') {
      this.ctx.bus.emit('ui:focusEntity', { entityId: hint.entityId });
    } else if (hint.kind === 'shop') {
      this.buildMenu.open({ defId: hint.defId, category: hint.category });
    } else {
      this.ctx.bus.emit('ui:focusTile', { x: (hint.cx + 0.5) * CHUNK_SIZE, y: (hint.cy + 0.5) * CHUNK_SIZE });
      this.toasts.show(t('hint.expand'), 'info');
    }
    this.refreshDock();
  }

  private showQuestCompleted(questId: string, reward: Reward): void {
    const def = getQuestDef(questId);
    this.modals.show({
      title: questTitle(def),
      kicker: t('quest.completedKicker'),
      className: 'modal--celebrate',
      body: [h('div', { class: 'celebrate-icon' }, questIcon(this.ctx.art, def.icon)), rewardChips(reward)],
      buttons: [{ label: t('quest.great') }],
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
        h('span', { text: building ? buildingName(building) : crop ? cropName(crop) : tripName(id) }),
      );
    });
    this.modals.show({
      title: t('level.title', { level }),
      kicker: t('level.kicker'),
      className: 'modal--celebrate modal--level',
      body: [
        h('div', { class: 'level-badge', html: Icons.xp }, h('span', { text: String(level) })),
        rewardChips(reward),
        h('p', { class: 'muted', text: t('level.energy') }),
        items.length ? h('div', { class: 'modal__section-title', text: t('level.unlocked') }) : null,
        items.length ? h('div', { class: 'unlocks' }, ...items) : null,
      ],
      buttons: [{ label: t('level.great') }],
    });
  }

  private offerExpansion(cx: number, cy: number): void {
    const { game } = this.ctx;
    this.closeTransient();
    const info = game.expansionInfo(cx, cy);
    if (info.status === 'unavailable') {
      this.toasts.show(t('expand.unavailable'), 'info');
      return;
    }
    if (info.status !== 'purchasable') return;
    const levelOk = game.state.level >= info.level;
    const needsBridge = info.reason === 'needsBridge';
    const east = isEastChunk(cx);
    this.modals.show({
      title: east ? t('expand.eastTitle') : t('expand.title'),
      kicker: t('expand.kicker'),
      body: [
        h('p', { text: east ? t('expand.eastBody') : t('expand.body') }),
        rewardChips({ coins: info.coins }),
        levelOk
          ? null
          : h('p', {
              class: 'warn',
              text: t('expand.levelRequired', { level: info.level, current: game.state.level }),
            }),
        levelOk && needsBridge ? h('p', { class: 'warn', text: t('expand.needsBridge') }) : null,
      ],
      buttons: [
        { label: t('common.later'), kind: 'secondary' },
        {
          label: t('expand.buy'),
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
      if (result.ok) this.toasts.show(t('energy.refilled'), 'success');
      else this.onFail(result.reason, result.missing);
    };
    const duration = formatDuration(ENERGY_REGEN_SEC);
    this.modals.show({
      title: t('energy.title'),
      kicker: t('energy.kicker'),
      body: [
        h('p', { text: wait ? t('energy.bodyNext', { duration, wait }) : t('energy.body', { duration }) }),
        h('p', { class: 'muted', text: t('energy.tip') }),
      ],
      buttons: [
        { label: t('energy.wait'), kind: 'secondary' },
        {
          label: t('energy.buy5', { cash: findCashOffer('energy_5')?.cash ?? 0 }),
          kind: 'gold',
          onClick: buy('energy_5'),
        },
        {
          label: t('energy.buyMax', { cash: findCashOffer('energy_full')?.cash ?? 0 }),
          kind: 'gold',
          onClick: buy('energy_full'),
        },
      ],
    });
  }

  /** Annonce de l'équipe : affichée une fois en fenêtre, puis gardée dans le centre de notifications. */
  private onAnnouncement(at: number): void {
    if (at <= this.announcementSeen) return;
    const since = this.announcementSeen;
    this.announcementSeen = at;
    try {
      this.options.storage.setItem(ANNOUNCEMENT_SEEN_KEY, String(at));
    } catch {
      // Sans gravité : l'annonce pourrait réapparaître.
    }
    this.options.social.backend
      .announcements(this.chat.watchedChannels)
      .then((list) => {
        const fresh = list.filter((a) => a.createdAt > since);
        for (const announcement of [...fresh].reverse()) {
          this.options.inbox.add({
            kind: 'announcement',
            text: t('inbox.announcement', { text: announcement.text }),
            at: announcement.createdAt,
            target: { kind: 'chat' },
          });
        }
        // Seule la plus récente s'affiche en grand ; les autres restent dans les notifications.
        const latest = fresh[0];
        if (!latest) return;
        this.modals.show({
          title: t('announce.title'),
          kicker: t('announce.kicker'),
          className: 'modal--announcement',
          body: [h('div', { class: 'announce-icon', html: Icons.megaphone }), h('p', { text: latest.text })],
          buttons: [{ label: t('common.thanks') }],
        });
      })
      .catch(() => {
        this.announcementSeen = since;
      });
  }

  private showSettings(): void {
    const { game } = this.ctx;
    this.closeTransient();
    const devButton = (text: string, onClick: () => void) =>
      h('button', { class: 'btn btn--small btn--secondary', text, onClick });
    const devButtons = DEV_TOOLS
      ? [
          h('div', { class: 'modal__section-title', text: t('settings.dev') }),
          h(
            'div',
            { class: 'dev-tools' },
            devButton(t('dev.coins', { n: 1000 }), () => game.devGrant({ coins: 1000 })),
            devButton(t('dev.cash', { n: 20 }), () => game.devGrant({ cash: 20 })),
            devButton(t('dev.energy'), () =>
              game.devGrant({ energy: Math.max(0, game.derived().energyMax - game.state.energy) }),
            ),
            devButton(t('dev.goods', { n: 50 }), () => game.devGrant({ goods: 50 })),
            devButton(t('dev.level'), () =>
              game.devGrant({ xp: Math.max(0, xpForLevel(game.state.level + 1) - game.state.xp) }),
            ),
            devButton(t('dev.skip', { n: 10 }), () => {
              game.devSkipTime(10 * 60 * 1000);
              this.toasts.show(t('dev.skipped', { n: 10 }), 'info');
            }),
            devButton(t('dev.notify'), () => void this.options.reminders.test(t('notif.test'))),
          ),
        ]
      : [];
    this.modals.show({
      title: t('settings.title'),
      body: [
        h(
          'div',
          { class: 'settings' },
          this.soundToggle(),
          this.dayNightToggle(),
          this.notifications.settingsSection(),
          this.social.accountSection(),
          h('button', {
            class: 'btn btn--secondary',
            text: t('settings.replayIntro'),
            onClick: () => this.replayIntro(),
          }),
          h('button', { class: 'btn btn--danger', text: t('settings.reset'), onClick: () => this.confirmReset() }),
        ),
        ...devButtons,
        h('p', {
          class: 'muted small',
          text: t('settings.version', { game: GAME_TITLE, version: GAME_VERSION }),
        }),
      ],
      buttons: [{ label: t('common.close') }],
    });
  }

  private soundToggle(): HTMLButtonElement {
    const { sound } = this.ctx;
    const label = () => (sound.muted ? t('settings.soundOff') : t('settings.soundOn'));
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
      cycle: t('daynight.cycle'),
      real: t('daynight.real'),
      off: t('daynight.off'),
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
            ? t('daynight.day', { wait })
            : state.phase === 'night'
              ? t('daynight.night', { wait })
              : state.phase === 'dusk'
                ? t('daynight.dusk')
                : t('daynight.dawn');
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
          title: t('reset.title'),
          body: h('p', { text: t('reset.body') }),
          buttons: [
            { label: t('common.cancel'), kind: 'secondary' },
            { label: t('reset.confirm'), kind: 'danger', onClick: () => this.options.onReset() },
          ],
        }),
      250,
    );
  }

  /** La partie a été modifiée dans un autre onglet : on impose un rechargement. */
  showStale(reload: () => void): void {
    this.modals.show({
      title: t('stale.title'),
      kicker: t('stale.kicker'),
      urgent: true,
      dismissible: false,
      body: h('p', { text: t('stale.body') }),
      buttons: [{ label: t('stale.reload'), onClick: reload }],
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
        title: t('pay.title'),
        kicker: t('pay.kicker'),
        urgent: true,
        body: [
          h('p', {}, h('strong', { text: productTitle(product) }), ` — ${productDescription(product)}`),
          h('p', { class: 'muted', text: t('pay.body') }),
        ],
        buttons: [
          { label: t('common.cancel'), kind: 'secondary', onClick: answer(false) },
          { label: t('pay.confirm', { price: product.priceLabel }), kind: 'gold', onClick: answer(true) },
        ],
        onClose: () => {
          if (!answered) resolve(false);
        },
      });
    });
  }
}
