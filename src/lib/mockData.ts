export type Exercise = {
  id: string;
  name: string;
  setsReps: string;
  cue?: string;
  primaryMuscle?: string;
  movementPattern?: string;
  estimatedTimeSec?: number;
  fatigueCost?: number;
  pivoted?: boolean;
  pivotRationale?: string;
  pivotConstraint?: string;
};

export type AdaptiveReasoning = {
  summary: string;
  selection: string[];
  constraints: string[];
  adaptations: string[];
};

export type ProgressionSnapshot = {
  sessionQuality?: number;
  compliance?: number;
  movementCoverage?: Record<string, number>;
};

export type Workout = {
  focus: string;
  duration: number; // minutes
  durationReasoning?: string;
  rationale: string;
  exercises: Exercise[];
  originalExerciseCount?: number;
  reasoning?: AdaptiveReasoning;
  progression?: ProgressionSnapshot;
  adaptiveNote?: string;
  debug?: Record<string, unknown>;
};

export const profile = {
  name: "User",
  age: 28,
  level: "Intermediate Lifter",
  goal: "Muscle Gain",
  frequency: "4x/week",
  equipment: "Full Gym",
  program: "Upper/Lower Split",
};

// Default workout (normal day)
export const defaultWorkout: Workout = {
  focus: "Upper Body Push",
  duration: 45,
  rationale:
    "You slept well and feel fresh. Today is a full upper push session — bench focus, then accessories.",
  exercises: [
    { id: "e1", name: "Barbell Bench Press", setsReps: "4 sets · 6 reps", cue: "Brace, drive feet through floor." },
    { id: "e2", name: "Incline Dumbbell Press", setsReps: "3 sets · 10 reps", cue: "Slow eccentric." },
    { id: "e3", name: "Standing Overhead Press", setsReps: "3 sets · 8 reps" },
    { id: "e4", name: "Cable Lateral Raise", setsReps: "3 sets · 12-15 reps", cue: "Lead with the elbow." },
    { id: "e5", name: "Triceps Rope Pushdown", setsReps: "3 sets · 12 reps" },
    { id: "e6", name: "Pec Deck Fly", setsReps: "2 sets · 15 reps" },
  ],
};

// Adapted workout based on poor check-in (low sleep, sore, short on time)
export const adaptedWorkout: Workout = {
  focus: "Lower Body + Zone 2",
  duration: 25,
  rationale:
    "You slept 5 hours and you're sore. Today is 25 minutes of lower body and zone 2 — heavy upper push moves to Thursday.",
  exercises: [
    { id: "a1", name: "Goblet Squat", setsReps: "3 sets · 8 reps", cue: "Stay tall, knees track toes." },
    { id: "a2", name: "Romanian Deadlift", setsReps: "3 sets · 10 reps", cue: "Hinge from hips, soft knees." },
    { id: "a3", name: "Walking Lunges", setsReps: "2 sets · 10 reps/leg" },
    { id: "a4", name: "Zone 2 Bike", setsReps: "10 min @ RPE 5", cue: "Conversational pace." },
  ],
};

// Deloaded workout for re-entry after 4+ days
export const deloadWorkout: Workout = {
  focus: "Re-entry • Full Body Deload",
  duration: 30,
  rationale:
    "Welcome back. After 4 days off, today is a light full-body session at 60% intensity to ease back in.",
  exercises: [
    { id: "d1", name: "Bodyweight Squat", setsReps: "2 sets · 12 reps", cue: "Move with control." },
    { id: "d2", name: "Push-ups", setsReps: "2 sets · 10 reps" },
    { id: "d3", name: "Dumbbell Row", setsReps: "2 sets · 10 reps", cue: "Light load. Feel the back." },
    { id: "d4", name: "Plank", setsReps: "2 sets · 30s" },
    { id: "d5", name: "Easy Walk / Bike", setsReps: "10 min" },
  ],
};

// Pivot alternatives (mock lookup)
export const pivotAlternatives: Record<string, { name: string; setsReps: string; cue?: string; rationale: string }> = {
  default: {
    name: "Dumbbell Floor Press",
    setsReps: "3 sets · 12 reps",
    cue: "Controlled press, pause at chest.",
    rationale: "Maintains chest stimulus with available equipment.",
  },
  bench: {
    name: "Weighted Push-Ups",
    setsReps: "3 sets · 12 reps",
    cue: "Slow descent, full range.",
    rationale: "Same chest stimulus, no bench needed.",
  },
  time: {
    name: "Push-up Drop Set",
    setsReps: "1 set · AMRAP",
    cue: "Go to technical failure.",
    rationale: "Compressed to 3 minutes — preserves the push stimulus.",
  },
  shoulder: {
    name: "Neutral-Grip DB Press",
    setsReps: "3 sets · 10 reps",
    cue: "Keep elbows tucked.",
    rationale: "Shoulder-friendly press with same target.",
  },
  busy: {
    name: "Dumbbell Floor Press",
    setsReps: "3 sets · 8 reps",
    cue: "Pause at the bottom.",
    rationale: "No rack needed — keeps the heavy push.",
  },
};

export type WeekDay = {
  day: string;
  date: string;
  focus: string;
  status: "completed" | "today" | "planned";
  provisional: boolean;
  pivots?: number;
};

export const weekPlan: WeekDay[] = [
  { day: "Today", date: "Tue 29", focus: "Upper Push", status: "today", provisional: false },
  { day: "Wed", date: "Wed 30", focus: "Rest / Mobility", status: "planned", provisional: true },
  { day: "Thu", date: "Thu 01", focus: "Lower", status: "planned", provisional: true },
  { day: "Fri", date: "Fri 02", focus: "Upper Pull", status: "planned", provisional: true },
  { day: "Sat", date: "Sat 03", focus: "Conditioning", status: "planned", provisional: true },
];

export const lastWorkout = "Yesterday: Lower body, 42 min, completed";

export const weeklyInsight = {
  range: "Apr 22 – Apr 28",
  summary:
    "You completed 3 of 4 planned workouts this week. The one you skipped came after a 4-hour sleep night — your pattern shows training drops sharply when sleep falls below 6 hours. Your bench press progressed by 2.5kg. Soreness reports were consistent with your training load.",
  stats: [
    { label: "Workouts completed", value: "3/4" },
    { label: "Total training time", value: "142 min" },
    { label: "Avg sleep this week", value: "6.2 hrs" },
    { label: "Pivots taken", value: "2" },
  ],
};
