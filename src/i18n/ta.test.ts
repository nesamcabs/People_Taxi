// Every English text the app marks for translation (t('…'), tr('…'), msg('…'), translate('…')) has a Tamil line, and every
// Tamil line keeps its English key's {placeholders}. A new or edited English string without Tamil fails here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TA } from './ta';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CALL = /\b(?:t|tr|tx|msg|translate)\(\s*'((?:\\.|[^'\\])*)'/g;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'i18n' ? [] : sourceFiles(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** The English keys used in the code, with the files that use them. */
export function usedKeys(): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(CALL)) {
      const key = m[1]!.replace(/\\(.)/g, '$1');
      if (!key.trim()) continue;
      keys.set(key, [...(keys.get(key) ?? []), path.relative(SRC, file)]);
    }
  }
  return keys;
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('Tamil translations', () => {
  it('cover every English text marked for translation', () => {
    const missing = [...usedKeys()].filter(([key]) => !(key in TA)).map(([key, files]) => `${key}   ← ${[...new Set(files)].join(', ')}`);
    expect(missing).toEqual([]);
  });

  it('keep each key’s placeholders', () => {
    const wrong = Object.entries(TA).filter(([en, ta]) => placeholders(en).join() !== placeholders(ta).join()).map(([en, ta]) => `${en} → ${ta}`);
    expect(wrong).toEqual([]);
  });

  it('are not left in English', () => {
    // A Tamil line identical to its key is a forgotten translation (brand words such as "OTP" are allowed).
    const same = Object.entries(TA).filter(([en, ta]) => en === ta && /[a-z]{3}/.test(en.replace(/OTP|UPI|SMS|GST|CNG|SOS|NESAM|People Taxi|WhatsApp|AC/g, '')));
    expect(same).toEqual([]);
  });
});
