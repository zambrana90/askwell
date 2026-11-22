import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";

export default function DashboardPage() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Projects</h1>
      <EmptyState
        title="No projects yet"
        description="Create a project to add knowledge and a chat widget to your site."
        action={<Button disabled>Create project</Button>}
      />
    </>
  );
}
