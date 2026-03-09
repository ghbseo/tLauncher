const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { app } = require("electron");
const { TextDecoder } = require("util");

const LOG_EVENT = "launcher:run-log";
const DEFAULT_PROFILE_ID = "default";
const activeRuns = new Map();

function getAppDataDir() {
  return path.join(app.getPath("userData"), "launcher-data");
}

function getRunsDir() {
  return path.join(getAppDataDir(), "runs");
}

function getProfileStorePath() {
  return path.join(getAppDataDir(), "profiles.json");
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore cleanup failures for transient run artifacts.
  }
}

function cleanupRunArtifacts({ keepLogPath = "" } = {}) {
  const runsDir = getRunsDir();
  if (!fs.existsSync(runsDir)) {
    return;
  }

  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const fileName = entry.name;
    const filePath = path.join(runsDir, fileName);
    const isRunLog = /^run-.*\.log$/i.test(fileName);
    const isRunBatch = /^run-.*\.bat$/i.test(fileName);
    const isTomcatRunner = /^tomcat-runner-.*\.bat$/i.test(fileName);

    if (isRunBatch || isTomcatRunner) {
      safeUnlink(filePath);
      continue;
    }

    if (isRunLog && filePath !== keepLogPath) {
      safeUnlink(filePath);
    }
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getDefaultFormState() {
  return {
    profileId: "",
    profileName: "",
    profileDescription: "",
    projectDir: "",
    tomcatHome: "",
    tomcatBase: "",
    mavenPath: "",
    buildCommand: "clean package",
    tomcatOptions: "-Dfile.encoding=UTF-8"
  };
}

function normalizeBuildCommand(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }

  return raw.replace(/^(?:"[^"]*mvn(?:w)?(?:\.cmd|\.bat|\.ps1|\.exe)?"|mvn(?:w)?(?:\.cmd|\.bat|\.ps1|\.exe)?)\s+/i, "");
}

function normalizeTomcatOptions(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "-Dfile.encoding=UTF-8";
  }

  return raw.replace(/file\.encofing/gi, "file.encoding");
}

function normalizeFormState(input = {}) {
  const defaults = getDefaultFormState();

  return {
    profileId: String(input.profileId ?? defaults.profileId).trim(),
    profileName: String(input.profileName ?? defaults.profileName).trim(),
    profileDescription: String(input.profileDescription ?? defaults.profileDescription).trim(),
    projectDir: String(input.projectDir ?? defaults.projectDir).trim(),
    tomcatHome: String(input.tomcatHome ?? defaults.tomcatHome).trim(),
    tomcatBase: String(input.tomcatBase ?? defaults.tomcatBase).trim(),
    mavenPath: String(input.mavenPath ?? defaults.mavenPath).trim(),
    buildCommand: normalizeBuildCommand(input.buildCommand ?? defaults.buildCommand),
    tomcatOptions: normalizeTomcatOptions(input.tomcatOptions ?? defaults.tomcatOptions)
  };
}

function normalizeStoredProfile(input = {}) {
  const normalized = normalizeFormState(input);
  const profileId = String(input.id || normalized.profileId || `${DEFAULT_PROFILE_ID}-${Date.now()}`).trim();
  const profileName = String(input.name || normalized.profileName || "Profile").trim();
  const profileDescription = String(input.description || normalized.profileDescription || "").trim();

  return {
    ...normalized,
    id: profileId,
    name: profileName,
    description: profileDescription,
    profileId,
    profileName,
    profileDescription,
    updatedAt: String(input.updatedAt || "")
  };
}

function createEmptyProfileStore() {
  return {
    currentProfileId: "",
    profiles: []
  };
}

