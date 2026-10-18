import { describe, expect, it } from 'vitest';
import type { KeyValueStorage } from '@/core/save';
import { InboxStore } from './inbox';

function memory(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe('centre de notifications', () => {
  it('range les messages, du plus récent au plus ancien, et compte les non lus', () => {
    const storage = memory();
    const inbox = new InboxStore(storage);
    inbox.add({ kind: 'quest', text: 'Objectif accompli' }, undefined, true);
    inbox.add({ kind: 'neighbor', text: 'Léa vous a aidé' });
    expect(inbox.list().map((i) => i.text)).toEqual(['Léa vous a aidé', 'Objectif accompli']);
    expect(inbox.unread()).toBe(1);
    // Relu depuis le stockage (redémarrage du jeu).
    expect(new InboxStore(storage).list()).toHaveLength(2);
    inbox.markAllRead();
    expect(inbox.unread()).toBe(0);
  });

  it('remplace un message regroupable encore non lu, pas un message déjà lu', () => {
    const inbox = new InboxStore(memory());
    inbox.add({ kind: 'crop', text: '2 champs sont prêts' }, 'crop');
    inbox.add({ kind: 'crop', text: '3 champs sont prêts' }, 'crop');
    expect(inbox.list().map((i) => i.text)).toEqual(['3 champs sont prêts']);
    inbox.markAllRead();
    inbox.add({ kind: 'crop', text: '1 champ est prêt' }, 'crop');
    expect(inbox.list().map((i) => i.text)).toEqual(['1 champ est prêt', '3 champs sont prêts']);
    expect(new Set(inbox.list().map((i) => i.id)).size).toBe(2);
  });

  it('garde au plus 50 messages', () => {
    const inbox = new InboxStore(memory());
    for (let i = 0; i < 60; i++) inbox.add({ kind: 'market', text: `Vente ${i}` });
    expect(inbox.list()).toHaveLength(50);
    expect(inbox.list()[0]?.text).toBe('Vente 59');
  });
});
