const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourceRoot = path.resolve(__dirname, '../server/src');

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? collectJavaScriptFiles(entryPath)
      : entry.name.endsWith('.js')
        ? [entryPath]
        : [];
  });
}

const files = collectJavaScriptFiles(sourceRoot);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Server JavaScript syntax OK (${files.length} files)`);