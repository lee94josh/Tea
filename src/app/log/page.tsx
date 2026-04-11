import { PageHeader } from "@/components/layout/page-header";
import { TeaSessionForm } from "@/components/tea/tea-session-form";

export default function LogPage() {
  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader title="Log a Tea" showBack />
      <TeaSessionForm />
    </div>
  );
}
