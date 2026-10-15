import { callGemini, corsHeaders, json, sanitizeInput } from "../_shared/gemini.ts";
import { EXERCISES, canonicalName, inferFocus, scoreExercise, shouldDebugAdaptive, isFocusLegal, exceedsPerceptualRedundancyThreshold, type ExerciseMeta } from "../_shared/adaptive.ts";

function chooseDeterministicReplacement(args: {
  focus: ReturnType<typeof inferFocus>;
  originalName: string;
  constraint: string;
  used: Set<string>;
  note: string;
  equipmentContext: string;
  recentExercises: string[];
  currentWorkout?: Array<{ name: string }>;
  priorPivots?: Array<{ replacement?: string }>;
}) {
  const c = `${args.constraint} ${args.note}`.toLowerCase();
  const pool = EXERCISES;
  const orig = canonicalName(args.originalName);
  const origEx = pool.find((e) => canonicalName(e.name) === orig);

  const pain = c.includes("pain") || c.includes("hurt") || c.includes("injur") || c.includes("tweak") || c.includes("shoulder") || c.includes("elbow") || c.includes("knee") || c.includes("back");
  const time = c.includes("time") || c.includes("late") || c.includes("minutes") || c.includes("only") || c.includes("rush");
  const equipmentBusy = c.includes("busy") || c.includes("taken") || c.includes("no") || c.includes("unavailable") || c.includes("broken");

  const candidates = pool
    .filter((e) => canonicalName(e.name) !== orig && !args.used.has(canonicalName(e.name)))
    .filter((e) => {
      // HARD INVARIANT: Focus legality
      if (!isFocusLegal(e, args.focus)) {
        return false;
      }
      
      // HARD INVARIANT: Global duplicate filter (against current workout + prior pivots)
      if (args.currentWorkout) {
        const currentNames = new Set(args.currentWorkout.map((ex) => canonicalName(ex.name)));
        if (currentNames.has(canonicalName(e.name))) {
          return false;
        }
      }
      if (args.priorPivots) {
        const priorNames = new Set(args.priorPivots.map((p) => canonicalName(p.replacement ?? "")));
        if (priorNames.has(canonicalName(e.name))) {
          return false;
        }
      }
      
      // HARD INVARIANT: Perceptual redundancy filter
      // Exclude the original exercise so its role slot is free for the replacement.
      if (args.currentWorkout && args.currentWorkout.length > 0) {
        const currentWorkoutExercises = args.currentWorkout
          .filter((item) => canonicalName(item.name) !== orig)
          .map((item) => pool.find((ex) => canonicalName(ex.name) === canonicalName(item.name)))
          .filter(Boolean) as ExerciseMeta[];

        if (exceedsPerceptualRedundancyThreshold(e, currentWorkoutExercises)) {
          return false;
        }
      }
      
      return true;
    });

  const scored = candidates
    .map((e) => {
      const { score: baseScore } = scoreExercise({
        ex: e,
        focus: args.focus,
        sleep: 7,
        energy: 6,
        soreness: pain ? 8 : 3,
        note: c,
        recent: args.recentExercises,
        usedPatterns: new Set(),
        equipmentContext: args.equipmentContext,
      });
      let score = baseScore;
      if (origEx && e.primaryMuscle === origEx.primaryMuscle) score += 7;
      if (origEx && e.movementPattern === origEx.movementPattern) score += 8;
      if (origEx && e.kind === origEx.kind) score += 2;
      if (pain) {
        if (e.jointStress === "low") score += 8;
        if (e.jointStress === "high") score -= 9;
        if (e.name.includes("Machine")) score += 3;
        if (e.name.includes("Cable")) score += 1;
      }
      if (equipmentBusy) {
        if (e.name.includes("Dumbbell")) score += 2;
        if (e.name.includes("Machine")) score += 1;
      }
      if (time) {
        if (e.name.toLowerCase().includes("drop")) score += 4;
        if (e.kind === "compound") score += 2;
      }
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name));

  const picked = scored[0]?.e;
  if (!picked) return null;

  const sets = pain || time ? 2 : 3;
  const prescType = picked.prescriptionType ?? "reps";
  const prescValue = (prescType !== "reps" && picked.defaultPrescription)
    ? picked.defaultPrescription
    : (time ? "AMRAP" : "10-12");
  return {
    name: picked.name,
    setsReps: formatPrescription(sets, prescValue, prescType),
    cue: pain ? "Keep the range pain-free." : undefined,
    rationale: sanitizeInput(
      time
        ? "Swapped to a high-value movement with fewer sets to fit the time constraint."
        : pain
        ? "Swapped to a more stable option while keeping the same training intent."
        : "Swapped to match the constraint while preserving the session focus.",
      220,
    ),
    constraint: args.constraint,
  };
}

