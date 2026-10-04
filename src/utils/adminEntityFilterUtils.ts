import type { CallSubtype } from "@/types/andon";
import type { Machine } from "@/types/machine";
import type { TechnicianConfig } from "@/types/settings";

export function normalizeAdminSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function filterTechniciansForAdmin(
  technicians: TechnicianConfig[],
  searchQuery: string,
  areaFilter: "all" | CallSubtype,
) {
  const query = normalizeAdminSearchValue(searchQuery);

  return technicians.filter((technician) => {
    const matchesSearch =
      !query ||
      normalizeAdminSearchValue(technician.name).includes(query) ||
      normalizeAdminSearchValue(technician.employeeId ?? "").includes(query);
    const technicianAreas = technician.areas?.length
      ? technician.areas
      : [technician.area];
    const matchesArea = areaFilter === "all" || technicianAreas.includes(areaFilter);

    return matchesSearch && matchesArea;
  });
}

export function filterMachinesForAdmin(machines: Machine[], searchQuery: string) {
  const query = normalizeAdminSearchValue(searchQuery);
  if (!query) return machines;

  return machines.filter(
    (machine) =>
      normalizeAdminSearchValue(machine.id).includes(query) ||
      normalizeAdminSearchValue(machine.name).includes(query),
  );
}