function loadProfileStore() {
  ensureDir(getAppDataDir());

  const storePath = getProfileStorePath();
  if (!fs.existsSync(storePath)) {
    return createEmptyProfileStore();
  }

  try {
    const raw = fs.readFileSync(storePath, "utf8");
    const parsed = JSON.parse(raw);
    const profiles = Array.isArray(parsed.profiles)
      ? parsed.profiles.map((profile) => normalizeStoredProfile(profile))
      : [];
    return {
      currentProfileId: parsed.currentProfileId || "",
      profiles
    };
  } catch {
    return createEmptyProfileStore();
  }
}

function writeProfileStore(store) {
  ensureDir(getAppDataDir());
  fs.writeFileSync(getProfileStorePath(), JSON.stringify(store, null, 2), "utf8");
  return store;
}

function saveCurrentProfile(formState) {
  const normalized = normalizeFormState(formState);
  const store = loadProfileStore();
  const now = new Date().toISOString();
  const profileId = normalized.profileId || `${DEFAULT_PROFILE_ID}-${Date.now()}`;
  const profileName = normalized.profileName || `Profile ${store.profiles.length + 1}`;
  const profile = {
    id: profileId,
    name: profileName,
    description: normalized.profileDescription,
    ...normalized,
    profileId,
    profileName,
    profileDescription: normalized.profileDescription,
    updatedAt: now
  };

  const nextProfiles = store.profiles.filter((item) => item.id !== profileId);
  nextProfiles.unshift(profile);

  return writeProfileStore({
    currentProfileId: profileId,
    profiles: nextProfiles
  });
}

function createProfile() {
  const store = loadProfileStore();
  const nextIndex = store.profiles.length + 1;
  const profileId = `${DEFAULT_PROFILE_ID}-${Date.now()}`;
  const profile = {
    ...getDefaultFormState(),
    profileId,
    profileName: `Profile ${nextIndex}`,
    profileDescription: "",
    id: profileId,
    name: `Profile ${nextIndex}`,
    description: "",
    updatedAt: new Date().toISOString()
  };

  return writeProfileStore({
    currentProfileId: profileId,
    profiles: [profile, ...store.profiles]
  });
}

function selectProfile(profileId) {
  const store = loadProfileStore();
  if (!store.profiles.some((item) => item.id === profileId)) {
    return store;
  }

  return writeProfileStore({
    ...store,
    currentProfileId: profileId
  });
}

function deleteProfile(profileId) {
  const store = loadProfileStore();
  const nextProfiles = store.profiles.filter((item) => item.id !== profileId);
  const currentProfileId =
    store.currentProfileId === profileId ? (nextProfiles[0]?.id || "") : store.currentProfileId;

  return writeProfileStore({
    currentProfileId,
    profiles: nextProfiles
  });
}

function getCurrentProfile(store) {
  const currentId = store.currentProfileId || "";
  return (
    store.profiles.find((item) => item.id === currentId) ||
    store.profiles[0] ||
    null
  );
}

function extractServerSummary(xmlText) {
  const portMatches = Array.from(xmlText.matchAll(/Connector[^>]*port="(\d+)"/gi)).slice(0, 3);
  if (portMatches.length === 0) {
    return "Connector port를 찾지 못했습니다.";
  }

  return `Connector port: ${portMatches.map((match) => match[1]).join(", ")}`;
}

function extractWebSummary(xmlText) {
  const displayName = xmlText.match(/<display-name>([^<]+)<\/display-name>/i)?.[1]?.trim();
  return displayName ? `display-name: ${displayName}` : "display-name을 찾지 못했습니다.";
}

function extractContextSummary(xmlText) {
  const pathValue = xmlText.match(/\spath="([^"]*)"/i)?.[1];
  const docBase = xmlText.match(/\sdocBase="([^"]*)"/i)?.[1];
  const parts = [];

  if (pathValue !== undefined) {
    parts.push(`path: ${pathValue || "/"}`);
  }

  if (docBase) {
    parts.push(`docBase: ${docBase}`);
  }

  return parts.length > 0 ? parts.join(", ") : "context 주요 속성을 찾지 못했습니다.";
}

