import { useNavigate } from 'react-router-dom';
import { useCustomerData } from '@core/context/CustomerData';
import { Button, EmptyState, PageHead } from '@/components/ui';
import { EmergencyContactForm, PersonalDetailsForm } from '@/components/ProfileForms';
import { useAuth } from '@/state/Auth';
import { useSeo } from '@/lib/seo';
import { msg, useT } from '@/i18n';

/** Personal details on their own page (the profile drawer shows the same form in place). */
export function EditProfilePage() {
  const t = useT();
  useSeo({ title: t('Personal details'), noindex: true });
  const navigate = useNavigate();
  const { profile } = useCustomerData();
  const { openLoginModal } = useAuth();
  const leave = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/', { replace: true }));

  if (!profile) {
    return (
      <div className="page">
        <div className="card card--center">
          <EmptyState
            art="welcome"
            title={t('Sign in to edit your details')}
            action={
              <Button variant="primary" onClick={() => openLoginModal({ title: msg('Sign in to edit profile') })}>
                {t('Sign in')}
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHead title={t('Personal details')} />
      <div className="page">
        <div className="card simple-form-wrap">
          <PersonalDetailsForm onDone={leave} onCancel={leave} />
          <h3 className="profile-sub">{t('Emergency contact')}</h3>
          <EmergencyContactForm onDone={leave} />
        </div>
      </div>
    </>
  );
}
