import { Link } from 'react-router-dom';
import { useCustomerData } from '@core/context/CustomerData';
import { formatDate, formatINR } from '@core/utils/format';
import { paymentRows } from '@core/utils/tripView';
import { Button, EmptyState, LinkButton, PageHead } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/state/Auth';
import { useSeo } from '@/lib/seo';
import { PolicyLinks } from '@/pages/PolicySections';
import { PayOnline } from '@/components/PayOnline';
import { msg, useT } from '@/i18n';

export function PaymentsPage() {
  const t = useT();
  const tx = t; // the payment rows below name each trip `t`
  useSeo({ title: t('Payments & Refunds'), noindex: true });
  const { trips, profile } = useCustomerData();
  const { openLoginModal } = useAuth();

  if (!profile) {
    return (
      <>
        <PageHead title={t('Payments')} />
        <div className="page">
          <div className="card card--center">
            <EmptyState
              art="welcome"
              title={t('Sign in to view payments')}
              action={
                <Button variant="primary" onClick={() => openLoginModal({ title: msg('Sign in to view payments') })}>
                  {t('Sign in')}
                </Button>
              }
            >
              {t('Sign in with your mobile number to view payment history, receipts and refund balances.')}
            </EmptyState>
          </div>
          <PolicyLinks ids={['payment', 'refund']} />
        </div>
      </>
    );
  }

  const rows = paymentRows(trips);
  const refunds = trips.filter((t) => t.refund && t.refund.amount > 0);

  const paidTrips = rows.filter((t) => t.status === 'Completed').length;

  return (
    <>
      <PageHead title={t('Payments')} />

      <div className="page">
        <section className="pay-summary" aria-label={t('Payment summary')}>
          <div className="pay-summary__item">
            <span className="pay-summary__icon"><Icon name="wallet" size={18} /></span>
            <span className="pay-summary__text">
              <small>{t('Refund credits')}</small>
              <strong className="num">{formatINR(profile.walletBalance)}</strong>
            </span>
          </div>
          <div className="pay-summary__item">
            <span className="pay-summary__icon pay-summary__icon--green"><Icon name="success" size={18} /></span>
            <span className="pay-summary__text">
              <small>{t('Completed trips')}</small>
              <strong className="num">{paidTrips}</strong>
            </span>
          </div>
          <div className="pay-summary__item">
            <span className="pay-summary__icon pay-summary__icon--blue"><Icon name="receipt" size={18} /></span>
            <span className="pay-summary__text">
              <small>{t('Payments')}</small>
              <strong className="num">{rows.length}</strong>
            </span>
          </div>
        </section>
        <p className="pay-note">
          {refunds.length ? `${refunds.length === 1 ? t('1 refund recorded on cancelled bookings.') : t('{n} refunds recorded on cancelled bookings.', { n: refunds.length })} ` : ''}{t('Receipts are kept with each trip.')}
        </p>

        {rows.length === 0 ? (
          <div className="card card--center">
            <EmptyState
              art="no-payments"
              title={t('No payments yet')}
              action={
                <LinkButton variant="primary" to="/book">
                  {t('Book a ride')}
                </LinkButton>
              }
            >
              {t('Completed trips and any refunds will be listed here.')}
            </EmptyState>
          </div>
        ) : (
          <ul className="card card--list pay-list">
            {rows.map((t) => {
              const tr = tx;
              const when = t.completedAt ?? t.cancelledAt ?? t.createdAt;
              const completed = t.status === 'Completed';
              const total = completed ? (t.fareBreakdown?.total ?? t.fare) + t.tollCharges + (t.extraCharges ?? 0) : t.cancellationFee;
              return (
                <li key={t.id}>
                  <Link className="pay-row" to={`/trips/${t.id}`}>
                    <span className="pay-row__main">
                      <strong className="truncate">
                        {t.pickup.name} → {t.drop.name}
                      </strong>
                      <small className="muted">
                        {when ? formatDate(when) : t.date} · {t.bookingId}
                      </small>
                      <small className="muted">
                        {completed
                          ? `${tr(t.paymentMethod)} · ${t.paid ? `${tr('Paid {amount}', { amount: formatINR(t.paid.totalPaid) })}${t.paid.balanceDue > 0 ? `, ${tr('balance {amount}', { amount: formatINR(t.paid.balanceDue) })}` : ''}` : tr(t.paymentStatus)}`
                          : tr('Cancelled')}
                      </small>
                      {t.refund && t.refund.amount > 0 ? (
                        <small className="pay-row__refund">
                          {tr('Refund {status}: {amount}', { status: tr(t.refund.status.toLowerCase()), amount: formatINR(t.refund.amount) })}
                        </small>
                      ) : null}
                    </span>
                    <span className="pay-row__amount">
                      <strong className="num">{formatINR(total)}</strong>
                      <span className={`badge ${completed ? 'badge--green' : 'badge--red'}`}>{tr(completed ? 'Completed' : 'Cancelled')}</span>
                    </span>
                    <Icon name="chevron-right" size={18} />
                  </Link>
                  {completed && t.paid && t.paid.balanceDue >= 1 ? (
                    <div className="pay-row__pay">
                      <PayOnline trip={t} compact />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        <div className="pay-policies">
          <PolicyLinks ids={['payment', 'refund']} />
        </div>
      </div>
    </>
  );
}
