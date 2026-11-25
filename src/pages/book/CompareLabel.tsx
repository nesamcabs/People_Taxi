// The home booking form's main action: "Compare", with a car-front outline before it and an arrow after it.
// Presentation only: the button around it keeps its own submit handler and validation.
import './compareLabel.css';

export function CompareLabel() {
  return (
    <span className="bf-compare">
      <svg className="bf-compare__ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M5 11 6.6 6.4A2 2 0 0 1 8.5 5h7a2 2 0 0 1 1.9 1.4L19 11M5 11h14a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-3.5A1.5 1.5 0 0 1 5 11ZM6 17v2M18 17v2M7.5 14h1M15.5 14h1" />
      </svg>
      <span>Compare</span>
      <svg className="bf-compare__ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </span>
  );
}
