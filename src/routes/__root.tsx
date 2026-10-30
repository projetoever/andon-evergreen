import { ui } from "@/i18n/translate";
import { useLanguage as useInterfaceLanguage } from "@/i18n/LanguageProvider";
import {
  Outlet,
  Link,
  createRootRoute,
  HeadContent,
  Scripts,
  useRouterState,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import { AndonProvider } from "@/context/AndonProvider";
import { TechnicianProvider } from "@/context/TechnicianProvider";
import { VirtualKeyboard } from "@/components/common/VirtualKeyboard";
import { Toaster } from "@/components/ui/sonner";
import { WorkstationAccessGate } from "@/components/security/WorkstationAccessGate";
import { LanguageProvider } from "@/i18n/LanguageProvider";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { GlobalVisualPaletteProvider } from "@/theme/GlobalVisualPaletteProvider";
import { ModuleAccessProvider, useModuleAccess } from "@/context/ModuleAccessProvider";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  useInterfaceLanguage();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {ui("Página não encontrada")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {ui("A página procurada não existe ou foi movida.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {ui("Ir para o início")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, interactive-widget=resizes-content" },
      { title: "Andon Evergreen" },
      {
        name: "description",
        content: "Sistema Andon industrial para acompanhar máquinas e chamados em tempo real.",
      },
      { name: "author", content: "Lovable" },
      { property: "og:title", content: "Andon Evergreen" },
      {
        property: "og:description",
        content: "Sistema Andon industrial para acompanhar máquinas e chamados em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Andon Evergreen" },
      {
        name: "twitter:description",
        content: "Sistema Andon industrial para acompanhar máquinas e chamados em tempo real.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b0d8df8f-09f1-46ee-a1fe-79b35d7672b2/id-preview-dd3d35ff--479cc6ec-0677-495f-8706-dc2437612114.lovable.app-1777145723650.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/b0d8df8f-09f1-46ee-a1fe-79b35d7672b2/id-preview-dd3d35ff--479cc6ec-0677-495f-8706-dc2437612114.lovable.app-1777145723650.png",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider><GlobalVisualPaletteProvider><LanguageProvider>{children}</LanguageProvider></GlobalVisualPaletteProvider></ThemeProvider>
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  useInterfaceLanguage();
  return (
    <ModuleAccessProvider>
      <RootContent />
    </ModuleAccessProvider>
  );
}

function RootContent() {
  useInterfaceLanguage();
  useVisualViewport();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { access, checking } = useModuleAccess();
  const navigate = useNavigate();
  const lockedMachineId = access?.workstation.lockedMachineId;
  const isHubRoute = pathname === "/" || pathname === "/hub" || pathname.startsWith("/hub/");
  const isIndependentModule =
    pathname === "/bi" || pathname.startsWith("/bi/") || pathname === "/machine-priorities";
  const mustReturnToMachine = Boolean(
    !checking &&
    lockedMachineId &&
    !isHubRoute &&
    !isIndependentModule &&
    pathname !== `/machines/${encodeURIComponent(lockedMachineId)}`,
  );
  useEffect(() => {
    if (mustReturnToMachine && lockedMachineId)
      void navigate({
        to: "/machines/$machineId",
        params: { machineId: lockedMachineId },
        replace: true,
      });
  }, [mustReturnToMachine, lockedMachineId, navigate]);
  const isBiRoute = useRouterState({
    select: (state) =>
      state.location.pathname === "/bi" || state.location.pathname.startsWith("/bi/"),
  });

  if (mustReturnToMachine)
    return (
      <div role="status" className="p-6">
        {ui("Retornando à tela fixada da máquina…")}
      </div>
    );
  if (isHubRoute)
    return (
      <>
        <Outlet />
        <Toaster />
      </>
    );
  if (pathname === "/machine-priorities")
    return (
      <WorkstationAccessGate>
        <Outlet />
        <Toaster />
      </WorkstationAccessGate>
    );

  if (isBiRoute) {
    return (
      <WorkstationAccessGate>
        <Outlet />
        <Toaster />
      </WorkstationAccessGate>
    );
  }

  return (
    <WorkstationAccessGate>
      <AndonProvider>
        <TechnicianProvider>
          <Outlet />
          <VirtualKeyboard />
          <Toaster />
        </TechnicianProvider>
      </AndonProvider>
    </WorkstationAccessGate>
  );
}
