import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve("docs/data/version.json");
const timestamp = new Date().toISOString();

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify({
  version: timestamp,
  generatedAt: timestamp
}, null, 2)}\n`, "utf8");
