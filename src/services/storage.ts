import type { KeyValueStorage } from '@/core/save';

/**
 * Stockage local tolérant aux pannes : en navigation privée, en aperçu ou si le
 * navigateur bloque le stockage, on bascule sur une mémoire temporaire.
 */
export function safeStorage(): KeyValueStorage & { persistent: boolean } {
  try {
    const probe = '__city_ville_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return {
      persistent: true,
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    };
  } catch {
    const memory = new Map<string, string>();
    return {
      persistent: false,
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => void memory.set(key, value),
      removeItem: (key) => void memory.delete(key),
    };
  }
}
