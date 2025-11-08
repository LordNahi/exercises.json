import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

interface ExerciseJson {
  name: string;
  force?: string | null;
  level?: string;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string;
}

async function main() {
  const exercisesDir = path.join(__dirname, "../exercises");

  if (!fs.existsSync(exercisesDir)) {
    throw new Error(`Exercises directory not found: ${exercisesDir}`);
  }

  const exerciseFolders = fs
    .readdirSync(exercisesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  console.log(`Found ${exerciseFolders.length} exercise folders`);

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const folder of exerciseFolders) {
    try {
      const exerciseFilePath = path.join(exercisesDir, folder, "exercise.json");

      if (!fs.existsSync(exerciseFilePath)) {
        console.warn(`⚠️  No exercise.json found in ${folder}`);
        skipped++;
        continue;
      }

      const fileContent = fs.readFileSync(exerciseFilePath, "utf-8");
      const exerciseData: ExerciseJson = JSON.parse(fileContent);

      // Transform instructions array to single text block
      const instructionsText = exerciseData.instructions?.length
        ? exerciseData.instructions.join("\n\n")
        : null;

      await prisma.exercise.upsert({
        where: { name: exerciseData.name },
        update: {
          primaryMuscles: exerciseData.primaryMuscles || [],
          secondaryMuscles: exerciseData.secondaryMuscles || [],
          equipment: exerciseData.equipment || null,
          category: exerciseData.category || null,
          instructions: instructionsText,
          force: exerciseData.force || null,
          mechanic: exerciseData.mechanic || null,
        },
        create: {
          name: exerciseData.name,
          primaryMuscles: exerciseData.primaryMuscles || [],
          secondaryMuscles: exerciseData.secondaryMuscles || [],
          equipment: exerciseData.equipment || null,
          category: exerciseData.category || null,
          instructions: instructionsText,
          force: exerciseData.force || null,
          mechanic: exerciseData.mechanic || null,
        },
      });

      imported++;

      // Log progress every 50 exercises
      if (imported % 50 === 0) {
        console.log(
          `✅ Imported ${imported}/${exerciseFolders.length} exercises...`
        );
      }
    } catch (error) {
      errors++;
      console.error(
        `❌ Error importing ${folder}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  console.log("\n=== Import Summary ===");
  console.log(`✅ Successfully imported: ${imported}`);
  console.log(`⚠️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total: ${exerciseFolders.length}`);
}

main()
  .catch((e) => {
    console.error("Fatal error during seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
