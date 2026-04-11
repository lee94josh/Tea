"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/ui/star-rating";
import { PhotoPicker } from "@/components/tea/photo-picker";
import { TEA_EDUCATION, TEA_TYPE_KEYS } from "@/lib/tea-education";
import { cn } from "@/lib/utils";

const schema = z.object({
  teaName: z.string().min(1, "Tea name is required"),
  teaType: z.enum(["green", "black", "white", "oolong", "puerh", "herbal", "yellow"]),
  origin: z.string().optional(),
  brand: z.string().optional(),
  rating: z.number().min(1).max(5),
  notes: z.string().optional(),
  brewTempC: z.number().min(40).max(105).optional().or(z.literal("")),
  steepTimeSec: z.number().min(1).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function TeaSessionForm() {
  const router = useRouter();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nameOptions, setNameOptions] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      teaType: "green",
      rating: 0,
    },
  });

  const teaName = watch("teaName");
  const rating = watch("rating");
  const teaType = watch("teaType");

  // Autocomplete tea names
  useEffect(() => {
    if (!teaName || teaName.length < 2) {
      setNameOptions([]);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/teas?name=${encodeURIComponent(teaName)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((teas: { name: string; type: string }[]) => {
        setNameOptions(teas.map((t) => t.name));
      })
      .catch(() => {});
    return () => controller.abort();
  }, [teaName]);

  const onSubmit = async (data: FormValues) => {
    if (data.rating < 1) {
      alert("Please give a star rating");
      return;
    }
    setSubmitting(true);
    try {
      // Create or find tea
      const teaRes = await fetch("/api/teas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.teaName,
          type: data.teaType,
          origin: data.origin || null,
          brand: data.brand || null,
        }),
      });
      const tea = await teaRes.json();

      // Create session
      await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teaId: tea.id,
          rating: data.rating,
          notes: data.notes || null,
          brewTempC: data.brewTempC ? Number(data.brewTempC) : null,
          steepTimeSec: data.steepTimeSec ? Number(data.steepTimeSec) : null,
          photoUrl,
        }),
      });

      router.push("/");
      router.refresh();
    } catch {
      alert("Failed to save. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-4">
      {/* Photo */}
      <div className="space-y-1.5">
        <Label>Photo (optional)</Label>
        <PhotoPicker value={photoUrl} onChange={setPhotoUrl} />
      </div>

      {/* Tea Name */}
      <div className="space-y-1.5">
        <Label htmlFor="teaName">Tea Name *</Label>
        <Input
          id="teaName"
          list="tea-name-options"
          placeholder="e.g. Dragon Well, Earl Grey…"
          {...register("teaName")}
        />
        <datalist id="tea-name-options">
          {nameOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {errors.teaName && (
          <p className="text-xs text-red-500">{errors.teaName.message}</p>
        )}
      </div>

      {/* Tea Type */}
      <div className="space-y-1.5">
        <Label>Tea Type *</Label>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TEA_TYPE_KEYS.map((key) => {
            const edu = TEA_EDUCATION[key];
            const isSelected = teaType === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setValue("teaType", key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                  isSelected
                    ? `${edu.bgColor} ${edu.color} ring-2 ring-offset-1 ring-amber-400`
                    : "bg-stone-100 text-stone-600"
                )}
              >
                {edu.displayName}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rating */}
      <div className="space-y-1.5">
        <Label>Rating *</Label>
        <StarRating
          value={rating}
          onChange={(v) => setValue("rating", v)}
          size="lg"
        />
        {errors.rating && (
          <p className="text-xs text-red-500">Please select a rating</p>
        )}
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Tasting Notes</Label>
        <Textarea
          id="notes"
          placeholder="What do you taste? How does it make you feel?"
          {...register("notes")}
        />
      </div>

      {/* Optional fields */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-stone-500 font-medium list-none flex items-center gap-1">
          <span className="group-open:hidden">+ More details</span>
          <span className="hidden group-open:inline">− Less details</span>
        </summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="brand">Brand</Label>
            <Input id="brand" placeholder="e.g. Harney & Sons" {...register("brand")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="origin">Origin</Label>
            <Input id="origin" placeholder="e.g. Hangzhou, China" {...register("origin")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brewTempC">Brew Temp (°C)</Label>
              <Input
                id="brewTempC"
                type="number"
                min={40}
                max={105}
                placeholder="e.g. 80"
                {...register("brewTempC", { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="steepTimeSec">Steep Time (sec)</Label>
              <Input
                id="steepTimeSec"
                type="number"
                min={1}
                placeholder="e.g. 120"
                {...register("steepTimeSec", { valueAsNumber: true })}
              />
            </div>
          </div>
        </div>
      </details>

      <Button type="submit" className="w-full" size="lg" disabled={submitting}>
        {submitting ? "Saving…" : "Save Tea Session"}
      </Button>
    </form>
  );
}
