import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Only inspect public assets, never server output or local environment files.
const forbidden = ["ADMIN_PASSWORD", process.env.ADMIN_PASSWORD].filter(
  Boolean,
);
let files = 0;
function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) inspect(path);
    else {
      files++;
      const content = readFileSync(path, "utf8");
      if (forbidden.some((value) => content.includes(value))) {
        // Do not include the matched value in logs.
        throw new Error(
          `Admin credential reference found in public asset: ${path}`,
        );
      }
    }
  }
}
inspect(".next/static");
if (!files) throw new Error("No client build assets to inspect");
console.log(`Client credential check passed (${files} public assets).`);
