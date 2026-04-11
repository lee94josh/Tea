import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() || "";
  const type = searchParams.get("type") || "";

  if (!q && !type) {
    return NextResponse.json({ results: [] });
  }

  const sessions = await prisma.teaSession.findMany({
    where: {
      AND: [
        type ? { tea: { type } } : {},
        q
          ? {
              OR: [
                { tea: { name: { contains: q } } },
                { tea: { origin: { contains: q } } },
                { tea: { brand: { contains: q } } },
                { notes: { contains: q } },
              ],
            }
          : {},
      ],
    },
    include: {
      tea: { select: { id: true, name: true, type: true, origin: true, brand: true } },
    },
    orderBy: { consumedAt: "desc" },
    take: 50,
  });

  return NextResponse.json({ results: sessions });
}
