// scripts/test-enrichment.ts

import * as fs from "fs";
import * as path from "path";

interface TestCase {
  exerciseName: string;
  expected: string;
}

const testCases: TestCase[] = [
  { exerciseName: "Barbell Squat", expected: "REPS_WEIGHT" },
  { exerciseName: "Plank", expected: "TIME" },
  { exerciseName: "Push-Up", expected: "REPS_BODYWEIGHT" },
  { exerciseName: "3/4 Sit-Up", expected: "REPS_BODYWEIGHT" },
  // Add more as you find exercises to test
];

async function callOllama(exercise: any): Promise<string | null> {
  const prompt = `Given this exercise data, return ONLY the tracking type enum.

Exercise: ${exercise.name}
Primary Muscles: ${JSON.stringify(exercise.primaryMuscles)}
Equipment: ${exercise.equipment || "none"}
Category: ${exercise.category}
Force: ${exercise.force || "none"}

Valid tracking types:
- REPS_WEIGHT (exercises with external weight: barbells, dumbbells, machines, cables)
- REPS_BODYWEIGHT (bodyweight exercises counted by reps: pushups, pullups, dips)
- TIME (isometric holds or timed exercises: plank, wall sit, stretching)
- DISTANCE_TIME (cardio with distance/duration: running, rowing, cycling)

Rules:
- If equipment involves weights (barbell, dumbbell, machine, cable) → REPS_WEIGHT
- If category is 'cardio' → DISTANCE_TIME
- If category is 'stretching' → TIME
- If exercise name contains 'plank', 'hold', 'bridge' → TIME
- If equipment is 'body only' and not timed → REPS_BODYWEIGHT

Return only the enum value, no explanation.`;

  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen2.5:7b",
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0,
        },
      }),
    });

    const data = (await response.json()) as { response: string };
    return data.response.trim();
  } catch (error) {
    console.error(`Error calling Ollama:`, error);
    return null;
  }
}

function findExerciseFolder(
  exerciseName: string,
  exercisesDir: string,
): string | null {
  const folders = fs
    .readdirSync(exercisesDir)
    .filter((f) => fs.statSync(path.join(exercisesDir, f)).isDirectory());

  for (const folder of folders) {
    const exercisePath = path.join(exercisesDir, folder, "exercise.json");
    if (fs.existsSync(exercisePath)) {
      const exercise = JSON.parse(fs.readFileSync(exercisePath, "utf8"));
      if (exercise.name === exerciseName) {
        return folder;
      }
    }
  }

  return null;
}

async function runTests(): Promise<void> {
  const exercisesDir = path.join(__dirname, "..", "exercises");

  console.log(`Running ${testCases.length} test cases...\n`);

  let passed = 0;
  let failed = 0;
  let notFound = 0;

  for (const testCase of testCases) {
    const folder = findExerciseFolder(testCase.exerciseName, exercisesDir);

    if (!folder) {
      console.log(`✗ NOT FOUND: ${testCase.exerciseName}`);
      notFound++;
      continue;
    }

    const exercisePath = path.join(exercisesDir, folder, "exercise.json");
    const exercise = JSON.parse(fs.readFileSync(exercisePath, "utf8"));

    const result = await callOllama(exercise);

    if (result === testCase.expected) {
      console.log(`✓ PASS: ${testCase.exerciseName}`);
      passed++;
    } else {
      console.log(`✗ FAIL: ${testCase.exerciseName}`);
      console.log(`  Expected: ${testCase.expected}`);
      console.log(`  Got: ${result}`);
      failed++;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  console.log(`\n${passed} passed, ${failed} failed, ${notFound} not found`);

  if (failed > 0 || notFound > 0) {
    process.exit(1);
  }
}

runTests().catch(console.error);
