/**
 * Injected into the compiled frontend by Vite. No runtime GitHub access,
 * secrets, user data, or backend revision assumptions.
 */
declare const __ANDON_BUILD_METADATA__: Readonly<{
  version: string;
  commit: string | null;
  branch: string | null;
  pullRequest: number | null;
  compiledAt: string;
}>;
