import { repairReports } from "@/db/jobs/repair-reports";

const result = await repairReports();
console.log(`[repair-reports] ${JSON.stringify(result)}`);
