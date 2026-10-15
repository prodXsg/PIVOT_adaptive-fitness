import { useState } from "react";
import { ArrowLeft, ArrowRight, Info, X } from "lucide-react";
import type { ReadinessSnapshot } from "./WorkoutIntentScreen";

type NumericKey = "sleep" | "energy" | "soreness" | "time";
type Selections = Partial<Record<NumericKey, number>>;

type CustomTime = {
  isCustom: boolean;
  duration: number;
};

const TOTAL_QUESTIONS = 4;

const QUESTIONS: {
  key: NumericKey;
  label: string;
  info: string;
  chips: { label: string; value: number; aria: string }[];
}[] = [
  {
    key: "sleep",
    label: "How much did you sleep last night?",
    info: "Sleep is the biggest driver of workout quality",
    chips: [
      { label: "< 5 hrs", value: 4, aria: "Sleep: less than 5 hours" },
      { label: "5-6 hrs", value: 5.5, aria: "Sleep: 5 to 6 hours" },
      { label: "7-8 hrs", value: 7.5, aria: "Sleep: 7 to 8 hours" },
      { label: "9+ hrs", value: 9.5, aria: "Sleep: 9 or more hours" },
    ],
  },
  {
    key: "energy",
    label: "How's your energy today?",
    info: "Your mental readiness - affected by stress, sleep, and mood",
    chips: [
      { label: "Exhausted", value: 2, aria: "Energy: exhausted" },
      { label: "Low", value: 4, aria: "Energy: low" },
      { label: "Good", value: 7, aria: "Energy: good" },
      { label: "Energised", value: 9, aria: "Energy: energised" },
    ],
  },
  {
    key: "soreness",
    label: "How does your body feel?",
    info: "How your muscles feel physically - distinct from mental energy",
    chips: [
      { label: "Stiff or achy", value: 9, aria: "Recovery: stiff or achy" },
      { label: "Sore", value: 6, aria: "Recovery: sore" },
      { label: "A little tight", value: 3, aria: "Recovery: a little tight" },
      { label: "Fresh", value: 1, aria: "Recovery: fresh" },
    ],
  },
  {
    key: "time",
    label: "How much time do you have?",
    info: "We'll fit the workout to your window",
    chips: [
      { label: "< 20 min", value: 15, aria: "Time: less than 20 minutes" },
      { label: "30 min", value: 30, aria: "Time: 30 minutes" },
      { label: "45 min", value: 45, aria: "Time: 45 minutes" },
      { label: "60+ min", value: 65, aria: "Time: 60 or more minutes" },
    ],
  },
];

function chipStyle(selected: boolean, animating: boolean): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 42,
    borderRadius: 21,
    padding: "0 10px",
    fontSize: 13,
    fontWeight: selected ? 600 : 500,
    background: selected ? "#C7F73D" : "rgba(255,255,255,0.08)",
    color: selected ? "#000" : "rgba(255,255,255,0.60)",
    border: selected ? "1px solid transparent" : "1px solid rgba(255,255,255,0.12)",
    boxShadow: selected ? "0 0 0 2px rgba(199,247,61,0.25)" : "none",
    cursor: "pointer",
    whiteSpace: "normal",
    lineHeight: 1.1,
    transition: "background 180ms ease-out, color 180ms ease-out, box-shadow 180ms ease-out, border-color 180ms ease-out, transform 160ms ease-out",
    animation: animating ? "chip-pop 200ms ease-out" : undefined,
  };
}

