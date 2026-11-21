// Runs the project's .venv Python interpreter with the given arguments.
// Keeps npm scripts identical on Windows, macOS and Linux.
const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const python =
  process.platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");

if (!existsSync(python)) {
  console.error(`Virtual environment Python not found at: ${python}`);
  console.error("Create it with:  python -m venv .venv  &&  npm run install:deps");
  process.exit(1);
}

const result = spawnSync(python, process.argv.slice(2), {
  cwd: root,
  stdio: "inherit",
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
