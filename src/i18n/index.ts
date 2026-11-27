// App language: English (default) or Tamil. The rider picks it under Account › Settings › Language; the choice is kept on
// this device (localStorage), so it survives closing and reopening the app.
//
// The English text itself is the key (gettext style): `t('Sign in')` shows the Tamil line from ./ta when Tamil is on,
// and the English text when it is off or has no translation yet. Because of that, a message kept in component state in
// English (a validation error, a server reply) is translated when it is shown, so switching language changes it too.
//
// Switching only re-renders: no screen is remounted, so a half-filled booking form, the selected cab and any open
// dialog stay exactly as they were.
import { Fragment, createElement, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { TA } from './ta';

export type Lang = 'en' | 'ta';
export type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

export const LANGUAGES: readonly { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'ta', label: 'தமிழ்' },
];

export const LANG_STORAGE_KEY = 'peopletaxi.lang';
const DEFAULT_LANG: Lang = 'en';

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ta';

function readStored(): Lang {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    return isLang(v) ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

let current: Lang = typeof window === 'undefined' ? DEFAULT_LANG : readStored();
const listeners = new Set<() => void>();

function applyToDocument(lang: Lang): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
}
applyToDocument(current);

function emit(): void {
  applyToDocument(current);
  listeners.forEach((fn) => fn());
}

export const getLanguage = (): Lang => current;

export function setLanguage(lang: Lang): void {
  if (!isLang(lang) || lang === current) return;
  current = lang;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* private mode / storage full: the choice still applies for this visit */
  }
  emit();
}

/** Another tab changed the language: follow it. */
function onStorage(e: StorageEvent): void {
  if (e.key !== LANG_STORAGE_KEY) return;
  const next = isLang(e.newValue) ? e.newValue : DEFAULT_LANG;
  if (next === current) return;
  current = next;
  emit();
}

export function subscribeLanguage(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1 && typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text);

// Messages built elsewhere with the numbers already in them ("You can book up to 30 days ahead." from the booking rules, a
// server reply) are matched against the templated keys ("You can book up to {n} days ahead."). Only templates with enough
// fixed words take part, so a name or an address is never mistaken for one. A captured value that is itself a key (a
// service name) is translated too; anything else (numbers, places, names) is kept as it is.
const MIN_FIXED_CHARS = 10;
interface Pattern {
  re: RegExp;
  names: string[];
  out: string;
}
let patterns: Pattern[] | null = null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function buildPatterns(): Pattern[] {
  const list: Pattern[] = [];
  for (const [key, out] of Object.entries(TA)) {
    if (!key.includes('{') || key.replace(/\{\w+\}/g, '').trim().length < MIN_FIXED_CHARS) continue;
    const names: string[] = [];
    const src = key
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return escapeRe(part);
        names.push(m[1]!);
        return '(.+?)';
      })
      .join('');
    list.push({ re: new RegExp(`^${src}$`, 's'), names, out });
  }
  return list;
}
const matched = new Map<string, string | null>();
function matchPattern(text: string): string | null {
  const known = matched.get(text);
  if (known !== undefined) return known;
  patterns ??= buildPatterns();
  let result: string | null = null;
  for (const p of patterns) {
    const m = p.re.exec(text);
    if (!m) continue;
    const vars: Vars = {};
    p.names.forEach((name, i) => {
      const v = m[i + 1]!;
      vars[name] = TA[v] ?? v;
    });
    result = fill(p.out, vars);
    break;
  }
  if (matched.size > 2000) matched.clear();
  matched.set(text, result);
  return result;
}

/** The text in `lang` (the current language by default), with `{name}` placeholders filled from `vars`. */
export function translate(text: string, vars?: Vars, lang: Lang = current): string {
  if (!text || typeof text !== 'string') return text;
  if (lang !== 'ta') return fill(text, vars);
  const exact = TA[text];
  if (exact !== undefined) return fill(exact, vars);
  if (vars) return fill(text, vars);
  return matchPattern(text) ?? text;
}

/** A translated sentence with elements (links, bold numbers) in it: `{name}` placeholders become `parts[name]`.
 *  Tamil puts the verb last, so a sentence is translated whole and the links move with the words. */
export function richText(text: string, parts: Record<string, ReactNode>): ReactNode {
  const pieces = text.split(/\{(\w+)\}/g).map((piece, i) => (i % 2 === 1 ? (piece in parts ? parts[piece] : `{${piece}}`) : piece));
  return createElement(Fragment, null, ...pieces);
}

/** Marks an English string as translatable where it is defined (a list of labels, a returned message) without
 *  translating it there: it is translated where it is shown. Lets the translation test find it. */
export const msg = <T extends string>(text: T): T => text;

/** The current language; the component re-renders when it changes. */
export function useLanguage(): Lang {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => DEFAULT_LANG);
}

/** `t(english, vars?)` for the current language; the component re-renders when the language changes. */
export function useT(): Translate {
  const lang = useLanguage();
  return useCallback<Translate>((text, vars) => translate(text, vars, lang), [lang]);
}

/** BCP 47 locale for dates and times in the current language (numbers and fares stay in the Indian English format). */
export const dateLocale = (lang: Lang = current): string => (lang === 'ta' ? 'ta-IN' : 'en-IN');
