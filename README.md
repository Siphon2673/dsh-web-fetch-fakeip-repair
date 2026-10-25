# dsh-web-fetch-fakeip-repair

A reversible, profile-local DSH plugin that repairs `web_fetch` behind a TUN
proxy in fake-IP mode (Clash/Mihomo, sing-box, ...).

- ✅ No change to DSH's installed source.
- ✅ Installs as a standard DSH bundle; enable/disable live through the
  Plugins page, the profile patch, or HMR.
- ✅ Only hostname DNS answers in `198.18.0.0/15` are relaxed.
- ✅ URL IP literals, `localhost`, and every other private/loopback range keep
  the original rejection.
- ✅ MIT licensed.

## The problem

A TUN proxy in fake-IP mode answers DNS with addresses from the RFC 2544
benchmarking range `198.18.0.0/15`. DSH's `dsh-web-fetch-http` provider
deliberately rejects every DNS answer that is not public unicast, so every
`web_fetch` call fails with:

```text
URL hostname "..." resolves to a non-public IP address
```

The TUN itself is fine: a direct `curl https://example.com` connects to
`198.18.0.x` and succeeds. Only the provider's SSRF guard rejects the answer.

## How the plugin works

At load time the plugin wraps the resolver of the already-registered `http`
fetch provider:

1. The original strict resolver always runs first.
2. Only when it throws `WEB_BLOCKED_URL` for a **hostname** whose complete DNS
   answer set is fake IPv4 in `198.18.0.0/15` does the wrapper re-resolve and
   return those answers.
3. URL IP literals, loopback, and every other private range keep the original
   error.
4. Disabling the row restores the original resolver. If the provider registers
   later than the plugin, the plugin retries for up to 10 seconds.

The plugin is a single ESM file, [`index.mjs`](./index.mjs). It imports only
Node.js built-ins.

## Install

### Standard bundle install (recommended)

This repository is a DSH bundle package: `package.json` declares
`dsh.bundle.patch`, and [`cordis.patch.yml`](./cordis.patch.yml) inserts the
plugin row. Install it through the same flow as any other profile plugin:

```bash
dsh plugin --profile web add file:/home/elder/projects/dsh-web-fetch-fakeip-repair
```

or open **Plugins → Add plugin** in the Web UI and enter the absolute path
`/home/elder/projects/dsh-web-fetch-fakeip-repair`.

The installer adds `dsh-web-fetch-fakeip-repair` to the profile and selects its
bundle layer. The bundle then appears on the sidebar **Plugins** page, where
both the bundle and its `web-fetch-fakeip-repair` row can be switched on and
off.

With the default profile HMR (`hmr` row enabled), the change applies without a
restart. If HMR is disabled, restart `dsh web`.

### Manual row install (no bundle)

For a minimal install without a profile dependency, add the row directly to
the profile's patch file (for example
`~/.dsh/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: web-fetch-fakeip-repair
      name: /home/elder/projects/dsh-web-fetch-fakeip-repair/index.mjs
      config:
        statusFile: /tmp/dsh-web-fetch-fakeip-repair.status
```

`name` may be an absolute path to `index.mjs`, or a path relative to the patch
file (for example `./plugins/dsh-web-fetch-fakeip-repair.mjs` after copying
the file into `$DSH_HOME/profiles/<profile>/plugins/`).

`statusFile` is optional. When set, the plugin writes a small JSON status file
while active and removes it on unload; it is useful for checking whether the
plugin mounted.

A manually inserted row is a plain Loader entry, not a bundle. It is visible
in **Settings → Built-in plugins** (the read-only inventory), but **not** on
the sidebar **Plugins** page, which lists profile bundles and their rows.

A ready-to-copy snippet is in
[`cordis.patch.example.yml`](./cordis.patch.example.yml).

### Verify it is active

```bash
cat /tmp/dsh-web-fetch-fakeip-repair.status
```

While enabled it contains something like:

```json
{
  "active": true,
  "patched": true,
  "provider": "http",
  "pid": 12086,
  "at": "2026-10-25T09:48:31.686Z"
}
```

Disable the row and the file is removed.

## Enable / disable

### Bundle install

Open the sidebar **Plugins** page. The card **dsh-web-fetch-fakeip-repair** has
a bundle switch, and its row **web-fetch-fakeip-repair** has its own switch:

- the bundle switch removes or restores the whole bundle layer;
- the row switch writes a `disabled` override into the profile patch.

Either way profile HMR applies the change in about a second.

### Manual row install

Add or remove `disabled: true` on the row in the profile patch:

```yaml
    - id: web-fetch-fakeip-repair
      disabled: true
```

### Uninstall

- **Bundle:** switch it off or remove it on the **Plugins** page, or run
  `dsh plugin --profile web remove dsh-web-fetch-fakeip-repair`. The profile
  returns to its previous composition.
- **Manual row:** remove the `- insert:` block.

DSH's installed source is untouched in both cases.

## Scope and security

Only IPv4 DNS answers in `198.18.0.0/15` are accepted, and only when they came
from resolving a hostname. These remain blocked:

- URL IP literals such as `http://198.18.0.185/`;
- `localhost` and hostnames resolving to `127.0.0.0/8` or `::1`;
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, link-local, and every other
  non-public range.

The wrapper never weakens an answer that the original resolver accepted, and
it rethrows every rejection that is not an all-fake-IPv4 hostname answer.

## Tested

Against DSH `0.2.1-alpha.2` / `@deepseek-ai/dsh-web-fetch-http` `0.2.1-alpha.2`:

- `example.com`, `www.kimi.com`, `api.github.com`: HTTP 200;
- `http://localhost:52080/`: `WEB_BLOCKED_URL`;
- `http://198.18.0.185/`: `WEB_BLOCKED_URL`;
- `http://127.0.0.1:52080/`: `WEB_BLOCKED_URL`;
- disabling the plugin restores the strict rejection;
- late provider registration is handled by the retry path.

## Compatibility notes

The plugin wraps the provider instance's `resolveAddresses` method. That is an
internal provider field, although it has been stable across the `0.2.1-alpha`
and `0.2.1-rc` builds checked while writing this plugin. If a future DSH
release renames it, the plugin logs a warning and leaves `web_fetch` strict; it
does not crash the process. Update the wrapper to the new field if that
happens.

Only IPv4 fake-IP is handled. An IPv6 fake-IP range (if the proxy enables one)
would need a matching check.

The symbol keys used for the provider wrapper intentionally keep the old
`dsh.web-fetch-fakeip.*` spelling. That lets a running `web-fetch-fakeip` row
and the new `web-fetch-fakeip-repair` row share one wrapper during a hot swap,
so removing either one restores the correct resolver.

## License

MIT. See [LICENSE](./LICENSE).

Copyright (c) 2026 SIPHON.
