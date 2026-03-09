const statusToneElement = document.getElementById("status-tone");
const statusMessageElement = document.getElementById("status-message");
const versionPillElement = document.getElementById("version-pill");
const logConsoleElement = document.getElementById("log-console");
const logConsoleModalElement = document.getElementById("log-console-modal");
const logModalElement = document.getElementById("log-modal");
const expandLogButtonElement = document.getElementById("expand-log-button");
const closeLogButtonElement = document.getElementById("close-log-button");
const copyLogButtonElement = document.getElementById("copy-log-button");
const logModalBackdropElement = document.getElementById("log-modal-backdrop");
const runButtonElement = document.getElementById("run-button");
const saveButtonElement = document.getElementById("save-button");
const reloadButtonElement = document.getElementById("reload-button");
const newProfileButtonElement = document.getElementById("new-profile-button");
const deleteProfileButtonElement = document.getElementById("delete-profile-button");
const profileListElement = document.getElementById("profile-list");
const directoryPickerElements = document.querySelectorAll("[data-directory-picker]");
const filePickerElements = document.querySelectorAll("[data-file-picker]");
const formInputElements = Array.from(document.querySelectorAll("input[name]"));

const formState = {
  profileId: "",
  profileName: "",
  profileDescription: "",
  projectDir: "",
  tomcatHome: "",
  tomcatBase: "",
  mavenPath: "",
  buildCommand: "",
  tomcatOptions: ""
};

let profileStore = {
  currentProfileId: "",
  profiles: []
};
let runLogUnsubscribe = null;
let isRunning = false;
const logLines = [];

function updateRunButtonState() {
  runButtonElement.textContent = isRunning ? "Stop" : "Run";
  runButtonElement.classList.toggle("button--danger", isRunning);
  runButtonElement.classList.toggle("button--primary", !isRunning);
}

function appendLog(message) {
  logLines.push(message);

  const line = document.createElement("p");
  line.textContent = message;
  logConsoleElement.appendChild(line);
  logConsoleElement.scrollTop = logConsoleElement.scrollHeight;

  const modalLine = document.createElement("p");
  modalLine.textContent = message;
  logConsoleModalElement.appendChild(modalLine);
  logConsoleModalElement.scrollTop = logConsoleModalElement.scrollHeight;
}

function setStatus(tone, message) {
  statusToneElement.className = `status-badge status-badge--${tone}`;
  statusToneElement.textContent = tone === "idle" ? "준비됨" : tone === "success" ? "정상" : tone === "warning" ? "주의" : "오류";
  statusMessageElement.textContent = message;
}

function clearLog() {
  logConsoleElement.innerHTML = "";
  logConsoleModalElement.innerHTML = "";
  logLines.length = 0;
}

function setVersionLabel(label) {
  versionPillElement.textContent = label;
}

function syncStateFromInputs() {
  formInputElements.forEach((inputElement) => {
    formState[inputElement.name] = inputElement.value.trim();
  });
}

function applyFormState(nextState = {}) {
  formInputElements.forEach((inputElement) => {
    const nextValue = nextState[inputElement.name] ?? "";
    inputElement.value = nextValue;
    formState[inputElement.name] = String(nextValue).trim();
  });
}

function renderProfileList() {
  profileListElement.innerHTML = "";

  if (!Array.isArray(profileStore.profiles) || profileStore.profiles.length === 0) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "profile-list__empty";
    emptyMessage.textContent = "저장된 프로필이 없습니다.";
    profileListElement.appendChild(emptyMessage);
    deleteProfileButtonElement.disabled = true;
    return;
  }

  profileStore.profiles.forEach((profile) => {
    const buttonElement = document.createElement("button");
    buttonElement.type = "button";
    buttonElement.className = "profile-card";
    buttonElement.dataset.profileId = profile.id;

    if (profile.id === profileStore.currentProfileId) {
      buttonElement.classList.add("is-active");
    }

    const titleElement = document.createElement("p");
    titleElement.className = "profile-card__title";
    titleElement.textContent = profile.name || "이름 없는 프로필";

    const descriptionElement = document.createElement("p");
    descriptionElement.className = "profile-card__description";
    descriptionElement.textContent = profile.description || "설명 없음";

    const metaElement = document.createElement("p");
    metaElement.className = "profile-card__meta";
    metaElement.textContent = profile.projectDir || "경로 미입력";

    buttonElement.append(titleElement, descriptionElement, metaElement);
    buttonElement.addEventListener("click", () => handleSelectProfile(profile.id));
    profileListElement.appendChild(buttonElement);
  });

  deleteProfileButtonElement.disabled = false;
}

