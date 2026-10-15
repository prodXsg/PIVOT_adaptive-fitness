/**
 * Diagnostic test script for generate-workout edge function
 * Calls the actual Gemini API and validates response constraints
 */

import { readFileSync } from "fs";
import { join } from "path";

// =============================================================================
// CONFIGURATION
// =============================================================================

// Get GEMINI_API_KEY from environment or Supabase secrets file
function getGeminiApiKey(): string {
  let apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    // Try to read from supabase/.temp/linked-project.json or other local config
    try {
      const linkedProject = JSON.parse(
        readFileSync(
          join(process.cwd(), "supabase/.temp/linked-project.json"),
          "utf-8"
        )
      );
      console.log(
        "[INFO] Linked project found:",
        linkedProject.project_id || "unknown"
      );
      // Note: secrets cannot be read from local files, must use env var
    } catch (e) {
      // File doesn't exist or is not JSON
    }
  }

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY not found. Set it with: export GEMINI_API_KEY=your_key"
    );
  }

  return apiKey;
}

// =============================================================================
// EXTRACTED LOGIC FROM EDGE FUNCTION
// =============================================================================

interface TimeRules {
  maxExercises: number;
  minDuration: number;
  maxDuration: number;
  label: string;
}

function timeRules(time: number): TimeRules {
  if (time <= 20)
    return { maxExercises: 4, minDuration: 15, maxDuration: 20, label: "< 20 min" };
  if (time <= 35)
    return { maxExercises: 5, minDuration: 25, maxDuration: 35, label: "30 min" };
  if (time <= 50)
    return { maxExercises: 6, minDuration: 40, maxDuration: 50, label: "45 min" };
  if (time <= 70)
    return { maxExercises: 7, minDuration: 60, maxDuration: 70, label: "60 min" };
  return { maxExercises: 8, minDuration: 75, maxDuration: 85, label: "75+ min" };
}

