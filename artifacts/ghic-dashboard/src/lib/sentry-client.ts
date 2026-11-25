// The only Sentry surface the dashboard uses. Importing the package
// namespace lazily (`import('@sentry/browser')`) defeats tree-shaking and
// ships Replay and Feedback too (~150 kB gzip); a named re-export keeps the
// lazy chunk to init and its default integrations.
export { init } from '@sentry/browser';
