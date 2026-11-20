// Transport to the NESAM server functions.
//
// Two interchangeable back ends run the *same* server code (functions/src):
//   • HTTP API (Vercel): used when EXPO_PUBLIC_API_URL is set at build time. Every call
//     carries the signed-in user's Firebase ID token as a Bearer token and the server
//     verifies it; the browser/app never holds any secret.
//   • Firebase callables: the original path, used when EXPO_PUBLIC_API_URL is not set.
// Callers use callBackend(name, data) and cannot tell the difference. Errors are thrown
// with a `functions/<code>` code so describeCallError keeps working unchanged.
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app, auth } from '../config/firebase';
import { browserMemory, createApiClient, parseBases } from './apiClient';

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').trim().replace(/\/+$/, '');

/**
 * Local development only: the dev server forwards this path to the deployed functions, so the browser sees a same-origin
 * call and the functions' allowed-website list (CORS) never applies. Unset in production builds and in the app.
 */
const FN_PROXY = (process.env.EXPO_PUBLIC_FUNCTIONS_PROXY ?? '').trim();
const callableFunctions = () => (FN_PROXY && typeof window !== 'undefined' ? getFunctions(app, `${window.location.origin}${FN_PROXY}`) : getFunctions(app, 'asia-south1'));

/** True when server functions go through the HTTP API instead of Firebase callables. */
export const usesHttpApi = API_URL.length > 0;

// Where this site runs: a browser (CORS applies, and its own address may forward /api) or a native app (neither).
const pageOrigin = typeof window !== 'undefined' && window.location && /^https?:/.test(window.location.origin ?? '') ? window.location.origin : '';
/** Addresses tried in order: the API, any extras from EXPO_PUBLIC_API_FALLBACK_URLS, then this site's own /api forwarder when it has one. */
const BASES = [...new Set([API_URL, ...parseBases(process.env.EXPO_PUBLIC_API_FALLBACK_URLS), ...(pageOrigin ? [''] : [])])];

const client = createApiClient({
  bases: BASES,
  pageOrigin,
  // Signed out: sent without a token; the server only answers its public (read-only) functions.
  getToken: async (force) => {
    const user = auth.currentUser;
    return user ? user.getIdToken(!!force) : '';
  },
  memory: pageOrigin ? browserMemory() : undefined,
  log: (event, info) => console.warn('[NESAM API]', event, info),
});

export async function callBackend<Req, Res>(name: string, data: Req, timeoutMs = 60000): Promise<Res> {
  if (!usesHttpApi) {
    const requestId = `${name}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    console.info('[NESAM API]', { requestId, name, transport: 'firebase-callable' });
    try {
      const result = (await httpsCallable<Req, Res>(callableFunctions(), name, { timeout: timeoutMs })(data)).data;
      console.info('[NESAM API success]', { requestId, name, transport: 'firebase-callable' });
      return result;
    } catch (error) {
      console.error('[NESAM API error]', { requestId, name, transport: 'firebase-callable', code: (error as { code?: string })?.code, message: (error as Error)?.message });
      throw error;
    }
  }
  return client.call<Res>(name, data, timeoutMs);
}

/**
 * Asks the server to settle derived money state (refund record, paid / balance, partner
 * ledger) after one of the few direct Firestore writes the security rules still allow.
 * Firebase deployments do this with Firestore triggers; the HTTP API has none, so the
 * app asks. Best effort — the server also sweeps recent bookings on a schedule.
 */
export function settleBooking(bookingId: string): void {
  if (!usesHttpApi || !bookingId) return;
  void callBackend('reconcile', { bookingId }, 30000).catch(() => undefined);
}

export function settlePayout(payoutRequestId: string): void {
  if (!usesHttpApi || !payoutRequestId) return;
  void callBackend('reconcile', { payoutRequestId }, 30000).catch(() => undefined);
}

/**
 * Connection check, runnable any time in the browser console as `nesamApiCheck()`: it tries every address this site can use and says
 * which work, which are blocked or down, and what to do. Nothing is sent but an unknown function name; no data, no token.
 */
export async function diagnoseApi(): Promise<Record<string, unknown>> {
  if (!usesHttpApi) return { verdict: 'Not using the HTTP API: set the API address (see the project settings) or remove the Firebase-callables switch.' };
  return client.diagnose();
}
if (typeof window !== 'undefined') {
  (window as unknown as { nesamApiCheck?: typeof diagnoseApi }).nesamApiCheck = diagnoseApi;
}
