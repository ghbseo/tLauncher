const { contextBridge, ipcRenderer } = require("electron");

const RUN_LOG_EVENT = "launcher:run-log";

contextBridge.exposeInMainWorld("launcherApi", {
  getVersion: () => ipcRenderer.invoke("app:getVersion"),
  ping: () => ipcRenderer.invoke("launcher:ping"),
  selectDirectory: (options) => ipcRenderer.invoke("dialog:selectDirectory", options),
  selectFile: (options) => ipcRenderer.invoke("dialog:selectFile", options),
  loadProfile: () => ipcRenderer.invoke("profile:load"),
  saveProfile: (formState) => ipcRenderer.invoke("profile:save", formState),
  createProfile: () => ipcRenderer.invoke("profile:create"),
  selectProfile: (profileId) => ipcRenderer.invoke("profile:select", profileId),
  deleteProfile: (profileId) => ipcRenderer.invoke("profile:delete", profileId),
  inspectConfig: (formState) => ipcRenderer.invoke("config:inspect", formState),
  prepareRun: (formState) => ipcRenderer.invoke("launcher:prepareRun", formState),
  runPrepared: (preparedRun) => ipcRenderer.invoke("launcher:run", preparedRun),
  stopRun: () => ipcRenderer.invoke("launcher:stop"),
  onRunLog: (listener) => {
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on(RUN_LOG_EVENT, wrapped);
    return () => ipcRenderer.removeListener(RUN_LOG_EVENT, wrapped);
  }
});
