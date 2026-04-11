import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  const limit = parseInt(searchParams.get("limit") || "20");

  const sessions = await prisma.teaSession.findMany({
    take: limit,
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { consumedAt: "desc" },
    include: {
      tea: {
        select: { id: true, name: true, type: true, origin: true, brand: true },
      },
    },
  });

  const nextCursor =
    sessions.length === limit ? sessions[sessions.length - 1].id : null;

  return NextResponse.json({ sessions, nextCursor });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { teaId, rating, notes, brewTempC, steepTimeSec, photoUrl, consumedAt } = body;

  if (!teaId || rating === undefined) {
    return NextResponse.json({ error: "teaId and rating are required" }, { status: 400 });
  }

  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be 1–5" }, { status: 400 });
  }

  const session = await prisma.teaSession.create({
    data: {
      teaId,
      rating,
      notes: notes || null,
      brewTempC: brewTempC || null,
      steepTimeSec: steepTimeSec || null,
      photoUrl: photoUrl || null,
      consumedAt: consumedAt ? new Date(consumedAt) : new Date(),
    },
    include: {
      tea: { select: { id: true, name: true, type: true, origin: true, brand: true } },
    },
  });

  return NextResponse.json(session, { status: 201 });
}
