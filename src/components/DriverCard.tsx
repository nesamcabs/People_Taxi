// The rider's driver and cab, wherever a booking shows them (the confirmation page and the live ride page): the driver's
// live selfie and the cab's front photo from the driver app's pre-trip check, the number plate, and Call / WhatsApp.
// Until the driver has done that check, the profile photo (or initials) and the cab type's picture stand in.
import { useEffect, useState } from 'react';
import type { RideCategory, TripRecord } from '@core/types';
import { fetchDriverPhotos, type DriverPhotos } from '@core/services/rideService';
import { formatPhone, formatTime, localMobile } from '@core/utils/format';
import { Icon } from '@/components/Icon';
import { tripCategoryName, tripCategoryPhoto } from '@/lib/categories';
import { useT } from '@/i18n';
import './driverCard.css';

const NONE: DriverPhotos = { selfieUrl: '', carUrl: '', profileUrl: '', checkedAt: '' };

/** Asks again when the driver changes or finishes the photo check; a failure just leaves the stand-ins. */
function useDriverPhotos(bookingId: string, driverId: string, checkedAt: string): DriverPhotos {
  const [got, setGot] = useState<{ driverId: string; photos: DriverPhotos } | null>(null);
  useEffect(() => {
    let live = true;
    fetchDriverPhotos(bookingId)
      .then((photos) => live && setGot({ driverId, photos }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [bookingId, driverId, checkedAt]);
  return got?.driverId === driverId ? got.photos : NONE;
}

const initialsOf = (name: string) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();

/** `actions={false}` hides Call / WhatsApp (the rider is already in the cab). */
export function DriverCard({ trip, categories, actions = true }: { trip: TripRecord; categories: RideCategory[]; actions?: boolean }) {
  const t = useT();
  const driver = trip.driver;
  const photos = useDriverPhotos(trip.id, driver?.id ?? '', driver?.checkedAt ?? '');
  const [broken, setBroken] = useState<string[]>([]);
  if (!driver) return null;

  const usable = (url: string) => (url && !broken.includes(url) ? url : '');
  const failed = (url: string) => () => setBroken((b) => [...b, url]);
  const selfie = usable(photos.selfieUrl);
  const face = selfie || usable(photos.profileUrl) || usable(driver.photoUrl);
  const car = usable(photos.carUrl);
  const phone = localMobile(driver.phone);
  const cabName = driver.vehicleModel || tripCategoryName(categories, trip);
  const taken = photos.checkedAt ? new Date(photos.checkedAt) : null;
  const firstName = driver.name.split(' ')[0] || t('driver');

  return (
    <section className="dvc" aria-label={t('Your driver')}>
      <header className="dvc__band">
        <Icon name={selfie ? 'shield-check' : 'user'} size={14} />
        <span>{t(selfie ? 'Verified driver' : 'Your driver')}</span>
        {selfie && taken && !Number.isNaN(taken.getTime()) ? <small>{t('Selfie taken at {time}', { time: formatTime(taken) })}</small> : null}
      </header>

      <div className="dvc__id">
        {face ? (
          <a className="dvc__face" href={face} target="_blank" rel="noopener noreferrer" aria-label={t('Open driver photo')}>
            <img src={face} alt={driver.name} onError={failed(face)} />
          </a>
        ) : (
          <span className="dvc__face dvc__face--initials" aria-hidden="true">
            {initialsOf(driver.name)}
          </span>
        )}
        <div className="dvc__who">
          <strong>{driver.name}</strong>
          {driver.rating != null ? <span className="dvc__rating">★ {driver.rating.toFixed(1)}</span> : null}
          {phone ? (
            <a className="dvc__phone num" href={`tel:+91${phone}`}>
              {formatPhone(phone)}
            </a>
          ) : null}
        </div>
      </div>

      <figure className={`dvc__cab ${car ? 'is-photo' : 'is-art'}`}>
        {car ? (
          <a href={car} target="_blank" rel="noopener noreferrer" aria-label={t('Open cab photo')}>
            <img src={car} alt={cabName} onError={failed(car)} />
          </a>
        ) : (
          <img src={tripCategoryPhoto(categories, trip)} alt="" />
        )}
        {driver.vehicleNumber ? (
          <span className="dvc__plate">
            <i aria-hidden="true">IND</i>
            <b>{driver.vehicleNumber}</b>
          </span>
        ) : null}
        <figcaption>
          <b>{cabName}</b>
          {car ? null : <small>{t('Live cab photo appears after the driver’s pre-trip check.')}</small>}
        </figcaption>
      </figure>

      {!actions ? (
        <span className="dvc__end" aria-hidden="true" />
      ) : phone ? (
        <div className="dvc__actions">
          <a className="dvc__call" href={`tel:+91${phone}`}>
            <Icon name="phone" size={16} /> {t('Call {name}', { name: firstName })}
          </a>
          <a className="dvc__wa" href={`https://wa.me/91${phone}`} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" size={16} /> WhatsApp
          </a>
        </div>
      ) : (
        <p className="dvc__nophone">{t('No phone number on file for this driver')}</p>
      )}
    </section>
  );
}
