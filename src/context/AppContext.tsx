import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { Workout } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";

export type Tab = "home" | "insights" | "profile";
export type Theme = "light" | "dark";
export type WorkoutState =
  | "NO_WORKOUT"
  | "WORKOUT_GENERATED"
  | "WORKOUT_STARTED"
  | "WORKOUT_COMPLETED";

export type CheckIn = {
  sleep: number;
  energy: number;
  soreness: number;
  time: number;
  focus?: string;
  /** Optional muscle emphasis ids (e.g. chest, rear-delts) layered on top of `focus`. */
  focusEmphasis?: string[];
  note?: string;
};

export type UserProfile = {
  name: string;
  email: string;
  createdAt?: string;
};

export type PriorPivot = {
  original: string;
  replacement: string;
  constraint: string;
};

type PivotHistoryEntry = {
  exerciseId: string;
  originalName: string;
  newName: string;
  constraint: string;
  rationale: string;
  timestamp: string;
};

type Replacement = {
  name: string;
  setsReps: string;
  cue?: string;
  rationale: string;
  constraint?: string;
  reasoning?: {
    summary?: string;
    selection?: string[];
    constraints?: string[];
    adaptations?: string[];
  };
};

export type ExerciseStatus = "pending" | "completed" | "skipped" | "partial";

type SessionQualityRecord = {
  at: string;
  focus: string;
  duration: number;
  completed: number;
  partial: number;
  skipped: number;
  pivots: number;
  compliance: number;
  quality: number;
};

type AdaptiveMemory = {
  favoritePatterns: Record<string, number>;
  skippedPatterns: Record<string, number>;
  failedCompletionPatterns: Record<string, number>;
  recurringPivotReasons: Record<string, number>;
  recurringPainConstraints: Record<string, number>;
};

type AppState = {
  tab: Tab;
  setTab: (t: Tab) => void;
  theme: Theme;
  toggleTheme: () => void;
  isReturning: boolean;
  setReturning: (v: boolean) => void;
  todayWorkout: Workout | null;
  setTodayWorkout: (w: Workout | null) => void;
  workoutState: WorkoutState;
  setWorkoutState: (s: WorkoutState) => void;
  generateWorkout: (c: CheckIn) => Promise<Workout>;
  generateReentryWorkout: () => Promise<Workout>;
  swapExercise: (exerciseId: string, constraint: string, priorPivots?: PriorPivot[]) => Promise<Replacement>;
  pivotExercise: (exerciseId: string, replacement: Replacement) => void;
  userProfile: UserProfile | null;
  setUserProfile: (p: UserProfile | null) => void;
  hasGeneratedWorkout: boolean;
  setHasGeneratedWorkout: (v: boolean) => void;
  checkInCount: number;
  incrementCheckInCount: () => void;
  completedWorkoutsCount: number;
  incrementCompletedWorkouts: (duration: number, focus: string) => void;
  totalTrainingTime: number;
  lastWorkoutDate: string | null;
  lastWorkoutFocus: string | null;
  weeklyCompletedWorkouts: number;
  exerciseStatusById: Record<string, ExerciseStatus>;
  setExerciseStatus: (id: string, status: ExerciseStatus) => void;
  clearExerciseStatuses: () => void;
  sessionQualityHistory: SessionQualityRecord[];
  adaptiveMemory: AdaptiveMemory;
  finalizeSessionQuality: () => void;
  totalPivotCount: number;
  lastCheckIn: CheckIn | null;
  pivotHistory: PivotHistoryEntry[];
};

