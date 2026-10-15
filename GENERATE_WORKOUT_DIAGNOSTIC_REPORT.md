# Generate-Workout Diagnostic Report

## Test Input
```json
{
  "sleep": 5,
  "energy": 4,
  "time": 20,
  "focus": "Legs",
  "soreness": 3
}
```

## Expected Behavior (Code Analysis)

### Input Processing ✓
- `sleep`: 5 → 5 (valid, no clamping needed)
- `energy`: 4 → 4 (valid, no clamping needed)
- `soreness`: 3 → 3 (valid, no clamping needed)
- `time`: 20 → 20 (valid, no clamping needed)
- `focus`: "Legs" → "Legs" (in FOCUS_LIST, no fallback)

### Readiness Detection ✓
```
LOW READINESS = true
├─ sleep < 6 (5 < 6) = true ✓
├─ energy <= 4 (4 <= 4) = true ✓
└─ soreness >= 7 (3 >= 7) = false

Result: Reduced intensity
├─ Sets: 2 (instead of 3)
└─ Reps: 10-12 (instead of 8-10)
```

### Time Rules ✓
```
time = 20 minutes
└─ Rule: < 20 min
    ├─ Max exercises: 4
    ├─ Min duration: 15 minutes
    └─ Max duration: 20 minutes
```

### Constraints for Gemini Response

The edge function sends Gemini these ABSOLUTE RULES (line 187-195):

1. **Focus MUST NOT change**: "You MUST NOT change the base session type (Legs)"
2. **Duration must be in range**: 15-20 minutes
3. **Max exercises**: Cannot exceed 4
4. **Exercise list**: Must use ONLY from pre-selected deterministic choices
5. **Output format**: Valid JSON only

### Response Validation Logic

When Gemini responds, the code (lines 291-327):

1. **Parses Gemini response** as JSON
2. **Validates exercise names** against `allowedSet` (pre-selected exercises)
3. **Clamps sets**: `clamp(sets, 2, 4, defaultSets)` where defaultSets = 2
4. **Clamps duration**: `clamp(est, 15, 20, 20)` where est is estimated time
5. **Returns response** if all exercises validated
6. **Triggers fallback** if ANY error occurs (catch block at line 394)

## Possible Failure Points

### 🔴 Failure Point 1: chooseExercises() throws error
**Location**: Line 250 in generate-workout/index.ts

```typescript
const rankedResult = chooseExercises({
  focus: "Legs",
  maxExercises: 4,
  sleep: 5,
  energy: 4,
  soreness: 3,
  // ... other params
});
```

**Issue**: If chooseExercises returns no exercises or throws an error:
- Line 264: `if (!picked.length) throw new Error("No deterministic exercises available")`
- This triggers the catch block (line 394)
- Fallback is returned: focus="Legs", duration=20, exercises=[], HTTP 500

**How to diagnose**: Check the Legs exercise pool in adaptive.ts. Does it have exercises tagged for Legs focus?

### 🔴 Failure Point 2: Gemini API call fails
**Location**: Line 269 in generate-workout/index.ts

```typescript
const raw = (await callGemini(...)) as RawPlan;
```

**Possible issues**:
- GEMINI_API_KEY not set or invalid
- Network timeout (28 second timeout)
- Rate limiting (503/429 retry up to 3 times)
- Invalid response format

**Fallback behavior**: HTTP 500 with exercises=[]

### 🔴 Failure Point 3: Gemini returns malformed JSON
**Location**: Line 72 in gemini.ts

```typescript
try {
  return JSON.parse(text);
} catch {
  throw new Error("Failed to parse Gemini JSON");
}
```

**Issue**: If Gemini returns text before/after JSON or invalid JSON, parsing fails.

**Fallback behavior**: HTTP 500 with exercises=[]

### 🔴 Failure Point 4: Gemini ignores focus constraint
**Scenario**: Gemini returns focus="Push" instead of "Legs"

**Current behavior in code**: 
- Line 360: `focus: composeFocusTitle(focus, representedEmphasis)`
- The code uses the `focus` variable (which is "Legs"), NOT what Gemini returned
- So the final response will have focus="Legs" regardless of what Gemini returned

**✓ This is SAFE** - the function doesn't trust Gemini's focus

### 🔴 Failure Point 5: Exercise name mismatches
**Location**: Lines 294-301 in generate-workout/index.ts

```typescript
const allowedSet = new Set(chosenNames.map(canonicalName));
for (const e of raw.exercises ?? []) {
  const nm = sanitizeInput(String(e.name ?? ""), 100);
  if (!nm || !allowedSet.has(canonicalName(nm))) continue; // SKIP if not in allowed set
  if (cueByName.has(canonicalName(nm))) continue; // SKIP if duplicate
  cueByName.set(canonicalName(nm), { ... });
}
```

**Issue**: If Gemini returns exercise names that don't match the pre-selected list:
- They are silently skipped (continue statement)
- Result: No exercises are added to cueByName
- Then line 303: `const exercises = picked.map((ex, i) => { ... cueByName.get(k) ... })`
- All exercises will use defaultSets and defaultReps (no AI customization)

**This is NOT a failure** - it uses fallback values. The response is still valid.

### 🔴 Failure Point 6: Duration clamping
**Location**: Line 320-324 in generate-workout/index.ts

```typescript
const est = estimateSessionMinutes(picked, exerciseSetsScheme);
const duration = clamp(est, 15, 20, 20);
```

