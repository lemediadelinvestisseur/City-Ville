import { describe, expect, it } from 'vitest';
import { CHAT, cleanChatText, isChannel } from './chat';

describe('chat', () => {
  it('normalise les espaces et coupe les messages trop longs', () => {
    expect(cleanChatText('  Salut\n\n tout   le monde  ')).toBe('Salut tout le monde');
    expect([...cleanChatText('a'.repeat(500))]).toHaveLength(CHAT.maxLength);
  });

  it('masque les liens, adresses e-mail et insultes (sans casse ni accents)', () => {
    expect(cleanChatText('Va sur https://arnaque.example/x ou www.pub.com')).toBe('Va sur *** ou ***');
    expect(cleanChatText('écris à moi@exemple.fr')).toBe('écris à ***');
    expect(cleanChatText('Quel CONNARD')).toBe('Quel *******');
    expect(cleanChatText('Bâtard !')).toBe('****** !');
    expect(cleanChatText('bande de connards')).toBe('bande de ********');
    // Un mot qui en contient un autre n'est pas touché.
    expect(cleanChatText('Mon computer rame')).toBe('Mon computer rame');
  });

  it('accepte le salon mondial et ceux des langues proposées', () => {
    expect(isChannel('world')).toBe(true);
    expect(isChannel('lang:ja')).toBe(true);
    expect(isChannel('lang:xx')).toBe(false);
    expect(isChannel('admin')).toBe(false);
  });
});
