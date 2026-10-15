import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CheckIn } from "@/context/AppContext";

type PivotModalProps = {
  open: boolean;
  exerciseName: string;
  onClose: () => void;
  onSubmit: (constraint: string) => void | Promise<void>;
  lastCheckIn?: CheckIn | null;
  workoutDuration?: number;
  totalDuration?: number;
};

function buildApplicableConstraints(
  lastCheckIn: CheckIn | null | undefined,
  workoutDuration: number | undefined,
  totalDuration: number | undefined,
): string[] {
  const constraints: string[] = [];

  // Pain constraint: Show if user reported soreness or low energy suggests joint stress risk
  if (lastCheckIn) {
    if (lastCheckIn.soreness && lastCheckIn.soreness > 4) {
      constraints.push("Sore area — modify exercise");
    } else if (lastCheckIn.soreness > 0 && lastCheckIn.energy <= 4) {
      constraints.push("Joint feels stressed");
    }
  }

  // Fatigue constraint: Show if low sleep or low energy
  if (lastCheckIn && (lastCheckIn.sleep < 6 || lastCheckIn.energy <= 3)) {
    constraints.push("Too fatigued for this exercise");
  }

  // Time constraint: Show if limited time remaining
  if (workoutDuration !== undefined && totalDuration !== undefined) {
    const remaining = totalDuration - workoutDuration;
    if (remaining > 0 && remaining < 10) {
      constraints.push(`Only ${remaining} min left`);
    }
  }

  // Equipment constraint: Always show (user can report equipment issues anytime)
  constraints.push("Equipment not available");

  // If no specific constraints, provide a fallback
  if (constraints.length === 0) {
    constraints.push("Other reason");
  }

  return constraints;
}

export function PivotModal({
  open,
  exerciseName,
  onClose,
  onSubmit,
  lastCheckIn,
  workoutDuration = 0,
  totalDuration = 45,
}: PivotModalProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [applicableConstraints] = useState(() =>
    buildApplicableConstraints(lastCheckIn, workoutDuration, totalDuration)
  );

  useEffect(() => {
    if (open) { setText(""); setLoading(false); }
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      await onSubmit(text.trim());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-card border-t border-border sm:border sm:rounded-3xl rounded-t-3xl p-6 pb-8 shadow-elevated animate-slide-in-bottom">
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-tertiary font-semibold">Pivot</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">What's the constraint?</h2>
            <p className="mt-1 text-xs text-muted-foreground truncate max-w-[280px]">For: {exerciseName}</p>
          </div>
          <button onClick={onClose} className="size-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex flex-col items-center gap-4">
            <div
              className="size-10 rounded-full border-[3px] border-secondary border-t-primary"
              style={{
                animation: "spin 1s linear infinite",
              }}
            />
            <p className="text-sm text-muted-foreground animate-soft-pulse">Finding alternative...</p>
          </div>
        ) : (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Describe what's happening..."
              rows={3}
              className="mt-4 w-full bg-elevated border border-border rounded-2xl p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-tertiary"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {applicableConstraints.map((c) => (
                <button
                  key={c}
                  onClick={() => setText(c)}
                  className="text-xs font-medium text-foreground bg-secondary hover:bg-elevated border border-border rounded-full px-3 py-2 transition-colors"
                >
                  {c}
                </button>
              ))}
            </div>
            {applicableConstraints.length === 1 && applicableConstraints[0] === "Other reason" && (
              <p className="mt-2 text-xs text-muted-foreground">
                No typical constraints detected. Describe any issues above.
              </p>
            )}
            <button
              onClick={submit}
              disabled={!text.trim()}
              className="mt-6 w-full bg-primary text-primary-foreground rounded-full py-3.5 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition-transform"
            >
              Pivot This Exercise
            </button>
          </>
        )}
      </div>
    </div>

    <style>{`
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `}</style>
  );
}
