import { useContext } from "react";
import { TechnicianContext } from "@/context/technicianContext";

export function useTechnicians() {
  const context = useContext(TechnicianContext);
  if (!context) {
    throw new Error("useTechnicians deve ser usado dentro de TechnicianProvider");
  }
  return context;
}
