import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No photo provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamically import sharp (server-only)
    const sharp = (await import("sharp")).default;

    const filename = `${crypto.randomUUID()}.webp`;
    const uploadsDir = path.join(process.cwd(), "public", "uploads");

    // Ensure directory exists
    await fs.mkdir(uploadsDir, { recursive: true });

    const outputPath = path.join(uploadsDir, filename);

    await sharp(buffer)
      .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outputPath);

    return NextResponse.json({ url: `/uploads/${filename}` });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
