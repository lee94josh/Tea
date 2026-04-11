import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { EducationPanel } from "@/components/tea/education-panel";
import { TEA_EDUCATION, TEA_TYPE_KEYS } from "@/lib/tea-education";
import type { TeaTypeKey } from "@/lib/tea-education";

interface Props {
  params: { type: string };
}

export function generateStaticParams() {
  return TEA_TYPE_KEYS.map((type) => ({ type }));
}

export default function LearnTypePage({ params }: Props) {
  const edu = TEA_EDUCATION[params.type as TeaTypeKey];
  if (!edu) notFound();

  return (
    <div className="min-h-screen bg-stone-50">
      <PageHeader title={edu.displayName} showBack />
      <div className="px-4 py-4 pb-8">
        <EducationPanel teaType={params.type} />
      </div>
    </div>
  );
}
