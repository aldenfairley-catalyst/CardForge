import { spawnSync } from "node:child_process";

const shouldSkip = process.env.CJ_SKIP_SERVER_INSTALL === "1";

if (shouldSkip) {
  console.log("Skipping server install because CJ_SKIP_SERVER_INSTALL=1");
  process.exit(0);
}

const result = spawnSync("npm", ["run", "install:server"], { stdio: "inherit" });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
