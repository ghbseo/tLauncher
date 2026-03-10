const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { rcedit } = require("rcedit");
const { generateIcons } = require("./generate-icons");

const projectRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")
);

const version = packageJson.version;
const productName = packageJson.build?.productName || "tLauncher";
const outputDir = path.join(projectRoot, "release");
const unpackedDir = path.join(outputDir, "win-unpacked");
const exePath = path.join(unpackedDir, `${productName}.exe`);
const iconPath = path.join(projectRoot, "assets", "icon.ico");
const zipPath = path.join(outputDir, `${productName}-${version}-win-x64.zip`);

function run(command, args) {
  const isCmdScript = process.platform === "win32" && command.toLowerCase().endsWith(".cmd");
  const actualCommand = isCmdScript ? "cmd.exe" : command;
  const actualArgs = isCmdScript ? ["/d", "/s", "/c", command, ...args] : args;

  const result = spawnSync(actualCommand, actualArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureMissing(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }

  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    if (process.platform !== "win32") {
      throw error;
    }

    const isDirectory = fs.statSync(targetPath).isDirectory();
    run("cmd.exe", [
      "/d",
      "/s",
      "/c",
      isDirectory ? `rmdir /s /q "${targetPath}"` : `del /f /q "${targetPath}"`,
    ]);
  }
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `${productName}-zip-`));
  const bundleDir = path.join(tempRoot, `${productName}-${version}-win-x64`);

  await generateIcons();
  run("pnpm.cmd", ["dist:win:builder"]);

  if (!fs.existsSync(exePath)) {
    throw new Error(`Built executable not found: ${exePath}`);
  }

  await rcedit(exePath, { icon: iconPath });

  fs.mkdirSync(bundleDir, { recursive: true });
  ensureMissing(zipPath);

  fs.cpSync(unpackedDir, bundleDir, { recursive: true });

  run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${bundleDir}' -DestinationPath '${zipPath}' -Force`,
  ]);

  ensureMissing(tempRoot);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
