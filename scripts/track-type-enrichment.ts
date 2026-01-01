#!/usr/bin/env ts-node
// scripts/enrich-exercises.ts

import * as fs from "fs";
import * as path from "path";

type TrackingType =
  | "REPS_WEIGHT"
  | "REPS_BODYWEIGHT"
  | "TIME"
  | "DISTANCE_TIME";

interface Exercise {
  name: string;
  primaryMuscles: string[];
  equipment?: string;
  category: string;
  force?: string;
  trackingType?: TrackingType;
}

interface OllamaResponse {
  response: string;
}

interface ProcessResult {
  folder: string;
  exercise: Exercise;
  success: boolean;
}

// Parse CLI args
const args = process.argv.slice(2);
const countIndex = args.indexOf("-c");
const count = countIndex !== -1 ? parseInt(args[countIndex + 1]) : null;
const override = args.includes("-o");

async function callOllama(exercise: Exercise): Promise<TrackingType | null> {
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

    const data = (await response.json()) as OllamaResponse;
    const result = data.response.trim();

    // Validate response is a valid tracking type
    const validTypes: TrackingType[] = [
      "REPS_WEIGHT",
      "REPS_BODYWEIGHT",
      "TIME",
      "DISTANCE_TIME",
    ];
    if (!validTypes.includes(result as TrackingType)) {
      console.warn(
        `Invalid tracking type returned: ${result} for ${exercise.name}`,
      );
      return null;
    }

    return result as TrackingType;
  } catch (error) {
    console.error(`Error calling Ollama for ${exercise.name}:`, error);
    return null;
  }
}

async function processExercises(): Promise<void> {
  const exercisesDir = path.join(__dirname, "..", "exercises");
  const exerciseFolders = fs
    .readdirSync(exercisesDir)
    .filter((f) => fs.statSync(path.join(exercisesDir, f)).isDirectory());

  const limit = count || exerciseFolders.length;
  const toProcess = exerciseFolders.slice(0, limit);

  console.log(`Processing ${toProcess.length} exercises...`);

  const results: ProcessResult[] = [];

  for (let i = 0; i < toProcess.length; i++) {
    const folder = toProcess[i];
    const exercisePath = path.join(exercisesDir, folder, "exercise.json");

    if (!fs.existsSync(exercisePath)) {
      console.warn(`No exercise.json found in ${folder}`);
      continue;
    }

    const exercise: Exercise = JSON.parse(
      fs.readFileSync(exercisePath, "utf8"),
    );
    console.log(`[${i + 1}/${toProcess.length}] Processing: ${exercise.name}`);

    const trackingType = await callOllama(exercise);

    if (trackingType) {
      exercise.trackingType = trackingType;
      results.push({ folder, exercise, success: true });

      // Determine output path based on override flag
      const outputPath = override
        ? exercisePath
        : path.join(exercisesDir, folder, "enriched.json");

      fs.writeFileSync(outputPath, JSON.stringify(exercise, null, 2));
    } else {
      results.push({ folder, exercise, success: false });
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Summary
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log(`\nComplete: ${successful} successful, ${failed} failed`);

  if (override) {
    console.log(`Updated ${successful} exercise.json files directly`);
  } else {
    console.log(`Created ${successful} enriched.json files`);
  }

  if (failed > 0) {
    console.log("\nFailed exercises:");
    results
      .filter((r) => !r.success)
      .forEach((r) => {
        console.log(`  - ${r.exercise.name} (${r.folder})`);
      });
  }
}

processExercises().catch(console.error);
