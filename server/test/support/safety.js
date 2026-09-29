import fs from "node:fs/promises";
import path from "node:path";

const clientSource = path.resolve(process.cwd(), "../client/src");

export async function clientSourceFiles(directory = clientSource) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await clientSourceFiles(fullPath)));
    } else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}
