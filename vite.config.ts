import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

function homologationHttps() {
  const certPath = process.env.ANDON_HOMOLOGATION_TLS_CERT?.trim();
  const keyPath = process.env.ANDON_HOMOLOGATION_TLS_KEY?.trim();

  if (Boolean(certPath) !== Boolean(keyPath)) {
    throw new Error(
      "ANDON_HOMOLOGATION_TLS_CERT e ANDON_HOMOLOGATION_TLS_KEY devem ser definidos juntos.",
    );
  }

  return certPath && keyPath
    ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
    : undefined;
}

/**
 * Exact identity of the BUILD ARTIFACT, not a live GitHub lookup. Using the
 * installer-pinned commit takes precedence over locally available Git (which
 * may not be on PATH on the Windows Server).
 */
function buildMetadata() {
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", args, {
        cwd: process.cwd(), encoding: "utf8", timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return "";
    }
  };
  const candidate = (process.env.ANDON_BUILD_COMMIT || git("rev-parse", "HEAD")).trim().toLowerCase();
  const commit = /^[0-9a-f]{40}$/.test(candidate) ? candidate : null;
  const sourceBranch = (process.env.ANDON_BUILD_BRANCH ||
    process.env.GITHUB_HEAD_REF || git("symbolic-ref", "--quiet", "--short", "HEAD")).trim();
  const branch = /^[a-zA-Z0-9_./-]{1,120}$/.test(sourceBranch) &&
    !sourceBranch.includes("..") ? sourceBranch : null;
  const ref = process.env.GITHUB_REF || "";
  const prFromRef = /^refs\\/pull\\/(\\d+)\\/merge$/.exec(ref)?.[1];
  const pullRequest = prFromRef ? Number(prFromRef) : null;
  const packageInfo = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string };
  return {
    version: packageInfo.version,
    commit,
    branch,
    pullRequest,
    compiledAt: new Date().toISOString(),
  };
}

export default defineConfig(() => ({
  define: { __ANDON_BUILD_METADATA__: JSON.stringify(buildMetadata()) },
  server: {
    host: process.env.ANDON_HOMOLOGATION_HOST?.trim() || "::",
    port: Number(process.env.ANDON_HOMOLOGATION_FRONTEND_PORT ?? 8080),
    strictPort: Boolean(process.env.ANDON_HOMOLOGATION_FRONTEND_PORT),
    https: homologationHttps(),
  },
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), viteReact()],
}));
