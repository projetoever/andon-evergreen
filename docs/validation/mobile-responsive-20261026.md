# Mobile responsiveness — review candidate

Base: main `81c9b41bfd0ad912db29250785c5c83310289539`.

## Changes

- ANDON uses vertically flowing machine cards below 1024px, retaining ordering and paging.
- BI uses a scrolling document, responsive filters and metrics, labeled scrollable navigation, explicit chart heights, bounded paginated lists, and locally scrolling tables/heatmaps.
- Shared dialogs follow the visual viewport on native keyboard resize; mobile inputs use 16px text without disabling zoom.
- Desktop/kiosk sizing remains under the existing lg (1024px) breakpoint. No backend, schema, KPI, permissions, or operational transition changes.

## Validation

- Frontend TypeScript and production build pass; backend generation/build pass.
- Existing UI regression suite: 263/263 pass. Five source-layout assertions updated for responsive breakpoint classes.
- ESLint excluding pre-existing formatting errors: no errors; one pre-existing effect-dependency warning in DashboardPage.
- Full baseline lint already fails (2491 errors, 19 warnings); no unrelated repository-wide formatting performed.
- Browser checks use synthetic API responses in API mode, not company data. Viewports: 360x800, 390x844, 844x390, 768x1024, 1366x768. Routes include Hub, operational dashboard, machine, priorities, Hub administration, and all five BI sections plus distribution and temporal modes.

## Remaining acceptance gates

Physical Android/iOS keyboard and scrolling validation; full API-backed call lifecycle against an isolated PostgreSQL environment; visual desktop/kiosk comparison with production-like records; export/print behavior on device. Browser emulation does not certify these gates. No merge/deploy/restart or pilot access performed.
