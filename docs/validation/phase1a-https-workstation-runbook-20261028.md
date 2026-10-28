# PHASE 1A — Read-only HTTPS/API and workstation incident checks

Data: 28/10/2026. **Do not deploy this PR to Evergreen without acceptance in an isolated environment.**

## Symptoms observed
- An operations screen on a notebook cannot complete an active maintenance cycle after a main update even though the operator reports using the origin workstation.
- Hub reports `API ANDON indisponível em https://192.168.68.100:3001`.
- Another screenshot shows BI available through an HTTP public-IP origin. These are not necessarily the same environment.
- The frontend API client uses `VITE_ANDON_API_BASE_URL` if provided; otherwise derives its protocol and hostname from the page and uses port 3001. A wrong build-time override, HTTPS mismatch or untrusted certificate can cause failed requests without backend downtime.

## Non-invasive checks (do not print passwords)
1. Record frontend address (scheme + hostname + port), and the **exact** API URL displayed in the error.
2. On the *same affected browser/workstation*, open the API `/health` endpoint using the same scheme/hostname/port. Observe the browser's certificate errors if HTTPS. Do not accept invalid TLS certificates as a workaround.
3. On the server, use the installer menu **6 — Verificar saúde** and its transport inventory. Confirm the 3001 listener uses HTTP or HTTPS consistently with the public frontend. Inspect CORS/Origin settings and host mapping; do not change them in this diagnostic pass.
4. If an explicit `VITE_ANDON_API_BASE_URL` override exists in the installed frontend build configuration, verify it corresponds to an address reachable from the affected device. A private LAN IP may not be reachable from an external browser.
5. Use the Admin **Segurança > Certificados e DNS** panel only after its HTTPS prerequisites are satisfied, and confirm the certificate SAN, expiration, trust chain on every relevant workstation and configured canonical hostname.
6. For the affected call, *on the installed server only*, run the read-only provenance script from the `server` directory with local DATABASE_URL configured:
   `node --env-file=.env scripts/diagnose-workstation-completion.mjs CALL_ID`
   The result gives only workstation UUID suffixes, attendance cycle, active sessions and registry status. Compare to the workstation UUID in the Hub admin panel. Do not paste full UUIDs, credentials or SQL dumps in chat.
7. Avoid deleting cookies/localStorage, switching hosts or clearing Chrome profiles during an active attendance: this can sever provenance even on the same physical notebook. If a mismatch is confirmed, require a supervised, auditable recovery step. Do not overwrite technician session provenance.

## Acceptance gates
- Test both the same origin browser and a different workstation with independent UUIDs: the correct device can attempt completion, a foreign UUID is denied **by the backend**.
- Confirm multiple technicians, ending individual sessions, return to maintenance, inactive stations, old sessions and unchanged default feature flags.
- Verify API health and TLS trust from the affected client; check Node-RED/GPIO separately before any future HTTPS switch.
- No service restart, no edits of `andon-config.json`, `.env`, certificates, database or production records in this diagnostic task.
