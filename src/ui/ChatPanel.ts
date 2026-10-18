import { CHAT, MUTE_MINUTES } from '@/core/chat';
import type { KeyValueStorage } from '@/core/save';
import { formatRelative, formatTime, language, t } from '@/i18n';
import type { Backend, ChatFeed, ChatMessage, ChatPulse } from '@/services/online/Backend';
import { clear, h, icon } from './dom';
import { formatDuration } from './format';
import { Icons } from './icons';
import { backendErrorMessage } from './messages';
import type { ModalButton, Modals } from './Modals';
import { avatar } from './NeighborsPanel';
import { languageName } from './Onboarding';
import type { ToastKind } from './Toasts';

const READ_KEY = 'city-ville:chat-read';

export interface ChatCallbacks {
  toast: (text: string, kind: ToastKind) => void;
  /** Visite la ville de l'auteur d'un message. */
  visit: (playerId: string, pseudo: string) => void;
  /** Bloque l'auteur d'un message (avec confirmation). */
  block: (playerId: string, pseudo: string) => void;
  onToggle: () => void;
  /** Nouveaux messages non lus (pastille du bouton). */
  onUnread: (unread: boolean) => void;
  /** Date de la dernière annonce visible (pour l'afficher en fenêtre). */
  onAnnouncement: (at: number) => void;
}

/**
 * Chat entre joueurs : salon mondial et salon de la langue du joueur, en temps
 * réel. Toucher un message permet de visiter la ville de son auteur, de le
 * signaler ou de le bloquer ; l'équipe de modération peut aussi supprimer un
 * message ou rendre un joueur muet.
 */
export class ChatPanel {
  readonly el = h('section', { class: 'sheet chat', attrs: { 'aria-label': t('chat.title') } });
  private tabs = h('div', { class: 'tabs tabs--center', attrs: { role: 'tablist' } });
  private list = h('div', { class: 'chat__list', attrs: { 'aria-live': 'polite' } });
  private notice = h('p', { class: 'chat__notice' });
  private input = h('input', {
    class: 'field__input chat__input',
    attrs: { maxlength: String(CHAT.maxLength), enterkeyhint: 'send', autocomplete: 'off' },
  });
  private sendButton = h('button', { class: 'chat__send', attrs: { 'aria-label': t('chat.send') } }, icon(Icons.send));
  private readonly channels: string[];
  private channel: string;
  private unsubscribe: (() => void) | null = null;
  private feed: ChatFeed | null = null;
  private sending = false;
  private lastRead: Record<string, number>;
  private latest: Record<string, number> = {};
  isOpen = false;

