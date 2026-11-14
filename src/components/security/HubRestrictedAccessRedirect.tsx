import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "@/i18n/toast";
import { ui } from "@/i18n/translate";

/** Navigate away from a forbidden screen and use the existing bottom-right
 * notification, without ever mounting Admin content or logging a user in.
 */
export function HubRestrictedAccessRedirect({
  destination,
  notice,
}: {
  destination: "hub" | "manager-overview";
  notice: string;
}) {
  const navigate = useNavigate();
  const notified = useRef(false);
  useEffect(() => {
    if (notified.current) return;
    notified.current = true;
    toast.error(ui(notice), { duration: 4500 });
    if (destination === "hub") {
      void navigate({ to: "/hub", replace: true });
    } else {
      void navigate({ to: "/hub/admin", search: { section: "overview" }, replace: true });
    }
  }, [destination, notice, navigate]);
  return <main className="min-h-dvh bg-background" aria-label={ui("Acesso administrativo restrito")} />;
}