function hydrateProfileState(store, currentProfile) {
  profileStore = {
    currentProfileId: store?.currentProfileId || currentProfile?.id || "",
    profiles: Array.isArray(store?.profiles) ? store.profiles : []
  };

  if (currentProfile) {
    applyFormState(currentProfile);
  } else {
    applyFormState({
      profileId: "",
      profileName: "",
      profileDescription: "",
      projectDir: "",
      tomcatHome: "",
      tomcatBase: "",
      mavenPath: "",
      buildCommand: "clean package",
      tomcatOptions: "-Dfile.encoding=UTF-8"
    });
  }

  renderProfileList();
}

function bindFormInputs() {
  formInputElements.forEach((inputElement) => {
    inputElement.addEventListener("input", () => {
      formState[inputElement.name] = inputElement.value.trim();

      if (inputElement.name === "profileName" || inputElement.name === "profileDescription") {
        renderProfileListPreview();
      }
    });
  });
}

function renderProfileListPreview() {
  if (!formState.profileId) {
    return;
  }

  profileStore.profiles = profileStore.profiles.map((profile) =>
    profile.id === formState.profileId
      ? {
          ...profile,
          name: formState.profileName,
          description: formState.profileDescription,
          projectDir: formState.projectDir
        }
      : profile
  );
  renderProfileList();
}

function setBusyState(busy) {
  isRunning = busy;
  runButtonElement.disabled = false;
  saveButtonElement.disabled = busy;
  reloadButtonElement.disabled = busy;
  newProfileButtonElement.disabled = busy;
  deleteProfileButtonElement.disabled = busy || profileStore.profiles.length === 0;
  expandLogButtonElement.disabled = false;
  directoryPickerElements.forEach((buttonElement) => {
    buttonElement.disabled = busy;
  });
  filePickerElements.forEach((buttonElement) => {
    buttonElement.disabled = busy;
  });
  profileListElement.querySelectorAll(".profile-card").forEach((buttonElement) => {
    buttonElement.disabled = busy;
  });
  updateRunButtonState();
}

function openLogModal() {
  logModalElement.hidden = false;
  document.body.classList.add("modal-open");
  closeLogButtonElement.focus();
}

function closeLogModal() {
  logModalElement.hidden = true;
  document.body.classList.remove("modal-open");
  expandLogButtonElement.focus();
}

async function copyLogs() {
  try {
    await navigator.clipboard.writeText(logLines.join("\n"));
    appendLog("[INFO] 로그를 클립보드에 복사했습니다.");
    setStatus("success", "로그를 복사했습니다.");
  } catch (error) {
    appendLog(`[ERROR] 로그 복사 실패: ${error.message}`);
    setStatus("error", "로그를 복사하지 못했습니다.");
  }
}

async function loadSavedProfile() {
  try {
    const result = await window.launcherApi.loadProfile();
    hydrateProfileState(result?.store, result?.currentProfile);
    appendLog("[INFO] 저장된 프로필을 불러왔습니다.");
    setStatus("idle", result?.currentProfile ? "저장된 프로필을 불러왔습니다." : "프로필을 새로 만들 수 있습니다.");
  } catch (error) {
    appendLog(`[ERROR] 프로필 불러오기 실패: ${error.message}`);
    syncStateFromInputs();
  }
}

async function loadInitialState() {
  clearLog();
  appendLog("[INFO] 브리지 연결 상태를 확인합니다.");

  try {
    const [appInfo, pingResult] = await Promise.all([
      window.launcherApi.getVersion(),
      window.launcherApi.ping()
    ]);

    versionPillElement.textContent = `v${appInfo.version}`;
    appendLog(`[INFO] 앱 버전 ${appInfo.version} 확인`);
    appendLog(`[INFO] ${pingResult.message}`);
    await loadSavedProfile();
    setStatus("success", "실행 환경을 사용할 수 있습니다.");
  } catch (error) {
    versionPillElement.textContent = "버전 조회 실패";
    appendLog(`[ERROR] ${error.message}`);
    setStatus("error", "초기 IPC 연결 중 문제가 발생했습니다.");
  }
}

