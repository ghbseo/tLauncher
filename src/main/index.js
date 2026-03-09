const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const {
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
} = require("./launcher-service");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDirectoryIfMissing(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir) || fs.existsSync(targetDir)) {
    return;
  }

  ensureDir(targetDir);

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryIfMissing(sourcePath, targetPath);
      continue;
    }

    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function resolveUserDataRoots() {
  const appDataRoot = app.getPath("appData");
  const prodRoot = path.join(appDataRoot, "tlauncher");
  const devRoot = path.join(appDataRoot, "tlauncher-dev");

  return {
    prodRoot,
    devRoot,
    isDev: !app.isPackaged
  };
}

function bootstrapUserDataPath() {
  const { prodRoot, devRoot, isDev } = resolveUserDataRoots();
  const targetRoot = isDev ? devRoot : prodRoot;

  if (isDev && !fs.existsSync(devRoot) && fs.existsSync(prodRoot)) {
    try {
      copyDirectoryIfMissing(prodRoot, devRoot);
    } catch {
      // Ignore migration failures and continue with empty dev data.
    }
  }

  ensureDir(targetRoot);
  app.setPath("userData", targetRoot);
}

bootstrapUserDataPath();

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f4f7fb",
    autoHideMenuBar: true,
    title: "tLauncher",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

ipcMain.handle("app:getVersion", async () => {
  return { version: app.getVersion() };
});

ipcMain.handle("launcher:ping", async () => {
  return {
    ok: true,
    message: "Launcher bridge is connected. Phase 1 shell is ready."
  };
});

ipcMain.handle("profile:load", async () => {
  const store = loadProfileStore();
  const currentProfile = getCurrentProfile(store);

  return {
    store,
    currentProfile
  };
});

ipcMain.handle("profile:save", async (_event, formState) => {
  const store = saveCurrentProfile(formState);
  const currentProfile = getCurrentProfile(store);

  return {
    store,
    currentProfile
  };
});

ipcMain.handle("profile:create", async () => {
  const store = createProfile();
  const currentProfile = getCurrentProfile(store);

  return {
    store,
    currentProfile
  };
});

ipcMain.handle("profile:select", async (_event, profileId) => {
  const store = selectProfile(profileId);
  const currentProfile = getCurrentProfile(store);

  return {
    store,
    currentProfile
  };
});

ipcMain.handle("profile:delete", async (_event, profileId) => {
  const store = deleteProfile(profileId);
  const currentProfile = getCurrentProfile(store);

  return {
    store,
    currentProfile
  };
});

ipcMain.handle("config:inspect", async (_event, formState) => {
  return inspectConfig(formState);
});

ipcMain.handle("launcher:prepareRun", async (_event, formState) => {
  return prepareRun(formState);
});

ipcMain.handle("launcher:run", async (event, preparedRun) => {
  return executePreparedRun(event.sender, preparedRun);
});

ipcMain.handle("launcher:stop", async (event) => {
  return stopRunForSender(event.sender);
});

ipcMain.handle("dialog:selectDirectory", async (event, options = {}) => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window || undefined, {
      title: options.title || "폴더 선택",
      properties: ["openDirectory", "dontAddToRecent"]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: "" };
    }

    return {
      canceled: false,
      path: result.filePaths[0]
    };
  } catch (error) {
    return {
      canceled: true,
      path: "",
      error: error.message
    };
  }
});

ipcMain.handle("dialog:selectFile", async (event, options = {}) => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(window || undefined, {
      title: options.title || "파일 선택",
      defaultPath: options.defaultPath,
      properties: ["openFile", "dontAddToRecent"],
      filters: options.filters
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, path: "" };
    }

    return {
      canceled: false,
      path: result.filePaths[0]
    };
  } catch (error) {
    return {
      canceled: true,
      path: "",
      error: error.message
    };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
