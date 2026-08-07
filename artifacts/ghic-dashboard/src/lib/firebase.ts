/**
 * Firebase initialisation, deliberately lazy and failure-tolerant.
 *
 * The whole marketing site must build, render, and deploy before anyone has
 * pasted a Firebase config in. If `initializeApp` ran at module scope with
 * missing values, importing this file would throw and take the landing page
 * down with it — a marketing site that 500s because auth isn't configured
 * yet is a much worse outcome than a sign-in button that says "not
 * configured".
 *
 * So: config is read from env, `isFirebaseConfigured` tells callers whether
 * it's usable, and the SDK is only touched inside `getFirebaseAuth()`.
 *
 * On these values being "secret": they aren't. Firebase web config
 * (apiKey, authDomain, projectId) is public by design — it ships in every
 * client bundle, and Firebase's own docs say so. Access is controlled by
 * Firebase Security Rules and by the authorised-domains list in the
 * console, not by hiding this key. They live in env vars for
 * per-environment configuration, not for secrecy. The values that *are*
 * secret — the GitHub OAuth client secret, any service-account key — never
 * appear in this app; they're pasted into the Firebase console instead.
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { GithubAuthProvider, type Auth, getAuth } from 'firebase/auth';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Only apiKey, authDomain and projectId are load-bearing for auth.
 * storageBucket / messagingSenderId aren't used by this app, so requiring
 * them would block sign-in over values nothing reads.
 */
export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId,
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

/** The Auth instance, or null when config is absent. Never throws. */
export function getFirebaseAuth(): Auth | null {
  if (!isFirebaseConfigured) return null;
  if (auth) return auth;

  try {
    // getApps() guards against re-initialising across Vite HMR reloads,
    // which otherwise throws "Firebase App named '[DEFAULT]' already exists".
    app = getApps().length ? getApps()[0]! : initializeApp(config);
    auth = getAuth(app);
    return auth;
  } catch (error) {
    console.error('[GHIC] Firebase failed to initialise:', error);
    return null;
  }
}

/**
 * GitHub provider with the minimum scope that still makes sign-in useful.
 *
 * `read:user` gets the profile and avatar. `user:email` is requested
 * because GitHub does not return a private email otherwise, and an account
 * with no email is awkward to support later. Deliberately NOT requested:
 * `repo` — the marketing site has no business holding repository access,
 * and GHIC gets repository permissions through the GitHub App installation
 * flow, which is separately consented and far narrower.
 */
export function githubProvider(): GithubAuthProvider {
  const provider = new GithubAuthProvider();
  provider.addScope('read:user');
  provider.addScope('user:email');
  provider.setCustomParameters({ allow_signup: 'true' });
  return provider;
}

/**
 * The marketing site, for signed-out links back out of the dashboard.
 * There is no DASHBOARD_URL here: this app is the dashboard, so a
 * successful sign-in stays put rather than redirecting anywhere.
 */
export const MARKETING_URL =
  import.meta.env.VITE_MARKETING_URL || 'https://ghic-website.vercel.app';
