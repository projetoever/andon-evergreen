import { Link } from "@tanstack/react-router";
import { Activity } from "lucide-react";
import { ClockDisplay } from "@/components/common/ClockDisplay";
import { APP_NAME } from "@/constants/appConstants";

export function AppHeader() {
  return (
    <header className="border-b border-border bg-card/60 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1920px] items-center justify-between gap-6 px-8 py-4">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-lg">
            <Activity className="h-7 w-7" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{APP_NAME}</h1>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Painel industrial · Modo kiosk
            </p>
          </div>
        </Link>
        <ClockDisplay />
      </div>
    </header>
  );
}
