import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("Hub version card shows the built frontend commit and never claims live main", async () => {
  const [view, overview] = await Promise.all([
    read("../src/components/settings/HubBuildVersionCard.tsx"),
    read("../src/components/settings/HubAdminOverview.tsx"),
  ]);
  assert.match(overview, /<HubBuildVersionCard \/>/);
  assert.match(view, /__ANDON_BUILD_METADATA__/);
  assert.match(view, /build\.version/);
  assert.match(view, /build\.commit/);
  assert.match(view, /build\.branch/);
  assert.match(view, /build\.compiledAt/);
  assert.match(view, /navigator\.clipboard\.writeText\(build\.commit\)/);
  assert.match(view, /\/compare\/\$\{build\.commit\}\.\.\.main/);
  assert.match(view, /Não confirma o commit do backend nem consulta a main em tempo real/);
  assert.match(view, /target="_blank" rel="noopener noreferrer"/);
});

test("Vite injects validated SHA from pinned installer or local Git, not a hard-coded main SHA", async () => {
  const [vite, ps, types] = await Promise.all([
    read("../vite.config.ts"),
    read("../installer/AndonInstaller.Common.ps1"),
    read("../src/types/buildMetadata.d.ts"),
  ]);
  assert.match(vite, /process\.env\.ANDON_BUILD_COMMIT \|\| git\("rev-parse", "HEAD"\)/);
  assert.match(vite, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(vite, /__ANDON_BUILD_METADATA__: JSON\.stringify\(buildMetadata\(\)\)/);
  assert.match(vite, /process\.env\.ANDON_BUILD_BRANCH/);
  assert.match(vite, /GITHUB_REF/);
  assert.match(vite, /packageInfo\.version/);
  assert.match(ps, /\$pinnedFrontendCommit = "\$\(\$config\.installedCommit\)"/);
  assert.match(ps, /\$env:ANDON_BUILD_COMMIT = \$pinnedFrontendCommit/);
  assert.match(ps, /\$env:ANDON_BUILD_BRANCH = "\$Global:AndonBranch"/);
  assert.match(ps, /\$env:ANDON_BUILD_COMMIT = \$previousBuildCommit/);
  assert.match(ps, /\$env:ANDON_BUILD_BRANCH = \$previousBuildBranch/);
  assert.match(types, /declare const __ANDON_BUILD_METADATA__/);
});

test("build information is displayed inside the protected Admin page only", async () => {
  const admin = await read("../src/pages/HubAdminPage.tsx");
  assert.match(admin, /if \(!authenticated\)/);
  assert.match(admin, /section === "overview" && <HubAdminOverview \/>/);
  const hub = await read("../src/pages/HubPage.tsx");
  assert.doesNotMatch(hub, /HubBuildVersionCard/);
});
