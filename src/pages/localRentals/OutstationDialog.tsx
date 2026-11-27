// Shown when the drop chosen on Local Pickup & Drop is outside the city: the journey, its distance, and the choice
// to move it to an Outstation booking or stay on Local.
import { Button, Dialog } from '@/components/ui';
import './outstationDialog.css';

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
  return (
    <Dialog
      className="ostn"
      title={
        <>
          <span className="ostn__eyebrow">Service advisory</span>
          Outstation service required
        </>
      }
      onClose={onStay}
      footer={
        <>
          <Button variant="secondary" onClick={onStay}>Remain on Local</Button>
          <Button onClick={onSwitch}>Continue with Outstation</Button>
        </>
      }
    >
      <div className="ostn__trip">
        <div className="ostn__place">
          <small>Pickup</small>
          <strong>{from}</strong>
        </div>
        <div className="ostn__gap">
          <b>≈ {km} km</b>
          <i aria-hidden="true" />
        </div>
        <div className="ostn__place ostn__place--end">
          <small>Drop</small>
          <strong>{to}</strong>
        </div>
      </div>

      <p className="ostn__text">
        <b>Local Pickup &amp; Drop</b> covers travel within one city. We recommend booking this journey as an <b>Outstation</b> trip.
      </p>
    </Dialog>
  );
}