function inspectConfig(formState) {
  const normalized = normalizeFormState(formState);
  if (!normalized.tomcatBase) {
    return {
      ok: false,
      files: [
        { name: "server.xml", exists: false, readable: false, summary: "" },
        { name: "web.xml", exists: false, readable: false, summary: "" },
        { name: "context.xml", exists: false, readable: false, summary: "" }
      ],
      warnings: ["Tomcat Base를 입력하세요."]
    };
  }

  const confDir = path.join(normalized.tomcatBase, "conf");
  const fileNames = ["server.xml", "web.xml", "context.xml"];
  const warnings = [];

  const files = fileNames.map((name) => {
    const filePath = path.join(confDir, name);
    const exists = fs.existsSync(filePath);

    if (!exists) {
      warnings.push(`${name} 파일이 없습니다.`);
      return {
        name,
        exists: false,
        readable: false,
        summary: ""
      };
    }

    try {
      const text = fs.readFileSync(filePath, "utf8");
      let summary = "";

      if (name === "server.xml") {
        summary = extractServerSummary(text);
      } else if (name === "web.xml") {
        summary = extractWebSummary(text);
      } else if (name === "context.xml") {
        summary = extractContextSummary(text);
      }

      return {
        name,
        exists: true,
        readable: true,
        summary
      };
    } catch (error) {
      warnings.push(`${name} 읽기 실패: ${error.message}`);
      return {
        name,
        exists: true,
        readable: false,
        summary: ""
      };
    }
  });

  return {
    ok: warnings.length === 0,
    files,
    warnings
  };
}

function validateFormState(formState) {
  const normalized = normalizeFormState(formState);
  const errors = [];

  if (!normalized.projectDir) {
    errors.push("Project Directory를 입력하세요.");
  }

  if (!normalized.tomcatHome) {
    errors.push("Tomcat Home을 입력하세요.");
  }

  if (!normalized.tomcatBase) {
    errors.push("Tomcat Base를 입력하세요.");
  }

  if (!normalized.buildCommand) {
    errors.push("Build Command를 입력하세요.");
  }

  if (!normalized.mavenPath) {
    errors.push("Maven Path를 입력하세요.");
  }

  if (normalized.projectDir && !fs.existsSync(normalized.projectDir)) {
    errors.push("Project Directory가 존재하지 않습니다.");
  }

  if (normalized.tomcatHome && !fs.existsSync(normalized.tomcatHome)) {
    errors.push("Tomcat Home이 존재하지 않습니다.");
  }

  if (normalized.tomcatBase && !fs.existsSync(normalized.tomcatBase)) {
    errors.push("Tomcat Base가 존재하지 않습니다.");
  }

  if (normalized.mavenPath && !fs.existsSync(normalized.mavenPath)) {
    errors.push("Maven Path가 존재하지 않습니다.");
  }

  if (
    normalized.mavenPath &&
    path.basename(normalized.mavenPath).toLowerCase() !== "mvn.cmd"
  ) {
    errors.push("Maven Path는 mvn.cmd 파일이어야 합니다.");
  }

  if (normalized.tomcatHome) {
    const catalinaPath = path.join(normalized.tomcatHome, "bin", "catalina.bat");
    if (!fs.existsSync(catalinaPath)) {
      errors.push("Tomcat Home 아래 bin\\catalina.bat 파일이 없습니다.");
    }
  }

  const configResult = inspectConfig(normalized);
  if (!configResult.ok) {
    errors.push(...configResult.warnings);
  }

  const deployDir = path.join(normalized.tomcatBase, "gtapps");
  if (!fs.existsSync(deployDir)) {
    errors.push("Tomcat Base 아래 gtapps 폴더가 없습니다.");
  }

  return {
    ok: errors.length === 0,
    errors,
    deployDir,
    configResult,
    formState: normalized
  };
}

