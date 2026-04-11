import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const tea = await prisma.tea.findUnique({
    where: { id: params.id },
    include: {
      sessions: {
        orderBy: { consumedAt: "desc" },
      },
    },
  });

  if (!tea) {
    return NextResponse.json({ error: "Tea not found" }, { status: 404 });
  }

  return NextResponse.json(tea);
}
