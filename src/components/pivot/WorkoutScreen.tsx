import { useState } from "react";
import { ArrowLeft, Check, Clock, MoreHorizontal, RefreshCw, Loader } from "lucide-react";
import { useApp, PriorPivot } from "@/context/AppContext";
import { Exercise } from "@/lib/mockData";
import { PivotModal } from "./PivotModal";
import { ExerciseImage } from "./ExerciseImage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  exercisePrimaryMatchesIntentPhrase,
  intentPhraseForExerciseSignal,
  parseWorkoutFocusHeader,
} from "@/lib/focusDisplay";

export function WorkoutScreen({
  onBack,
  onComplete,
  mode = "active",
}: {
  onBack: () => void;
  onComplete: () => void;
  mode?: "preview" | "active";
}) {
  const {
    todayWorkout,
    pivotExercise,
    swapExercise,
    exerciseStatusById,
    setExerciseStatus,
    lastCheckIn,
  } = useApp();

  const [pivotTarget, setPivotTarget] = useState<Exercise | null>(null);
  const [priorPivots, setPriorPivots] = useState<PriorPivot[]>([]);
  const [finishing, setFinishing] = useState(false);
  const [pivotLoading, setPivotLoading] = useState(false);
  const [optionsOpenId, setOptionsOpenId] = useState<string | null>(null);
  const [undoPromptId, setUndoPromptId] = useState<string | null>(null);

  if (!todayWorkout) {
    return (
      <div className="flex-1 flex flex-col px-5 pt-6 pb-6 animate-fade-in">
        <button
          onClick={onBack}
          className="size-10 -ml-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
          <p className="text-base font-medium text-foreground/70">
            Something went wrong loading your workout.
          </p>
          <button
            onClick={onBack}
            className="mt-6 rounded-full border border-border px-6 py-3 text-sm font-semibold hover:bg-elevated transition-colors"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const exercises = todayWorkout.exercises;
  const totalCount = todayWorkout.originalExerciseCount ?? exercises.length;
  const focusHeader = parseWorkoutFocusHeader(todayWorkout.focus);
  const intentSignalTail = intentPhraseForExerciseSignal(focusHeader.hint);

  const currentIds = new Set(exercises.map((e) => e.id));
  const doneCount = Object.entries(exerciseStatusById).filter(([id, st]) => currentIds.has(id) && st === "completed").length;
  const partialCount = Object.entries(exerciseStatusById).filter(([id, st]) => currentIds.has(id) && st === "partial").length;
  const skippedCount = Object.entries(exerciseStatusById).filter(([id, st]) => currentIds.has(id) && st === "skipped").length;

  const effectiveDone = doneCount + partialCount;
  const threshold50 = Math.max(1, Math.ceil(totalCount * 0.5));
  const canComplete = effectiveDone >= threshold50 && totalCount > 0;
  const allSettled = exercises.every(
    (e) => exerciseStatusById[e.id] && exerciseStatusById[e.id] !== "pending"
  );
  const progress = exercises.length > 0 ? Math.min(effectiveDone / exercises.length, 1) : 0;
  const displayExNum = Math.min(effectiveDone + 1, totalCount);

  const handlePivot = async (constraint: string) => {
    if (!pivotTarget) return;
    const target = pivotTarget;
    setPivotLoading(true);
    try {
      const alt = await swapExercise(target.id, constraint, priorPivots);
      pivotExercise(target.id, alt);
      setPriorPivots((prev) => [
        ...prev,
        { original: target.name, replacement: alt.name, constraint },
      ]);
      setTimeout(() => {
        setPivotTarget(null);
        setOptionsOpenId(null);
        toast(`Swapped to ${alt.name}`, { description: alt.rationale });
      }, 300);
    } catch {
      setPivotTarget(null);
      setOptionsOpenId(null);
      toast.error("Couldn't swap that exercise. Try again.");
    } finally {
      setPivotLoading(false);
    }
  };

  const handleDone = (id: string) => {
    setExerciseStatus(id, "completed");
    setOptionsOpenId(null);
  };

  const handlePartial = (id: string) => {
    setExerciseStatus(id, "partial");
    setOptionsOpenId(null);
  };

  const handleSkip = (id: string) => {
    setExerciseStatus(id, "skipped");
    setOptionsOpenId(null);
  };

  const handleUndoDone = (id: string) => {
    setUndoPromptId(id);
  };

  const confirmUndo = (id: string) => {
    setExerciseStatus(id, "pending");
    setUndoPromptId(null);
  };

  const handleMarkComplete = () => {
    if (!canComplete || finishing) return;
    setFinishing(true);
    setTimeout(() => onComplete(), 700);
  };

  const isPreview = mode === "preview";

  return (
    <div
      className="flex-1 flex flex-col animate-fade-in"
      style={{ overflow: "hidden" }}
      onClick={() => setOptionsOpenId(null)}
    >
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-xl border-b border-[hsl(var(--foreground)/0.06)]">
        <div className="flex items-center px-5 h-14">
          <button
            onClick={onBack}
            className="size-10 -ml-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 ml-1 min-w-0">
            <p className="text-[15px] font-semibold leading-tight truncate">
              {isPreview ? "Today's Workout" : focusHeader.main}
            </p>
            {!isPreview && focusHeader.hint && (
              <p className="text-[11px] text-foreground/44 leading-snug truncate mt-0.5">{focusHeader.hint}</p>
            )}
            {!isPreview && (
              <p className={`text-[12px] text-foreground/50 ${focusHeader.hint ? "mt-0.5" : ""}`}>
                Exercise {displayExNum} of {totalCount}
              </p>
            )}
          </div>
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground tabular">
            <Clock size={13} /> {todayWorkout.duration} min
          </span>
        </div>

        {!isPreview && (
          <div style={{ height: 3, background: "hsl(var(--foreground)/0.08)", position: "relative", overflow: "hidden" }}>
            <div
              style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${progress * 100}%`,
                background: "#C7F73D",
                transition: "width 400ms ease-out",
              }}
            />
          </div>
        )}
      </div>

      {/* Exercise list */}
      <div
        className="flex-1 px-5 pt-4 pb-6"
        style={{ overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
      >
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {exercises.map((ex, i) => {
            const st = exerciseStatusById[ex.id] ?? "pending";
            const isDone = st === "completed";
            const isSkipped = st === "skipped";
            const isPartial = st === "partial";
            const isInactive = isDone || isSkipped || isPartial;
            const isMenuOpen = optionsOpenId === ex.id;
            const isUndoOpen = undoPromptId === ex.id;
            const showIntentSignal =
              !isPreview &&
              !!intentSignalTail &&
              exercisePrimaryMatchesIntentPhrase(intentSignalTail, ex.primaryMuscle);

            return (
              <li
                key={ex.id + (ex.pivoted ? "-p" : "")}
                style={{
                  borderRadius: 18,
                  padding: 14,
                  border: isDone
                    ? "1px solid rgba(255,255,255,0.04)"
                    : isSkipped || isPartial
                    ? "1px solid rgba(255,255,255,0.04)"
                    : "1px solid hsl(var(--border))",
                  background: isDone
                    ? "rgba(255,255,255,0.02)"
                    : isSkipped || isPartial
                    ? "rgba(255,255,255,0.01)"
                    : "hsl(var(--card))",
                  opacity: isDone ? 0.45 : isSkipped ? 0.28 : isPartial ? 0.55 : 1,
                  borderLeft: isDone
                    ? "3px solid rgba(199,247,61,0.30)"
                    : isPartial
                    ? "3px solid rgba(199,247,61,0.15)"
                    : showIntentSignal && !isInactive
                    ? "3px solid rgba(199,247,61,0.20)"
                    : undefined,
                  transition: "opacity 300ms ease-out, background 300ms ease-out",
                  animation: `workout-rise 300ms ${i * 55}ms ease-out both`,
                  ...(ex.pivoted && !isInactive ? { boxShadow: "0 0 0 1px rgba(199,247,61,0.25)" } : {}),
                }}
              >
                {/* Main row */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <ExerciseImage name={ex.name} size={52} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <h3
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          lineHeight: 1.2,
                          color: "hsl(var(--foreground))",
                          textDecoration: isInactive ? "line-through" : "none",
                          textDecorationColor: "rgba(255,255,255,0.30)",
                        }}
                      >
                        {ex.name}
                      </h3>
                      {ex.pivoted && !isInactive && (
                        <span
                          style={{
                            fontSize: 9, fontWeight: 800, letterSpacing: "0.8px",
                            textTransform: "uppercase",
                            color: "#C7F73D",
                            background: "rgba(199,247,61,0.15)",
                            border: "1px solid rgba(199,247,61,0.40)",
                            borderRadius: 5,
                            padding: "2px 5px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          PIVOTED{ex.pivotConstraint ? ` · ${ex.pivotConstraint.slice(0, 15)}` : ""}
                        </span>
                      )}
                      {isDone && (
                        <Check size={13} strokeWidth={2.5} style={{ color: "#C7F73D", opacity: 0.7 }} />
                      )}
                      {isSkipped && (
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                          Skipped
                        </span>
                      )}
                      {isPartial && !isDone && (
                        <span style={{ fontSize: 9, color: "rgba(251,146,60,0.85)", fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase" }}>
                          Partial
                        </span>
                      )}
                    </div>
                    {ex.pivoted && ex.pivotRationale && (
                      <p style={{ marginTop: 3, marginBottom: 1, fontSize: 11, color: "rgba(255,255,255,0.50)", lineHeight: 1.5, fontStyle: "italic" }}>
                        ↩ {ex.pivotRationale}
                      </p>
                    )}
                    <p style={{ marginTop: 2, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
                      {ex.setsReps}
                    </p>
                    {ex.cue && !isInactive && (
                      <p style={{ marginTop: 4, fontSize: 12, fontStyle: "italic", color: "hsl(var(--foreground)/0.45)", lineHeight: 1.4 }}>
                        {ex.cue}
                      </p>
                    )}
                  </div>

                  {/* Right-side action */}
                  {!isPreview && (
                    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                      {!isInactive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOptionsOpenId(null);
                            setPivotTarget(ex);
                          }}
                          disabled={pivotLoading}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "8px 12px",
                            borderRadius: 999,
                            border: "1px solid rgba(199,247,61,0.25)",
                            background: pivotLoading ? "rgba(199,247,61,0.12)" : "rgba(199,247,61,0.08)",
                            color: pivotLoading ? "rgba(199,247,61,0.50)" : "#C7F73D",
                            fontSize: 12,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            cursor: pivotLoading ? "not-allowed" : "pointer",
                            opacity: pivotLoading ? 0.6 : 1,
                            transition: "all 200ms ease-out",
                          }}
                        >
                          {pivotLoading ? (
                            <>
                              <Loader size={14} strokeWidth={2.2} className="animate-spin" />
                              Pivoting...
                            </>
                          ) : (
                            <>
                              <RefreshCw size={14} strokeWidth={2.2} />
                              Pivot
                            </>
                          )}
                        </button>
                      )}

                      {isDone ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleUndoDone(ex.id); }}
                          title="Tap to undo"
                          style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "rgba(199,247,61,0.15)", border: "none",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <Check size={16} strokeWidth={2.5} style={{ color: "#C7F73D" }} />
                        </button>
                      ) : isSkipped || isPartial ? null : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setUndoPromptId(null);
                            setOptionsOpenId(isMenuOpen ? null : ex.id);
                          }}
                          style={{
                            width: 32, height: 32, borderRadius: "50%",
                            background: "hsl(var(--secondary))",
                            border: "1px solid hsl(var(--border))",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: "pointer",
                          }}
                        >
                          <MoreHorizontal size={16} style={{ color: "hsl(var(--foreground)/0.60)" }} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Options menu */}
                {isMenuOpen && !isPreview && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: 10,
                      borderRadius: 12,
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      overflow: "hidden",
                      animation: "menu-drop 150ms ease-out both",
                    }}
                  >
                    {[
                      { label: "Done", sub: "Completed all sets", action: () => handleDone(ex.id), accent: false },
                      { label: "Partial", sub: "Got some sets in", action: () => handlePartial(ex.id), accent: false },
                      { label: "Skip", sub: "Skip this exercise", action: () => handleSkip(ex.id), accent: false },
                    ].map((item, idx, arr) => (
                      <button
                        key={item.label}
                        onClick={item.action}
                        style={{
                          width: "100%",
                          display: "flex", flexDirection: "column",
                          padding: "10px 14px",
                          background: "transparent", border: "none",
                          borderBottom: idx < arr.length - 1 ? "1px solid hsl(var(--border))" : "none",
                          textAlign: "left", cursor: "pointer",
                        }}
                      >
                        <span style={{ fontSize: 14, fontWeight: 600, color: item.accent ? "#C7F73D" : "hsl(var(--foreground))" }}>
                          {item.label}
                        </span>
                        <span style={{ fontSize: 11, color: "hsl(var(--foreground)/0.45)", marginTop: 1 }}>
                          {item.sub}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Undo prompt */}
                {isUndoOpen && !isPreview && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: 10,
                      borderRadius: 12,
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      padding: "10px 14px",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      animation: "menu-drop 150ms ease-out both",
                    }}
                  >
                    <span style={{ fontSize: 13, color: "hsl(var(--foreground)/0.70)" }}>
                      Undo completion?
                    </span>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => confirmUndo(ex.id)}
                        style={{
                          fontSize: 13, fontWeight: 700, color: "#C7F73D",
                          background: "transparent", border: "none",
                          cursor: "pointer", padding: "2px 10px",
                        }}
                      >
                        Undo
                      </button>
                      <button
                        onClick={() => setUndoPromptId(null)}
                        style={{
                          fontSize: 13, fontWeight: 600, color: "hsl(var(--foreground)/0.45)",
                          background: "transparent", border: "none",
                          cursor: "pointer", padding: "2px 10px",
                        }}
                      >
                        Keep
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bottom CTA */}
      <div
        style={{
          padding: "12px 20px",
          paddingBottom: "max(16px, env(safe-area-inset-bottom))",
          borderTop: "1px solid hsl(var(--foreground)/0.06)",
          background: "hsl(var(--background))",
          flexShrink: 0,
        }}
      >
        {!isPreview && (
          <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.50)", marginBottom: 10 }}>
            {allSettled
              ? "All exercises accounted for!"
              : canComplete
              ? `${effectiveDone} of ${totalCount} done — ready to finish`
              : `${effectiveDone} of ${totalCount} exercises done`}
          </p>
        )}

        {isPreview ? (
          <button
            onClick={onComplete}
            style={{
              width: "100%", height: 52, borderRadius: 26,
              background: "#C7F73D", border: "none",
              fontSize: 15, fontWeight: 700, color: "#000",
              cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            Start Workout →
          </button>
        ) : (
          <button
            onClick={handleMarkComplete}
            disabled={!canComplete || finishing}
            className={cn(
              "w-full h-[52px] rounded-full font-bold text-base flex items-center justify-center gap-2 transition-colors",
              finishing ? "bg-success text-primary-foreground animate-btn-success"
                : allSettled ? "bg-primary text-primary-foreground"
                : canComplete ? "bg-primary/75 text-primary-foreground"
                : "cursor-default"
            )}
            style={!canComplete && !finishing ? { background: "rgba(199,247,61,0.20)", color: "rgba(0,0,0,0.40)" } : undefined}
          >
            {finishing ? (
              <><Check size={18} strokeWidth={3} /> Logged</>
            ) : (
              "Mark Workout Complete"
            )}
          </button>
        )}
      </div>

      <style>{`
        @keyframes workout-rise {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes menu-drop {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <PivotModal
        open={!!pivotTarget}
        exerciseName={pivotTarget?.name ?? ""}
        onClose={() => setPivotTarget(null)}
        onSubmit={handlePivot}
        lastCheckIn={lastCheckIn}
        workoutDuration={Math.round(progress * (todayWorkout?.duration ?? 45))}
        totalDuration={todayWorkout?.duration ?? 45}
      />
    </div>
  );
}