**Issue**: If estimateSessionMinutes returns < 15 or > 20:
- The value is clamped to [15, 20]
- Result: duration will be 15-20 (always valid)

**✓ This is SAFE** - duration is guaranteed to be in bounds

## HTTP Response Structure

### Success Response (no errors)
```json
{
  "focus": "Legs",
  "duration": <15-20>,
  "rationale": "...",
  "exercises": [
    {
      "id": "g1",
      "name": "Exercise Name",
      "setsReps": "2 sets - 10-12 reps",
      "cue": "...",
      "primaryMuscle": "...",
      "movementPattern": "...",
      "estimatedTimeSec": ...,
      "fatigueCost": ...
    }
  ],
  "reasoning": { ... },
  "adaptiveNote": "...",
  "progression": { ... },
  "debug": { ... }  // Only if PIVOT_DEBUG_ADAPTIVE=true
}
```

### Fallback Response (error during processing)
```json
{
  "focus": "Legs",
  "duration": 20,
  "rationale": "Could not run full adaptation pipeline, returned a constrained Legs session.",
  "exercises": []
}
```

**HTTP Status**: 500

## Diagnostic Steps to Run Now

### Step 1: Add detailed logging to the edge function

Modify `/supabase/functions/generate-workout/index.ts` to add logging:

```typescript
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[generate-workout] START - Received request");

  let fallbackFocus = "Push";
  let fallbackRules = timeRules(45);
  let fallbackDet: ReturnType<typeof fallbackFromDeterministic> | null = null;

  try {
    const body = await req.json();
    console.log("[generate-workout] Input:", JSON.stringify(body));
    
    const sleep = clamp(body.sleep, 0, 12, 7);
    const energy = clamp(body.energy, 1, 10, 6);
    const soreness = clamp(body.soreness, 0, 10, 3);
    const time = clamp(body.time, 15, 90, 45);
    console.log(`[generate-workout] Clamped: sleep=${sleep}, energy=${energy}, soreness=${soreness}, time=${time}`);

    const focus = inferFocus(String(body.focus ?? "Push"));
    console.log(`[generate-workout] Focus: "${focus}" (from "${body.focus}")`);

    const rules = timeRules(time);
    console.log(`[generate-workout] Rules: maxEx=${rules.maxExercises}, duration=${rules.minDuration}-${rules.maxDuration}`);

    console.log("[generate-workout] Calling chooseExercises...");
    const rankedResult = chooseExercises({ ... });
    const picked = rankedResult.picked.slice(0, rules.maxExercises);
    console.log(`[generate-workout] Selected ${picked.length} exercises`);
    console.log(`[generate-workout] Exercises: ${picked.map(e => e.name).join(", ")}`);

    if (!picked.length) throw new Error("No deterministic exercises available");

    fallbackDet = fallbackFromDeterministic(focus, picked, rules, sleep, energy, soreness, emphasisForScoring);
    console.log("[generate-workout] Fallback plan created");

    console.log("[generate-workout] Calling Gemini API...");
    const raw = (await callGemini(...)) as RawPlan;
    console.log("[generate-workout] Gemini response:", JSON.stringify(raw).slice(0, 500));

    // ... rest of validation ...

    console.log("[generate-workout] SUCCESS - Returning full response");
    return json({ ... });

  } catch (err) {
    console.log("[generate-workout] ERROR:", String(err));
    if (fallbackDet) {
      console.log("[generate-workout] FALLBACK - Returning deterministic plan");
      return json(fallbackDet);
    }
    console.log("[generate-workout] FALLBACK FAILED - Returning error response");
    return json({ ... }, 500);
  }
});
```

### Step 2: Deploy and test with logging

```bash
supabase functions deploy generate-workout --no-verify-jwt
# Then call the edge function and check the logs
supabase functions logs generate-workout --tail
```

### Step 3: Check the response

Send test request:
```bash
curl -X POST https://yhowfwwxkz.supabase.co/functions/v1/generate-workout \
  -H "Content-Type: application/json" \
  -d '{
    "sleep": 5,
    "energy": 4,
    "time": 20,
    "focus": "Legs",
    "soreness": 3
  }' -v
```

Check for:
1. HTTP status code (200 = success, 500 = fallback)
2. Focus field (should be "Legs")
3. Duration field (should be 15-20)
4. Exercises array (should have items OR be empty if fallback)

### Step 4: Analyze logs

Look for:
- "Clamped:" - Did input processing work?
- "Focus:" - Did focus inference work?
- "Selected X exercises" - Did chooseExercises work?
- "Gemini response:" - What did Gemini return?
- "ERROR:" - What error was thrown?
- "FALLBACK" or "SUCCESS" - Which path was taken?

## Summary

The generate-workout function should:
1. ✓ Accept your test input without issues
2. ✓ Infer focus as "Legs"
3. ✓ Detect low readiness (sleep 5h < 6h, energy 4 <= 4)
4. ✓ Select 1-4 Legs exercises via chooseExercises()
5. ✓ Call Gemini with strict constraints
6. ✓ Return focus="Legs", duration=15-20, exercises with 2 sets/10-12 reps

If it's failing, it's likely due to:
1. **Gemini API error** (most likely)
2. **chooseExercises() returning no Legs exercises**
3. **Gemini returning malformed JSON**
4. **Network timeout**

To diagnose: **Add the logging above and deploy**.