function escapeBatchValue(value) {
  return String(value).replace(/%/g, "%%");
}

function buildBatchScript(formState, tomcatRunnerFileName) {
  const projectDir = escapeBatchValue(formState.projectDir);
  const tomcatHome = escapeBatchValue(formState.tomcatHome);
  const tomcatBase = escapeBatchValue(formState.tomcatBase);
  const mavenPath = escapeBatchValue(formState.mavenPath);
  const buildCommand = escapeBatchValue(formState.buildCommand);
  const tomcatOptions = escapeBatchValue(formState.tomcatOptions);
  const deployFileName = "ROOT.war";
  const tomcatRunnerName = escapeBatchValue(tomcatRunnerFileName);
  const runtimeOptions = escapeBatchValue(
    normalizeTomcatOptions(`${formState.tomcatOptions} -Dsun.stdout.encoding=UTF-8 -Dsun.stderr.encoding=UTF-8`)
  );

  return [
    "@echo off",
    "setlocal EnableExtensions DisableDelayedExpansion",
    `set "PROJECT_DIR=${projectDir}"`,
    `set "TOMCAT_HOME=${tomcatHome}"`,
    `set "TOMCAT_BASE=${tomcatBase}"`,
    `set "MAVEN_PATH=${mavenPath}"`,
    `set "BUILD_COMMAND=${buildCommand}"`,
    `set "TOMCAT_OPTIONS=${tomcatOptions}"`,
    `set "TOMCAT_RUNTIME_OPTIONS=${runtimeOptions}"`,
    "",
    'echo [STAGE] validation',
    'if not exist "%PROJECT_DIR%" echo [ERROR] Project Directory not found. & exit /b 11',
    'if not exist "%TOMCAT_HOME%\\bin\\catalina.bat" echo [ERROR] Tomcat Home is invalid. & exit /b 12',
    'if not exist "%TOMCAT_BASE%\\conf\\server.xml" echo [ERROR] server.xml not found. & exit /b 13',
    'if not exist "%TOMCAT_BASE%\\conf\\web.xml" echo [ERROR] web.xml not found. & exit /b 14',
    'if not exist "%TOMCAT_BASE%\\conf\\context.xml" echo [ERROR] context.xml not found. & exit /b 15',
    'if not exist "%TOMCAT_BASE%\\gtapps" echo [ERROR] gtapps not found. & exit /b 16',
    'if not exist "%MAVEN_PATH%" echo [ERROR] Maven Path not found. & exit /b 17',
    "",
    'cd /d "%PROJECT_DIR%"',
    "",
    'echo [STAGE] cleanup',
    'if exist "target" rmdir /s /q "target"',
    'if exist "%TOMCAT_BASE%\\gtapps\\*" del /q "%TOMCAT_BASE%\\gtapps\\*" >nul 2>&1',
    'for /d %%d in ("%TOMCAT_BASE%\\gtapps\\*") do rmdir /s /q "%%~fd"',
    "",
    'echo [STAGE] build',
    'call "%MAVEN_PATH%" %BUILD_COMMAND%',
    "if errorlevel 1 (",
    "  echo [ERROR] Build command failed.",
    "  exit /b 21",
    ")",
    "",
    'echo [STAGE] war-detect',
    'set "WAR_COUNT=0"',
    'set "WAR_FILE="',
    'for %%f in ("target\\*.war") do (',
    '  set /a WAR_COUNT+=1',
    '  call set "WAR_FILE=%%~ff"',
    ")",
    'if "%WAR_COUNT%"=="0" echo [ERROR] No WAR file found. & exit /b 22',
    'if not "%WAR_COUNT%"=="1" echo [ERROR] Multiple WAR files found. & exit /b 23',
    'echo [INFO] WAR file: %WAR_FILE%',
    `echo [INFO] Deploy file: ${deployFileName}`,
    "",
    'echo [STAGE] deploy',
    `copy /Y "%WAR_FILE%" "%TOMCAT_BASE%\\gtapps\\${deployFileName}" >nul`,
    "if errorlevel 1 (",
    "  echo [ERROR] WAR copy failed.",
    "  exit /b 24",
    ")",
    "",
    'echo [STAGE] tomcat-start',
    'set "CATALINA_HOME=%TOMCAT_HOME%"',
    'set "CATALINA_BASE=%TOMCAT_BASE%"',
    'set "CATALINA_OPTS=%TOMCAT_RUNTIME_OPTIONS%"',
    `set "TOMCAT_RUNNER=%~dp0${tomcatRunnerName}"`,
    'start "Tomcat" "%TOMCAT_RUNNER%"',
    "if errorlevel 1 (",
    "  echo [ERROR] Tomcat start failed.",
    "  exit /b 25",
    ")",
    "",
    "echo [INFO] Run completed.",
    "exit /b 0",
    ""
  ].join("\r\n");
}

