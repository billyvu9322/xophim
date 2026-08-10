import { Check } from "lucide-react";
import { PRESET_AVATARS } from "@/lib/avatars";
import { cn } from "@/lib/utils";

interface AvatarPickerProps {
  avatarUrl: string | null;
  onSelect: (url: string) => void;
}

export function AvatarPicker({ avatarUrl, onSelect }: AvatarPickerProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-silver">Chọn Avatar</label>
      <div className="grid grid-cols-5 gap-3 sm:grid-cols-6 md:grid-cols-8">
        {PRESET_AVATARS.map((url) => {
          const selected = url === avatarUrl;
          return (
            <button
              key={url}
              type="button"
              aria-label="Chọn avatar này"
              onClick={() => onSelect(url)}
              className={cn(
                "relative aspect-square overflow-hidden rounded-full bg-elevated ring-2 transition",
                selected
                  ? "ring-gold"
                  : "ring-transparent hover:ring-white/40",
              )}
            >
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
              {selected && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Check className="h-5 w-5 text-gold" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
