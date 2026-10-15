import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useApp } from "@/context/AppContext";
import type { CheckIn } from "@/context/AppContext";
import { baseStructureFromFocusLabel } from "@/lib/focusDisplay";

function getGreeting(hour: number, name: string): string {
  const salutation =
    hour >= 5 && hour < 12
      ? "Good morning"
      : hour >= 12 && hour < 17
      ? "Good afternoon"
      : hour >= 17 && hour < 22
      ? "Good evening"
      : "Good night";
  return name ? `${salutation}, ${name}` : salutation;
}

function getCelebration(count: number): string {
  if (count <= 1) return "First one down.";
  if (count <= 3) return "Building the habit.";
  if (count <= 6) return "Consistency is compound interest.";
  return "You're the algorithm now.";
}

function getActiveWorkoutHeadline(exercisesCompleted: number, totalExercises: number): string {
  if (totalExercises === 0) return "Resume your session";
  const progressPercent = Math.round((exercisesCompleted / totalExercises) * 100);
  if (progressPercent < 25) return "Keep the momentum";
  if (progressPercent < 50) return "Halfway there";
  if (progressPercent < 75) return "Almost done";
  return "Finish strong";
}

function getRecovery(focus: string): string {
  const f = focus.toLowerCase();
  if (f.includes("leg") || f.includes("quad") || f.includes("hamstring") || f.includes("glute") || f.includes("calf") || f.includes("conditioning")) {
    return "High-protein recovery. Elevate legs if sore.";
  }
  if (f.includes("push") || f.includes("chest") || f.includes("shoulder") || f.includes("tricep")) {
    return "Stretch your chest. Sleep repairs what you built.";
  }
  if (f.includes("pull") || f.includes("back") || f.includes("bicep") || f.includes("rear delt")) {
    return "Foam roll the lats. Sleep repairs what you built.";
  }
  return "Rest well. Next session builds on this one.";
}

function getReadinessLabel(c: CheckIn | null): string {
  if (!c) return "Assessed";
  const score = (c.sleep >= 7 ? 2 : c.sleep >= 6 ? 1 : 0) +
                (c.energy >= 7 ? 2 : c.energy >= 5 ? 1 : 0);
  if (score >= 4) return "High";
  if (score >= 2) return "Good";
  return "Low";
}

function getIntensityLabel(duration: number, c: CheckIn | null): string {
  if (c && (c.sleep < 6 || c.energy <= 4)) {
    return duration >= 40 ? "Moderate" : "Light";
  }
  if (duration >= 50) return "High";
  if (duration >= 35) return "Moderate";
  return "Light";
}

