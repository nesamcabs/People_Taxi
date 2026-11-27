import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GeoPlace, LocationItem } from '@core/types';
import { useCustomerData } from '@core/context/CustomerData';
import { deleteSavedPlace, savePlace } from '@core/services/userService';
import { describeError } from '@core/utils/retry';
import { Button, Dialog, EmptyState, Notice, PageHead, Segmented, TextField } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { PlaceField } from '@/components/PlaceField';
import { QUICK_CITIES } from '@/pages/book/content';
import { useDeviceLocation } from '@/lib/hooks';
import { useAuth } from '@/state/Auth';
import { useSeo } from '@/lib/seo';
import { msg, useT } from '@/i18n';

type Kind = 'home' | 'work' | 'favorite';
const ICON: Record<string, string> = { home: 'home', work: 'briefcase', favorite: 'favourite' };

function AddPlaceDialog({ onClose }: { onClose: () => void }) {
  const { profile, savedPlaces } = useCustomerData();
  const { position } = useDeviceLocation(false);
  const [kind, setKind] = useState<Kind>('favorite');
  const [picked, setPicked] = useState<GeoPlace | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = useT();

  const save = async () => {
    if (!picked) return setError(msg('Search for the place to save.'));
    if (!profile) return setError(msg('Sign in to save this place.'));
    const name = kind === 'home' ? 'Home' : kind === 'work' ? 'Work' : label.trim() || picked.name;
    // Only one Home and one Work: replace the existing entry.
    const existing = kind !== 'favorite' ? savedPlaces.find((p) => p.type === kind) : undefined;
    setBusy(true);
    setError('');
    try {
      await savePlace({ ...picked, id: existing?.id ?? '', name, address: picked.address, type: kind }, profile.uid);
      onClose();
    } catch (e) {
      setError(describeError(e, msg('We couldn’t save this place.')));
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={t('Add a saved place')}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('Cancel')}
          </Button>
          <Button loading={busy} disabled={!picked} onClick={() => void save()}>
            {t('Save place')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <Segmented
          label={msg('Place type')}
          value={kind}
          onChange={setKind}
          options={[
            { value: 'home', label: msg('Home') },
            { value: 'work', label: msg('Work') },
            { value: 'favorite', label: msg('Favourite') },
          ]}
        />
        {picked ? (
          <div className="picked">
            <Icon name="location-pin" />
            <div>
              <strong>{picked.name}</strong>
              <small className="muted">{picked.address}</small>
            </div>
            <button type="button" className="link-btn" onClick={() => setPicked(null)}>
              {t('Change')}
            </button>
          </div>
        ) : (
          <div className="search search--field" data-pf-anchor>
            <Icon name="search" size={18} />
            <label className="sr-only" htmlFor="place-q">
              {t('Search address, street or landmark')}
            </label>
            <PlaceField
              inputId="place-q"
              value={null}
              config={{ title: t('Search a place to save'), placeholder: t('Search address, street or landmark'), allowCurrent: true, popular: QUICK_CITIES, popularLabel: t('Popular cities'), near: position, pinMode: 'pickup' }}
              saved={[]}
              recent={[]}
              onSelect={setPicked}
            />
          </div>
        )}
        {kind === 'favorite' && picked ? <TextField label={t('Label (optional)')} value={label} onChange={(e) => setLabel(e.target.value.slice(0, 40))} placeholder={t('e.g. Hospital, College, Mom’s house')} /> : null}
        {error ? <Notice tone="error">{t(error)}</Notice> : null}
      </div>
    </Dialog>
  );
}

export function SavedPlacesPage() {
  const t = useT();
  useSeo({ title: t('Saved Places'), noindex: true });
  const { savedPlaces, profile } = useCustomerData();
  const { openLoginModal } = useAuth();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<LocationItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!profile) {
    return (
      <>
        <PageHead
          eyebrow="Account"
          title="Saved places"
        >
          Home, work and the places you go often — one tap when booking.
        </PageHead>
        <div className="page">
          <div className="card card--center">
            <EmptyState
              art="welcome"
              title={t('Sign in to view saved places')}
              action={
                <Button variant="primary" onClick={() => openLoginModal({ title: msg('Sign in to saved places') })}>
                  {t('Sign in')}
                </Button>
              }
            >
              {t('Sign in with your mobile number to save your home, work and favorite locations for quick booking.')}
            </EmptyState>
          </div>
        </div>
      </>
    );
  }

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await deleteSavedPlace(removing.id);
      setRemoving(null);
    } catch (e) {
      setError(describeError(e, msg('We couldn’t remove this place.')));
      setRemoving(null);
    } finally {
      setBusy(false);
    }
  };

  const order = (p: LocationItem) => (p.type === 'home' ? 0 : p.type === 'work' ? 1 : 2);
  const sorted = [...savedPlaces].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));

  return (
    <>
      <PageHead
        eyebrow="Account"
        title={t('Saved places')}
      >
        {t('Home, work and the places you go often — one tap when booking.')}
      </PageHead>
      <div className="page">
        {error ? <Notice tone="error">{t(error)}</Notice> : null}

        {sorted.length === 0 ? (
          <div className="card card--center">
            <EmptyState
              art="no-saved-places"
              title={t('No saved places yet')}
              action={
                <Button icon="add" onClick={() => setAdding(true)}>
                  {t('Add your first place')}
                </Button>
              }
            >
              {t('Save Home and Work to start a booking in one tap.')}
            </EmptyState>
          </div>
        ) : (
          <ul className="place-grid">
            {sorted.map((p) => (
              <li key={p.id} className="saved">
                <span className="saved__icon">
                  <Icon name={ICON[p.type] ?? 'saved-place'} size={22} />
                </span>
                <span className="saved__text">
                  <strong>{p.type === 'home' || p.type === 'work' ? t(p.name) : p.name}</strong>
                  <small className="muted">{p.address}</small>
                </span>
                <button type="button" className="icon-btn" aria-label={t('Remove {name}', { name: p.name })} onClick={() => setRemoving(p)}>
                  <Icon name="trash" size={20} />
                </button>
              </li>
            ))}
            <li>
              <button type="button" className="saved saved--add" onClick={() => setAdding(true)}>
                <span className="saved__icon">
                  <Icon name="add" size={20} />
                </span>
                <span className="saved__text">
                  <strong>{t('Add a place')}</strong>
                  <small className="muted">{t('Home, work or anywhere you go often')}</small>
                </span>
              </button>
            </li>
          </ul>
        )}
      </div>

      {adding ? <AddPlaceDialog onClose={() => setAdding(false)} /> : null}
      {removing ? (
        <Dialog
          title={t('Remove this place?')}
          onClose={() => setRemoving(null)}
          dismissible={!busy}
          footer={
            <>
              <Button variant="secondary" onClick={() => setRemoving(null)} disabled={busy}>
                {t('Keep')}
              </Button>
              <Button variant="primary" loading={busy} onClick={() => void remove()}>
                {t('Remove')}
              </Button>
            </>
          }
        >
          <p className="muted">{t('“{name}” will be removed from your saved places.', { name: removing.name })}</p>
        </Dialog>
      ) : null}
    </>
  );
}
