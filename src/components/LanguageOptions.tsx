// The two app languages as a short radio list (Account › Settings › Language / மொழி). The current one carries a ✓.
// Choosing one applies straight away, on every screen (see @/i18n): nothing reloads or remounts.
import { LANGUAGES, setLanguage, useLanguage, useT } from '@/i18n';

export function LanguageOptions({ onChosen }: { onChosen?: () => void }) {
  const lang = useLanguage();
  const t = useT();
  return (
    <div className="lang-options" role="radiogroup" aria-label={t('App language')}>
      {LANGUAGES.map((l) => {
        const on = l.id === lang;
        return (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={on}
            lang={l.id}
            className={`lang-option ${on ? 'is-on' : ''}`}
            onClick={() => {
              setLanguage(l.id);
              onChosen?.();
            }}
          >
            <span className="lang-option__label">{l.label}</span>
            <span className="lang-option__check" aria-hidden="true">
              {on ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** The current language's own name ("English" / "தமிழ்"), for the settings row's value. */
export function useLanguageName(): string {
  const lang = useLanguage();
  return LANGUAGES.find((l) => l.id === lang)?.label ?? 'English';
}