const SYSTEM_PROMPT = `You are Pivot. The user is mid-workout and needs an exercise swap.

Original exercise:
- Name: {EXERCISE_NAME}
- Sets: {SETS}
- Reps: {REPS}

Workout focus: {WORKOUT_FOCUS}
User constraint: "{USER_CONSTRAINT}"

Prior pivots this session:
{PRIOR_PIVOTS}

Rules:
1. Replace the original exercise with one alternative only.
2. Do not suggest an exercise already used in prior pivots.
3. Equipment constraint: same muscle group and similar movement pattern.
4. Pain/injury constraint: avoid the affected joint or muscle.
5. Time constraint: reduce sets and choose the highest-value movement.
6. Keep the replacement aligned with the workout focus when possible.
7. You MUST ONLY choose a replacement from the allowed exercise list. Do not invent exercises.

Output only valid JSON:
{
  "replacement": {
    "name": "New exercise name",
    "sets": 3,
    "reps": "10-12",
    "muscle_group": "target muscle",
    "is_compound": true,
    "form_cue": "Optional cue"
  },
  "rationale": "One sentence explaining the swap."
}`;

function parseSetsReps(s: string): { sets: number; reps: string } {
  const setsReps = /(\d+)\s*sets?\s*[-·]\s*(.+?)\s*reps?/i.exec(s || "");
  if (setsReps) return { sets: Number.parseInt(setsReps[1], 10), reps: setsReps[2].trim() };
  const amrap = /(\d+)\s*rounds?\s*-\s*AMRAP/i.exec(s || "");
  if (amrap) return { sets: Number.parseInt(amrap[1], 10), reps: "AMRAP" };
  const setsOrRounds = /(\d+)\s*(?:sets?|rounds?)\s*[×x]\s*(.+)/i.exec(s || "");
  if (setsOrRounds) return { sets: Number.parseInt(setsOrRounds[1], 10), reps: setsOrRounds[2].trim() };
  const cross = /(\d+)\s*[×x]\s*(.+)/i.exec(s || "");
  return { sets: cross ? Number.parseInt(cross[1], 10) : 3, reps: cross ? cross[2].trim() : "8-10" };
}