export function CheckInScreen({
  onBack,
  onReadinessComplete,
  initialReadiness,
}: {
  onBack: () => void;
  onReadinessComplete: (r: ReadinessSnapshot) => void;
  /** When returning from the intent screen, restore the four numeric answers. */
  initialReadiness?: ReadinessSnapshot | null;
}) {
  const [selections, setSelections] = useState<Selections>(() =>
    initialReadiness
      ? {
          sleep: initialReadiness.sleep,
          energy: initialReadiness.energy,
          soreness: initialReadiness.soreness,
          time: initialReadiness.time,
        }
      : {},
  );
  const [activeTooltip, setActiveTooltip] = useState<NumericKey | null>(null);
  const [chipAnim, setChipAnim] = useState<Record<string, boolean>>({});
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  const [customTime, setCustomTime] = useState<CustomTime>({ isCustom: false, duration: 30 });

  const answeredCount = Object.keys(selections).length;
  const allAnswered = answeredCount === TOTAL_QUESTIONS;

  const animateChip = (key: string) => {
    setChipAnim((a) => ({ ...a, [key]: true }));
    window.setTimeout(() => {
      setChipAnim((a) => {
        const next = { ...a };
        delete next[key];
        return next;
      });
    }, 210);
  };

  const selectNumeric = (key: NumericKey, value: number, label: string) => {
    setSelections((s) => ({ ...s, [key]: value }));
    if (activeTooltip === key) setActiveTooltip(null);
    animateChip(`${key}-${label}`);
  };

  const continueToIntent = () => {
    if (!allAnswered) return;
    onReadinessComplete({
      sleep: selections.sleep!,
      energy: selections.energy!,
      soreness: selections.soreness!,
      time: selections.time!,
    });
  };

  return (
    <div
      className="absolute inset-0 flex flex-col bg-background overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)", animation: "cin-enter 280ms ease-out both" }}
      onClick={() => setActiveTooltip(null)}
    >
      <div
        className="shrink-0 px-5"
        style={{
          paddingTop: "max(10px, env(safe-area-inset-top))",
          paddingBottom: 12,
        }}
      >
        <div className="grid grid-cols-[40px_1fr_40px] items-start gap-1">
          <button
            onClick={onBack}
            aria-label="Go back"
            className="size-9 flex items-center justify-center text-foreground/50 hover:text-foreground transition-colors shrink-0"
            style={{ marginTop: 2 }}
          >
            <ArrowLeft size={22} strokeWidth={2} />
          </button>
          <div className="flex flex-col items-center text-center min-w-0 pt-0.5">
            <h1
              style={{
                fontSize: 23,
                fontWeight: 700,
                letterSpacing: "-0.45px",
                lineHeight: 1.18,
                color: "hsl(var(--foreground))",
              }}
            >
              How are you feeling today?
            </h1>
            <p
              style={{
                marginTop: 10,
                maxWidth: 280,
                marginLeft: "auto",
                marginRight: "auto",
                fontSize: 13,
                fontWeight: 400,
                lineHeight: 1.45,
                color: "hsl(var(--foreground)/0.48)",
              }}
            >
              A few honest taps. Pivot builds around your reality.
            </p>
          </div>
          <div aria-hidden style={{ width: 40 }} />
        </div>
      </div>

      <div className="flex-1 flex flex-col px-5 overflow-hidden" style={{ gap: 10, paddingTop: 6 }}>
        {QUESTIONS.map((q, i) => (
          <QuestionModule
            key={q.key}
            index={i}
            label={q.label}
            info={q.info}
            tooltipOpen={activeTooltip === q.key}
            onToggleInfo={(e) => {
              e.stopPropagation();
              setActiveTooltip((t) => (t === q.key ? null : q.key));
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {q.chips.map((chip) => {
                const selected = selections[q.key] === chip.value;
                return (
                  <button
                    key={chip.label}
                    type="button"
                    aria-pressed={selected}
                    aria-label={chip.aria}
                    className="pivot-checkin-chip"
                    onClick={(e) => {
                      e.stopPropagation();
                      selectNumeric(q.key, chip.value, chip.label);
                      setCustomTime({ isCustom: false, duration: chip.value });
                    }}
                    style={chipStyle(selected, !!chipAnim[`${q.key}-${chip.label}`])}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>
            {q.key === "time" && (
              <button
                type="button"
                aria-pressed={customTime.isCustom}
                aria-label="Custom duration"
                className="pivot-checkin-chip"
                onClick={(e) => {
                  e.stopPropagation();
                  setCustomTimeOpen(true);
                }}
                style={{ ...chipStyle(customTime.isCustom, !!chipAnim["time-custom"]), marginTop: 12 }}
              >
                Custom ({customTime.isCustom ? `${customTime.duration} min` : "Set"})
              </button>
            )}
          </QuestionModule>
        ))}
      </div>

      <div className="px-4 shrink-0" style={{ paddingTop: 10, paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
        <button
          type="button"
          onClick={continueToIntent}
          disabled={!allAnswered}
          aria-live="polite"
          className="relative w-full flex items-center justify-center font-bold active:scale-[0.97]"
          style={{
            height: 52,
            borderRadius: 26,
            fontSize: 15,
            background: allAnswered ? "#C7F73D" : answeredCount === 0 ? "rgba(199,247,61,0.25)" : "rgba(199,247,61,0.40)",
            color: allAnswered ? "#000" : answeredCount === 0 ? "rgba(0,0,0,0.40)" : "rgba(0,0,0,0.60)",
            border: "none",
            cursor: allAnswered ? "pointer" : "default",
            transition: "background 200ms ease-out, color 200ms ease-out, transform 160ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {allAnswered ? "Continue" : answeredCount === 0 ? "Answer all 4 to continue" : `${answeredCount} of 4 answered`}
          {allAnswered && <ArrowRight size={18} style={{ position: "absolute", right: 16 }} />}
        </button>
      </div>

      {customTimeOpen && (
        <CustomTimeModal
          isOpen={customTimeOpen}
          duration={customTime.duration}
          onClose={() => setCustomTimeOpen(false)}
          onSubmit={(duration) => {
            setCustomTime({ isCustom: true, duration });
            setSelections((s) => ({ ...s, time: duration }));
            setCustomTimeOpen(false);
            animateChip("time-custom");
          }}
        />
      )}

      <style>{`
        .pivot-checkin-chip:active { transform: scale(0.96); transition: transform 120ms ease-out !important; }
        @keyframes cin-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cin-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cin-tooltip { from { opacity: 0; transform: translateY(-3px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes chip-pop { 0% { transform: scale(1); } 50% { transform: scale(1.02); } 100% { transform: scale(1); } }
      `}</style>
    </div>
  );
}

function CustomTimeModal({
  isOpen,
  duration,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  duration: number;
  onClose: () => void;
  onSubmit: (duration: number) => void;
}) {
  const [inputValue, setInputValue] = useState(duration);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[430px] bg-card border-t border-border sm:border sm:rounded-3xl rounded-t-3xl p-6 pb-8 shadow-elevated">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-tertiary font-semibold">Time</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight">How many minutes?</h2>
          </div>
          <button onClick={onClose} className="size-9 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="time-input" className="text-sm font-medium">
                Duration
              </label>
              <span className="text-lg font-bold text-primary">{inputValue} min</span>
            </div>
            <input
              id="time-input"
              type="range"
              min="10"
              max="90"
              value={inputValue}
              onChange={(e) => setInputValue(Number(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              style={{
                background: `linear-gradient(to right, #C7F73D 0%, #C7F73D ${((inputValue - 10) / 80) * 100}%, rgba(255,255,255,0.08) ${((inputValue - 10) / 80) * 100}%, rgba(255,255,255,0.08) 100%)`,
              }}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>10 min</span>
              <span>90 min</span>
            </div>
          </div>

          <div className="relative">
            <input
              type="number"
              value={inputValue}
              onChange={(e) => {
                const val = Math.min(90, Math.max(10, Number(e.target.value) || 0));
                setInputValue(val);
              }}
              min="10"
              max="90"
              className="w-full bg-elevated border border-border rounded-lg px-4 py-3 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-primary/40"
              placeholder="Enter duration"
            />
          </div>

          <button
            onClick={() => onSubmit(inputValue)}
            className="w-full bg-primary text-primary-foreground rounded-full py-3 font-semibold text-sm active:scale-[0.99] transition-transform"
            style={{ color: "#000" }}
          >
            Set Duration
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionModule({
  index,
  label,
  info,
  tooltipOpen,
  onToggleInfo,
  children,
}: {
  index: number;
  label: string;
  info: string;
  tooltipOpen: boolean;
  onToggleInfo: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0" style={{ animation: `cin-rise 280ms ${index * 50}ms ease-out both` }}>
      <div className="flex items-center mb-1.5" style={{ gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: "hsl(var(--foreground)/0.82)", lineHeight: 1.2 }}>
          {label}
        </span>
        <button
          type="button"
          onClick={onToggleInfo}
          aria-label={`More info about ${label}`}
          className="shrink-0 flex items-center justify-center"
          style={{ width: 18, height: 18 }}
        >
          <Info size={14} strokeWidth={1.8} style={{ color: "rgba(255,255,255,0.4)" }} />
        </button>
      </div>
      {tooltipOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mb-2 rounded-xl px-3 py-2"
          style={{
            background: "hsl(var(--surface-elevated))",
            border: "1px solid hsl(var(--foreground)/0.08)",
            fontSize: 12,
            lineHeight: 1.4,
            color: "hsl(var(--foreground)/0.70)",
            maxWidth: 240,
            animation: "cin-tooltip 150ms ease-out both",
          }}
        >
          {info}
        </div>
      )}
      {children}
    </div>
  );
}