function prepareRun(formState) {
  const validation = validateFormState(formState);
  if (!validation.ok) {
    const error = new Error(validation.errors.join("\n"));
    error.validationErrors = validation.errors;
    throw error;
  }

  ensureDir(getRunsDir());
  cleanupRunArtifacts();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const batPath = path.join(getRunsDir(), `run-${timestamp}.bat`);
  const logPath = path.join(getRunsDir(), `run-${timestamp}.log`);
  const tomcatRunnerFileName = `tomcat-runner-${timestamp}.bat`;
  const tomcatRunnerPath = path.join(getRunsDir(), tomcatRunnerFileName);
  const script = buildBatchScript(validation.formState, tomcatRunnerFileName);
  const tomcatRunnerScript = [
    "@echo off",
    "setlocal",
    "chcp 65001 >nul",
    'call "%CATALINA_HOME%\\bin\\catalina.bat" run',
    "endlocal",
    ""
  ].join("\r\n");

  fs.writeFileSync(batPath, script, "utf8");
  fs.writeFileSync(logPath, "", "utf8");
  fs.writeFileSync(tomcatRunnerPath, tomcatRunnerScript, "utf8");

  return {
    batPath,
    logPath,
    tomcatRunnerPath,
    summary: {
      projectDir: validation.formState.projectDir,
      tomcatHome: validation.formState.tomcatHome,
      tomcatBase: validation.formState.tomcatBase,
      mavenPath: validation.formState.mavenPath,
      buildCommand: validation.formState.buildCommand,
      tomcatOptions: validation.formState.tomcatOptions,
      deployDir: validation.deployDir,
      deployFileName: "ROOT.war"
    }
  };
}

function emitRunLog(sender, line) {
  if (!sender || sender.isDestroyed()) {
    return;
  }

  sender.send(LOG_EVENT, {
    line,
    timestamp: new Date().toISOString()
  });
}

function stopRunForSender(sender) {
  if (!sender || sender.isDestroyed()) {
    return { ok: false, message: "실행 중인 작업이 없습니다." };
  }

  const runState = activeRuns.get(sender.id);
  if (!runState || !runState.child || runState.child.exitCode !== null || runState.stopping) {
    return { ok: false, message: "실행 중인 작업이 없습니다." };
  }

  runState.stopping = true;

  try {
    const killer = spawn("taskkill.exe", ["/pid", String(runState.child.pid), "/t", "/f"], {
      windowsHide: true
    });

    killer.on("error", () => {
      // The close handler on the run process will still report final state if this fails.
    });

    return { ok: true, message: "중지 요청을 보냈습니다." };
  } catch {
    return { ok: false, message: "실행 중지 요청을 보내지 못했습니다." };
  }
}

