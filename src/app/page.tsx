import { fetchApplications } from "@/lib/sheets";
import { TrackerDashboard } from "@/components/TrackerDashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { data: applications, source } = await fetchApplications();

  return (
    <main className="min-h-screen">
      <TrackerDashboard initialApplications={applications} source={source} />
    </main>
  );
}
