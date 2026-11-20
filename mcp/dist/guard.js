// Where the API key may be sent.
// The key goes to whatever base URL this server is configured with, so a changed base URL is only accepted when it
// is https (or http on this machine) and MEDIA_ALLOW_CUSTOM_URL=1 says the change is deliberate.
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function resolveBaseUrl(prefix, defaultUrl, env = process.env) {
    const name = `${prefix}_API_URL`;
    const flag = `${prefix}_ALLOW_CUSTOM_URL`;
    const raw = (env[name] ?? "").trim();
    if (!raw)
        return { ok: true, url: defaultUrl, custom: false };
    const refused = (why) => ({
        ok: false,
        error: `${name} ${why} No request was made and the API key was not sent. Unset ${name} to use ${defaultUrl}.`,
    });
    let u;
    try {
        u = new URL(raw);
    }
    catch {
        return refused("is not a valid URL.");
    }
    const url = (u.origin + u.pathname).replace(/\/+$/, "");
    if (url === defaultUrl && !u.username && !u.password && !u.search && !u.hash) {
        return { ok: true, url: defaultUrl, custom: false };
    }
    if (u.username || u.password || u.search || u.hash) {
        return refused("must be a plain base URL, with no credentials, query or fragment.");
    }
    const local = u.protocol === "http:" && LOOPBACK.has(u.hostname);
    if (u.protocol !== "https:" && !local) {
        return refused("must be an https URL (http is accepted for localhost only).");
    }
    if (env[flag] !== "1") {
        return refused(`points at ${u.host}, and the API key would be sent there. Set ${flag}=1 if that is intended.`);
    }
    return { ok: true, url, custom: true };
}