function executePreparedRun(sender, preparedRun) {
  return new Promise((resolve) => {
    let lastStage = "validation";
    const cleanupCurrentRunArtifacts = () => {
      safeUnlink(preparedRun.batPath);
      safeUnlink(preparedRun.tomcatRunnerPath);
      cleanupRunArtifacts({ keepLogPath: preparedRun.logPath });
    };
    const writeStream = fs.createWriteStream(preparedRun.logPath, { flags: "a" });
    const child = spawn("cmd.exe", ["/d", "/s", "/c", preparedRun.batPath], {
      windowsHide: true
    });
    activeRuns.set(sender.id, {
      child,
      stopping: false
    });
    const streamStates = {
      stdout: {
        encoding: "utf-8",
        utf8Decoder: new TextDecoder("utf-8"),
        eucKrDecoder: new TextDecoder("euc-kr"),
        buffer: ""
      },
      stderr: {
        encoding: "utf-8",
        utf8Decoder: new TextDecoder("utf-8"),
        eucKrDecoder: new TextDecoder("euc-kr"),
        buffer: ""
      }
    };

    const switchTomcatEncoding = () => {
      Object.values(streamStates).forEach((state) => {
        state.encoding = "euc-kr";
      });
    };

    const processText = (streamName, text) => {
      const state = streamStates[streamName];
      state.buffer += text;

      const parts = state.buffer.split(/\r?\n/);
      state.buffer = parts.pop() ?? "";

      parts
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .forEach((line) => {
          const stageMatch = line.match(/^\[STAGE\]\s+(.+)$/);
          if (stageMatch) {
            lastStage = stageMatch[1];
            if (lastStage === "tomcat-start") {
              switchTomcatEncoding();
            }
          }

          emitRunLog(sender, line);
        });
    };

    const handleChunk = (streamName, chunk) => {
      const state = streamStates[streamName];
      writeStream.write(chunk);
      const decoder =
        state.encoding === "euc-kr" ? state.eucKrDecoder : state.utf8Decoder;
      const text = decoder.decode(chunk, { stream: true });
      processText(streamName, text);
    };

    const flushRemaining = () => {
      Object.entries(streamStates).forEach(([streamName, state]) => {
        const decoder =
          state.encoding === "euc-kr" ? state.eucKrDecoder : state.utf8Decoder;
        const tail = decoder.decode();
        processText(streamName, tail);

        const line = state.buffer.trimEnd();
        if (line) {
          emitRunLog(sender, line);
        }

        state.buffer = "";
      });
    };

    child.stdout.on("data", (chunk) => handleChunk("stdout", chunk));
    child.stderr.on("data", (chunk) => handleChunk("stderr", chunk));

    child.on("error", (error) => {
      const line = `[ERROR] ${error.message}`;
      writeStream.write(`${line}\r\n`);
      emitRunLog(sender, line);
      writeStream.end(() => {
        activeRuns.delete(sender.id);
        cleanupCurrentRunArtifacts();
        resolve({
          success: false,
          stage: lastStage,
          exitCode: -1,
          batPath: preparedRun.batPath,
          logPath: preparedRun.logPath,
          message: error.message
        });
      });
    });

    child.on("close", (code) => {
      flushRemaining();
      writeStream.end(() => {
        const runState = activeRuns.get(sender.id);
        const stopped = Boolean(runState?.stopping);
        activeRuns.delete(sender.id);
        cleanupCurrentRunArtifacts();
        resolve({
          success: code === 0 && !stopped,
          stage: lastStage,
          exitCode: code ?? -1,
          batPath: preparedRun.batPath,
          logPath: preparedRun.logPath,
          message: stopped
            ? "Run stopped by user."
            : code === 0
              ? "Run completed."
              : `Run failed at ${lastStage}.`,
          stopped
        });
      });
    });
  });
}

module.exports = {
  LOG_EVENT,
  getDefaultFormState,
  loadProfileStore,
  saveCurrentProfile,
  createProfile,
  selectProfile,
  deleteProfile,
  getCurrentProfile,
  inspectConfig,
  prepareRun,
  executePreparedRun,
  stopRunForSender
};
