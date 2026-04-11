import {
  TEA_EDUCATION,
  CAFFEINE_LABELS,
  FLAVOR_CATEGORY_COLORS,
  type TeaTypeKey,
} from "@/lib/tea-education";
import { Thermometer, Clock, Droplets, Zap, Leaf, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface EducationPanelProps {
  teaType: string;
}

export function EducationPanel({ teaType }: EducationPanelProps) {
  const edu = TEA_EDUCATION[teaType as TeaTypeKey];
  if (!edu) return null;

  const caffeineBarWidth: Record<string, string> = {
    none: "w-0",
    low: "w-1/5",
    medium: "w-2/5",
    high: "w-4/5",
    "very-high": "w-full",
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className={cn("rounded-2xl p-4", edu.bgColor)}>
        <h3 className={cn("font-bold text-lg", edu.color)}>{edu.displayName}</h3>
        <p className="text-sm text-stone-600 mt-1">{edu.tagline}</p>
        <div className="flex flex-wrap gap-2 mt-3 text-xs text-stone-600">
          <span className="flex items-center gap-1">
            <Leaf size={12} />
            {edu.oxidationLevel} oxidation
          </span>
          <span>·</span>
          <span>{edu.originRegions.join(", ")}</span>
        </div>
      </div>

      {/* Flavor Notes */}
      <div>
        <h4 className="text-sm font-semibold text-stone-700 mb-2">Flavor Profile</h4>
        <div className="flex flex-wrap gap-1.5">
          {edu.flavorNotes.map((note) => (
            <span
              key={note.label}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                FLAVOR_CATEGORY_COLORS[note.category]
              )}
            >
              {note.label}
            </span>
          ))}
        </div>
      </div>

      {/* Caffeine */}
      <div>
        <h4 className="text-sm font-semibold text-stone-700 mb-2 flex items-center gap-1.5">
          <Zap size={14} />
          Caffeine Level
        </h4>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full bg-amber-500 rounded-full transition-all",
                caffeineBarWidth[edu.caffeineLevel]
              )}
            />
          </div>
          <span className="text-xs font-medium text-stone-600 w-20 text-right">
            {CAFFEINE_LABELS[edu.caffeineLevel]}
          </span>
        </div>
      </div>

      {/* Brewing Guide */}
      <div className="bg-amber-50 rounded-2xl p-4">
        <h4 className="text-sm font-semibold text-amber-900 mb-3">Brewing Guide</h4>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="flex items-start gap-2">
            <Thermometer size={16} className="text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-stone-500">Temperature</p>
              <p className="text-sm font-medium text-stone-800">
                {edu.brewing.tempRangeC[0]}–{edu.brewing.tempRangeC[1]}°C
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={16} className="text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-stone-500">Steep Time</p>
              <p className="text-sm font-medium text-stone-800">
                {Math.floor(edu.brewing.steepTimeSec[0] / 60)}–
                {Math.floor(edu.brewing.steepTimeSec[1] / 60)} min
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Droplets size={16} className="text-amber-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-stone-500">Leaf:Water</p>
              <p className="text-sm font-medium text-stone-800">{edu.brewing.waterToLeaf}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-amber-700 text-base mt-0.5 shrink-0">⬙</span>
            <div>
              <p className="text-xs text-stone-500">Vessel</p>
              <p className="text-sm font-medium text-stone-800 leading-snug">
                {edu.brewing.vessel}
              </p>
            </div>
          </div>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">{edu.brewing.notes}</p>
      </div>

      {/* Health Highlights */}
      <div>
        <h4 className="text-sm font-semibold text-stone-700 mb-2">Health Highlights</h4>
        <ul className="space-y-1.5">
          {edu.healthHighlights.map((h, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
              <span className="text-green-500 mt-0.5 shrink-0">✓</span>
              {h}
            </li>
          ))}
        </ul>
      </div>

      {/* Famous Varieties */}
      <div>
        <h4 className="text-sm font-semibold text-stone-700 mb-2 flex items-center gap-1.5">
          <Star size={14} />
          Famous Varieties
        </h4>
        <div className="space-y-2">
          {edu.famousVarieties.map((v) => (
            <div key={v.name} className="bg-stone-50 rounded-xl p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium text-stone-800">{v.name}</p>
                <p className="text-xs text-stone-400 shrink-0">{v.origin}</p>
              </div>
              <p className="text-xs text-stone-600 mt-0.5">{v.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Processing */}
      <div>
        <h4 className="text-sm font-semibold text-stone-700 mb-2">How It's Made</h4>
        <ol className="space-y-1.5">
          {edu.processingSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
              <span className="text-xs font-bold text-amber-700 mt-0.5 w-4 shrink-0">
                {i + 1}.
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* Fun Fact */}
      <div className="bg-stone-100 rounded-2xl p-4">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">
          Did You Know?
        </p>
        <p className="text-sm text-stone-700 leading-relaxed">{edu.funFact}</p>
      </div>
    </div>
  );
}