export function HomeScreen({
  onStartCheckIn,
  onStartWorkout,
  onContinueWorkout,
  onViewWorkout,
}: {
  onStartCheckIn: () => void;
  onStartWorkout: () => void;
  onContinueWorkout: () => void;
  onViewWorkout: () => void;
}) {
  const {
    isReturning,
    setTab,
    userProfile,
    workoutState,
    todayWorkout,
    completedWorkoutsCount,
    exerciseStatusById,
    lastCheckIn,
    sessionQualityHistory,
  } = useApp();

  const rawName = userProfile?.name?.trim() || "";
  const displayName = rawName
    ? rawName.charAt(0).toUpperCase() + rawName.slice(1)
    : "";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [greeting, setGreeting] = useState(() =>
    getGreeting(new Date().getHours(), displayName)
  );

  useEffect(() => {
    const refresh = () => setGreeting(getGreeting(new Date().getHours(), displayName));
    window.addEventListener("pivot:checkin-updated", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("pivot:checkin-updated", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(interval);
    };
  }, [displayName]);

  const isNoWorkout = workoutState === "NO_WORKOUT";
  const isGenerated = workoutState === "WORKOUT_GENERATED";
  const isStarted = workoutState === "WORKOUT_STARTED";
  const isCompleted = workoutState === "WORKOUT_COMPLETED";

  // Calculate exercise progress early for active workout headline
  const exercisesCompleted = todayWorkout
    ? Object.entries(exerciseStatusById).filter(([id, st]) =>
        st === "completed" && todayWorkout.exercises.some((e) => e.id === id)
      ).length
    : 0;
  const totalExercises = todayWorkout?.exercises.length ?? 0;

  const eyebrow = isNoWorkout
    ? isReturning ? "WELCOME BACK" : "Ready? 💪"
    : isStarted ? "IN PROGRESS 💪"
    : null;

  const pulseDot = isNoWorkout && !isReturning;

  const headline = isNoWorkout
    ? isReturning ? "Let's ease back in" : "Check-in"
    : isGenerated ? "Your workout is ready"
    : isStarted ? getActiveWorkoutHeadline(exercisesCompleted, totalExercises)
    : getCelebration(completedWorkoutsCount);

  const subtext = isNoWorkout
    ? isReturning
      ? "We'll deload your first sessions to protect your progress."
      : "15 seconds. 4 questions."
    : isGenerated
    ? todayWorkout
      ? `${todayWorkout.focus} · ${todayWorkout.duration} min`
      : "Today's workout is ready."
    : isStarted
    ? "Keep going. You're in it."
    : "Rest well. See you tomorrow. 🌙";

  // Chips — use real workout data + lastCheckIn
  const indicators = todayWorkout && isGenerated ? [
    { label: "Readiness", value: getReadinessLabel(lastCheckIn) },
    { label: "Intensity", value: getIntensityLabel(todayWorkout.duration, lastCheckIn) },
    { label: "Focus", value: baseStructureFromFocusLabel(todayWorkout.focus) },
    { label: "Duration", value: `${todayWorkout.duration} min` },
  ] : [];

  const adaptiveSummary = isGenerated ? todayWorkout?.reasoning?.summary ?? "" : "";
  const adaptiveReasons = isGenerated ? (todayWorkout?.reasoning?.adaptations ?? []).slice(0, 2) : [];
  const durationReasoning = isGenerated ? todayWorkout?.durationReasoning : "";
  const lastQuality = sessionQualityHistory[0];

  // Post-workout stats
  const sessionPivots = todayWorkout
    ? todayWorkout.exercises.filter((e) => e.pivoted).length
    : 0;

  return (
    <div className="flex-1 flex flex-col px-4 pt-12 pb-6 animate-fade-in">
      <header className="mb-6 px-1">
        <p className="text-sm text-tertiary uppercase tracking-[0.18em] font-medium">{today}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{greeting}.</h1>
      </header>

      {/* Primary action card */}
      <section
        className="relative overflow-hidden bg-elevated border border-[hsl(var(--foreground)/0.06)] rounded-[20px] p-6 mb-4 text-center"
        style={{
          minHeight: 220,
          animation: isGenerated ? "home-card-enter 300ms ease-out both" : undefined,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 rounded-full"
          style={{
            background:
              "radial-gradient(circle at center, hsl(75 90% 60% / 0.28) 0%, hsl(75 90% 60% / 0.12) 35%, transparent 70%)",
            filter: "blur(8px)",
          }}
        />

        {eyebrow && (
          <div className="relative flex items-center justify-center gap-1.5 mb-3">
            <span
              className={`inline-block size-1.5 rounded-full bg-primary ${pulseDot ? "animate-[pivot-dot_600ms_ease-out_1]" : ""}`}
            />
            <span className="text-[12px] font-bold tracking-[1px] text-primary">
              {eyebrow}
            </span>
          </div>
        )}

        <h2 className={`relative text-[28px] font-bold leading-[1.15] text-foreground ${eyebrow ? "" : "mt-2"}`}>
          {headline}
        </h2>

        <p
          className="relative mt-2 text-sm font-normal leading-[1.5] text-foreground/60"
          style={isGenerated ? { animation: "home-rise 300ms 150ms ease-out both" } : undefined}
        >
          {subtext}
        </p>

        {/* Adaptive transparency — WORKOUT_GENERATED only */}
        {isGenerated && adaptiveSummary && (
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "rgba(255,255,255,0.55)",
              lineHeight: 1.4,
              animation: "home-rise 300ms 200ms ease-out both",
            }}
          >
            {adaptiveSummary}
          </p>
        )}

        {/* CTA area */}
        <div className="relative mt-5">
          {isCompleted ? (
            <button
              onClick={onViewWorkout}
              className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:opacity-80 transition-opacity"
            >
              View today's workout
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>
          ) : isGenerated ? (
            <button
              onClick={onStartWorkout}
              aria-label="Start your workout"
              className="relative w-full h-[52px] rounded-full bg-primary font-bold text-base flex items-center justify-center transition-transform duration-150 ease-out active:scale-[0.97]"
              style={{
                color: "#000",
                animation: "home-cta-pulse 600ms ease-out 500ms 1 both",
              }}
            >
              <span>Start Workout</span>
              <ArrowRight
                size={18}
                strokeWidth={2.5}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                color="#000"
              />
            </button>
          ) : isStarted ? (
            <button
              onClick={onContinueWorkout}
              aria-label="Continue your workout"
              className="relative w-full h-[52px] rounded-full bg-primary font-bold text-base flex items-center justify-center transition-transform duration-150 ease-out active:scale-[0.97]"
              style={{ color: "#000" }}
            >
              <span>Continue Workout</span>
              <ArrowRight
                size={18}
                strokeWidth={2.5}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                color="#000"
              />
            </button>
          ) : (
            <button
              onClick={onStartCheckIn}
              aria-label="Start your daily check-in"
              className="relative w-full h-[52px] rounded-full bg-primary font-bold text-base flex items-center justify-center transition-transform duration-150 ease-out active:scale-[0.97]"
              style={{ color: "#000" }}
            >
              <span>Let's go</span>
              <ArrowRight
                size={18}
                strokeWidth={2.5}
                className="absolute right-4 top-1/2 -translate-y-1/2"
                color="#000"
              />
            </button>
          )}

          {isGenerated && durationReasoning && (
            <p
              style={{
                marginTop: 10,
                fontSize: 11,
                color: "rgba(255,255,255,0.45)",
                lineHeight: 1.4,
                animation: "home-rise 300ms 550ms ease-out both",
              }}
            >
              {durationReasoning}
            </p>
          )}

          {isGenerated && adaptiveReasons.length > 0 && (
            <div style={{ marginTop: 10, animation: "home-rise 300ms 600ms ease-out both" }}>
              {adaptiveReasons.map((reason) => (
                <p key={reason} style={{ fontSize: 11, color: "rgba(255,255,255,0.42)", lineHeight: 1.4 }}>
                  {reason}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Micro-indicator chips — WORKOUT_GENERATED */}
      {isGenerated && indicators.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {indicators.map((ind, i) => (
            <div
              key={ind.label}
              style={{
                borderRadius: 14,
                padding: "10px 6px",
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                textAlign: "center",
                animation: `home-rise 300ms ${100 + i * 80}ms ease-out both`,
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 700, color: "hsl(var(--foreground))", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {ind.value}
              </p>
              <p style={{ marginTop: 2, fontSize: 10, color: "hsl(var(--foreground)/0.40)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
                {ind.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Post-workout stats — WORKOUT_COMPLETED */}
      {isCompleted && todayWorkout && (
        <>
          <div
            className="grid grid-cols-3 gap-2 mb-3"
            style={{ animation: "home-rise 300ms 60ms ease-out both" }}
          >
            <div style={{ borderRadius: 14, padding: "12px 10px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: "hsl(var(--foreground))", lineHeight: 1 }}>
                {exercisesCompleted > 0 ? exercisesCompleted : todayWorkout.exercises.length}
              </p>
              <p style={{ marginTop: 3, fontSize: 10, color: "hsl(var(--foreground)/0.40)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
                Completed
              </p>
            </div>
            <div style={{ borderRadius: 14, padding: "12px 10px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: "hsl(var(--foreground))", lineHeight: 1 }}>
                {todayWorkout.duration}
              </p>
              <p style={{ marginTop: 3, fontSize: 10, color: "hsl(var(--foreground)/0.40)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
                Min
              </p>
            </div>
            <div style={{ borderRadius: 14, padding: "12px 10px", background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", textAlign: "center" }}>
              <p style={{ fontSize: 20, fontWeight: 800, color: "hsl(var(--foreground))", lineHeight: 1 }}>
                {sessionPivots > 0 ? sessionPivots : "—"}
              </p>
              <p style={{ marginTop: 3, fontSize: 10, color: "hsl(var(--foreground)/0.40)", textTransform: "uppercase", letterSpacing: "0.6px", fontWeight: 600 }}>
                {sessionPivots === 1 ? "Pivot" : "Pivots"}
              </p>
            </div>
          </div>

          <p
            style={{ textAlign: "center", fontSize: 13, color: "hsl(var(--foreground)/0.50)", fontStyle: "italic", animation: "home-rise 300ms 100ms ease-out both" }}
          >
            {getRecovery(baseStructureFromFocusLabel(todayWorkout.focus))}
          </p>
          {lastQuality && (
            <p
              style={{ textAlign: "center", fontSize: 11, color: "hsl(var(--foreground)/0.45)", marginTop: 6, animation: "home-rise 300ms 105ms ease-out both" }}
            >
              Session quality {Math.round(lastQuality.quality * 100)}% · compliance {Math.round(lastQuality.compliance * 100)}%
            </p>
          )}


        </>
      )}

      <style>{`
        @keyframes pivot-dot {
          0%   { transform: scale(1);   opacity: 1; }
          50%  { transform: scale(1.3); opacity: 0.6; }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes home-card-enter {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes home-rise {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes home-cta-pulse {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.03); }
          100% { transform: scale(1); }
        }
      `}</style>

      <div className="mt-auto pt-8" />
    </div>
  );
}
