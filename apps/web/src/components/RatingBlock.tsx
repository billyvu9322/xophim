import { Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/auth";
import { useRate, useRating } from "@/hooks/community";
import { cn } from "@/lib/utils";

// 5-star user rating (DESIGN.md §4 "User Star Rating"). Interactive when logged
// in; shows the average score + vote count beside the stars.
export function RatingBlock({ slug }: { slug: string }) {
  const { data: user } = useAuth();
  const { data: rating } = useRating(slug);
  const rate = useRate(slug);
  const [hover, setHover] = useState(0);

  const mine = rating?.mine ?? 0;
  const shown = hover || mine;

  const onRate = (score: number) => {
    if (!user) {
      toast.error("Đăng nhập để đánh giá");
      return;
    }
    rate.mutate(score);
  };

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg bg-chrome p-4">
      <div>
        <p className="mb-1 text-sm font-medium text-white">Đánh giá của bạn</p>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              onMouseEnter={() => setHover(n)}
              onClick={() => onRate(n)}
              aria-label={`${n} sao`}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={cn(
                  "h-6 w-6",
                  n <= shown ? "fill-gold text-gold" : "fill-transparent text-slate",
                )}
              />
            </button>
          ))}
        </div>
      </div>
      {rating && (
        <div className="text-sm text-muted">
          <span className="text-lg font-semibold text-gold">
            {rating.avg != null ? rating.avg.toFixed(1) : "—"}
          </span>{" "}
          · {rating.count} lượt
        </div>
      )}
    </div>
  );
}
