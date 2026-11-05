import { requireUser } from "@/lib/auth";
import { MoodDashboardClient } from "@/components/mood/mood-dashboard-client";

export const dynamic = "force-dynamic";

export default async function MoodPage() {
  const auth = await requireUser();
  if ("response" in auth) return null;

  return <MoodDashboardClient />;
}
