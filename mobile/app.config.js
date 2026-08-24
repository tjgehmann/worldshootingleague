// Dynamic wrapper around app.json. The only thing computed here is the web
// base path: unset (root) for Netlify/Vercel, which is what app.json alone
// gave everyone before this file existed, and /worldshootingleague when
// WSL_BASE_PATH is set for a GitHub Pages project-page build. See
// scripts/finish-web-build.mjs, which needs the same value to rewrite the
// paths Expo's own export doesn't reach (manifest link, service worker).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    baseUrl: process.env.WSL_BASE_PATH ?? '',
  },
});
