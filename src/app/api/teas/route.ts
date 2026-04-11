import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  const teas = await prisma.tea.findMany({
    where: name ? { name: { contains: name } } : undefined,
    orderBy: { name: "asc" },
    take: 20,
    include: {
      _count: { select: { sessions: true } },
    },
  });

  return NextResponse.json(teas);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, type, origin, brand } = body;

  if (!name || !type) {
    return NextResponse.json({ error: "name and type are required" }, { status: 400 });
  }

  // Find existing tea or create new one
  const existing = await prisma.tea.findFirst({
    where: {
      name: { equals: name },
      type,
    },
  });

  if (existing) {
    return NextResponse.json(existing);
  }

  const tea = await prisma.tea.create({
    data: { name, type, origin: origin || null, brand: brand || null },
  });

  return NextResponse.json(tea, { status: 201 });
}
