// The language switch: English by default, the choice kept on the device, every listener told, and translation rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Mod = typeof import('./index');

/** A fresh copy of the module with a fake browser window (storage + storage events) behind it, as on a new page load. */
async function load(stored?: string): Promise<{ mod: Mod; store: Map<string, string>; fire: (e: { key: string; newValue: string | null }) => void }> {
  const store = new Map<string, string>(stored ? [['peopletaxi.lang', stored]] : []);
  const handlers = new Set<(e: unknown) => void>();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    addEventListener: (_: string, fn: (e: unknown) => void) => handlers.add(fn),
    removeEventListener: (_: string, fn: (e: unknown) => void) => handlers.delete(fn),
  });
  vi.stubGlobal('document', { documentElement: { lang: '' } });
  vi.resetModules();
  const mod = await import('./index');
  return { mod, store, fire: (e) => handlers.forEach((fn) => fn(e)) };
}

describe('app language', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('starts in English when nothing was chosen', async () => {
    const { mod } = await load();
    expect(mod.getLanguage()).toBe('en');
    expect(mod.translate('Sign in')).toBe('Sign in');
    expect((globalThis as unknown as { document: { documentElement: { lang: string } } }).document.documentElement.lang).toBe('en');
  });

  it('ignores an unknown stored value', async () => {
    const { mod } = await load('fr');
    expect(mod.getLanguage()).toBe('en');
  });

  it('switches to Tamil at once, saves it, and tells every listener', async () => {
    const { mod, store } = await load();
    const heard = vi.fn();
    const stop = mod.subscribeLanguage(heard);
    mod.setLanguage('ta');
    expect(mod.getLanguage()).toBe('ta');
    expect(store.get('peopletaxi.lang')).toBe('ta');
    expect(heard).toHaveBeenCalledTimes(1);
    expect(mod.translate('Sign in')).toBe('உள்நுழை');
    expect((globalThis as unknown as { document: { documentElement: { lang: string } } }).document.documentElement.lang).toBe('ta');
    mod.setLanguage('ta'); // no change, no notice
    expect(heard).toHaveBeenCalledTimes(1);
    mod.setLanguage('en');
    expect(mod.translate('Sign in')).toBe('Sign in');
    expect(store.get('peopletaxi.lang')).toBe('en');
    stop();
  });

  it('keeps the choice after the app is closed and opened again', async () => {
    const first = await load();
    first.mod.setLanguage('ta');
    const saved = first.store.get('peopletaxi.lang');
    const reopened = await load(saved);
    expect(reopened.mod.getLanguage()).toBe('ta');
    expect(reopened.mod.translate('My trips')).toBe('என் பயணங்கள்');
  });

  it('follows a change made in another tab', async () => {
    const { mod, fire } = await load();
    const heard = vi.fn();
    mod.subscribeLanguage(heard);
    fire({ key: 'peopletaxi.lang', newValue: 'ta' });
    expect(mod.getLanguage()).toBe('ta');
    expect(heard).toHaveBeenCalled();
  });
});

describe('translate', () => {
  it('fills placeholders in both languages', async () => {
    const { mod } = await load();
    expect(mod.translate('Resend code in {n}s', { n: 12 })).toBe('Resend code in 12s');
    expect(mod.translate('Resend code in {n}s', { n: 12 }, 'ta')).toBe('12 வினாடியில் மீண்டும் அனுப்பலாம்');
  });

  it('shows English for a text with no Tamil line, and never changes names, places or IDs', async () => {
    const { mod } = await load();
    for (const text of ['Ravi Kumar', 'Chennai Central', 'PT-20391', '₹1,250', 'Anna Nagar to Road']) expect(mod.translate(text, undefined, 'ta')).toBe(text);
  });

  it('translates a message built elsewhere with its values in it', async () => {
    const { mod } = await load();
    expect(mod.translate('You can book up to 30 days ahead.', undefined, 'ta')).toBe('30 நாட்கள் முன்கூட்டியே வரை முன்பதிவு செய்யலாம்.');
    // A captured value that is itself a key (a service name) is translated too.
    expect(mod.translate('One Way is currently unavailable. Please choose another service.', undefined, 'ta')).toBe('ஒருவழி சேவை தற்போது கிடைக்கவில்லை. வேறு சேவையைத் தேர்ந்தெடுக்கவும்.');
  });

  it('marks text for translation without translating it', async () => {
    const { mod } = await load();
    mod.setLanguage('ta');
    expect(mod.msg('Sign in')).toBe('Sign in');
  });

  it('builds a sentence with elements in the translated word order', async () => {
    const { mod } = await load();
    const node = mod.richText(mod.translate('{code} applied', undefined, 'ta'), { code: 'SAVE10' }) as { props: { children: unknown[] } };
    expect(node.props.children).toEqual(['', 'SAVE10', ' பயன்படுத்தப்பட்டது']);
  });
});
