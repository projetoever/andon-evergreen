import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { isIP } from "node:net";

export type TlsCertificateSummary = {
  subject: string;
  issuer: string;
  subjectAlternativeName: string;
  fingerprint256: string;
  validFrom: string;
  validTo: string;
  daysUntilExpiry: number;
  validity: "valid" | "expiring" | "expired" | "not_yet_valid";
  hostMatchesCertificate: boolean;
};

export type TlsInventory = {
  transport: "http" | "https";
  canonicalHost: string | null;
  certificate: TlsCertificateSummary | null;
  publicCertificateChainPem: string | null;
  note: string;
};

/** Only the configured server certificate is read. Private keys and trust-store files are never opened. */
export function inspectTlsCertificate(
  certificatePem: string,
  canonicalHost: string,
  now: Date = new Date(),
): Pick<TlsInventory, "certificate" | "publicCertificateChainPem"> {
  const certificateBlocks = certificatePem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
  );
  if (!certificateBlocks?.length || certificateBlocks.length > 8) {
    throw new Error("tls_certificate_invalid");
  }
  const leaf = new X509Certificate(certificateBlocks[0]);
  const validFrom = new Date(leaf.validFrom);
  const validTo = new Date(leaf.validTo);
  const time = now.getTime();
  if (!Number.isFinite(validFrom.getTime()) || !Number.isFinite(validTo.getTime())) {
    throw new Error("tls_certificate_invalid_dates");
  }
  const daysUntilExpiry = Math.ceil((validTo.getTime() - time) / 86_400_000);
  const validity: TlsCertificateSummary["validity"] =
    time < validFrom.getTime()
      ? "not_yet_valid"
      : time > validTo.getTime()
        ? "expired"
        : daysUntilExpiry <= 30
          ? "expiring"
          : "valid";
  const hostMatchesCertificate = Boolean(
    canonicalHost &&
      (isIP(canonicalHost)
        ? leaf.checkIP(canonicalHost)
        : leaf.checkHost(canonicalHost, { subject: "never" })),
  );
  return {
    certificate: {
      subject: leaf.subject,
      issuer: leaf.issuer,
      subjectAlternativeName: leaf.subjectAltName ?? "",
      fingerprint256: leaf.fingerprint256,
      validFrom: validFrom.toISOString(),
      validTo: validTo.toISOString(),
      daysUntilExpiry,
      validity,
      hostMatchesCertificate,
    },
    publicCertificateChainPem: certificateBlocks.join("\n") + "\n",
  };
}

export function tlsInventoryFromEnvironment(
  env: Pick<NodeJS.ProcessEnv, "ANDON_TLS_CERT" | "ANDON_TLS_KEY" | "ANDON_ACCESS_ORIGIN">,
  now: Date = new Date(),
): TlsInventory {
  const canonicalHost = (() => {
    try {
      return env.ANDON_ACCESS_ORIGIN ? new URL(env.ANDON_ACCESS_ORIGIN).hostname : null;
    } catch {
      return null;
    }
  })();
  if (!env.ANDON_TLS_CERT || !env.ANDON_TLS_KEY) {
    return {
      transport: "http",
      canonicalHost,
      certificate: null,
      publicCertificateChainPem: null,
      note: "HTTPS ainda nao configurado neste processo.",
    };
  }
  // Do not return filesystem paths, source config, private keys or CA secrets to clients.
  const pem = readFileSync(env.ANDON_TLS_CERT, "utf8");
  if (pem.length > 131072) throw new Error("tls_certificate_too_large");
  const publicData = inspectTlsCertificate(pem, canonicalHost ?? "", now);
  return {
    transport: "https",
    canonicalHost,
    ...publicData,
    note: "Validade e SAN verificadas localmente; a confianca de cada cliente deve ser testada separadamente.",
  };
}
