import { useEffect, useState } from "react";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";
import { ui } from "@/i18n/translate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createAndonApiClient } from "@/api/andonApiClient";

type Inventory = {
  transport: "http" | "https";
  canonicalHost: string | null;
  certificate: null | {
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
  publicCertificateChainPem: string | null;
  note: string;
  dns: { state: string; addresses: string[]; localMatch: boolean };
};

const api = createAndonApiClient();
const formatDate = (date: string) => new Date(date).toLocaleDateString();

function downloadPublicText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function TlsInspectionPanel() {
  const [status, setStatus] = useState<Inventory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const result = await api.get<Inventory>("/api/admin-auth/tls-status");
      setStatus(result);
    } catch {
      setStatus(null);
      setError("Não foi possível consultar os certificados. Confirme o HTTPS e sua sessão Admin.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);

  const cert = status?.certificate;
  const validity = cert?.validity === "valid"
    ? ui("Dentro da validade")
    : cert?.validity === "expiring"
      ? ui("Perto do vencimento")
      : cert?.validity === "expired"
        ? ui("Certificado vencido")
        : ui("Certificado ainda não válido");

  const report = () => {
    if (!status || !cert) return;
    const details = [
      "ANDON Web Industrial — Informações públicas de TLS",
      "Ambiente: servidor consultado pelo painel Admin",
      "Transporte: " + status.transport.toUpperCase(),
      "Host canônico: " + (status.canonicalHost ?? "não identificado"),
      "Assunto: " + cert.subject.replaceAll("\n", " | "),
      "Emissor: " + cert.issuer.replaceAll("\n", " | "),
      "SAN: " + cert.subjectAlternativeName,
      "Início: " + cert.validFrom,
      "Vencimento: " + cert.validTo,
      "Dias até vencer: " + cert.daysUntilExpiry,
      "Impressão digital SHA-256: " + cert.fingerprint256,
      "Host coberto pelo certificado: " + (cert.hostMatchesCertificate ? "sim" : "não"),
      "DNS: " + status.dns.state,
      "IPs DNS: " + status.dns.addresses.join(", "),
      "",
      "ATENÇÃO: validade/SAN local não comprovam confiança em outros clientes.",
      "A chave privada do servidor e a chave privada da CA nunca fazem parte desta exportação.",
      "A CA pública de teste (mkcert) requer exportação e autorização separadas pela TI.",
      "",
      "----- CERTIFICADO PÚBLICO DO SERVIDOR -----",
      status.publicCertificateChainPem ?? "",
    ].join("\n");
    downloadPublicText("ANDON-HTTPS-INFORMACOES-PUBLICAS-TI.txt", details);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          {ui("Certificados e DNS")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          {ui("Inspeção somente leitura do HTTPS em uso. Nenhuma configuração ou chave privada é alterada.")}
        </p>
        <Button type="button" variant="outline" disabled={loading} onClick={() => void refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          {loading ? ui("Consultando...") : ui("Atualizar diagnóstico")}
        </Button>
        {error && <p role="alert" className="text-sm text-danger">{ui(error)}</p>}
        {status && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{ui("Transporte")}</p>
                <p className="mt-1 font-bold">{status.transport.toUpperCase()}</p>
              </div>
              <div className="min-w-0 rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">{ui("Endereço oficial")}</p>
                <p className="mt-1 break-all font-semibold">{status.canonicalHost ?? "—"}</p>
              </div>
            </div>
            {cert ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">{ui("Validade do certificado")}</p>
                    <p className="mt-1 font-semibold">{validity}</p>
                    <p className="mt-1 text-sm">{ui("Expira em")}: {formatDate(cert.validTo)} ({cert.daysUntilExpiry} {ui("dias")})</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">{ui("Host presente no certificado")}</p>
                    <p className="mt-1 font-semibold">{cert.hostMatchesCertificate ? ui("Sim") : ui("Não")}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{cert.subjectAlternativeName}</p>
                  </div>
                </div>
                <div className="min-w-0 space-y-2 rounded-lg border border-border p-3 text-sm">
                  <p><strong>{ui("Emissor")}:</strong> <span className="break-all">{cert.issuer.replaceAll("\n", " · ")}</span></p>
                  <p><strong>{ui("SHA-256")}:</strong> <span className="break-all font-mono text-xs">{cert.fingerprint256}</span></p>
                  <p><strong>{ui("DNS resolvido")}:</strong> {status.dns.addresses.length
                    ? status.dns.addresses.join(", ")
                    : ui("Não disponível ou não aplicável")}</p>
                  <p className="text-xs text-muted-foreground">
                    {ui("A resolução no servidor não comprova acesso, cadeia de confiança ou segurança dos outros dispositivos.")}
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={report}>
                  <Download className="mr-2 h-4 w-4" />
                  {ui("Exportar informações públicas para TI")}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{ui("Certificado HTTPS não configurado neste processo.")}</p>
            )}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {ui("A exportação não inclui chaves privadas nem a CA pública do mkcert. A confiança deverá ser validada pela TI em cada dispositivo.")}
        </p>
      </CardContent>
    </Card>
  );
}