function formatPrescription(sets: number, prescription: string, type: string = "reps"): string {
  switch (type) {
    case "timed": return `${sets} sets × ${prescription}`;
    case "distance": return `${sets} rounds × ${prescription}`;
    case "amrap": return `${sets} rounds - AMRAP`;
    case "interval": return `${sets} rounds × ${prescription}`;
    default: return `${sets} sets - ${prescription} reps`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { exercise, constraint, workoutFocus, priorPivots, currentExercises, recentExercises, equipment, note } = body;

    if (exercise?.pivoted === true) {
      console.log("[swap-exercise] Blocked re-pivot of:", exercise.name);
      return json({ error: "Exercise already pivoted. Cannot pivot twice." }, 400);
    }

    console.log("[swap] request parsed", {
      exerciseName: exercise?.name,
      exerciseSetsReps: exercise?.setsReps,
      constraint,
      workoutFocus,
      currentExercisesCount: Array.isArray(currentExercises) ? currentExercises.length : "not-array",
      currentExercises: Array.isArray(currentExercises) ? currentExercises : [],
      priorPivotsCount: Array.isArray(priorPivots) ? priorPivots.length : 0,
    });

    const safeConstraint = sanitizeInput(typeof constraint === "string" ? constraint : "", 300);
    const sr = parseSetsReps(String(exercise?.setsReps ?? ""));

    console.log("[swap] parseSetsReps", { input: exercise?.setsReps, output: sr });

    const originalCanon = canonicalName(String(exercise?.name ?? ""));
    const used = new Set<string>();
    // Used = current workout exercises + prior pivot replacements + original exercise
    if (Array.isArray(currentExercises)) {
      for (const n of currentExercises) used.add(canonicalName(String(n)));
    }
    if (Array.isArray(priorPivots)) {
      for (const p of priorPivots) used.add(canonicalName(String(p?.replacement ?? "")));
    }
    used.add(originalCanon);

    const focus = inferFocus(String(workoutFocus ?? "Full Body"));

    console.log("[swap] focus inferred", { focus, usedCount: used.size, usedSet: [...used] });

    // STEP 1: BUILD RAW CANDIDATE SET
    // Start with all exercises except the original being replaced
    let candidates = EXERCISES.filter((e) => canonicalName(e.name) !== originalCanon);
    console.log("[swap] step1 raw candidates", { count: candidates.length });

    // STEP 2: HARD ELIMINATION FILTERS (PRE-SCORING)
    // Precompute the "remaining workout" context for perceptual redundancy:
    // exclude the exercise being replaced so its perceptual-role slot is freed for the replacement.
    const remainingWorkoutExercises: ExerciseMeta[] = Array.isArray(currentExercises)
      ? currentExercises
          .filter((name: unknown) => canonicalName(String(name)) !== originalCanon)
          .map((name: unknown) => EXERCISES.find((ex) => canonicalName(ex.name) === canonicalName(String(name))))
          .filter(Boolean) as ExerciseMeta[]
      : [];

    console.log("[swap] remainingWorkout for perceptual check", {
      count: remainingWorkoutExercises.length,
      names: remainingWorkoutExercises.map((e) => e.name),
    });

    let focusRejected = 0, dupRejected = 0, perceptualRejected = 0;

    candidates = candidates.filter((e) => {
      // A. WORKOUT FOCUS LEGALITY FILTER
      if (!isFocusLegal(e, focus)) {
        focusRejected++;
        return false;
      }

      // B. GLOBAL DUPLICATE FILTER
      if (used.has(canonicalName(e.name))) {
        dupRejected++;
        return false;
      }

      // C. PERCEPTUAL REDUNDANCY FILTER — checked against remaining workout
      // (excludes the exercise being replaced so its role slot is free for the replacement)
      if (remainingWorkoutExercises.length > 0) {
        if (exceedsPerceptualRedundancyThreshold(e, remainingWorkoutExercises)) {
          perceptualRejected++;
          return false;
        }
      }

      return true;
    });

    console.log("[swap] step2 after filters", {
      remaining: candidates.length,
      focusRejected,
      dupRejected,
      perceptualRejected,
      topCandidates: candidates.slice(0, 5).map((e) => e.name),
    });

    // If no legal candidates remain, return null (no replacement possible)
    if (candidates.length === 0) {
      console.log("[swap] no candidates after filtering — returning null");
      return json(null);
    }

    // STEP 3: SCORING (only on legal candidates)
    const pivotScoring = candidates.map((e) => {
      const evald = scoreExercise({
        ex: e,
        focus,
        sleep: 7,
        energy: 6,
        soreness: safeConstraint.toLowerCase().includes("pain") ? 8 : 3,
        note: `${safeConstraint} ${sanitizeInput(String(note ?? ""), 120)}`,
        recent: Array.isArray(recentExercises) ? recentExercises.map((x: unknown) => String(x)) : [],
        usedPatterns: new Set(),
        equipmentContext: sanitizeInput(String(equipment ?? "Full Gym"), 60),
      });
      return { name: e.name, score: evald.score, reasons: evald.reasons };
    });

    // Soft score filter: only consider exercises with reasonable scores
    const allowed = candidates.filter((e) => {
      const entry = pivotScoring.find((s) => canonicalName(s.name) === canonicalName(e.name));
      return (entry?.score ?? -999) > -10;
    });

    console.log("[swap] step3 scoring", {
      scoredCount: pivotScoring.length,
      allowedAfterSoftFilter: allowed.length,
      topAllowed: allowed.slice(0, 5).map((e) => e.name),
    });

    const allowedText = allowed.map((e) => `- ${e.name}`).join("\n");

    const priorPivotsText = Array.isArray(priorPivots) && priorPivots.length
      ? priorPivots
          .slice(0, 5)
          .map((p: { original?: unknown; replacement?: unknown; constraint?: unknown }) =>
            `- ${sanitizeInput(String(p.replacement ?? ""), 80)} from ${sanitizeInput(String(p.original ?? ""), 80)} (${sanitizeInput(String(p.constraint ?? ""), 120)})`
          )
          .join("\n")
      : "None";

    const prompt = SYSTEM_PROMPT
      .replace("{EXERCISE_NAME}", sanitizeInput(String(exercise?.name ?? "Unknown"), 100))
      .replace("{SETS}", String(sr.sets))
      .replace("{REPS}", sanitizeInput(sr.reps, 30))
      .replace("{WORKOUT_FOCUS}", sanitizeInput(String(workoutFocus ?? "Today's session"), 100))
      .replace("{USER_CONSTRAINT}", safeConstraint)
      .replace("{PRIOR_PIVOTS}", priorPivotsText) + `\n\nAllowed replacement exercises:\n${allowedText}\n`;

    const raw = (await callGemini(prompt)) as {
      replacement?: { name?: string; sets?: number; reps?: string; form_cue?: string };
      rationale?: string;
    };
    const r = raw.replacement;
    const proposed = r?.name ? canonicalName(r.name) : "";
    const allowedByCanon = new Map(allowed.map((e) => [canonicalName(e.name), e.name]));
    const allowedName = proposed ? allowedByCanon.get(proposed) : undefined;

    console.log("[swap] LLM result", {
      proposedName: r?.name,
      proposedCanon: proposed,
      allowedName,
      allowedByCanonSize: allowedByCanon.size,
      isInUsed: allowedName ? used.has(canonicalName(allowedName)) : "n/a",
    });

    // Hard filtering: reject duplicates / disallowed replacements.
    if (!allowedName || used.has(canonicalName(allowedName))) {
      console.log("[swap] LLM rejected — falling back to deterministic");
      const det = chooseDeterministicReplacement({
        focus,
        originalName: String(exercise?.name ?? ""),
        constraint: safeConstraint,
        used,
        note: sanitizeInput(String(note ?? ""), 120),
        equipmentContext: sanitizeInput(String(equipment ?? "Full Gym"), 60),
        recentExercises: Array.isArray(recentExercises) ? recentExercises.map((x: unknown) => String(x)) : [],
        currentWorkout: Array.isArray(currentExercises)
          ? currentExercises
              .filter((x: unknown) => canonicalName(String(x)) !== originalCanon)
              .map((x: unknown) => ({ name: String(x) }))
          : undefined,
        priorPivots: Array.isArray(priorPivots) ? priorPivots : undefined,
      });
      console.log("[swap] deterministic result", det ? { name: det.name, setsReps: det.setsReps } : null);
      if (det) return json(det);
      console.log("[swap] no deterministic replacement — returning null");
      return json(null);
    }

    const replacementEx = EXERCISES.find((e) => canonicalName(e.name) === canonicalName(allowedName));
    const replPrescType = replacementEx?.prescriptionType ?? "reps";
    const replPrescValue = (replPrescType !== "reps" && replacementEx?.defaultPrescription)
      ? replacementEx.defaultPrescription
      : sanitizeInput(r?.reps ?? "10-12", 30);

    console.log("[swap] prescription lookup", {
      allowedName,
      prescriptionType: replPrescType,
      defaultPrescription: replacementEx?.defaultPrescription,
      prescValue: replPrescValue,
      sets: r?.sets ?? 3,
      setsReps: formatPrescription(r?.sets ?? 3, replPrescValue, replPrescType),
    });

    const response = {
      name: sanitizeInput(allowedName, 100),
      setsReps: formatPrescription(r?.sets ?? 3, replPrescValue, replPrescType),
      cue: r?.form_cue ? sanitizeInput(r.form_cue, 160) : undefined,
      rationale: sanitizeInput(raw.rationale ?? "Swapped to fit the current constraint.", 220),
      constraint: safeConstraint,
      reasoning: {
        summary: "Preserved session intent while adapting to your constraint.",
        selection: [
          "Prioritized replacements with matching movement pattern and muscle stimulus.",
        ],
        constraints: [
          "Blocked already-used replacements and duplicates in the current workout.",
        ],
        adaptations: [
          safeConstraint.toLowerCase().includes("pain")
            ? "Reduced joint stress due to pain/soreness constraint."
            : "Adjusted replacement around equipment/time constraints.",
        ],
      },
      debug: shouldDebugAdaptive()
        ? {
            pivotScoring,
            used: [...used],
            filterStats: { focusRejected, dupRejected, perceptualRejected },
          }
        : undefined,
    };

    console.log("[swap] returning LLM response", { name: response.name, setsReps: response.setsReps });
    return json(response);
  } catch (err) {
    console.error("[swap] caught error", {
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 400) : undefined,
    });
    return json(null);
  }
});
