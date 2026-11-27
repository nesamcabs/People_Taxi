import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerData } from '@core/context/CustomerData';
import { updateCustomerProfile } from '@core/services/userService';
import { COMPANY_LEGAL_NAME } from '@core/config/constants';
import { formatINR, formatPhone } from '@core/utils/format';
import { describeError } from '@core/utils/retry';
import { Avatar, Button, Dialog, EmptyState, Notice, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { BrandIcon, type BrandIconName } from '@/components/BrandIcon';
import { EmergencyContactForm, PersonalDetailsForm } from '@/components/ProfileForms';
import { PhotoError, uploadProfilePhoto } from '@/lib/avatarUpload';
import { useSeo } from '@/lib/seo';
import { useAuth } from '@/state/Auth';

/** Rows that have their own artwork (public/icons/ui) show it in place of the line icon. */
const ROW_ART: Record<string, BrandIconName> = {
  emergency: 'emergency', 'trip-history': 'trips', receipt: 'payments', offers: 'offers', support: 'support', info: 'about', document: 'terms', phone: 'contact',
};

/** Each kind of row keeps its own icon colour, so a list reads at a glance. */
const TONES: Record<string, string> = {
  'saved-place': 'brand', emergency: 'red', help: 'blue', receipt: 'green', offers: 'gold', 'trip-history': 'brand',
  support: 'blue', phone: 'green', info: 'gold', document: 'brand', jet: 'blue',
};

function Row({ icon, label, value, to, href, onPress, onNavigate, expanded }: { icon: string; label: string; value?: ReactNode; to?: string; href?: string; onPress?: () => void; onNavigate?: () => void; expanded?: boolean }) {
  const tone = TONES[icon] ?? 'brand';
  const cls = `setting setting--${tone}`;
  const inner = (
    <>
      {ROW_ART[icon] ? (
        <span className="setting__icon setting__icon--art">
          <BrandIcon name={ROW_ART[icon]!} size={34} />
        </span>
      ) : (
        <span className="setting__icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      <span className="setting__label">{label}</span>
      {value ? <span className="setting__value truncate">{value}</span> : null}
      {to || href || onPress ? <Icon name="chevron-right" size={18} /> : null}
    </>
  );
  if (onPress)
    return (
      <button type="button" className={`${cls} setting--button`} onClick={onPress} {...(expanded === undefined ? {} : { 'aria-expanded': expanded })}>
        {inner}
      </button>
    );
  if (to)
    return (
      <Link className={cls} to={to} onClick={onNavigate}>
        {inner}
      </Link>
    );
  if (href)
    return (
      <a className={cls} href={href}>
        {inner}
      </a>
    );
  return <div className={cls}>{inner}</div>;
}

type ProfileEditView = 'details' | 'emergency';

/** `drawer`: shown inside the profile side drawer (no page heading or page padding); its edit forms open in place, under the item tapped. */
export function AccountPage({ variant = 'page', onClose }: { variant?: 'page' | 'drawer'; onClose?: () => void }) {
  useSeo(variant === 'page' ? { title: 'My Account', noindex: true } : null);
  const inDrawer = variant === 'drawer';
  const { profile } = useCustomerData();
  const { signOut, openLoginModal } = useAuth();
  const file = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  // Drawer only: the edit form currently open in place (one at a time).
  const [editing, setEditing] = useState<ProfileEditView | null>(null);
  const toggleEdit = (view: ProfileEditView) => setEditing((now) => (now === view ? null : view));
  useEffect(() => {
    if (!editing) return undefined;
    const t = window.setTimeout(() => document.querySelector<HTMLElement>('.inline-edit input:not([readonly])')?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [editing]);

  if (!profile) {
    const signedOut = (
      <>
        <div className="card card--center">
          <EmptyState
            art="welcome"
            title="Sign in to your account"
            action={
              <Button variant="primary" onClick={() => { onClose?.(); openLoginModal({ title: 'Sign in to account' }); }}>
                Sign in
              </Button>
            }
          >
            Sign in to manage your profile, saved addresses and payment options.
          </EmptyState>
        </div>
        {/* Offers and Help are here too, because narrower desktop headers move them into this menu. */}
        <div className="card card--list" style={{ marginTop: 16 }}>
          <Row icon="offers" label="Offers" to="/offers" />
          <Row icon="support" label="Help and support" to="/support" />
          <Row icon="info" label="About People Taxi" to="/about" />
          <Row icon="document" label="Terms, privacy & customer policies" to="/legal" />
        </div>
      </>
    );
    return inDrawer ? <div className="account account--drawer">{signedOut}</div> : (
      <>
        <PageHead title="Account" />
        <div className="page">{signedOut}</div>
      </>
    );
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    setProgress(0);
    try {
      const url = await uploadProfilePhoto(profile.uid, f, setProgress);
      await updateCustomerProfile(profile.uid, { photoUrl: url });
    } catch (e) {
      setError(e instanceof PhotoError ? e.message : describeError(e, 'We couldn’t update your photo.'));
    } finally {
      setProgress(null);
      if (file.current) file.current.value = '';
    }
  };

  const body = (
    <>
        {error ? <Notice tone="error">{error}</Notice> : null}

        <div className={`account ${inDrawer ? 'account--drawer' : ''}`}>
          <aside className="account__side">
            {/* One profile card: photo, name and number on top (tap the name to edit, no separate pencil), then the emergency
                contact as a row inside the same card. Each edit form opens in place, right under what was tapped. */}
            <section className="profile-card profile-card--combined" aria-label="Your profile">
              <div className="profile-card__head">
                <button type="button" className="profile-card__photo" onClick={() => file.current?.click()} disabled={progress != null} aria-label="Change profile photo">
                  <Avatar name={profile.name} photoUrl={profile.photoUrl} size={52} />
                  <span className="profile-card__cam">
                    <Icon name={progress != null ? 'document-upload' : 'camera'} size={12} />
                  </span>
                </button>
                <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
                {(() => {
                  const info = (
                    <>
                      <span className="profile-card__info">
                        <span className="profile-card__name truncate">{profile.name}</span>
                        <span className="profile-card__sub truncate">{progress != null ? `Uploading photo… ${progress}%` : formatPhone(profile.phone)}</span>
                        {profile.email && !inDrawer && progress == null ? <span className="profile-card__sub truncate">{profile.email}</span> : null}
                      </span>
                      <Icon name="chevron-right" size={18} />
                    </>
                  );
                  return inDrawer ? (
                    <button type="button" className={`profile-card__open ${editing === 'details' ? 'is-open' : ''}`} onClick={() => toggleEdit('details')} aria-label="Edit profile" aria-expanded={editing === 'details'}>
                      {info}
                    </button>
                  ) : (
                    <Link className="profile-card__open" to="/account/edit" aria-label="Edit profile">
                      {info}
                    </Link>
                  );
                })()}
              </div>
              {inDrawer && editing === 'details' ? (
                <div className="inline-edit">
                  <PersonalDetailsForm onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
                </div>
              ) : null}
              <div className="profile-card__extra">
                <Row icon="emergency" label="Emergency contact" value={profile.emergencyContact || 'Not set'} {...(inDrawer ? { onPress: () => toggleEdit('emergency'), expanded: editing === 'emergency' } : { to: '/account/emergency' })} />
                {inDrawer && editing === 'emergency' ? (
                  <div className="inline-edit">
                    <EmergencyContactForm onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />
                  </div>
                ) : null}
              </div>
            </section>

            {/* Refund credits live on the Payments page; the drawer stays a short menu. */}
            {inDrawer ? null : (
            <Link className="credit-row" to="/account/payments">
              <Icon name="wallet" size={18} />
              <span>Refund credits</span>
              <strong className="num">{formatINR(profile.walletBalance)}</strong>
              <Icon name="chevron-right" size={16} />
            </Link>
            )}
          </aside>

          <div className="account__groups">
            <section className="group" aria-label="Trips and payments">
              <div className="card card--list">
                <Row icon="trip-history" label="My trips" to="/trips" />
                <Row icon="receipt" label="Payments and refunds" to="/account/payments" />
                <Row icon="offers" label="Offers" to="/offers" />
              </div>
            </section>
            <section className="group" aria-label="Help">
              <div className="card card--list">
                <Row icon="support" label="Help and support" to="/support" />
                <Row icon="info" label="About People Taxi" to="/about" />
                <Row icon="document" label="Terms & policies" to="/legal" />
              </div>
            </section>
            <section className="group" aria-label="Session">
              <div className="card card--list">
                <button type="button" className="setting setting--action" onClick={() => setConfirm(true)}>
                  <span className="setting__icon setting__icon--art"><BrandIcon name="logout" size={34} /></span>
                  <span className="setting__label">Log out</span>
                </button>
              </div>
              <p className="account__legal">© {COMPANY_LEGAL_NAME.replace(/NESAM/g, 'Nesam')}</p>
            </section>
          </div>
        </div>
    </>
  );

  return (
    <>
      {inDrawer ? body : (
        <>
          <PageHead title="Account" />
          <div className="page">{body}</div>
        </>
      )}

      {confirm ? (
        <Dialog
          title="Log out of People Taxi?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(false)}>
                Stay signed in
              </Button>
              <Button onClick={() => void signOut().catch(() => setError('We couldn’t log you out. Please try again.'))}>Log out</Button>
            </>
          }
        >
          <p className="muted">You’ll need to verify your mobile number again to sign back in.</p>
        </Dialog>
      ) : null}
    </>
  );
}
