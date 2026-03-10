const fs = require("fs");
const path = require("path");

const packageJsonPath = path.join(__dirname, "..", "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

const currentVersion = String(packageJson.version || "0.0.0").trim();
const versionParts = currentVersion.split(".").map((part) => Number.parseInt(part, 10));

if (versionParts.length !== 3 || versionParts.some((part) => !Number.isInteger(part) || part < 0)) {
  throw new Error(`Unsupported package.json version: ${currentVersion}`);
}

versionParts[2] += 1;
const nextVersion = versionParts.join(".");

packageJson.version = nextVersion;
fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

process.stdout.write(nextVersion);