function readLS<T>(key: string, fallback: T): T {
  try {
    const s = localStorage.getItem(key);
    if (s === null) return fallback;
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function writeLS(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getMondayStr(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

const VALID_STATES: WorkoutState[] = ["NO_WORKOUT", "WORKOUT_GENERATED", "WORKOUT_STARTED", "WORKOUT_COMPLETED"];

function readWorkoutState(): WorkoutState {
  try {
    const date = localStorage.getItem("pivot_workout_state_date");
    if (date !== getTodayStr()) return "NO_WORKOUT";
    const state = localStorage.getItem("pivot_workout_state") as WorkoutState | null;
    return VALID_STATES.includes(state as WorkoutState) ? (state as WorkoutState) : "NO_WORKOUT";
  } catch { return "NO_WORKOUT"; }
}

function writeWorkoutState(state: WorkoutState) {
  try {
    localStorage.setItem("pivot_workout_state", state);
    localStorage.setItem("pivot_workout_state_date", getTodayStr());
  } catch {}
}

function readTodayWorkout(): Workout | null {
  try {
    const date = localStorage.getItem("pivot_workout_state_date");
    if (date !== getTodayStr()) return null;
    return readLS<Workout | null>("pivot_today_workout", null);
  } catch { return null; }
}

function readTodayArray(key: string): string[] {
  try {
    const date = localStorage.getItem("pivot_workout_state_date");
    if (date !== getTodayStr()) return [];
    return readLS<string[]>(key, []);
  } catch { return []; }
}

function readTodayMap(key: string): Record<string, ExerciseStatus> {
  try {
    const date = localStorage.getItem("pivot_workout_state_date");
    if (date !== getTodayStr()) return {};
    return readLS<Record<string, ExerciseStatus>>(key, {});
  } catch { return {}; }
}

function readWeeklyCount(): number {
  try {
    const weekStart = localStorage.getItem("pivot_weekly_week_start");
    if (weekStart !== getMondayStr()) return 0;
    return readLS<number>("pivot_weekly_completed", 0);
  } catch { return 0; }
}

function appendUniqueRecent(list: string[], values: string[], max = 60): string[] {
  const seen = new Set<string>();
  const merged = [...values, ...list]
    .map((v) => String(v).trim())
    .filter(Boolean)
    .filter((v) => {
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return merged.slice(0, max);
}

function bumpCounter(map: Record<string, number>, key: string, amount = 1): Record<string, number> {
  return { ...map, [key]: (map[key] ?? 0) + amount };
}

function inferPatternFromExerciseName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bench") || n.includes("press") || n.includes("push-up")) return "press";
  if (n.includes("row") || n.includes("pulldown") || n.includes("pull")) return "pull";
  if (n.includes("squat") || n.includes("leg press")) return "squat";
  if (n.includes("deadlift") || n.includes("hinge") || n.includes("thrust")) return "hinge";
  if (n.includes("lunge") || n.includes("split")) return "lunge";
  if (n.includes("curl")) return "curl";
  if (n.includes("triceps") || n.includes("pushdown") || n.includes("extension")) return "extension";
  if (n.includes("plank") || n.includes("core")) return "core";
  return "other";
}

const Ctx = createContext<AppState | null>(null);

async function invoke<T>(name: string, body?: unknown, fallback?: T): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body: body ?? {} });
    if (error) throw error;
    return data as T;
  } catch {
    throw new Error("Request failed");
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>("home");
  const [theme, setTheme] = useState<Theme>("dark");
  const [isReturning, setReturning] = useState(false);
  const [todayWorkout, setTodayWorkoutInternal] = useState<Workout | null>(readTodayWorkout);
  const [workoutState, setWorkoutStateInternal] = useState<WorkoutState>(readWorkoutState);
  const [userProfile, setUserProfileInternal] = useState<UserProfile | null>(() =>
    readLS<UserProfile | null>("pivot_user_profile", null));
  const [hasGeneratedWorkout, setHasGeneratedWorkoutInternal] = useState<boolean>(() =>
    readLS<boolean>("pivot_has_generated_workout", false));
  const [checkInCount, setCheckInCount] = useState<number>(() =>
    readLS<number>("pivot_checkin_count", 0));
  const [completedWorkoutsCount, setCompletedWorkoutsCount] = useState<number>(() =>
    readLS<number>("pivot_completed_workouts_count", 0));
  const [totalTrainingTime, setTotalTrainingTime] = useState<number>(() =>
    readLS<number>("pivot_total_training_time", 0));
  const [lastWorkoutDate, setLastWorkoutDateInternal] = useState<string | null>(() =>
    readLS<string | null>("pivot_last_workout_date", null));
  const [lastWorkoutFocus, setLastWorkoutFocusInternal] = useState<string | null>(() =>
    readLS<string | null>("pivot_last_workout_focus", null));
  const [weeklyCompletedWorkouts, setWeeklyCompletedWorkouts] = useState<number>(readWeeklyCount);
  const [exerciseStatusById, setExerciseStatusByIdInternal] = useState<Record<string, ExerciseStatus>>(() => {
    const map = readTodayMap("pivot_exercise_status_v1");
    // Back-compat: migrate old arrays into the map (completed > partial > skipped priority).
    const completed = readTodayArray("pivot_completed_exercises");
    const partial = readTodayArray("pivot_partial_exercises");
    const skipped = readTodayArray("pivot_skipped_exercises");
    let changed = false;
    const next: Record<string, ExerciseStatus> = { ...map };
    for (const id of skipped) { if (!next[id]) { next[id] = "skipped"; changed = true; } }
    for (const id of partial) { next[id] = "partial"; changed = true; }
    for (const id of completed) { next[id] = "completed"; changed = true; }
    if (changed) writeLS("pivot_exercise_status_v1", next);
    return next;
  });
  const [totalPivotCount, setTotalPivotCount] = useState<number>(() =>
    readLS<number>("pivot_total_pivots", 0));
  const [lastCheckIn, setLastCheckInInternal] = useState<CheckIn | null>(() =>
    readLS<CheckIn | null>("pivot_last_checkin_data", null));
  const [pivotHistory, setPivotHistoryInternal] = useState<PivotHistoryEntry[]>(() =>
    readLS<PivotHistoryEntry[]>("pivot_history_v1", []));
  const [recentExercises, setRecentExercises] = useState<string[]>(() =>
    readLS<string[]>("pivot_recent_exercises_v1", []));
  const [recentPivotReplacements, setRecentPivotReplacements] = useState<string[]>(() =>
    readLS<string[]>("pivot_recent_pivots_v1", []));
  const [sessionQualityHistory, setSessionQualityHistory] = useState<SessionQualityRecord[]>(() =>
    readLS<SessionQualityRecord[]>("pivot_session_quality_v1", []));
  const [adaptiveMemory, setAdaptiveMemory] = useState<AdaptiveMemory>(() =>
    readLS<AdaptiveMemory>("pivot_adaptive_memory_v1", {
      favoritePatterns: {},
      skippedPatterns: {},
      failedCompletionPatterns: {},
      recurringPivotReasons: {},
      recurringPainConstraints: {},
    }));

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const setUserProfile = (p: UserProfile | null) => {
    setUserProfileInternal(p);
    writeLS("pivot_user_profile", p);
  };

  const setHasGeneratedWorkout = (v: boolean) => {
    setHasGeneratedWorkoutInternal(v);
    writeLS("pivot_has_generated_workout", v);
  };

  const setTodayWorkout = (w: Workout | null) => {
    // Preserve originalExerciseCount when setting for the first time
    let enhanced = w && !w.originalExerciseCount
      ? { ...w, originalExerciseCount: w.exercises.length }
      : w;

    // Restore pivot metadata from history
    if (enhanced && pivotHistory.length > 0) {
      enhanced = {
        ...enhanced,
        exercises: enhanced.exercises.map((ex) => {
          const pivotEntry = pivotHistory.find((p) => p.exerciseId === ex.id);
          if (pivotEntry) {
            return {
              ...ex,
              pivoted: true,
              pivotRationale: pivotEntry.rationale,
              pivotConstraint: pivotEntry.constraint,
            };
          }
          return ex;
        }),
      };
    }

    setTodayWorkoutInternal(enhanced);
    writeLS("pivot_today_workout", enhanced);
  };

  const setWorkoutState = (s: WorkoutState) => {
    setWorkoutStateInternal(s);
    writeWorkoutState(s);
  };

  const incrementCheckInCount = () => {
    setCheckInCount((n) => {
      const next = n + 1;
      writeLS("pivot_checkin_count", next);
      return next;
    });
  };

  const incrementCompletedWorkouts = (duration: number, focus: string) => {
    const now = new Date().toISOString();
    setCompletedWorkoutsCount((n) => {
      const next = n + 1;
      writeLS("pivot_completed_workouts_count", next);
      return next;
    });
    setTotalTrainingTime((t) => {
      const next = t + Math.max(0, duration);
      writeLS("pivot_total_training_time", next);
      return next;
    });
    setLastWorkoutDateInternal(now);
    writeLS("pivot_last_workout_date", now);
    setLastWorkoutFocusInternal(focus);
    writeLS("pivot_last_workout_focus", focus);
    const monday = getMondayStr();
    const storedWeek = localStorage.getItem("pivot_weekly_week_start");
    setWeeklyCompletedWorkouts((prev) => {
      const next = storedWeek === monday ? prev + 1 : 1;
      try {
        localStorage.setItem("pivot_weekly_week_start", monday);
        writeLS("pivot_weekly_completed", next);
      } catch {}
      return next;
    });
  };

  // ── Exercise status map (single authoritative state) ─────────────────────
  const setExerciseStatus: AppState["setExerciseStatus"] = (id, status) => {
    setExerciseStatusByIdInternal((prev) => {
      const next = { ...prev, [id]: status };
      writeLS("pivot_exercise_status_v1", next);
      return next;
    });
  };

  const clearExerciseStatuses = () => {
    setExerciseStatusByIdInternal({});
    try { localStorage.removeItem("pivot_exercise_status_v1"); } catch {}
    // Also clear legacy keys so they can't re-hydrate.
    try {
      localStorage.removeItem("pivot_completed_exercises");
      localStorage.removeItem("pivot_skipped_exercises");
      localStorage.removeItem("pivot_partial_exercises");
    } catch {}
  };

  // ── LastCheckIn ──────────────────────────────────────────────────────────
  const setLastCheckIn = (c: CheckIn | null) => {
    setLastCheckInInternal(c);
    writeLS("pivot_last_checkin_data", c);
  };

  // ── Workout generation ───────────────────────────────────────────────────
  const generateWorkout = async (c: CheckIn): Promise<Workout> => {
    if (isReturning) return generateReentryWorkout();
    setLastCheckIn(c);
    return invoke<Workout>("generate-workout", {
      ...c,
      recentExercises,
      recentPivots: recentPivotReplacements,
      equipment: "Full Gym",
      adaptiveMemory,
    });
  };

  const generateReentryWorkout = async (): Promise<Workout> => {
    return invoke<Workout>("generate-reentry-workout", {}, {
      focus: "Re-entry · Full Body Deload",
      duration: 30,
      rationale: "Welcome back. After your time off, today is a light full-body session at 60% intensity to ease back in safely.",
      exercises: [
        { id: "d1", name: "Bodyweight Squat", setsReps: "2 sets · 12 reps", cue: "Move with control." },
        { id: "d2", name: "Push-ups", setsReps: "2 sets · 10 reps" },
        { id: "d3", name: "Dumbbell Row", setsReps: "2 sets · 10 reps", cue: "Light load." },
        { id: "d4", name: "Plank", setsReps: "2 sets · 30s" },
      ],
    });
  };

  const swapExercise = async (exerciseId: string, constraint: string, priorPivots: PriorPivot[] = []): Promise<Replacement> => {
    const exercise = todayWorkout?.exercises.find((e) => e.id === exerciseId);
    const normalize = (value: string) => String(value).trim().toLowerCase();
    const currentExerciseNames = new Set(
      (todayWorkout?.exercises ?? [])
        .map((e) => normalize(e.name))
        .filter((name) => exercise ? name !== normalize(exercise.name) : true)
    );

    const attemptedReplacements = new Set<string>();
    let nextPriorPivots = [...priorPivots];
    let lastReplacement: Replacement | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const replacement = await invoke<Replacement>(
        "swap-exercise",
        {
          exercise,
          constraint,
          workoutFocus: todayWorkout?.focus,
          priorPivots: nextPriorPivots,
          currentExercises: todayWorkout?.exercises?.map((e) => e.name) ?? [],
          recentExercises,
          recentPivots: recentPivotReplacements,
          equipment: "Full Gym",
          note: lastCheckIn?.note ?? "",
          adaptiveMemory,
        },
        undefined
      );

      lastReplacement = replacement;
      const replacementName = normalize(replacement.name);
      if (
        !exercise ||
        (!currentExerciseNames.has(replacementName) &&
          replacementName !== normalize(exercise.name) &&
          !attemptedReplacements.has(replacementName))
      ) {
        return replacement;
      }

      attemptedReplacements.add(replacementName);
      nextPriorPivots = [
        ...nextPriorPivots,
        { original: exercise.name, replacement: replacement.name, constraint },
      ];
    }

    return lastReplacement ?? Promise.reject(new Error("Unable to generate a unique pivot replacement."));
  };

  const pivotExercise: AppState["pivotExercise"] = (exerciseId, replacement) => {
    const originalExercise = todayWorkout?.exercises.find((e) => e.id === exerciseId);
    const originalName = originalExercise?.name ?? "Unknown";

    setTodayWorkoutInternal((w) => {
      if (!w) return w;
      const updated = w.exercises.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              name: replacement.name,
              setsReps: replacement.setsReps,
              cue: replacement.cue,
              pivoted: true,
              pivotRationale: replacement.rationale,
              pivotConstraint: replacement.constraint,
            }
          : e
      );
      // Do not delete exercises on pivot; backend ensures replacements are unique.
      const next = { ...w, exercises: updated };
      writeLS("pivot_today_workout", next);
      return next;
    });

    setPivotHistoryInternal((prev) => {
      const entry: PivotHistoryEntry = {
        exerciseId,
        originalName,
        newName: replacement.name,
        constraint: replacement.constraint ?? "",
        rationale: replacement.rationale ?? "",
        timestamp: new Date().toISOString(),
      };
      const next = [entry, ...prev];
      writeLS("pivot_history_v1", next);
      return next;
    });

    setTotalPivotCount((n) => {
      const next = n + 1;
      writeLS("pivot_total_pivots", next);
      return next;
    });
    setRecentPivotReplacements((prev) => {
      const next = appendUniqueRecent(prev, [replacement.name], 40);
      writeLS("pivot_recent_pivots_v1", next);
      return next;
    });
    setAdaptiveMemory((prev) => {
      const c = replacement.constraint?.toLowerCase() ?? "";
      const next: AdaptiveMemory = {
        ...prev,
        recurringPivotReasons: bumpCounter(prev.recurringPivotReasons, c || "unknown"),
        recurringPainConstraints: /pain|hurt|injur|shoulder|knee|elbow|back/.test(c)
          ? bumpCounter(prev.recurringPainConstraints, "pain-related")
          : prev.recurringPainConstraints,
      };
      writeLS("pivot_adaptive_memory_v1", next);
      return next;
    });
  };

  useEffect(() => {
    if (!todayWorkout?.exercises?.length) return;
    setRecentExercises((prev) => {
      const next = appendUniqueRecent(prev, todayWorkout.exercises.map((e) => e.name), 80);
      writeLS("pivot_recent_exercises_v1", next);
      return next;
    });
  }, [todayWorkout]);

  const finalizeSessionQuality = () => {
    if (!todayWorkout?.exercises?.length) return;
    const status = todayWorkout.exercises.map((e) => exerciseStatusById[e.id] ?? "pending");
    const completed = status.filter((s) => s === "completed").length;
    const partial = status.filter((s) => s === "partial").length;
    const skipped = status.filter((s) => s === "skipped").length;
    const pivots = todayWorkout.exercises.filter((e) => e.pivoted).length;
    const total = todayWorkout.exercises.length;
    const compliance = total > 0 ? (completed + partial * 0.5) / total : 0;
    const quality = Math.max(0, Math.min(1, compliance - skipped * 0.08));
    const record: SessionQualityRecord = {
      at: new Date().toISOString(),
      focus: todayWorkout.focus,
      duration: todayWorkout.duration,
      completed,
      partial,
      skipped,
      pivots,
      compliance,
      quality,
    };
    setSessionQualityHistory((prev) => {
      const next = [record, ...prev].slice(0, 60);
      writeLS("pivot_session_quality_v1", next);
      return next;
    });
    setAdaptiveMemory((prev) => {
      let next = { ...prev };
      for (const ex of todayWorkout.exercises) {
        const p = ex.movementPattern || inferPatternFromExerciseName(ex.name);
        const st = exerciseStatusById[ex.id] ?? "pending";
        if (st === "completed" || st === "partial") {
          next = { ...next, favoritePatterns: bumpCounter(next.favoritePatterns, p) };
        }
        if (st === "skipped") {
          next = { ...next, skippedPatterns: bumpCounter(next.skippedPatterns, p) };
          next = { ...next, failedCompletionPatterns: bumpCounter(next.failedCompletionPatterns, p) };
        }
      }
      writeLS("pivot_adaptive_memory_v1", next);
      return next;
    });
  };

  const value = useMemo<AppState>(
    () => ({
      tab, setTab, theme, toggleTheme, isReturning, setReturning,
      todayWorkout, setTodayWorkout, workoutState, setWorkoutState,
      generateWorkout, generateReentryWorkout, swapExercise, pivotExercise,
      userProfile, setUserProfile,
      hasGeneratedWorkout, setHasGeneratedWorkout,
      checkInCount, incrementCheckInCount,
      completedWorkoutsCount, incrementCompletedWorkouts,
      totalTrainingTime, lastWorkoutDate, lastWorkoutFocus, weeklyCompletedWorkouts,
      exerciseStatusById, setExerciseStatus, clearExerciseStatuses,
      sessionQualityHistory, adaptiveMemory, finalizeSessionQuality,
      totalPivotCount,
      lastCheckIn,
      pivotHistory,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, theme, isReturning, todayWorkout, workoutState, userProfile, hasGeneratedWorkout,
     checkInCount, completedWorkoutsCount, totalTrainingTime, lastWorkoutDate, lastWorkoutFocus,
     weeklyCompletedWorkouts, exerciseStatusById,
     sessionQualityHistory, adaptiveMemory, totalPivotCount, lastCheckIn, pivotHistory]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used within AppProvider");
  return v;
}
