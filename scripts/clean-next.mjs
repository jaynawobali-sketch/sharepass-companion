import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const requestedDirs = process.argv.slice(2);
const distDirs = requestedDirs.length > 0 ? requestedDirs : [".next", ".next-dev"];

for (const distDir of distDirs) {
  const nextDir = join(process.cwd(), distDir);

  if (!existsSync(nextDir)) {
    continue;
  }

  rmSync(nextDir, { recursive: true, force: true });
  console.log(`Cleared ${distDir} before starting Next.js.`);
}
