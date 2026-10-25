# DSH Optimizations

A small collection of reversible, profile-local bundles/plugins for
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).
Nothing in this repository modifies DSH's installed source; each bundle is
installed through the profile's standard plugin flow and can be disabled or
removed at any time.

| Directory | What it does |
|---|---|
| [web-fetch-fakeip](./web-fetch-fakeip/) | Lets `web_fetch` accept DNS answers in the TUN/Clash fake-IP range `198.18.0.0/15`, while URL IP literals, loopback and other private ranges stay blocked. |

## Install

Each subdirectory with a `package.json` and a `dsh.bundle.patch` is a DSH
bundle. Install one through the Web UI's **Plugins → Add plugin** (enter the
absolute local path), or from a terminal:

```bash
dsh plugin --profile web add file:/home/elder/projects/dsh_optimization/web-fetch-fakeip
```

The bundle then appears on the sidebar **Plugins** page, where the bundle and
its rows can be switched on and off. Profile HMR applies changes without a
restart.

A bare plugin row (without a bundle) is still possible; see each plugin's
README. Such a row appears in **Settings → Built-in plugins**, not on the
Plugins page.

## Why profile-local bundles

A DSH profile is an ordered composition of bundle patch layers, then the user
patch layer (`$DSH_HOME/profiles/<profile>/cordis.patch.yml`). A bundle keeps
its plugin rows and install metadata together; the user patch can still
override or disable any row. On long-lived surfaces the profile HMR watcher
re-applies changes without a restart.

- no edit to `node_modules` or any DSH package;
- bundle switch on the Plugins page, or row-level `disabled: true`;
- uninstall restores the stock composition;
- DSH upgrades do not overwrite the bundle.

## Compatibility

Each plugin documents the DSH/provider versions it was tested against.
Profile patch syntax and plugin APIs follow the DSH `0.2.1-alpha.2` packages
in this repository; newer releases may need a small update.
