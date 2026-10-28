import { X509Certificate } from "node:crypto";
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

/** Inspects the immutable public PEM snapshot provided to the live TLS listener at startup. */
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

/**
 * The PEM must be the exact Buffer also passed to Fastify's HTTPS listener at
 * process startup. Never reopen the file: a renewal can replace it without
 * restarting the server, while the listener still serves the old certificate.
 */
export function tlsInventoryFromLoadedCertificate(
  certificatePem: string | null,
  origin: string | undefined,
  now: Date = new Date(),
): TlsInventory {
  const canonicalHost = (() => {
    try {
      return origin ? new URL(origin).hostname : null;
    } catch {
      return null;
    }
  })();
  if (!certificatePem) {
    return {
      transport: "http",
      canonicalHost,
      certificate: null,
      publicCertificateChainPem: null,
      note: "HTTPS ainda nao configurado neste processo.",
    };
  }
  if (certificatePem.length > 131072) throw new Error("tls_certificate_too_large");
  const publicData = inspectTlsCertificate(certificatePem, canonicalHost ?? "", now);
  return {
    transport: "https",
    canonicalHost,
    ...publicData,
    note: "Certificado carregado no processo. Validade e SAN locais nao comprovam a confianca dos demais clientes.",
  };
}
