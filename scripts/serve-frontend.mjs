import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { isIP } from "node:net";
import { X509Certificate } from "node:crypto";
import { createSecureContext } from "node:tls";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const projectPath = resolve(process.env.ANDON_PROJECT_PATH || process.cwd());
const clientPath = resolve(projectPath, "dist", "client");
const serverEntryPath = resolve(projectPath, "dist", "server", "server.js");
const host = process.env.HOST?.trim() || "0.0.0.0";
const port = Number(process.env.PORT || 8080);
const certificatePath = process.env.ANDON_TLS_CERT?.trim();
const privateKeyPath = process.env.ANDON_TLS_KEY?.trim();
const tlsHost = process.env.ANDON_TLS_HOST?.trim();

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function loadTlsConfiguration() {
  if (Boolean(certificatePath) !== Boolean(privateKeyPath)) {
    throw new Error("ANDON_TLS_CERT e ANDON_TLS_KEY devem ser configurados juntos.");
  }

  if (!certificatePath || !privateKeyPath) return null;
  if (!tlsHost) throw new Error("ANDON_TLS_HOST e obrigatorio no modo HTTPS.");

  const cert = readFileSync(certificatePath);
  const key = readFileSync(privateKeyPath);
  createSecureContext({ cert, key });

  const certificate = new X509Certificate(cert);
  const now = Date.now();
  if (now < Date.parse(certificate.validFrom) || now > Date.parse(certificate.validTo)) {
    throw new Error("O certificado TLS esta fora do periodo de validade.");
  }
  const certificateHostMatch = isIP(tlsHost)
    ? certificate.checkIP(tlsHost)
    : certificate.checkHost(tlsHost);
  if (!certificateHostMatch) {
    throw new Error(`O certificado TLS nao contempla o host ${tlsHost}.`);
  }

  return { cert, key };
}

const tls = loadTlsConfiguration();

if (process.argv.includes("--validate-tls")) {
  if (!tls) throw new Error("A validacao TLS exige certificado e chave privada.");
  process.stdout.write(`TLS valido para ${tlsHost}.\n`);
  process.exit(0);
}

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(`PORT invalida: ${process.env.PORT ?? ""}`);
}
if (!existsSync(clientPath) || !existsSync(serverEntryPath)) {
  throw new Error("Build compilado ausente. Execute npm run build antes de iniciar o frontend.");
}

const serverBuild = (await import(pathToFileURL(serverEntryPath).href)).default;
if (!serverBuild || typeof serverBuild.fetch !== "function") {
  throw new Error("Entrada SSR compilada invalida: fetch nao encontrado.");
}

function resolveStaticFile(pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const candidate = resolve(clientPath, `.${decodedPath}`);
  const clientPrefix = clientPath.endsWith(sep) ? clientPath : `${clientPath}${sep}`;
  if (candidate !== clientPath && !candidate.startsWith(clientPrefix)) return null;
  if (!existsSync(candidate)) return null;

  const stats = statSync(candidate);
  return stats.isFile() ? { candidate, stats } : null;
}

function serveStatic(req, res, url) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const resolvedFile = resolveStaticFile(url.pathname);
  if (!resolvedFile) return false;

  const extension = extname(resolvedFile.candidate).toLowerCase();
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes.get(extension) || "application/octet-stream");
  res.setHeader("Content-Length", String(resolvedFile.stats.size));
  res.setHeader(
    "Cache-Control",
    url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
  );

  if (req.method === "HEAD") {
    res.end();
  } else {
    createReadStream(resolvedFile.candidate).pipe(res);
  }
  return true;
}

function appendRequestHeaders(req) {
  const headers = new Headers();
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    headers.append(req.rawHeaders[index], req.rawHeaders[index + 1]);
  }
  return headers;
}

function applyResponseHeaders(res, headers) {
  const setCookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  for (const [name, value] of headers) {
    if (name.toLowerCase() !== "set-cookie") res.setHeader(name, value);
  }
  if (setCookies.length > 0) res.setHeader("Set-Cookie", setCookies);
}

async function handleRequest(req, res) {
  const protocol = tls ? "https" : "http";
  const url = new URL(req.url || "/", `${protocol}://${req.headers.host || "localhost"}`);
  if (serveStatic(req, res, url)) return;

  const init = {
    method: req.method,
    headers: appendRequestHeaders(req),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }

  const response = await serverBuild.fetch(new Request(url, init));
  res.statusCode = response.status;
  res.statusMessage = response.statusText;
  applyResponseHeaders(res, response.headers);

  if (req.method === "HEAD" || !response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

const server = tls ? createHttpsServer(tls) : createHttpServer();
server.on("request", (req, res) => {
  handleRequest(req, res).catch((error) => {
    console.error("Falha no frontend compilado ANDON:", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
    }
    res.end("Falha interna no frontend ANDON.");
  });
});

server.listen(port, host, () => {
  console.log(`Frontend ANDON compilado em ${tls ? "https" : "http"}://${host}:${port}`);
});
