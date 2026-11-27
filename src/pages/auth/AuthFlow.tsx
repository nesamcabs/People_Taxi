// Sign in with a mobile number: number → one-time code. A new customer then continues to
// profile setup (see ProfileSetup). Same Firebase phone auth as the customer app.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ConfirmationResult } from 'firebase/auth';
import { isValidIndianMobile, formatPhone } from '@core/utils/format';
import { registerCustomerProfile } from '@core/services/userService';
import { isValidEmail, isValidName } from '@core/utils/format';
import { describeError } from '@core/utils/retry';
import { SUPPORT_PHONE, SUPPORT_PHONE_DISPLAY } from '@core/config/constants';
import { Button, Notice, TextField } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { confirmOtpCode, describePhoneAuthError, sendOtpToPhone, signOutUser } from '@/lib/authService';
import { useOnline, usePageTitle } from '@/lib/hooks';
import { OtpInput, OTP_LENGTH } from '@/components/OtpInput';
import { msg, richText, useT } from '@/i18n';

const RESEND_SECONDS = 30;

const POINTS = [
  { icon: 'verified', text: msg('Fares shown upfront, before you book') },
  { icon: 'driver', text: msg('Verified commercial drivers') },
  { icon: 'support', text: msg('Customer care you can call any time') },
];

