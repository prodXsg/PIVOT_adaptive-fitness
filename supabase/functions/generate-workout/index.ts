import { callGemini, corsHeaders, json, sanitizeInput } from "../_shared/gemini.ts";
import {
  AdaptiveMemory,
  ExerciseMeta,
  chooseExercises,
  estimateSessionMinutes,
  inferFocus,
  canonicalName,
  shouldDebugAdaptive,
  parseFocusEmphasis,
  type ParsedEmphasis,
  type PrescriptionType,
} from "../_shared/adaptive.ts";

type RawPlan = {
  rationale?: string;
  exercises?: { name?: string; sets?: number; reps?: string; form_cue?: string }[];
};

function clamp(v: unknown, min: number, max: number, def: number): number {
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function timeRules(time: number) {
  if (time <= 20) return { maxExercises: 4, minDuration: 15, maxDuration: 20, label: "< 20 min" };
  if (time <= 35) return { maxExercises: 5, minDuration: 25, maxDuration: 35, label: "30 min" };
  if (time <= 50) return { maxExercises: 6, minDuration: 40, maxDuration: 50, label: "45 min" };
  if (time <= 70) return { maxExercises: 7, minDuration: 60, maxDuration: 70, label: "60 min" };
  return { maxExercises: 8, minDuration: 75, maxDuration: 85, label: "75+ min" };
}

function formatPrescription(sets: number, prescription: string, type: PrescriptionType = "reps"): string {
  switch (type) {
    case "timed":
      return `${sets} sets × ${sanitizeInput(prescription, 30)}`;
    case "distance":
      return `${sets} rounds × ${sanitizeInput(prescription, 30)}`;
    case "amrap":
      return `${sets} rounds - AMRAP`;
    case "interval":
      return `${sets} rounds × ${sanitizeInput(prescription, 30)}`;
    default:
      return `${sets} sets - ${sanitizeInput(prescription, 30)} reps`;
  }
}

function emphasisLabelFromMuscle(m: string): string {
  if (m === "core") return "Core";
  return m.slice(0, 1).toUpperCase() + m.slice(1);
}

function collectRepresentedEmphasisLabels(
  emphasis: ParsedEmphasis | null,
  picked: ExerciseMeta[],
): string[] {
  if (!emphasis) return [];
  const labels: string[] = [];
  const add = (label: string) => {
    if (!labels.includes(label)) labels.push(label);
  };
  for (const m of emphasis.muscles) {
    if (picked.some((p) => p.primaryMuscle === m)) add(emphasisLabelFromMuscle(m));
  }
  if (emphasis.rearDeltBoost && picked.some((p) => p.pivotTags.includes("rear-delt"))) add("Rear Delts");
  if (emphasis.forearmsBoost && picked.some((p) => p.movementPattern === "elbow-flexion")) add("Forearms");
  return labels;
}

function joinHumanList(parts: string[]): string {
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function composeFocusTitle(baseFocus: string, representedEmphasisLabels: string[]): string {
  if (!representedEmphasisLabels.length) return baseFocus;
  const short = representedEmphasisLabels.slice(0, 2);
  return `${baseFocus} · ${joinHumanList(short)} Emphasis`;
}

function composeAdaptiveEmphasisNote(baseFocus: string, representedEmphasisLabels: string[]): string | null {
  if (!representedEmphasisLabels.length) return null;
  return `Built around ${baseFocus} with extra focus on ${joinHumanList(representedEmphasisLabels).toLowerCase()}.`;
}

function fallbackFromDeterministic(
  focus: string,
  picked: ExerciseMeta[],
  rules: ReturnType<typeof timeRules>,
  sleep: number,
  energy: number,
  soreness: number,
  emphasis?: ParsedEmphasis | null,
) {
  const lowReadiness = sleep < 6 || energy <= 4 || soreness >= 7;
  const sets = lowReadiness ? 2 : 3;
  const reps = lowReadiness ? "10-12" : "8-10";
  const setsScheme = picked.map(() => sets);
  const estimated = estimateSessionMinutes(picked, setsScheme);
  const represented = collectRepresentedEmphasisLabels(emphasis ?? null, picked);
  const emphasisNote = composeAdaptiveEmphasisNote(focus, represented);
  return {
    focus: composeFocusTitle(focus, represented),
    duration: clamp(estimated, rules.minDuration, rules.maxDuration, rules.maxDuration),
    rationale: lowReadiness
      ? `Built around ${focus} with reduced joint stress and fatigue to match your readiness.`
      : picked.length >= 7
        ? `Full-volume ${focus} session across strength, development, and finisher phases.`
        : `Built around ${focus} with balanced movement patterns for your selected time window.`,
    exercises: picked.map((e, i) => {
      const prescType = e.prescriptionType ?? "reps";
      const prescription = (prescType !== "reps" && e.defaultPrescription) ? e.defaultPrescription : reps;
      return {
        id: `d${i + 1}`,
        name: e.name,
        setsReps: formatPrescription(sets, prescription, prescType),
        cue: undefined,
        primaryMuscle: e.primaryMuscle,
        movementPattern: e.movementPattern,
        estimatedTimeSec: e.estimatedTimeSec,
        fatigueCost: e.fatigueCost,
      };
    }),
    reasoning: {
      summary: lowReadiness
        ? "Adjusted intensity down for readiness while preserving training intent."
        : "Balanced movement patterns for the selected focus and duration.",
      selection: [
        "Selected exercises by deterministic scoring (focus, movement pattern, variety, equipment).",
      ],
      constraints: [
        `Duration constrained to ${rules.minDuration}-${rules.maxDuration} minutes.`,
        `Exercise count capped at ${rules.maxExercises}.`,
      ],
      adaptations: lowReadiness
        ? ["Reduced fatigue load due to low readiness markers."]
        : ["Kept normal training load because readiness was adequate."],
    },
    adaptiveNote: emphasisNote ?? undefined,
  };
}

function emphasisPromptFragment(e: ParsedEmphasis, baseFocus: string): string {
  const parts: string[] = [];
  for (const m of e.muscles) parts.push(m === "core" ? "abs/core" : m);
  if (e.rearDeltBoost) parts.push("rear delts");
  if (e.forearmsBoost) parts.push("forearms");
  if (!parts.length) return "";
  const safe = parts.map((p) => sanitizeInput(p, 20));
  const bf = sanitizeInput(baseFocus, 24);
  return `, with added intent toward ${safe.join(", ")}. In rationale and cues, acknowledge that direct work for those areas is intentionally included while keeping the overall ${bf} session balanced.`;
}

function buildPrompt(params: {
  focus: string;
  emphasisNote: string;
  rules: ReturnType<typeof timeRules>;
  ranked: { name: string; score: number }[];
  chosenExercises: Array<{ name: string; prescriptionType?: PrescriptionType; defaultPrescription?: string }>;
  sleep: number;
  energy: number;
  soreness: number;
  note: string;
}) {
  const rankedText = params.ranked.map((r) => `- ${r.name} (score ${r.score})`).join("\n");
  const chosenText = params.chosenExercises.map((e) => `- ${e.name}`).join("\n");
  const nonRepExercises = params.chosenExercises.filter(
    (e) => e.prescriptionType && e.prescriptionType !== "reps",
  );
  const prescriptionBlock = nonRepExercises.length > 0
    ? `\nPrescription types — use these EXACT values in the "reps" field:\n${
      nonRepExercises.map((e) =>
        `- ${e.name}: ${e.prescriptionType} — write "${e.defaultPrescription}" as the reps value. Write form cues that reference ${e.prescriptionType === "timed" ? "duration/time" : e.prescriptionType === "distance" ? "distance/load" : "effort"}, not rep counts.`
      ).join("\n")
    }`
    : "";
  const sessionStructureBlock = params.rules.maxExercises >= 7
    ? `\nSession structure guidance (${params.rules.maxExercises} exercises, ${params.rules.label}):
- Exercises 1-3: Compound strength block — primary movers, lower rep range (5-8 or 6-10), heavier intent.
- Exercises 4-5: Development block — accessory lifts and secondary movers, moderate reps (8-12).
- Exercises 6+: Finisher block — direct/isolation work, higher reps (10-15) or time-based conditioning.
Write a rationale that acknowledges this multi-phase session structure.`
    : "";
  return `ABSOLUTE RULES - FOLLOW FIRST:
1. Today's workout focus is ${params.focus}${params.emphasisNote}. You MUST NOT change the base session type (${params.focus}).
2. duration_minutes must be ${params.rules.minDuration}-${params.rules.maxDuration}.
3. Use exactly these selected exercises and preserve their order intent:
${chosenText}
4. Do not add or replace exercises outside the selected list.
5. Keep total exercises <= ${params.rules.maxExercises}.${prescriptionBlock}${sessionStructureBlock}

Ranked candidate context (already filtered/scored by backend):
${rankedText}

Readiness context:
- Sleep: ${params.sleep} hours
- Energy: ${params.energy}/10
- Soreness: ${params.soreness}/10
- Note: ${params.note || "none"}

Output only valid JSON:
{
  "rationale": "One calm sentence.",
  "exercises": [
    {
      "name": "Exact exercise name from selected list",
      "sets": 3,
      "reps": "8-10 for rep-based; use the prescribed value for timed/distance/amrap exercises",
      "form_cue": "Optional one-line cue matching the prescription type"
    }
  ]
}`;
}

function validateWorkoutAgainstConstraints(
  raw: RawPlan,
  expectedFocus: string,
  timeRules: { minDuration: number; maxDuration: number },
): boolean {
  const focusKeyword = expectedFocus.split(" ")[0].toLowerCase();
  const rationale = (raw.rationale ?? "").toLowerCase();

  if (!rationale.includes(focusKeyword)) {
    console.log("[generate] focus validation FAILED — using deterministic fallback");
    return false;
  }

  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let fallbackFocus = "Push";
  let fallbackRules = timeRules(45);
  let fallbackDet: ReturnType<typeof fallbackFromDeterministic> | null = null;

  try {
    const body = await req.json();
    const sleep = clamp(body.sleep, 0, 12, 7);
    const energy = clamp(body.energy, 1, 10, 6);
    const soreness = clamp(body.soreness, 0, 10, 3);
    const time = clamp(body.time, 15, 90, 45);
    const note = typeof body.note === "string" ? sanitizeInput(body.note, 300) : "";
    const equipmentContext = sanitizeInput(String(body.equipment ?? "Full Gym"), 60);
    const recentExercises = Array.isArray(body.recentExercises)
      ? body.recentExercises.slice(0, 60).map((x: unknown) => sanitizeInput(String(x), 120))
      : [];
    const adaptiveMemory: AdaptiveMemory = typeof body.adaptiveMemory === "object" && body.adaptiveMemory
      ? body.adaptiveMemory as AdaptiveMemory
      : {};

    const focus = inferFocus(String(body.focus ?? "Push"));
    const emphasisParsed = parseFocusEmphasis(body.focusEmphasis);
    const emphasisForScoring =
      emphasisParsed.muscles.length || emphasisParsed.rearDeltBoost || emphasisParsed.forearmsBoost
        ? emphasisParsed
        : null;
    const emphasisNote = emphasisPromptFragment(emphasisParsed, focus);
    const rules = timeRules(time);
    fallbackFocus = focus;
    fallbackRules = rules;
    const rankedResult = chooseExercises({
      focus,
      maxExercises: rules.maxExercises,
      sleep,
      energy,
      soreness,
      note,
      recentExercises,
      equipmentContext,
      memory: adaptiveMemory,
      emphasis: emphasisForScoring,
      timeMinutes: time,
    });
    const picked = rankedResult.picked.slice(0, rules.maxExercises);
    if (!picked.length) throw new Error("No deterministic exercises available");
    fallbackDet = fallbackFromDeterministic(focus, picked, rules, sleep, energy, soreness, emphasisForScoring);

    const chosenNames = picked.map((e) => e.name);
    const allowedSet = new Set(chosenNames.map(canonicalName));
    const raw = (await callGemini(
      buildPrompt({
        focus,
        emphasisNote,
        rules,
        ranked: rankedResult.ranked.map((r) => ({ name: r.ex.name, score: Math.round(r.score) })),
        chosenExercises: picked.map((e) => ({
          name: e.name,
          prescriptionType: e.prescriptionType,
          defaultPrescription: e.defaultPrescription,
        })),
        sleep,
        energy,
        soreness,
        note,
      }),
    )) as RawPlan;

    const isValidResponse = validateWorkoutAgainstConstraints(raw, focus, rules);
    if (!isValidResponse) {
      console.log("[generate] LLM response invalid — falling back to deterministic");
      return json(fallbackDet);
    }

    const lowReadiness = sleep < 6 || energy <= 4 || soreness >= 7;
    const defaultSets = lowReadiness ? 2 : 3;
    const defaultReps = lowReadiness ? "10-12" : "8-10";

    const cueByName = new Map<string, { sets: number; reps: string; cue?: string }>();
    for (const e of raw.exercises ?? []) {
      const nm = sanitizeInput(String(e.name ?? ""), 100);
      if (!nm || !allowedSet.has(canonicalName(nm))) continue;
      if (cueByName.has(canonicalName(nm))) continue;
      cueByName.set(canonicalName(nm), {
        sets: clamp(e.sets, 2, 4, defaultSets),
        reps: sanitizeInput(e.reps ?? defaultReps, 30),
        cue: e.form_cue ? sanitizeInput(e.form_cue, 160) : undefined,
      });
    }

    const exercises = picked.map((ex, i) => {
      const k = canonicalName(ex.name);
      const aiPlan = cueByName.get(k);
      const sets = aiPlan?.sets ?? defaultSets;
      const prescType = ex.prescriptionType ?? "reps";
      // For non-rep prescriptions, use the exercise's defaultPrescription rather than the AI-generated value
      const prescription = (prescType !== "reps" && ex.defaultPrescription)
        ? ex.defaultPrescription
        : (aiPlan?.reps ?? defaultReps);
      return {
        id: `g${i + 1}`,
        name: ex.name,
        setsReps: formatPrescription(sets, prescription, prescType),
        cue: aiPlan?.cue,
      };
    });

    const est = estimateSessionMinutes(
      picked,
      exercises.map((e) => clamp(Number(e.setsReps.split(" ")[0]), 2, 4, defaultSets)),
    );
    const duration = clamp(est, rules.minDuration, rules.maxDuration, rules.maxDuration);
    const representedEmphasis = collectRepresentedEmphasisLabels(emphasisForScoring, picked);
    const adaptiveEmphasisNote = composeAdaptiveEmphasisNote(focus, representedEmphasis);

    const reasoning = {
      summary: lowReadiness
        ? "Reduced fatigue load due to readiness signals while preserving workout identity."
        : picked.length >= 7
          ? "Built a full-volume session with distinct strength, development, and finisher phases."
          : "Built a balanced session aligned to focus, time, and recent history.",
      selection: picked.length >= 7
        ? [
            "Ranked exercises by focus fit, movement-pattern balance, and variety pressure.",
            "Organized into strength, development, and finisher phases for session depth.",
            "Protected against duplicate movement patterns across all phases.",
          ]
        : [
            "Ranked exercises by focus fit, movement-pattern balance, and variety pressure.",
            "Protected against duplicate movement patterns in the same session.",
          ],
      constraints: [
        `Hard duration band applied: ${rules.minDuration}-${rules.maxDuration} minutes.`,
        `Hard max exercise count applied: ${rules.maxExercises}.`,
      ],
      adaptations: [
        ...(adaptiveEmphasisNote ? [adaptiveEmphasisNote] : []),
        lowReadiness
          ? "Reduced high-fatigue/high-joint-stress choices due to low sleep/energy or high soreness."
          : "Maintained normal fatigue profile because readiness was sufficient.",
        recentExercises.length
          ? "Applied repetition penalties using recent exercise history."
          : "No repetition penalty applied (no history available).",
      ],
    };

    return json({
      focus: composeFocusTitle(focus, representedEmphasis),
      duration,
      rationale: sanitizeInput(
        raw.rationale ??
          (lowReadiness
            ? `Reduced fatigue and joint stress while preserving ${focus} training intent.`
            : `Balanced movement patterns and stimulus for your ${focus} session.`),
        240,
      ),
      exercises: exercises.map((e, i) => ({
        ...e,
        primaryMuscle: picked[i]?.primaryMuscle,
        movementPattern: picked[i]?.movementPattern,
        estimatedTimeSec: picked[i]?.estimatedTimeSec,
        fatigueCost: picked[i]?.fatigueCost,
      })),
      reasoning,
      adaptiveNote: adaptiveEmphasisNote ?? undefined,
      progression: {
        movementCoverage: picked.reduce<Record<string, number>>((acc, ex) => {
          acc[ex.movementPattern] = (acc[ex.movementPattern] ?? 0) + 1;
          return acc;
        }, {}),
      },
      debug: shouldDebugAdaptive()
        ? {
            scoring: rankedResult.debug.scoring,
            rejected: rankedResult.debug.rejected,
            durationEstimate: { estimatedMinutes: est, clampedMinutes: duration, rules },
            readiness: { sleep, energy, soreness, lowReadiness },
            penalties: { repetitionHistoryCount: recentExercises.length },
          }
        : undefined,
    });
  } catch {
    if (fallbackDet) return json(fallbackDet);
    return json({
      focus: fallbackFocus,
      duration: fallbackRules.maxDuration,
      rationale: `Could not run full adaptation pipeline, returned a constrained ${fallbackFocus} session.`,
      exercises: [],
    }, 500);
  }
});
