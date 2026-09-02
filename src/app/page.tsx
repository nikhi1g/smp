import { TrackerDashboard } from "@/components/TrackerDashboard";

// Static exports cannot run server-side data loaders at build time. The client
// dashboard hydrates this serializable shell from localStorage/GitHub after load.
export default function Page() {
  return (
    <main className="min-h-screen">
      <TrackerDashboard initialApplications={[]} source="local_fallback" />
    </main>
  );
}
