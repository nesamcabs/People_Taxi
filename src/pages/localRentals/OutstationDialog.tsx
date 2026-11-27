// Shown when the drop chosen on Local Pickup & Drop is outside the city: the journey, its distance, and the choice
// to move it to an Outstation booking or stay on Local.
import { Button, Dialog } from '@/components/ui';
import './outstationDialog.css';
import { richText, useT } from '@/i18n';

export function OutstationDialog({
  from,
  to,
  km,
  onStay,
  onSwitch,
}: {
  from: string;
  to: string;
  km: number;
  onStay: () => void;
  onSwitch: () => void;
}) {
  const t = useT();
  return (
    <Dialog
      className="ostn"
      title={
        <>
          <span className="ostn__eyebrow">{t('Service advisory')}</span>
          {t('Outstation service required')}
        </>
      }
      onClose={onStay}
      footer={
        <>
          <Button variant="secondary" onClick={onStay}>{t('Remain on Local')}</Button>
          <Button onClick={onSwitch}>{t('Continue with Outstation')}</Button>
        </>
      }
    >
      <div className="ostn__trip">
        <div className="ostn__place">
          <small>{t('Pickup')}</small>
          <strong>{from}</strong>
        </div>
        <div className="ostn__gap">
          <b>≈ {km} km</b>
          <i aria-hidden="true" />
        </div>
        <div className="ostn__place ostn__place--end">
          <small>{t('Drop')}</small>
          <strong>{to}</strong>
        </div>
      </div>

      <p className="ostn__text">
        {richText(t('{local} covers travel within one city. We recommend booking this journey as an {outstation} trip.'), { local: <b key="l">{t('Local Pickup & Drop')}</b>, outstation: <b key="o">{t('Outstation')}</b> })}
      </p>
    </Dialog>
  );
}