function bindDirectoryPickers() {
  directoryPickerElements.forEach((buttonElement) => {
    buttonElement.addEventListener("click", async () => {
      const fieldName = buttonElement.dataset.directoryPicker;
      const inputElement = document.querySelector(`input[name="${fieldName}"]`);

      if (!inputElement || typeof window.launcherApi?.selectDirectory !== "function") {
        appendLog(`[ERROR] ${fieldName} 선택기를 사용할 수 없습니다.`);
        setStatus("error", "폴더 선택 기능을 사용할 수 없습니다.");
        return;
      }

      appendLog(`[ACTION] ${fieldName} 경로 선택`);

      try {
        const result = await window.launcherApi.selectDirectory({
          title: `${fieldName} 폴더 선택`
        });

        if (result.error) {
          appendLog(`[ERROR] ${result.error}`);
          setStatus("error", "폴더 선택 창을 열지 못했습니다.");
          return;
        }

        if (result.canceled) {
          appendLog(`[INFO] ${fieldName} 선택 취소`);
          return;
        }

        inputElement.value = result.path;
        formState[fieldName] = result.path.trim();
        renderProfileListPreview();
        appendLog(`[INFO] ${fieldName} = ${result.path}`);
        setStatus("idle", "입력 경로를 업데이트했습니다.");
      } catch (error) {
        appendLog(`[ERROR] ${error.message}`);
        setStatus("error", "폴더 선택 중 문제가 발생했습니다.");
      }
    });
  });
}

function bindFilePickers() {
  filePickerElements.forEach((buttonElement) => {
    buttonElement.addEventListener("click", async () => {
      const fieldName = buttonElement.dataset.filePicker;
      const inputElement = document.querySelector(`input[name="${fieldName}"]`);

      if (!inputElement || typeof window.launcherApi?.selectFile !== "function") {
        appendLog(`[ERROR] ${fieldName} 선택기를 사용할 수 없습니다.`);
        setStatus("error", "파일 선택 기능을 사용할 수 없습니다.");
        return;
      }

      appendLog(`[ACTION] ${fieldName} 파일 선택`);

      try {
        const result = await window.launcherApi.selectFile({
          title: `${fieldName} 파일 선택`,
          defaultPath: inputElement.value || undefined,
          filters: [
            { name: "Maven Command", extensions: ["cmd"] },
            { name: "All Files", extensions: ["*"] }
          ]
        });

        if (result.error) {
          appendLog(`[ERROR] ${result.error}`);
          setStatus("error", "파일 선택 창을 열지 못했습니다.");
          return;
        }

        if (result.canceled) {
          appendLog(`[INFO] ${fieldName} 선택 취소`);
          return;
        }

        inputElement.value = result.path;
        formState[fieldName] = result.path.trim();
        appendLog(`[INFO] ${fieldName} = ${result.path}`);
        setStatus("idle", "입력 경로를 업데이트했습니다.");
      } catch (error) {
        appendLog(`[ERROR] ${error.message}`);
        setStatus("error", "파일 선택 중 문제가 발생했습니다.");
      }
    });
  });
}

async function handleSaveProfile() {
  syncStateFromInputs();
  appendLog("[ACTION] Save Profile 버튼 클릭");

  try {
    const result = await window.launcherApi.saveProfile(formState);
    hydrateProfileState(result?.store, result?.currentProfile);
    const updatedAt = result?.currentProfile?.updatedAt || "";
    appendLog(`[INFO] 프로필 저장 완료${updatedAt ? ` (${updatedAt})` : ""}`);
    setStatus("success", "프로필을 저장했습니다.");
  } catch (error) {
    appendLog(`[ERROR] ${error.message}`);
    setStatus("error", "프로필 저장에 실패했습니다.");
  }
}

async function handleCreateProfile() {
  appendLog("[ACTION] 새 프로필 생성");

  try {
    const result = await window.launcherApi.createProfile();
    hydrateProfileState(result?.store, result?.currentProfile);
    appendLog(`[INFO] ${result?.currentProfile?.name || "새 프로필"} 생성`);
    setStatus("success", "새 프로필을 만들었습니다.");
  } catch (error) {
    appendLog(`[ERROR] ${error.message}`);
    setStatus("error", "프로필을 만들지 못했습니다.");
  }
}

async function handleSelectProfile(profileId) {
  if (!profileId || profileId === profileStore.currentProfileId || isRunning) {
    return;
  }

  appendLog(`[ACTION] 프로필 선택: ${profileId}`);

  try {
    const result = await window.launcherApi.selectProfile(profileId);
    hydrateProfileState(result?.store, result?.currentProfile);
    appendLog(`[INFO] ${result?.currentProfile?.name || "프로필"} 선택`);
    setStatus("idle", "프로필을 전환했습니다.");
  } catch (error) {
    appendLog(`[ERROR] ${error.message}`);
    setStatus("error", "프로필을 전환하지 못했습니다.");
  }
}

async function handleDeleteProfile() {
  if (!formState.profileId) {
    return;
  }

  appendLog(`[ACTION] 프로필 삭제: ${formState.profileName || formState.profileId}`);

  try {
    const result = await window.launcherApi.deleteProfile(formState.profileId);
    hydrateProfileState(result?.store, result?.currentProfile);
    appendLog("[INFO] 프로필을 삭제했습니다.");
    setStatus("success", "프로필을 삭제했습니다.");
  } catch (error) {
    appendLog(`[ERROR] ${error.message}`);
    setStatus("error", "프로필을 삭제하지 못했습니다.");
  }
}