  constructor(
    private readonly backend: Backend,
    private readonly modals: Modals,
    private readonly storage: KeyValueStorage,
    private readonly callbacks: ChatCallbacks,
  ) {
    this.channels = ['world', `lang:${language()}`];
    this.channel = this.channels[0] ?? 'world';
    try {
      this.lastRead = JSON.parse(storage.getItem(READ_KEY) ?? '{}') as Record<string, number>;
    } catch {
      this.lastRead = {};
    }
    this.input.placeholder = t('chat.placeholder');
    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        void this.send();
      }
    });
    this.sendButton.addEventListener('click', () => void this.send());
    this.el.append(
      h(
        'div',
        { class: 'sheet__header' },
        h('h2', { class: 'sheet__title' }, icon(Icons.chat), ` ${t('chat.title')}`),
        h(
          'button',
          { class: 'sheet__close', attrs: { 'aria-label': t('common.close') }, onClick: () => this.close() },
          icon(Icons.close),
        ),
      ),
      this.tabs,
      this.list,
      h(
        'div',
        { class: 'chat__footer' },
        this.notice,
        h('div', { class: 'chat__composer' }, this.input, this.sendButton),
        h('p', { class: 'chat__rules', text: backend.kind === 'local' ? t('chat.demo') : t('chat.rules') }),
      ),
    );
  }

  /** Abonnement léger permanent : pastille de nouveaux messages et annonces. */
  watch(): void {
    this.backend.watchPulse(this.channels, (pulse) => this.onPulse(pulse));
  }

  open(): void {
    this.isOpen = true;
    this.el.classList.add('is-open');
    this.subscribe();
    this.callbacks.onToggle();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.el.classList.remove('is-open');
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.input.blur();
    this.callbacks.onToggle();
  }

  private subscribe(): void {
    this.unsubscribe?.();
    this.feed = null;
    this.list.dataset.scrolled = '';
    this.renderTabs();
    clear(this.list);
    this.list.append(h('p', { class: 'chat__empty', text: t('common.loading') }));
    const channel = this.channel;
    this.unsubscribe = this.backend.watchChat(
      channel,
      (feed) => {
        if (channel !== this.channel) return;
        this.feed = feed;
        this.render();
        this.markRead(channel, feed.messages.at(-1)?.createdAt ?? 0);
      },
      (error) => {
        clear(this.list);
        this.list.append(
          h('p', {
            class: 'chat__empty',
            text: error.code === 'network' ? t('chat.offline') : backendErrorMessage(error),
          }),
        );
      },
    );
  }

  private renderTabs(): void {
    clear(this.tabs);
    for (const channel of this.channels) {
      const label = channel === 'world' ? t('chat.world') : languageName(channel.slice(5));
      const unread = channel !== this.channel && (this.latest[channel] ?? 0) > (this.lastRead[channel] ?? 0);
      this.tabs.append(
        h(
          'button',
          {
            class: `tab${channel === this.channel ? ' is-active' : ''}`,
            attrs: { role: 'tab', 'aria-selected': String(channel === this.channel) },
            onClick: () => {
              if (channel === this.channel) return;
              this.channel = channel;
              this.subscribe();
            },
          },
          label,
          unread ? h('span', { class: 'tab__dot' }) : null,
        ),
      );
    }
  }

  private render(): void {
    const feed = this.feed;
    if (!feed) return;
    const atBottom = this.list.scrollHeight - this.list.scrollTop - this.list.clientHeight < 60;
    clear(this.list);
    if (feed.messages.length === 0) this.list.append(h('p', { class: 'chat__empty', text: t('chat.empty') }));
    for (const message of feed.messages) this.list.append(this.messageRow(message, feed.canModerate));
    if (atBottom || !this.list.dataset.scrolled) {
      this.list.scrollTop = this.list.scrollHeight;
      this.list.dataset.scrolled = '1';
    }
    // Ce qui empêche d'écrire (sourdine, niveau) s'affiche au-dessus du champ.
    let notice = '';
    if (feed.mutedUntil) notice = t('chat.muted', { when: formatRelative(feed.mutedUntil, Date.now()) });
    else if (!feed.canWrite) notice = t('chat.minLevel', { level: CHAT.minLevel });
    this.notice.textContent = notice;
    this.input.disabled = !feed.canWrite;
    this.sendButton.disabled = !feed.canWrite;
  }

  private messageRow(message: ChatMessage, canModerate: boolean): HTMLElement {
    const announcement = message.kind === 'announcement';
    const staff = message.role
      ? h('span', {
          class: `chat__badge chat__badge--${message.role}`,
          text: t(message.role === 'admin' ? 'chat.staff.admin' : 'chat.staff.moderator'),
        })
      : null;
    const row = h(
      'button',
      {
        class: `msg${message.mine && !announcement ? ' is-mine' : ''}${announcement ? ' is-announcement' : ''}${message.role ? ' is-staff' : ''}`,
        onClick: () => this.actions(message, canModerate),
      },
      announcement ? h('span', { class: 'msg__avatar', html: Icons.megaphone }) : avatar(message.pseudo, 32),
      h(
        'span',
        { class: 'msg__body' },
        h(
          'span',
          { class: 'msg__head' },
          h('span', { class: 'msg__pseudo', text: announcement ? t('chat.announcement') : message.pseudo }),
          staff,
          h('span', { class: 'msg__time', text: formatTime(message.createdAt) }),
        ),
        h('span', { class: 'msg__text', text: message.text }),
      ),
    );
    return row;
  }

  /** Actions possibles sur un message (selon l'auteur et les droits de modération). */
  private actions(message: ChatMessage, canModerate: boolean): void {
    const { backend, callbacks } = this;
    const buttons: ModalButton[] = [];
    const run = (action: () => Promise<unknown>, done?: string) => () => {
      action()
        .then(() => {
          if (done) callbacks.toast(done, 'success');
        })
        .catch((e: unknown) => callbacks.toast(backendErrorMessage(e), 'error'));
    };
    if (message.kind === 'message' && !message.mine) {
      buttons.push(
        {
          label: t('chat.visit'),
          kind: 'secondary',
          onClick: () => {
            this.close();
            callbacks.visit(message.playerId, message.pseudo);
          },
        },
        {
          label: t('chat.report'),
          kind: 'secondary',
          onClick: run(() => backend.reportChat(message.id), t('chat.reported')),
        },
        {
          label: t('chat.block', { pseudo: message.pseudo }),
          kind: 'secondary',
          onClick: () => callbacks.block(message.playerId, message.pseudo),
        },
      );
    }
    if (message.mine || (canModerate && message.kind === 'message')) {
      buttons.push({
        label: t('chat.delete'),
        kind: 'danger',
        onClick: run(() => backend.deleteChat(message.id), t('chat.deleted')),
      });
    }
    if (canModerate && !message.mine && !message.role && message.kind === 'message') {
      for (const minutes of MUTE_MINUTES) {
        const duration = formatDuration(minutes * 60);
        buttons.push({
          label: t('chat.mute', { duration }),
          kind: 'danger',
          onClick: run(
            () => backend.mute(message.playerId, minutes),
            t('chat.muteDone', { pseudo: message.pseudo, duration }),
          ),
        });
      }
    }
    if (buttons.length === 0) return;
    buttons.push({ label: t('common.cancel'), kind: 'secondary' });
    this.modals.show({
      title:
        message.kind === 'announcement' ? t('chat.announcement') : t('chat.actionsTitle', { pseudo: message.pseudo }),
      className: 'modal--actions',
      body: h('p', { class: 'chat__quote', text: message.text }),
      buttons,
    });
  }

  private async send(): Promise<void> {
    const text = this.input.value.trim();
    if (!text || this.sending) return;
    this.sending = true;
    this.sendButton.disabled = true;
    try {
      await this.backend.sendChat(this.channel, text);
      this.input.value = '';
      this.list.dataset.scrolled = '';
    } catch (error) {
      this.callbacks.toast(backendErrorMessage(error), 'error');
    } finally {
      this.sending = false;
      this.sendButton.disabled = !(this.feed?.canWrite ?? true);
    }
  }

  private onPulse(pulse: ChatPulse): void {
    for (const { channel, at } of pulse.latest) this.latest[channel] = at;
    if (this.isOpen) this.renderTabs();
    this.callbacks.onUnread(this.hasUnread());
    if (pulse.announcementAt) this.callbacks.onAnnouncement(pulse.announcementAt);
  }

  private markRead(channel: string, at: number): void {
    if (at <= (this.lastRead[channel] ?? 0)) return;
    this.lastRead[channel] = at;
    try {
      this.storage.setItem(READ_KEY, JSON.stringify(this.lastRead));
    } catch {
      // Sans gravité : la pastille réapparaîtra.
    }
    this.callbacks.onUnread(this.hasUnread());
  }

  private hasUnread(): boolean {
    return this.channels.some((c) => (this.latest[c] ?? 0) > (this.lastRead[c] ?? 0));
  }

  /** Salons suivis (pour les annonces). */
  get watchedChannels(): string[] {
    return this.channels;
  }
}
