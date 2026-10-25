/**
 * web-fetch-fakeip — a reversible, profile-local DSH plugin.
 *
 * Why this exists
 * ---------------
 * A TUN proxy in fake-IP mode (Clash/Mihomo, sing-box, ...) answers every
 * hostname with an address from the RFC 2544 benchmarking range
 * 198.18.0.0/15. DSH's `dsh-web-fetch-http` provider deliberately rejects any
 * DNS answer that is not public unicast, so `web_fetch` fails for every
 * hostname with:
 *
 *   URL hostname "..." resolves to a non-public IP address
 *
 * This plugin does not replace or patch DSH's installed code. At load time it
 * wraps the resolver of the already-registered `http` fetch provider:
 *
 *   1. the original strict resolver always runs first;
 *   2. only when it rejects a *hostname* whose complete DNS answer set is
 *      fake IPv4 in 198.18.0.0/15 does the wrapper re-resolve and return
 *      those answers;
 *   3. IP literals in the URL, loopback, and every other private range keep
 *      the original rejection.
 *
 * Disabling the row (or removing it from the profile patch) restores the
 * original resolver immediately; the plugin is hot-reloaded by DSH's profile
 * HMR watcher, so no restart is needed to toggle it.
 *
 * Optional diagnostics: pass `config.statusFile` (a path) to have the plugin
 * write a small JSON status file while active and remove it on unload.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { unlinkSync, writeFileSync } from 'node:fs';

export const name = 'web-fetch-fakeip';
export const inject = ['web'];

const MARK = Symbol.for('dsh.web-fetch-fakeip.wrapper');
const ORIGINAL = Symbol.for('dsh.web-fetch-fakeip.original');
const REFS = Symbol.for('dsh.web-fetch-fakeip.refs');

const RETRY_INTERVAL_MS = 50;
const RETRY_ATTEMPTS = 200; // 10 seconds

function bareHostname(hostname) {
	return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isIpLiteral(hostname) {
	return isIP(bareHostname(hostname)) !== 0;
}

/** 198.18.0.0/15; IPv4 only, because fake-IP proxies return A records here. */
function isFakeIpv4(address) {
	if (isIP(address) !== 4) return false;
	const octets = address.split('.');
	return octets[0] === '198' && (octets[1] === '18' || octets[1] === '19');
}

function raceWithSignal(promise, signal) {
	if (signal === undefined) return promise;
	if (signal.aborted) return Promise.reject(signal.reason ?? new Error('aborted'));
	return new Promise((resolve, reject) => {
		const onAbort = () => reject(signal.reason ?? new Error('aborted'));
		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			},
		);
	});
}

/**
 * Wrap one strict resolver. The wrapper is a pure fallback: it never weakens
 * an answer that the original resolver accepts, and it rethrows every
 * rejection that is not an all-fake-IPv4 hostname answer.
 */
function wrapResolver(original) {
	const wrapped = async function (hostname, signal) {
		try {
			return await original.call(this, hostname, signal);
		} catch (error) {
			if (error?.code !== 'WEB_BLOCKED_URL' || isIpLiteral(hostname)) throw error;
			let resolved;
			try {
				resolved = await raceWithSignal(lookup(hostname, { all: true, order: 'verbatim' }), signal);
			} catch {
				throw error;
			}
			if (resolved.length === 0) throw error;
			if (!resolved.every((entry) => entry.family === 4 && isFakeIpv4(entry.address))) throw error;
			return resolved.map(({ address, family }) => ({ address, family }));
		}
	};
	Object.defineProperties(wrapped, {
		[MARK]: { value: true },
		[ORIGINAL]: { value: original },
		[REFS]: { value: 1, writable: true },
	});
	return wrapped;
}

/**
 * Install or share the wrapper on one provider instance. The returned
 * disposer may be called once; the last owner restores the original.
 */
function acquire(provider) {
	let current = provider.resolveAddresses;
	if (typeof current !== 'function') return undefined;
	if (current[MARK] === true) {
		current[REFS] = (current[REFS] ?? 0) + 1;
	} else {
		current = wrapResolver(current);
		provider.resolveAddresses = current;
	}
	return () => {
		current[REFS] = (current[REFS] ?? 1) - 1;
		if (current[REFS] <= 0 && provider.resolveAddresses === current) {
			provider.resolveAddresses = current[ORIGINAL];
		}
	};
}

function writeStatus(config, value) {
	const file = config?.statusFile;
	if (typeof file !== 'string' || file.length === 0) return;
	try {
		writeFileSync(file, `${JSON.stringify({ ...value, pid: process.pid, at: new Date().toISOString() }, null, 2)}\n`);
	} catch {
		// Diagnostics are best effort and must never affect web_fetch.
	}
}

function clearStatus(config) {
	const file = config?.statusFile;
	if (typeof file !== 'string' || file.length === 0) return;
	try {
		unlinkSync(file);
	} catch {
		// Already gone or never written.
	}
}

export function apply(ctx, config) {
	const web = ctx.web;
	if (web === undefined || !(web.fetchProviders instanceof Map)) {
		ctx.logger.warn('web-fetch-fakeip: ctx.web.fetchProviders is unavailable; web_fetch is unchanged');
		writeStatus(config, { active: false, reason: 'web.fetchProviders unavailable' });
		return;
	}

	let release;
	let timer;
	let attempts = 0;
	let disposed = false;

	const activate = () => {
		if (disposed) return true;
		const provider = web.fetchProviders.get('http');
		if (provider === undefined) return false;
		try {
			release = acquire(provider);
		} catch (error) {
			ctx.logger.warn(`web-fetch-fakeip: cannot patch the http fetch provider: ${error?.message ?? String(error)}`);
			writeStatus(config, { active: false, reason: String(error) });
			return true;
		}
		if (release === undefined) {
			ctx.logger.warn('web-fetch-fakeip: the http fetch provider has no resolveAddresses field; web_fetch is unchanged');
			writeStatus(config, { active: false, reason: 'provider has no resolveAddresses' });
			return true;
		}
		ctx.logger.info('web-fetch-fakeip: enabled; DNS answers in 198.18.0.0/15 are accepted for hostnames');
		writeStatus(config, { active: true, patched: true, provider: 'http' });
		return true;
	};

	ctx.effect(
		() => () => {
			disposed = true;
			if (timer !== undefined) {
				clearInterval(timer);
				timer = undefined;
			}
			if (release !== undefined) {
				release();
				release = undefined;
			}
			clearStatus(config);
			ctx.logger.info('web-fetch-fakeip: disabled; the original public-address resolver is restored');
		},
		'web-fetch-fakeip: lifecycle',
	);

	if (!activate()) {
		timer = setInterval(() => {
			attempts += 1;
			if (activate()) {
				clearInterval(timer);
				timer = undefined;
				return;
			}
			if (attempts >= RETRY_ATTEMPTS) {
				clearInterval(timer);
				timer = undefined;
				ctx.logger.warn('web-fetch-fakeip: the http fetch provider did not appear within 10s; web_fetch is unchanged');
				writeStatus(config, { active: false, reason: 'provider not found' });
			}
		}, RETRY_INTERVAL_MS);
		timer.unref?.();
	}
}
