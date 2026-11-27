import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/500.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/shell.css';
import './styles/home.css';
import './styles/booking.css';
import './styles/pages.css';
import './styles/ride.css';
import './styles/landing.css';
import './styles/polish.css';
import './styles/forms.css';
import './styles/mobile.css';
import './styles/bookform.css';
import './styles/compact.css';
import './styles/theme.css';
import './styles/bottom-nav.css';
import './styles/desktop-controls.css';
import './styles/scroll-header.css';
import './styles/contact-controls.css';
import './styles/bookform-date.css';
import './styles/support-menu.css';
import './styles/bookform-route.css';
import './styles/account.css';
import './styles/otp.css';
import './styles/clean-pages.css';
import './styles/desktop.css';
import './styles/placefield.css';
import './styles/placeSearch.css';
import './styles/brand-icons.css';
import './styles/keyboard.css';
import './styles/colour-bars.css';
import './styles/service-bar.css';
import './styles/phone-fit.css';
import './styles/route-controls.css';
import './styles/header-icons.css';
import './styles/route-form.css';
import './styles/logo-anim.css';
import './styles/bookform-premium.css';
import './styles/responsive-shell.css';
import './styles/ride-corp.css';
import './styles/drawer-corp.css';
import { keepHomeBehindEveryScreen } from './lib/homeNav';
import { installStaleVersionReload, installVersionCheck } from '@/shared/components/RouteErrorBoundary';
import { prefetchWhenIdle, registerDeviceCache } from '@/lib/deviceCache';
import { App } from './App';

keepHomeBehindEveryScreen();
installStaleVersionReload();
installVersionCheck();
registerDeviceCache();
prefetchWhenIdle([
  () => import('@/pages/book/DonePage'),
  () => import('@/pages/ride/RidePage'),
  () => import('@/pages/TripsPage'),
  () => import('@/pages/localRentals/LocalRentalsPage'),
  () => import('@/pages/AccountPage'),
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
