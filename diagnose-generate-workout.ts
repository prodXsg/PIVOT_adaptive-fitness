/**
 * DIAGNOSTIC: Generate-Workout Logic Trace
 * This traces through the entire generate-workout function with your test input
 * WITHOUT requiring network access or Gemini API calls.
 */

// =============================================================================
// INPUT
// =============================================================================

const TEST_INPUT = {
  sleep: 5,
  energy: 4,
  time: 20,
  focus: "Legs",
  soreness: 3,
};

console.log("\n" + "=".repeat(80));
console.log("GENERATE-WORKOUT DIAGNOSTIC - CODE TRACE");
console.log("=".repeat(80));

console.log("\n[1] INPUT VALUES");
console.log(JSON.stringify(TEST_INPUT, null, 2));

// =============================================================================
// VALIDATION AND CLAMPING (from generate-workout/index.ts:225-239)
// =============================================================================

function clamp(v: unknown, min: number, max: number, def: number): number {
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

const sleep = clamp(TEST_INPUT.sleep, 0, 12, 7);
const energy = clamp(TEST_INPUT.energy, 1, 10, 6);
const soreness = clamp(TEST_INPUT.soreness, 0, 10, 3);
const time = clamp(TEST_INPUT.time, 15, 90, 45);

console.log("\n[2] CLAMPED VALUES (from input validation)");
console.log(`  sleep:   ${TEST_INPUT.sleep} → ${sleep} (range [0,12], default 7)`);
console.log(`  energy:  ${TEST_INPUT.energy} → ${energy} (range [1,10], default 6)`);
console.log(`  soreness: ${TEST_INPUT.soreness} → ${soreness} (range [0,10], default 3)`);
console.log(`  time:    ${TEST_INPUT.time} → ${time} (range [15,90], default 45)`);

// =============================================================================
// FOCUS INFERENCE (from adaptive.ts:1435-1441)
// =============================================================================

const FOCUS_LIST = [
  "Push", "Pull", "Legs", "Full Body", "Core", "Conditioning", "Chest", "Back", "Shoulders",
  "Biceps", "Triceps", "Glutes", "Hamstrings", "Quads", "Calves", "Arms", "Rear Delts",
];

function inferFocus(raw: string): string {
  const s = String(raw ?? "").trim();
  if (FOCUS_LIST.includes(s)) return s;
  const first = s.split(/\s*(?:·|•|—)\s*/)[0]?.trim() ?? "";
  if (FOCUS_LIST.includes(first)) return first;
  return "Push"; // DEFAULT FALLBACK
}

const focus = inferFocus(String(TEST_INPUT.focus ?? "Push"));

console.log("\n[3] FOCUS INFERENCE");
console.log(`  Raw input: "${TEST_INPUT.focus}"`);
console.log(`  In FOCUS_LIST: ${FOCUS_LIST.includes(TEST_INPUT.focus as any)}`);
console.log(`  Inferred focus: "${focus}"`);
console.log(`  Status: ${focus === "Legs" ? "✓ CORRECT" : "✗ INCORRECT"}`);

// =============================================================================
// TIME RULES (from generate-workout/index.ts:26-32)
// =============================================================================

interface TimeRules {
  maxExercises: number;
  minDuration: number;
  maxDuration: number;
  label: string;
}

function timeRules(t: number): TimeRules {
  if (t <= 20) return { maxExercises: 4, minDuration: 15, maxDuration: 20, label: "< 20 min" };
  if (t <= 35) return { maxExercises: 5, minDuration: 25, maxDuration: 35, label: "30 min" };
  if (t <= 50) return { maxExercises: 6, minDuration: 40, maxDuration: 50, label: "45 min" };
  if (t <= 70) return { maxExercises: 7, minDuration: 60, maxDuration: 70, label: "60 min" };
  return { maxExercises: 8, minDuration: 75, maxDuration: 85, label: "75+ min" };
}

const rules = timeRules(time);

console.log("\n[4] TIME RULES");
console.log(`  Time requested: ${time} minutes`);
console.log(`  Matched rule: "${rules.label}"`);
console.log(`  Max exercises: ${rules.maxExercises}`);
console.log(`  Duration range: ${rules.minDuration}-${rules.maxDuration} minutes`);

// =============================================================================
// READINESS CHECK (from generate-workout/index.ts:287-289)
// =============================================================================

const lowReadiness = sleep < 6 || energy <= 4 || soreness >= 7;

console.log("\n[5] READINESS CHECK");
console.log(`  Sleep ${sleep}h < 6h: ${sleep < 6}`);
console.log(`  Energy ${energy}/10 <= 4: ${energy <= 4}`);
console.log(`  Soreness ${soreness}/10 >= 7: ${soreness >= 7}`);
console.log(`  → LOW READINESS: ${lowReadiness}`);
console.log(`  Result: ${lowReadiness ? "Reduced fatigue/intensity" : "Normal intensity"}`);

const defaultSets = lowReadiness ? 2 : 3;
const defaultReps = lowReadiness ? "10-12" : "8-10";

console.log(`  Default sets: ${defaultSets}`);
console.log(`  Default reps: ${defaultReps}`);

// =============================================================================
// KEY CONSTRAINTS FOR GEMINI PROMPT (from generate-workout/index.ts:187-195)
// =============================================================================

console.log("\n[6] GEMINI PROMPT CONSTRAINTS");
console.log(`  ABSOLUTE RULE #1: Focus MUST be "${focus}", not changed to something else`);
console.log(`  ABSOLUTE RULE #2: Duration must be ${rules.minDuration}-${rules.maxDuration} minutes`);
console.log(`  ABSOLUTE RULE #3: Max exercises cannot exceed ${rules.maxExercises}`);
console.log(`  ABSOLUTE RULE #4: Must use ONLY from the pre-selected exercise list`);
console.log(`  Output format: Valid JSON only`);

// =============================================================================
// RESPONSE VALIDATION LOGIC (from generate-workout/index.ts:287-327)
// =============================================================================

console.log("\n[7] RESPONSE VALIDATION CRITERIA");
console.log(`\n  When Gemini responds, the function checks:\n`);
console.log(`  A) Is focus correct?`);
console.log(`     - Expected: "${focus}"`);
console.log(`     - Response must contain focus or use the inference logic`);
console.log(`     - If focus is wrong, constraint violated ✗`);
console.log(`\n  B) Is duration within bounds?`);
console.log(`     - Expected: ${rules.minDuration}-${rules.maxDuration} minutes`);
console.log(`     - Code clamps: clamp(est, ${rules.minDuration}, ${rules.maxDuration}, ${rules.maxDuration})`);
console.log(`     - If duration < ${rules.minDuration} or > ${rules.maxDuration}: constraint violated ✗`);
console.log(`\n  C) Are all exercises from the selected list?`);
console.log(`     - Each exercise in Gemini response is checked against allowedSet`);
console.log(`     - If exercise name doesn't match (after canonicalization): ignored`);
console.log(`     - If all exercises are rejected: might trigger fallback`);
console.log(`\n  D) Exercise count?`);
console.log(`     - picked.slice(0, maxExercises) limits to ${rules.maxExercises}`);
console.log(`     - If count exceeds limit: clamped to ${rules.maxExercises}`);

// =============================================================================
// FALLBACK TRIGGER CONDITION (from generate-workout/index.ts:394-402)
// =============================================================================

console.log("\n[8] FALLBACK TRIGGER CONDITIONS");
console.log(`\n  Fallback is triggered when:\n`);
console.log(`  • catch block catches ANY error (lines 394-402)`);
console.log(`  • Gemini API call fails`);
console.log(`  • JSON parsing fails`);
console.log(`  • Exception thrown in chooseExercises() or callGemini()`);
console.log(`\n  When fallback is used, the response includes:`);
console.log(`  • focus: "${focus}" (saved fallbackFocus)`);
console.log(`  • duration: ${rules.maxDuration}`);
console.log(`  • rationale: "Could not run full adaptation pipeline..."`);
console.log(`  • exercises: [] (EMPTY - no AI-generated content)`);
console.log(`  • HTTP 500 status`);

// =============================================================================
// POTENTIAL ISSUES
// =============================================================================

console.log("\n[9] POTENTIAL FAILURE POINTS");
console.log(`\n  ❓ Issue 1: Gemini ignoring focus constraint`);
console.log(`     - If Gemini returns "Push" instead of "Legs"`);
console.log(`     - Solution: Check if prompt is being ignored or truncated\n`);

console.log(`  ❓ Issue 2: Gemini returning wrong duration`);
console.log(`     - If duration_minutes field is missing or wrong type`);
console.log(`     - If Gemini returns 30+ minutes for 20min request`);
console.log(`     - Code will clamp it, but constraint check happens first\n`);

console.log(`  ❓ Issue 3: Gemini returning exercises not in allowed set`);
console.log(`     - If exercise names don't match selected list exactly`);
console.log(`     - canonicalName() normalizes names but might miss variations\n`);

console.log(`  ❓ Issue 4: JSON parsing failure`);
console.log(`     - If Gemini returns malformed JSON`);
console.log(`     - If response includes extra text before/after JSON\n`);

console.log(`  ❓ Issue 5: No exercises returned`);
console.log(`     - If Gemini returns empty exercises array`);
console.log(`     - Fallback is triggered (line 395)\n`);

console.log(`  ❓ Issue 6: API/Network error`);
console.log(`     - Gemini API timeout`);
console.log(`     - Network connectivity issues`);
console.log(`     - Triggers fallback\n`);

// =============================================================================
// EXAMPLE VALID VS INVALID RESPONSES
// =============================================================================

console.log("[10] EXAMPLE RESPONSES");

const validResponse = {
  focus: "Legs",
  duration_minutes: 20,
  rationale: "Built a focused leg workout with reduced intensity for low readiness.",
  exercises: [
    { name: "Barbell Squat", sets: 2, reps: "10-12", form_cue: "Keep chest up" },
    { name: "Romanian Deadlift", sets: 2, reps: "10-12", form_cue: "Hinge at hips" },
    { name: "Leg Press", sets: 2, reps: "10-12", form_cue: "Full range" },
  ],
};

const invalidResponse1 = {
  focus: "Push", // ✗ WRONG
  duration_minutes: 20,
  exercises: [{ name: "Barbell Squat", sets: 2, reps: "10-12" }],
};

const invalidResponse2 = {
  focus: "Legs",
  duration_minutes: 35, // ✗ TOO LONG (max 20)
  exercises: [{ name: "Barbell Squat", sets: 2, reps: "10-12" }],
};

const invalidResponse3 = {
  focus: "Legs",
  duration_minutes: 20,
  exercises: [], // ✗ EMPTY (would trigger fallback)
};

console.log(`\n  ✓ VALID Response:`);
console.log(`    Focus: "${validResponse.focus}" (matches "Legs")`);
console.log(`    Duration: ${validResponse.duration_minutes} min (in [15, 20])`);
console.log(`    Exercises: ${validResponse.exercises.length} items\n`);

console.log(`  ✗ INVALID Response #1 (focus):`);
console.log(`    Focus: "${invalidResponse1.focus}" (expected "Legs")`);
console.log(`    CONSTRAINT VIOLATED\n`);

console.log(`  ✗ INVALID Response #2 (duration):`);
console.log(`    Duration: ${invalidResponse2.duration_minutes} min (exceeds max 20)`);
console.log(`    CONSTRAINT VIOLATED\n`);

console.log(`  ✗ INVALID Response #3 (empty):`);
console.log(`    Exercises: ${invalidResponse3.exercises.length} items`);
console.log(`    Would trigger FALLBACK (line 395)\n`);

// =============================================================================
// SUMMARY
// =============================================================================

console.log("[11] CONCLUSION");
console.log(`\n  With your test input (sleep:5, energy:4, time:20, focus:"Legs", soreness:3):`);
console.log(`\n  Expected behavior:`);
console.log(`  • Input processing: ✓ Should work correctly`);
console.log(`  • Focus inference: ✓ Should return "Legs"`);
console.log(`  • Readiness detected: ✓ lowReadiness = true`);
console.log(`  • Constraints should be: focus="Legs", duration=[15-20], exercises<=4`);
console.log(`\n  To diagnose the actual failure, check:\n`);
console.log(`  1. What focus does Gemini actually return?`);
console.log(`  2. What duration does it return?`);
console.log(`  3. Are constraint violations happening before Gemini call?`);
console.log(`  4. Is the fallback being triggered? (check HTTP 500 status)`);
console.log(`\n  Run the actual edge function and log:`);
console.log(`  • Gemini API response (raw text before JSON parsing)`);
console.log(`  • Each constraint check result`);
console.log(`  • Whether fallback was triggered`);

console.log("\n" + "=".repeat(80) + "\n");
