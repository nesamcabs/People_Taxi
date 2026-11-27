import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useCustomerData } from '@core/context/CustomerData';
import { updateCustomerProfile } from '@core/services/userService';
import { COMPANY_LEGAL_NAME } from '@core/config/constants';
import { formatINR, formatPhone } from '@core/utils/format';
import { describeError } from '@core/utils/retry';
import { Avatar, Button, Dialog, EmptyState, Notice, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { BrandIcon, type BrandIconName } from '@/components/BrandIcon';
import { DrawerIcon, hasDrawerIcon } from '@/components/DrawerIcons';
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

/** Inside the side drawer, rows show the drawer's own line icons (one neat corporate set) in place of the artwork. */
const LineIcons = createContext(false);

function Row({ icon, label, hint, value, to, href, onPress, onNavigate, expanded }: { icon: string; label: string; hint?: string; value?: ReactNode; to?: string; href?: string; onPress?: () => void; onNavigate?: () => void; expanded?: boolean }) {
  const tone = TONES[icon] ?? 'brand';
  const line = useContext(LineIcons);
  const cls = `setting setting--${tone}`;
  const inner = (
    <>
      {line && hasDrawerIcon(icon) ? (
        <span className="setting__icon setting__icon--line">
          <DrawerIcon name={icon} size={19} />
        </span>
      ) : ROW_ART[icon] ? (
        <span className="setting__icon setting__icon--art">
          <BrandIcon name={ROW_ART[icon]!} size={34} />
        </span>
      ) : (
        <span className="setting__icon">
          <Icon name={icon} size={20} />
        </span>
      )}
      {hint ? (
        <span className="setting__text">
          <span className="setting__label">{label}</span>
          <span className="setting__hint">{hint}</span>
        </span>
      ) : (
        <span className="setting__label">{label}</span>
      )}
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
  // Drawer only: whether the profile editor is open in place.
  const [editing, setEditing] = useState<'details' | null>(null);
  const toggleEdit = (view: 'details') => setEditing((now) => (now === view ? null : view));
  useEffect(() => {
    if (!editing) return undefined;
    const t = window.setTimeout(() => document.querySelector<HTMLElement>('.inline-edit input:not([readonly])')?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [editing]);

  if (!profile) {
    const signedOut = (
      <>
        {inDrawer ? (
          /* The drawer's welcome card: the same deep navy as the signed-in account card. */
          <section className="drawer-welcome" aria-label="Sign in">
            <span className="drawer-welcome__eyebrow">Welcome to People Taxi</span>
            <strong className="drawer-welcome__title">Sign in to your account</strong>
            <p className="drawer-welcome__text">Manage your bookings, payments and saved details in one place.</p>
            <button type="button" className="drawer-welcome__btn" onClick={() => { onClose?.(); openLoginModal({ title: 'Sign in to account' }); }}>
              Sign in
            </button>
          </section>
        ) : (
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
            Manage your bookings, payments and saved details in one place.
          </EmptyState>
        </div>
        )}
        {/* Offers and Help are here too, because narrower desktop headers move them into this menu. */}
        <section className="group" style={inDrawer ? undefined : { marginTop: 16 }}>
          <h2 className="eyebrow">Support &amp; information</h2>
          <div className="card card--list">
            <Row icon="offers" label="Offers & promotions" hint="Current fare offers" to="/offers" />
            <Row icon="support" label="Customer support" hint="24/7 assistance by call or chat" to="/support" />
            <Row icon="info" label="About People Taxi" hint="Company information" to="/about" />
            <Row icon="document" label="Terms & policies" hint="Privacy, cancellation and refund policies" to="/legal" />
          </div>
        </section>
      </>
    );
    return inDrawer ? (
      <LineIcons.Provider value>
        <div className="account account--drawer">{signedOut}</div>
      </LineIcons.Provider>
    ) : (
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
            {/* The profile card: photo, name and number (tap the name to edit, no separate pencil). The editor opens under it and
                holds the personal details and the emergency contact. */}
            <section className="profile-card profile-card--combined" aria-label="Your profile">
              <div className="profile-card__head">
                <button type="button" className="profile-card__photo" onClick={() => file.current?.click()} disabled={progress != null} aria-label="Change profile photo">
                  <Avatar name={profile.name} photoUrl={profile.photoUrl} size={42} />
                  <span className="profile-card__cam">
                    <Icon name={progress != null ? 'document-upload' : 'camera'} size={12} />
                  </span>
                </button>
                <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
                {(() => {
                  const info = (
                    <>
                      <span className="profile-card__info">
                        {inDrawer ? (
                          <span className="profile-card__eyebrow">
                            My account
                            <span className="profile-card__badge">
                              <DrawerIcon name="verified" size={10} strokeWidth={3} />
                              Verified
                            </span>
                          </span>
                        ) : null}
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
                  <h3 className="profile-sub">Emergency contact</h3>
                  <EmergencyContactForm onDone={() => setEditing(null)} />
                </div>
              ) : null}
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
            <section className="group">
              <h2 className="eyebrow">Bookings &amp; payments</h2>
              <div className="card card--list">
                <Row icon="trip-history" label="My bookings" hint="Upcoming and completed trips" to="/trips" />
                <Row icon="receipt" label="Payments & refunds" hint="Receipts and refund status" to="/account/payments" />
                <Row icon="offers" label="Offers & promotions" hint="Current fare offers" to="/offers" />
              </div>
            </section>
            <section className="group">
              <h2 className="eyebrow">Support &amp; information</h2>
              <div className="card card--list">
                <Row icon="support" label="Customer support" hint="24/7 assistance by call or chat" to="/support" />
                <Row icon="info" label="About People Taxi" hint="Company information" to="/about" />
                <Row icon="document" label="Terms & policies" hint="Privacy, cancellation and refund policies" to="/legal" />
              </div>
            </section>
            <section className="group" aria-label="Session">
              {inDrawer ? (
                <button type="button" className="drawer-signout" onClick={() => setConfirm(true)}>
                  <DrawerIcon name="logout" size={18} strokeWidth={2} />
                  Log out
                </button>
              ) : (
                <div className="card card--list">
                  <button type="button" className="setting setting--action" onClick={() => setConfirm(true)}>
                    <span className="setting__icon setting__icon--art"><BrandIcon name="logout" size={34} /></span>
                    <span className="setting__label">Log out</span>
                  </button>
                </div>
              )}
              <p className="account__legal">© {new Date().getFullYear()} {COMPANY_LEGAL_NAME.replace(/NESAM/g, 'Nesam')}</p>
            </section>
          </div>
        </div>
    </>
  );

  return (
    <>
      {inDrawer ? <LineIcons.Provider value>{body}</LineIcons.Provider> : (
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
