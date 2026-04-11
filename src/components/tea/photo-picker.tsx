"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, ImageIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PhotoPickerProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

export function PhotoPicker({ value, onChange }: PhotoPickerProps) {
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onChange(data.url);
    } catch (err) {
      console.error(err);
      alert("Photo upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  if (value) {
    return (
      <div className="relative rounded-2xl overflow-hidden">
        <div className="relative h-48 w-full">
          <Image src={value} alt="Tea photo" fill className="object-cover" sizes="640px" />
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5"
          aria-label="Remove photo"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={uploading}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera size={18} />
          {uploading ? "Uploading…" : "Camera"}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={uploading}
          onClick={() => galleryRef.current?.click()}
        >
          <ImageIcon size={18} />
          {uploading ? "Uploading…" : "Gallery"}
        </Button>
      </div>

      {/* Hidden inputs */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
