/** Local-only hint for a browser opened over HTTP against a HTTPS-only API.
 * This is advisory, not an automatic redirect: factory HTTP legacy modes
 * must keep working until explicitly migrated.
 */
export function getSafeHubHttpsUrl(location: {
  protocol: string;
  hostname: string;
  host: string;
  pathname: string;
  search: string;
  hash: string;
} | null): string | null {
  if (!location || location.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname))
    return null;
  return `https://${location.host}${location.pathname}${location.search}${location.hash}`;
}
