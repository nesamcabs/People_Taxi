// The email status under the profile's email field: "Verified", or a "Verify email" button. Verification is Firebase
// Auth's own link email: the address is added to the signed-in account only after the rider opens that link.
import { useState } from 'react';
import { sendEmailVerification, verifyBeforeUpdateEmail } from 'firebase/auth';
import { auth } from '@/platform/firebase';
import { Icon } from '@/components/Icon';

const isVerified = (email: string) => !!auth.currentUser?.emailVerified && auth.currentUser.email?.toLowerCase() === email;

/** Plain words for what Firebase refused. */
const reason = (e: unknown): string => {
  switch ((e as { code?: string }).code) {
    case 'auth/requires-recent-login':
      return 'For your security, log out and sign in again, then verify.';
    case 'auth/email-already-in-use':
      return 'This email is already linked to another account.';
    case 'auth/operation-not-allowed':
      return 'Email verification is not switched on yet. Please contact support.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/user-token-expired':
      return 'Please sign in again to finish verification.';
    default:
      return 'We couldn’t send the verification email. Please try again.';
  }
};

export function EmailVerify({ email }: { email: string }) {
  const address = email.trim().toLowerCase();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [verified, setVerified] = useState(() => isVerified(address));
  if (!address) return null;

  const send = async () => {
    const user = auth.currentUser;
    if (!user || busy) return;
    setBusy(true);
    setMessage('');
    try {
      if (user.email?.toLowerCase() === address) await sendEmailVerification(user);
      else await verifyBeforeUpdateEmail(user, address);
      setSent(true);
    } catch (e) {
      setMessage(reason(e));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setMessage('');
    try {
      await auth.currentUser?.reload();
      if (isVerified(address)) setVerified(true);
      else setMessage('Not verified yet. Open the link in the email we sent.');
    } catch (e) {
      setMessage(reason(e));
    }
  };

  if (verified || isVerified(address))
    return (
      <p className="email-verify email-verify--ok">
        <Icon name="check" size={14} /> Email verified
      </p>
    );

  return (
    <div className="email-verify" aria-live="polite">
      <span>{sent ? `Verification link sent to ${address}.` : 'Email not verified'}</span>
      <button type="button" onClick={() => void send()} disabled={busy}>
        {busy ? 'Sending…' : sent ? 'Resend' : 'Verify email'}
      </button>
      {sent ? (
        <button type="button" onClick={() => void check()}>
          I’ve verified
        </button>
      ) : null}
      {message ? <small role="alert">{message}</small> : null}
    </div>
  );
}