async function handleInspectConfig() {
  syncStateFromInputs();
  appendLog("[ACTION] 설정 확인 버튼 클릭");

  try {
    const result = await window.launcherApi.inspectConfig(formState);
    clearLog();
    appendLog("[STAGE] validation");
    result.files.forEach((file) => {
      if (!file.exists) {
        appendLog(`[WARN] ${file.name}: 파일이 없습니다.`);
        return;
      }

      if (!file.readable) {
        appendLog(`[WARN] ${file.name}: 읽을 수 없습니다.`);
        return;
      }

      appendLog(`[INFO] ${file.name}: ${file.summary}`);
    });

    if (result.warnings.length > 0) {
      result.warnings.forEach((warning) => appendLog(`[WARN] ${warning}`));
      setStatus("warning", "설정 파일을 확인하세요.");
      setVersionLabel("설정 확인 필요");
      return;
    }

    setStatus("success", "설정 파일을 읽었습니다.");
    setVersionLabel("설정 확인 완료");
  } catch (error) {
    appendLog(`[ERROR] ${error.message}`);
    setStatus("error", "설정 파일을 읽지 못했습니다.");
    setVersionLabel("설정 확인 실패");
  }
}

async function handleRun() {
  if (isRunning) {
    appendLog("[ACTION] Stop 버튼 클릭");

    try {
      const result = await window.launcherApi.stopRun();
      appendLog(`[INFO] ${result.message}`);
      setStatus(result.ok ? "warning" : "error", result.message);
    } catch (error) {
      appendLog(`[ERROR] ${error.message}`);
      setStatus("error", "실행 중지 요청에 실패했습니다.");
    }
    return;
  }

  syncStateFromInputs();
  clearLog();
  appendLog("[ACTION] Run 버튼 클릭");
  setBusyState(true);
  setStatus("warning", "실행 준비 중입니다.");
  setVersionLabel("실행 준비");

  try {
    const preparedRun = await window.launcherApi.prepareRun(formState);
    appendLog(`[INFO] BAT 생성: ${preparedRun.batPath}`);
    appendLog(`[INFO] 로그 파일: ${preparedRun.logPath}`);
    appendLog(`[INFO] 배포 위치: ${preparedRun.summary.deployDir}`);
    appendLog(`[INFO] 배포 파일: ${preparedRun.summary.deployFileName}`);

    const runResult = await window.launcherApi.runPrepared(preparedRun);
    appendLog(`[INFO] 종료 코드: ${runResult.exitCode}`);
    appendLog(`[INFO] 단계: ${runResult.stage}`);

    if (runResult.stopped) {
      appendLog("[INFO] 실행이 중지되었습니다.");
      setStatus("warning", "실행을 중지했습니다.");
      setVersionLabel("실행 중지");
    } else if (runResult.success) {
      setStatus("success", "실행이 완료되었습니다.");
      setVersionLabel("실행 완료");
    } else {
      setStatus("error", `${runResult.stage} 단계에서 실패했습니다.`);
      setVersionLabel("실행 실패");
    }
  } catch (error) {
    const details = error.message.split(/\r?\n/).filter(Boolean);
    details.forEach((line) => appendLog(`[ERROR] ${line}`));
    setStatus("error", "실행 준비에 실패했습니다.");
    setVersionLabel("실행 실패");
  } finally {
    setBusyState(false);
  }
}

function bindActions() {
  bindFormInputs();
  bindDirectoryPickers();
  bindFilePickers();

  runButtonElement.addEventListener("click", handleRun);
  saveButtonElement.addEventListener("click", handleSaveProfile);
  reloadButtonElement.addEventListener("click", handleInspectConfig);
  newProfileButtonElement.addEventListener("click", handleCreateProfile);
  deleteProfileButtonElement.addEventListener("click", handleDeleteProfile);
  expandLogButtonElement.addEventListener("click", openLogModal);
  closeLogButtonElement.addEventListener("click", closeLogModal);
  copyLogButtonElement.addEventListener("click", copyLogs);
  logModalBackdropElement.addEventListener("click", closeLogModal);

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !logModalElement.hidden) {
      closeLogModal();
    }
  });

  runLogUnsubscribe = window.launcherApi.onRunLog((payload) => {
    appendLog(payload.line);
  });
}

bindActions();
updateRunButtonState();
loadInitialState();

window.addEventListener("beforeunload", () => {
  if (typeof runLogUnsubscribe === "function") {
    runLogUnsubscribe();
  }
});
