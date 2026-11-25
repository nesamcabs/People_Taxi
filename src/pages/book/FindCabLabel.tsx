// The home booking form's main action: "Find Cab", with a cab-and-magnifier outline before it and an arrow after it.
// Presentation only: the button around it keeps its own submit handler and validation.
import './findCabLabel.css';

export function FindCabLabel() {
  return (
    <span className="bf-findcab">
      {/* Front view of a cab with a magnifying glass over its lower right corner. */}
      <svg className="bf-findcab__ico" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M3.5 10.5 5 6.6A2 2 0 0 1 6.9 5.3h6.7a2 2 0 0 1 1.9 1.3l1.3 3.9" />
        <path d="M12.5 17.5H3.4a.9.9 0 0 1-.9-.9v-4.4a1.7 1.7 0 0 1 1.7-1.7h8.3" />
        <path d="M4 17.5v1.7M6 13.6h1.2" />
        <circle cx="17" cy="15.5" r="3.6" />
        <path d="m19.6 18.1 2.4 2.4" />
      </svg>
      <span className="bf-findcab__sep" aria-hidden="true" />
      <span className="bf-findcab__text">Find Cab</span>
      <svg className="bf-findcab__ico bf-findcab__arrow" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}
