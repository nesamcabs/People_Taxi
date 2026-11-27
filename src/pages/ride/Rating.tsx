import { useState } from 'react';
import type { TripRecord, UserProfile } from '@core/types';
import { rateTrip } from '@core/services/rideService';
import { describeError } from '@core/utils/retry';
import { RATING_LABELS, RATING_REASONS, RATING_TAGS, emptyRatingForm, isLowRating, ratingPayload, ratingProblem, type RatingForm } from '@core/data/ratingPolicy';
import { Button, Notice } from '@/components/ui';
import { msg, useT } from '@/i18n';

/**
 * End-of-trip driver rating. A low rating (2 stars or fewer) asks what went wrong, what happened and what should be
 * improved; the server keeps it on the driver's profile and opens a follow-up for the office.
 */
export function RatingCard({ trip, profile }: { trip: TripRecord; profile: UserProfile }) {
  const [form, setForm] = useState<RatingForm>(emptyRatingForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const t = useT();
  const set = (patch: Partial<RatingForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError('');
  };

  if (trip.rating != null || sent) {
    const done = trip.rating ?? form.stars;
    return (
      <section className="card rating rating--done">
        <p className="rating__stars" aria-label={t('You rated this trip {n} out of 5', { n: done })}>
          {'★'.repeat(done)}
          <span>{'★'.repeat(5 - done)}</span>
        </p>
        <p className="muted">{t(isLowRating(done) ? 'Thank you. We are sorry about this trip and will look into it.' : 'Thanks for rating your trip.')}</p>
      </section>
    );
  }

  const stars = form.stars;
  const low = isLowRating(stars);
  const problem = ratingProblem(form);

  const submit = async () => {
    if (problem) return setError(problem);
    setBusy(true);
    setError('');
    try {
      await rateTrip(trip, profile, ratingPayload(form));
      setSent(true);
    } catch (e) {
      setError(describeError(e, msg('We couldn’t save your rating. Please try again.')));
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const tagSet = stars <= 3 ? RATING_TAGS.mid : RATING_TAGS.high;
  return (
    <section className="card rating" aria-labelledby="rate-title">
      <h2 id="rate-title">{trip.driver ? t('How was your ride with {name}?', { name: trip.driver.name }) : t('How was your ride?')}</h2>
      <div className="rating__row" role="radiogroup" aria-label={t('Rating')}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={stars === s}
            aria-label={s > 1 ? t('{n} stars', { n: s }) : t('1 star')}
            className={`rating__star ${s <= stars ? 'is-on' : ''}`}
            onClick={() => set({ stars: s, tags: [], reason: '', feedback: '', improvements: '', comment: '' })}
          >
            ★
          </button>
        ))}
      </div>
      <p className="muted small rating__label" aria-live="polite">
        {t(RATING_LABELS[stars] ?? '')}
      </p>

      {low ? (
        <>
          <p className="rating__lead">{t('We’re sorry your ride wasn’t good. Please tell us what went wrong so we can put it right.')}</p>
          <p className="rating__q" id="rating-reason-label">{t('What went wrong?')} <span aria-hidden="true">*</span></p>
          <div className="rating__tags" role="radiogroup" aria-labelledby="rating-reason-label">
            {RATING_REASONS.map((r) => (
              <button key={r} type="button" role="radio" aria-checked={form.reason === r} className="chip" aria-pressed={form.reason === r} onClick={() => set({ reason: r })}>
                {t(r)}
              </button>
            ))}
          </div>
          <label className="rating__q" htmlFor="rating-feedback">{t('Tell us what happened')} <span aria-hidden="true">*</span></label>
          <textarea
            id="rating-feedback"
            className="textarea"
            required
            value={form.feedback}
            onChange={(e) => set({ feedback: e.target.value.slice(0, 600) })}
            placeholder={t('What happened on this trip?')}
          />
          <label className="rating__q" htmlFor="rating-improve">{t('What should we improve?')} <span className="muted">{t('(optional)')}</span></label>
          <textarea
            id="rating-improve"
            className="textarea"
            value={form.improvements}
            onChange={(e) => set({ improvements: e.target.value.slice(0, 600) })}
            placeholder={t('How could the driver or NESAM do better?')}
          />
        </>
      ) : stars > 0 ? (
        <>
          <div className="rating__tags">
            {tagSet.map((tag) => (
              <button key={tag} type="button" className="chip" aria-pressed={form.tags.includes(tag)} onClick={() => set({ tags: form.tags.includes(tag) ? form.tags.filter((x) => x !== tag) : [...form.tags, tag] })}>
                {t(tag)}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="rating-comment">
            {t('Anything else? (optional)')}
          </label>
          <textarea id="rating-comment" className="textarea" value={form.comment} onChange={(e) => set({ comment: e.target.value.slice(0, 400) })} placeholder={t('Anything else? (optional)')} />
        </>
      ) : null}
      {error ? <Notice tone="error">{t(error)}</Notice> : null}
      <Button block loading={busy} disabled={!stars || (low && !!problem)} onClick={() => void submit()}>
        {t('Submit rating')}
      </Button>
    </section>
  );
}
