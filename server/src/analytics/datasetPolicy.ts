import { prisma } from "../db/prisma.js";
import { analyticsEligibility } from "./eligibility.js";

export async function loadAnalyticsEligibility() {
  const catalog = await prisma.failureClassification.findMany({
    select: { value: true, analyticsDisposition: true },
  });
  return analyticsEligibility(catalog);
}