function AuthLayout({ art, title, subtitle, children }: { art: string; title: string; subtitle: string; children: ReactNode }) {
  const t = useT();
  return (
    <div className="auth">
      <aside className="auth__hero">
        <picture>
          <source media="(max-width: 720px)" srcSet="/website-images/web/heroes/hero-mobile.webp" />
          <img className="auth__bg" src="/website-images/web/heroes/hero-family.webp" alt={t('Family traveling comfortably with People Taxi outstation cab')} width={1774} height={887} />
        </picture>
        <span className="auth__shade" aria-hidden="true" />
        <div className="auth__top">
          <span className="brand brand--light brand--compact">
            <img src="/brand/peopletaxi-symbol.png" alt="" width={44} height={44} />
            <span className="brand__word">
              <b>People</b>
              <small>Taxi</small>
            </span>
          </span>
        </div>
        <div className="auth__hero-body">
          <p className="hero__eyebrow">
            <Icon name="route" size={16} /> {t('Outstation & intercity cabs')}
          </p>
          <h2>{t('Safe journeys, happy memories.')}</h2>
          <ul className="auth__points">
            {POINTS.map((p) => (
              <li key={p.text}>
                <Icon name={p.icon} size={20} /> {t(p.text)}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <main className="auth__main" id="main">
        <div className="auth__panel">
          <img className="auth__art" src={`/art/${art}.webp`} alt="" width={132} height={132} />
          <h1>{title}</h1>
          <p className="auth__sub">{subtitle}</p>
          {children}
          <p className="auth__legal">
            {richText(t('Need help? Call {phone}.'), { phone: <a key="phone" href={`tel:${SUPPORT_PHONE}`}>{SUPPORT_PHONE_DISPLAY}</a> })}{' '}
            {richText(t('By continuing you agree to People Taxi’s {terms} and {privacy}.'), {
              terms: <Link key="terms" to="/legal#terms" target="_blank" rel="noopener">{t('Terms & Conditions')}<span className="sr-only"> {t('(opens in a new tab)')}</span></Link>,
              privacy: <Link key="privacy" to="/legal#privacy" target="_blank" rel="noopener">{t('Privacy & Location Policy')}<span className="sr-only"> {t('(opens in a new tab)')}</span></Link>,
            })}
          </p>
        </div>
      </main>
    </div>
  );
}

export function AuthFlow() {
  const t = useT();
  usePageTitle(t('Sign in'));
  const { online } = useOnline();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const sendOtp = async () => {
    if (sending) return;
    if (!isValidIndianMobile(mobile)) return setError(msg('Enter a valid 10-digit mobile number.'));
    if (!online) return setError(msg('You’re offline. Connect to the internet to receive your code.'));
    setError('');
    setSending(true);
    try {
      setConfirmation(await sendOtpToPhone(`+91${mobile}`));
      setOtp('');
      setStep('otp');
      setCooldown(RESEND_SECONDS);
    } catch (e) {
      setError(describePhoneAuthError(e));
    } finally {
      setSending(false);
    }
  };

  const verify = async (code: string) => {
    if (verifying) return;
    if (code.length !== OTP_LENGTH) return setError(msg('Enter the 6-digit code.'));
    if (!confirmation) return setError(msg('Your code expired. Request a new one.'));
    setError('');
    setVerifying(true);
    try {
      await confirmOtpCode(confirmation, code);
      // The auth listener takes over from here.
    } catch (e) {
      setError(describePhoneAuthError(e));
      setOtp('');
      setVerifying(false);
    }
  };

  if (step === 'otp') {
    return (
      <AuthLayout art="phone-verification" title={t('Enter the code')} subtitle={t('We sent a 6-digit code to {phone}.', { phone: `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}` })}>
        <form
          className="auth__form"
          onSubmit={(e) => {
            e.preventDefault();
            void verify(otp);
          }}
        >
          <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(''); }} onComplete={(v) => void verify(v)} disabled={verifying} invalid={!!error} />
          {error ? <Notice tone="error">{t(error)}</Notice> : null}
          <Button type="submit" size="lg" block loading={verifying} disabled={otp.length !== OTP_LENGTH}>
            {verifying ? t('Verifying…') : t('Verify and continue')}
          </Button>
          <div className="auth__links">
            <button type="button" className="link-btn" onClick={() => { setStep('phone'); setOtp(''); setError(''); }}>
              {t('Change number')}
            </button>
            <button type="button" className="link-btn" disabled={cooldown > 0 || sending} onClick={() => void sendOtp()}>
              {cooldown > 0 ? t('Resend code in {n}s', { n: cooldown }) : sending ? t('Sending…') : t('Resend code')}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout art="welcome" title={t('Book your ride')} subtitle={t('Enter your mobile number to sign in or create your People Taxi account.')}>
      <form
        className="auth__form"
        onSubmit={(e) => {
          e.preventDefault();
          void sendOtp();
        }}
      >
        <TextField
          label={t('Mobile number')}
          prefix="+91"
          value={mobile}
          onChange={(e) => {
            setMobile(e.target.value.replace(/\D/g, '').slice(0, 10));
            setError('');
          }}
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          autoFocus={typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches}
          hint={t('We’ll text you a one-time code.')}
        />
        {error ? <Notice tone="error">{t(error)}</Notice> : null}
        <Button type="submit" size="lg" block loading={sending} disabled={mobile.length < 10}>
          {sending ? t('Sending code…') : t('Continue')}
        </Button>
      </form>
    </AuthLayout>
  );
}

export function ProfileSetup({ phone }: { phone: string }) {
  const t = useT();
  usePageTitle(t('Complete your profile'));
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const errors = {
    name: !isValidName(name) ? t('Enter your full name (letters and spaces, 2–60 characters).') : '',
    email: email.trim() && !isValidEmail(email) ? t('Enter a valid email address, or leave it blank.') : '',
  };

  const save = async () => {
    setTouched(true);
    if (errors.name || errors.email || saving) return;
    setSaving(true);
    setError('');
    try {
      await registerCustomerProfile({ name, email });
      // The profile listener moves on to the app.
    } catch (e) {
      setError(describeError(e, msg('We couldn’t create your profile. Please try again.')));
      setSaving(false);
    }
  };

  return (
    <AuthLayout art="profile-setup" title={t('Almost there')} subtitle={t('Tell us who’s travelling. Your number {phone} is verified.', { phone: formatPhone(phone) })}>
      <form
        className="auth__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <TextField label={t('Full name')} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder={t('e.g. Priya Raman')} error={touched ? errors.name : ''} />
        <TextField
          label={
            <>
              {t('Email')} <small>{t('(optional)')}</small>
            </>
          }
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          placeholder="you@example.com"
          hint={t('Booking confirmations and receipts are sent here.')}
          error={touched ? errors.email : ''}
        />
        {error ? <Notice tone="error">{t(error)}</Notice> : null}
        <Button type="submit" size="lg" block loading={saving}>
          {saving ? t('Saving…') : t('Save and start booking')}
        </Button>
        <div className="auth__links auth__links--center">
          <button type="button" className="link-btn" onClick={() => void signOutUser()}>
            {t('Not your number? Sign out')}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

export function AccountHold({ status, onSignOut }: { status: string; onSignOut: () => void }) {
  const t = useT();
  usePageTitle(t('Account on hold'));
  return (
    <AuthLayout art="account-review" title={t('Your account is on hold')} subtitle={`${status ? t('Your account is currently {status}.', { status: t(status.toLowerCase()) }) : t('Your account is not active yet.')} ${t('Please call us and we’ll help.')}`}>
      <div className="auth__form">
        <a className="btn btn--primary btn--lg btn--block" href={`tel:${SUPPORT_PHONE}`}>
          <Icon name="phone" /> {t('Call {phone}', { phone: SUPPORT_PHONE_DISPLAY })}
        </a>
        <Button variant="secondary" size="lg" block onClick={onSignOut}>
          {t('Sign out')}
        </Button>
      </div>
    </AuthLayout>
  );
}

export function LoadError({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  const t = useT();
  usePageTitle(t('Something went wrong'));
  return (
    <AuthLayout art="error" title={t('We couldn’t load your account')} subtitle={t('This is usually a connection problem.')}>
      <div className="auth__form">
        <Notice tone="error">{t(message)}</Notice>
        <Button size="lg" block onClick={onRetry}>
          {t('Try again')}
        </Button>
        <Button variant="secondary" size="lg" block onClick={onSignOut}>
          {t('Sign out')}
        </Button>
      </div>
    </AuthLayout>
  );
}
