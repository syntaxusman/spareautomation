import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assetsDirectory = path.resolve("dist/client/assets");
const maximumChunkBytes = 500 * 1024;
const entries = await readdir(assetsDirectory);
const javascriptChunks = await Promise.all(
  entries
    .filter((entry) => entry.endsWith(".js"))
    .map(async (entry) => ({
      entry,
      bytes: (await stat(path.join(assetsDirectory, entry))).size,
    })),
);

const oversized = javascriptChunks.filter((chunk) => chunk.bytes > maximumChunkBytes);
const largest = javascriptChunks.toSorted((a, b) => b.bytes - a.bytes)[0];

if (largest) {
  console.log(
    `Largest client chunk: ${largest.entry} (${(largest.bytes / 1024).toFixed(2)} KiB; budget 500 KiB)`,
  );
}

if (oversized.length > 0) {
  for (const chunk of oversized) {
    console.error(`Bundle budget exceeded: ${chunk.entry} is ${(chunk.bytes / 1024).toFixed(2)} KiB.`);
  }
  process.exitCode = 1;
}
