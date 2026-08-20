# Upstream compatibility

LearnLoop supports only DSH `dsh-v0.1.0-rc.8` (`141eb6fef83422698aef7a981029e843e8161534`). DSH is prerelease software; upgrade deliberately rather than following the default branch.

The compatibility adapter comprises the package `dsh` manifest, Loader patch, Host registration in `src/index.ts`, and prebuilt Client Module in `client/bundle.js`. The prebuilt artifact exists because rc.8 does not publish its client-bundle preset. It must remain a lazy-CJS `window.__ModuleLoader__.load` factory and must not value-import another client plugin.

For an upgrade: inspect upstream extension, settings-card and conversation-view cookbooks; compare storage-domain, Web server and Client Loader types; update exact peer pins; run `npm run test:compat`, `npm run check`, `npm run package:validate`, install into a clean profile, and run every Web acceptance scenario. Reject an upgrade if the client artifact, whole-value authority, CAS behavior, storage recovery or credential isolation cannot be preserved.
