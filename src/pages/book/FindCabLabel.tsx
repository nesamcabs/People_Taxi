// The home booking form's main action: "Find Cab", with a cab inside a gentle radar pulse before it.
// Presentation only: the button around it keeps its own submit handler, validation and states. The pulse is decorative.
import { useT } from '@/i18n';
import './findCabLabel.css';

export function FindCabLabel() {
  const t = useT();
  return (
    <span className="bf-findcab">
      <span className="bf-findcab__radar" aria-hidden="true">
        <span className="bf-findcab__ring" />
        <span className="bf-findcab__ring" />
        <span className="bf-findcab__ring" />
        {/* Front view of a taxi: roof sign, body with windscreen, headlights, wheels. */}
        <svg className="bf-findcab__cab" viewBox="0 0 24 24" width="20" height="20" focusable="false">
          <path fill="currentColor" d="M9.6 2.8h4.8a.9.9 0 0 1 .9.9v1.5H8.7V3.7a.9.9 0 0 1 .9-.9Z" />
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M7.4 6.2h9.2a2.2 2.2 0 0 1 2.06 1.43l1.33 3.57A2.6 2.6 0 0 1 21.6 13.3v3.4a1.3 1.3 0 0 1-1.3 1.3h-.5v1.2a1.6 1.6 0 0 1-3.2 0V18H7.4v1.2a1.6 1.6 0 0 1-3.2 0V18h-.5a1.3 1.3 0 0 1-1.3-1.3v-3.4a2.6 2.6 0 0 1 1.61-2.4l1.33-3.57A2.2 2.2 0 0 1 7.4 6.2Zm.34 1.9a.7.7 0 0 0-.66.46L6.03 11h11.94l-1.05-2.44a.7.7 0 0 0-.66-.46H7.74ZM6.4 13.2a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Zm11.2 0a1.45 1.45 0 1 0 0 2.9 1.45 1.45 0 0 0 0-2.9Z"
          />
        </svg>
      </span>
      <span className="bf-findcab__text">{t('Find Cab')}</span>
    </span>
  );
}
