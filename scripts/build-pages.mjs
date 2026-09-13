#!/usr/bin/env node
/**
 * Static GitHub Pages build. TanStack Start SPA mode emits dist/client/_shell.html
 * instead of index.html; Pages needs index.html + 404.html at the artifact root.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "dist", "client");

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, PAGES: "1" },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited ${code}`));
    });
  });
}

await run("node", [join(root, "scripts", "with-app-env.mjs"), "vite", "build"]);

const shell = readFileSync(join(clientDir, "_shell.html"));
const html = Buffer.from(
  shell
    .filter((b) => b !== 0)
    .toString("utf8")
    .replaceAll("/./", "./"),
);
writeFileSync(join(clientDir, "index.html"), html);
writeFileSync(join(clientDir, "404.html"), html);
writeFileSync(join(clientDir, ".nojekyll"), "");
console.log("[pages] wrote index.html, 404.html, .nojekyll");
