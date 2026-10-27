import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
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

export default defineConfig(() => ({
  server: {
    host: process.env.ANDON_HOMOLOGATION_HOST?.trim() || "::",
    port: Number(process.env.ANDON_HOMOLOGATION_FRONTEND_PORT ?? 8080),
    strictPort: Boolean(process.env.ANDON_HOMOLOGATION_FRONTEND_PORT),
    https: homologationHttps(),
  },
  plugins: [tsConfigPaths(), tailwindcss(), tanstackStart(), viteReact()],
}));