function clamp(v: unknown, min: number, max: number, def: number): number {
  const n = Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function sanitizeInput(s: string, maxLen = 500): string {
  return s
    .trim()
    .replace(/[{}\\\[\]`<>]/g, "")
    .slice(0, maxLen);
}

async function callGemini(combinedPrompt: string, apiKey: string): Promise<unknown> {
  const GEMINI_URL =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const body = JSON.stringify({
    contents: [{ parts: [{ text: combinedPrompt }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
    },
  });

  let res: Response | null = null;
  let lastErrText = "";

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 28000);

      res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) break;
      lastErrText = await res.text();
      if (res.status !== 503 && res.status !== 429) break;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
      }
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 600 * attempt));
    }
  }

  if (!res || !res.ok) {
    throw new Error(`Gemini ${res?.status ?? "no-response"}: ${lastErrText.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("No text in Gemini response");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Failed to parse Gemini JSON");
  }
}

// =============================================================================
// TEST SCRIPT
// =============================================================================

async function testGenerateWorkout() {
  console.log("\n" + "=".repeat(80));
  console.log("GENERATE-WORKOUT DIAGNOSTIC TEST");
  console.log("=".repeat(80));

  const testInput = {
    sleep: 5,
    energy: 4,
    time: 20,
    focus: "Legs",
    soreness: 3,
  };

  console.log("\n[INPUT]");
  console.log(JSON.stringify(testInput, null, 2));

  // Validate input
  const sleep = clamp(testInput.sleep, 0, 12, 7);
  const energy = clamp(testInput.energy, 1, 10, 6);
  const soreness = clamp(testInput.soreness, 0, 10, 3);
  const time = clamp(testInput.time, 15, 90, 45);
  const focus = sanitizeInput(String(testInput.focus));
  const rules = timeRules(time);

  console.log("\n[CLAMPED INPUT]");
  console.log({ sleep, energy, soreness, time, focus });

  console.log("\n[TIME RULES]");
  console.log(
    `  - Min duration: ${rules.minDuration} min, Max: ${rules.maxDuration} min`
  );
  console.log(`  - Max exercises: ${rules.maxExercises}`);
  console.log(`  - Label: ${rules.label}`);

  const lowReadiness = sleep < 6 || energy <= 4 || soreness >= 7;
  console.log(`\n[READINESS CHECK]`);
  console.log(`  - Sleep ${sleep}h < 6h: ${sleep < 6}`);
  console.log(`  - Energy ${energy}/10 <= 4: ${energy <= 4}`);
  console.log(`  - Soreness ${soreness}/10 >= 7: ${soreness >= 7}`);
  console.log(`  - Low readiness: ${lowReadiness}`);

  // Build a simplified prompt (mimicking the actual function)
  // For this diagnostic, we'll use a simpler prompt
  const prompt = `You are a workout generator. The user wants a ${focus} workout.

Readiness context:
- Sleep: ${sleep} hours
- Energy: ${energy}/10
- Soreness: ${soreness}/10

Duration: ${rules.minDuration}-${rules.maxDuration} minutes
Max exercises: ${rules.maxExercises}

CRITICAL: You MUST output ONLY valid JSON, nothing else. The focus MUST remain "${focus}". Duration must be between ${rules.minDuration} and ${rules.maxDuration} minutes.

Output format:
{
  "focus": "${focus}",
  "duration_minutes": <number between ${rules.minDuration} and ${rules.maxDuration}>,
  "rationale": "One sentence explanation",
  "exercises": [
    {
      "name": "Exercise name",
      "sets": 3,
      "reps": "8-10 or time-based prescription",
      "form_cue": "Optional cue"
    }
  ]
}`;

  console.log("\n[GEMINI PROMPT]");
  console.log(prompt);
  console.log("\n" + "-".repeat(80));

  // Call Gemini
  let response: any = null;
  let geminiRawText = "";

  try {
    const apiKey = getGeminiApiKey();
    console.log("\n[CALLING GEMINI API...]");
    console.log(`  Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`);

    response = await callGemini(prompt, apiKey);
    console.log("\n✓ Gemini API call succeeded\n");
  } catch (error) {
    console.error("\n✗ GEMINI API CALL FAILED");
    console.error(error);
    process.exit(1);
  }

  console.log("[GEMINI RESPONSE (RAW)]");
  console.log(JSON.stringify(response, null, 2));

  // =============================================================================
  // VALIDATION
  // =============================================================================

  console.log("\n" + "=".repeat(80));
  console.log("CONSTRAINT VALIDATION");
  console.log("=".repeat(80));

  let violations: string[] = [];

  // Check focus
  const responseFocus = response.focus || "";
  const focusMatch =
    responseFocus.toLowerCase().includes("leg") ||
    responseFocus.toLowerCase().includes(focus.toLowerCase());
  console.log(`\n[FOCUS CONSTRAINT]`);
  console.log(`  Expected: Contains "${focus}"`);
  console.log(`  Got: "${responseFocus}"`);
  console.log(`  Status: ${focusMatch ? "✓ PASS" : "✗ FAIL"}`);
  if (!focusMatch) violations.push(`Focus mismatch: expected "${focus}", got "${responseFocus}"`);

  // Check duration
  const duration = response.duration_minutes || response.duration || 0;
  const durationValid = duration >= rules.minDuration && duration <= rules.maxDuration;
  console.log(`\n[DURATION CONSTRAINT]`);
  console.log(`  Expected: ${rules.minDuration}-${rules.maxDuration} minutes`);
  console.log(`  Got: ${duration} minutes`);
  console.log(`  Status: ${durationValid ? "✓ PASS" : "✗ FAIL"}`);
  if (!durationValid) {
    violations.push(
      `Duration out of bounds: ${duration} not in [${rules.minDuration}, ${rules.maxDuration}]`
    );
  }

  // Check exercise count
  const exercises = response.exercises || [];
  const exerciseCountValid = exercises.length >= 1 && exercises.length <= rules.maxExercises;
  console.log(`\n[EXERCISE COUNT CONSTRAINT]`);
  console.log(`  Expected: 1-${rules.maxExercises} exercises`);
  console.log(`  Got: ${exercises.length} exercises`);
  console.log(`  Status: ${exerciseCountValid ? "✓ PASS" : "✗ FAIL"}`);
  if (!exerciseCountValid) {
    violations.push(
      `Exercise count invalid: ${exercises.length} not in [1, ${rules.maxExercises}]`
    );
  }

  // Log exercises
  if (exercises.length > 0) {
    console.log(`\n[EXERCISES]`);
    exercises.forEach((ex: any, i: number) => {
      console.log(`  ${i + 1}. ${ex.name} - ${ex.sets} sets × ${ex.reps}`);
      if (ex.form_cue) console.log(`     Cue: ${ex.form_cue}`);
    });
  }

  // =============================================================================
  // SUMMARY
  // =============================================================================

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  if (violations.length === 0) {
    console.log("\n✓ ALL CONSTRAINTS PASSED");
    console.log("\nResponse would be ACCEPTED by edge function.");
  } else {
    console.log("\n✗ CONSTRAINT VIOLATIONS DETECTED:");
    violations.forEach((v) => console.log(`  - ${v}`));
    console.log("\nResponse would TRIGGER FALLBACK in edge function.");
  }

  console.log("\n[WOULD FALLBACK TRIGGER?]");
  const wouldFallback =
    violations.length > 0 ||
    !response ||
    !response.exercises ||
    response.exercises.length === 0;
  console.log(`  ${wouldFallback ? "YES" : "NO"}`);

  if (wouldFallback && response) {
    const fallbackFocus = response.focus || focus;
    const fallbackDuration = response.duration || rules.maxDuration;
    console.log(`\n[FALLBACK DETAILS]`);
    console.log(`  Focus: ${fallbackFocus}`);
    console.log(`  Duration: ${fallbackDuration}min`);
    console.log(`  Exercises: 0 (deterministic selection only, no Gemini)`);
    console.log(`  Rationale: "Could not run full adaptation pipeline..."`);
  }

  console.log("\n" + "=".repeat(80) + "\n");

  process.exit(violations.length > 0 ? 1 : 0);
}

// Run test
testGenerateWorkout().catch((error) => {
  console.error("\nTest script failed:", error);
  process.exit(1);
});
