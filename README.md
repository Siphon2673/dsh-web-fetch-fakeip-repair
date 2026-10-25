# DSH Optimizations

A small collection of reversible, profile-local plugins/patches for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Nothing in this repository modifies DSH's installed source; each plugin is
loaded through the profile's `cordis.patch.yml` and can be disabled or removed
at any time.

| Directory | What it does |
|---|---|
| [web-fetch-fakeip](./web-fetch-fakeip/) | Lets `web_fetch` accept DNS answers in the TUN/Clash fake-IP range `198.18.0.0/15`, while URL IP literals, loopback and other private ranges stay blocked. |

## Why profile-local plugins

A DSH profile is a composition of plugin rows. The user patch layer
(`$DSH_HOME/profiles/<profile>/cordis.patch.yml`) is applied after every
bundle, and on long-lived surfaces the profile HMR watcher re-applies it
without a restart. That makes a local `.mjs` file plus one patch row a clean
place for machine-specific behavior:

- no edit to `node_modules` or any DSH package;
- enable/disable with one `disabled: true`;
- deleting the row and the file restores the stock composition;
- DSH upgrades do not overwrite the plugin.

## Compatibility

Each plugin documents the DSH/provider versions it was tested against.
Profile patch syntax and plugin APIs follow the DSH `0.2.1-alpha.2` packages
in this repository's initial commit; newer releases may need a small update.
