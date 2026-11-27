// How the notifications page lays out one entry. The text is written by the server as one sentence
// ("Your booking CODE for 27 Nov 2026, 06:00 PM (A → B) is confirmed. Fare ₹7,017. …"); a booking message in that shape is
// split into its facts. Anything else returns null and is shown exactly as written.

export interface BookingNotice {
  code: string;
  pickup: string;
  from: string;
  to: string;
  fare: string;
  /** Whatever the sentence says beyond those facts (empty when nothing). */
  note: string;
}

const BOOKING = /^Your booking\s+(\S+)\s+for\s+(.+?\d{1,2}:\d{2}\s*[AP]M)\s+\((.+?)\s*(?:→|->)\s*(.+?)\)(?=\s+(?:is|has|was)\b)\s+(.*)$/is;

export function parseBookingNotice(message: string): BookingNotice | null {
  const m = BOOKING.exec(message.trim());
  if (!m) return null;
  let fare = '';
  const note = m[5]!
    .trim()
    .replace(/^is confirmed\b[.!]?\s*/i, '')
    .replace(/\bFare:?\s*(₹\s?\d[\d,]*(?:\.\d+)?)[.]?\s*/i, (_all, amount: string) => {
      fare = amount.replace(/\s/g, '');
      return '';
    })
    .trim();
  return {
    code: m[1]!,
    pickup: m[2]!.trim(),
    from: m[3]!.trim(),
    to: m[4]!.trim(),
    fare,
    // "has been cancelled." and the like must stay a readable sentence.
    note: /^(is|has|was)\b/i.test(note) ? `Your booking ${note}` : note,
  };
}

/** "Today", "Yesterday" or "26 Nov 2026"; entries without a time yet are "Earlier". */
export function dayLabel(ms: number, now: Date, locale = 'en-GB'): string {
  if (!ms) return 'Earlier';
  const day = new Date(ms);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((midnight(now) - midnight(day)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return day.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}
