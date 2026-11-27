import { createExam, normalizeAnswer, isAnswerCorrect } from "./generators.js";
import {
  getActiveCodes,
  createStudentCodes,
  startExam,
  getSession,
  saveAnswers,
  saveProgress,
  recordTabSwitch,
  saveResult,
  getResults,
  clearLocalData,
  getSavedTheme,
  saveTheme,
  initSupabase,
  authenticateStaff,
  getStaffSession,
  clearStaffSession,
  getTeachers,
  createTeacher,
  deleteTeacher,
  getLocalProfile,
  registerProfile,
  loginProfile,
  getProfileHistory,
  getEvents,
  createEvent,
} from "./storage.js?v=20261127f";

const $ = (selector) => document.querySelector(selector);
const views = ["login-view", "exam-view", "result-view", "teacher-view"];

let session = null;
let currentIndex = 0;
let timerHandle = null;
let awayActive = false;
let examFinished = false;
let inputSaveTimer = null;
let staffActor = getStaffSession();
let studentProfile = getLocalProfile();
let loginMode = "profile"; // profile | event

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function showView(id) {
  views.forEach((view) => {
    const el = $(`#${view}`);
    if (el) el.classList.toggle("hidden", view !== id);
  });
}

function modal(content) {
  $("#modal-root").innerHTML = `<div class="modal-backdrop"><div class="modal-dialog">${content}</div></div>`;
}

function clearModal() {
  $("#modal-root").innerHTML = "";
}

// ---------------- РўР•РњРђ РћР¤РћР РњР›Р•РќРРЇ (DARK / LIGHT) ----------------

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  saveTheme(theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0d1522" : "#f4f7fb");
}

function initTheme() {
  const saved = getSavedTheme();
  applyTheme(saved);
  const toggleBtn = $("#theme-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "light";
      const next = current === "dark" ? "light" : "dark";
      applyTheme(next);
    });
  }
}

// ---------------- РРќРР¦РРђР›РР—РђР¦РРЇ ----------------

async function initialize() {
  initTheme();
  staffActor = getStaffSession();
  studentProfile = getLocalProfile();
  bindLoginModeSwitch();
  setLoginMode("profile");
  if (studentProfile?.code) {
    $("#profile-name").value = studentProfile.name || "";
    $("#profile-code").value = studentProfile.code || "";
  }
  renderProfileHistory();

  try {
    await Promise.race([
      initSupabase(),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
  } catch (err) {
    console.warn("Init Supabase failed:", err);
  }

  try {
    const saved = await Promise.race([
      getSession(),
      new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
    ]);
    if (saved) {
      session = saved;
      currentIndex = Math.max(0, Math.min(saved.lastIndex || 0, saved.questions.length - 1));
      if (Date.now() - saved.startedAt >= 30 * 60 * 1000) {
        await finishExam("Р’СЂРµРјСЏ РёСЃС‚РµРєР»Рѕ");
        return;
      }
      activateExam();
    }
  } catch (err) {
    console.warn("Session restore failed:", err);
  }
}


// ---------------- Р’РҐРћР” РЈР§Р•РќРРљРђ (РўРћР›Р¬РљРћ ID) ----------------

function setLoginMode(mode) {
  loginMode = mode === "event" ? "event" : "profile";
  $$("#login-mode-switch [data-mode]").forEach((btn) => btn.classList.toggle("active", btn.dataset.mode === loginMode));
  $("#profile-fields")?.classList.toggle("hidden", loginMode !== "profile");
  $("#event-fields")?.classList.toggle("hidden", loginMode !== "event");
  $("#login-error").textContent = "";
}

function bindLoginModeSwitch() {
  $$("#login-mode-switch [data-mode]").forEach((btn) => btn.addEventListener("click", () => setLoginMode(btn.dataset.mode)));
}

async function renderProfileHistory() {
  const box = $("#profile-history");
  if (!box) return;
  if (!studentProfile?.code) {
    box.innerHTML = `<div class="empty-note">РЎРѕР·РґР°Р№С‚Рµ РїСЂРѕС„РёР»СЊ РёР»Рё РІРѕР№РґРёС‚Рµ, С‡С‚РѕР±С‹ РІРёРґРµС‚СЊ РёСЃС‚РѕСЂРёСЋ.</div>`;
    return;
  }
  box.innerHTML = `<div class="empty-note">Р—Р°РіСЂСѓР¶Р°РµРј РёСЃС‚РѕСЂРёСЋвЂ¦</div>`;
  try {
    const history = await getProfileHistory(studentProfile.code);
    if (!history.length) {
      box.innerHTML = `<div class="empty-note">РџРѕРєР° РЅРµС‚ Р·Р°РІРµСЂС€С‘РЅРЅС‹С… РїРѕРїС‹С‚РѕРє.</div>`;
      return;
    }
    box.innerHTML = history.slice(0, 8).map((r) => `
      <div class="history-row">
        <div>
          <b>${r.score}/8</b> <span class="muted">В· ${escapeHtml(new Date(r.finishedAt).toLocaleString("ru-RU"))}</span>
          <div class="muted small">${r.eventCode ? `РЎРѕР±С‹С‚РёРµ: ${escapeHtml(r.eventTitle || r.eventCode)}` : "РўСЂРµРЅРёСЂРѕРІРєР°"}</div>
        </div>
        <span class="status-badge ${String(r.status).includes("РџСЂРёРЅСѓРґ") ? "forced" : "completed"}">${escapeHtml(r.status)}</span>
      </div>`).join("");
  } catch {
    box.innerHTML = `<div class="empty-note">РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РіСЂСѓР·РёС‚СЊ РёСЃС‚РѕСЂРёСЋ.</div>`;
  }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const errorEl = $("#login-error");
  const submitBtn = $("#submit-login");
  errorEl.textContent = "";
  submitBtn.disabled = true;
  submitBtn.style.opacity = "0.7";

  try {
    let code = "";
    let profile = null;
    let eventCode = "";

    if (loginMode === "event") {
      eventCode = String(form.get("eventCode") || "").trim().toUpperCase();
      code = String(form.get("eventStudentCode") || "").trim().toUpperCase();
      if (!/^EVT-\d{6}$/.test(eventCode)) throw new Error("Р’РІРµРґРёС‚Рµ РєРѕСЂСЂРµРєС‚РЅС‹Р№ ID СЃРѕР±С‹С‚РёСЏ (EVT-123456).");
      if (!/^\d{6}$/.test(code)) throw new Error("Р’РІРµРґРёС‚Рµ 6-Р·РЅР°С‡РЅС‹Р№ ID СѓС‡РµРЅРёРєР°.");
    } else {
      const name = String(form.get("profileName") || "").trim();
      code = String(form.get("profileCode") || "").trim().toUpperCase();
      if (!/^\d{6}$/.test(code)) throw new Error("Р’РІРµРґРёС‚Рµ 6-Р·РЅР°С‡РЅС‹Р№ ID РїСЂРѕС„РёР»СЏ.");
      profile = await loginProfile({ code, name });
      studentProfile = profile;
      renderProfileHistory();
    }

    const created = await startExam({ code, questions: createExam(), eventCode, profile });
    session = created;
    currentIndex = 0;
    activateExam();
  } catch (error) {
    errorEl.textContent = error.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РІРѕР№С‚Рё.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
  }
});

// ---------------- Р­РљР РђРќ Р­РљР—РђРњР•РќРђ ----------------

function activateExam() {
  examFinished = false;
  showView("exam-view");
  document.body.classList.add("in-exam");
  if (session.mode !== "practice") {
    document.addEventListener("contextmenu", blockContextMenu);
  }
  renderExam();
  updateTimer();
  clearInterval(timerHandle);
  timerHandle = setInterval(updateTimer, 1000);
}

function blockContextMenu(event) {
  if (document.body.classList.contains("in-exam")) {
    event.preventDefault();
  }
}

function renderExam() {
  const root = $("#exam-view");
  const question = session.questions[currentIndex];
  const answeredCount = session.questions.filter((item) => String(session.answers[item.number] ?? "").trim()).length;
  const progressPct = Math.round((answeredCount / session.questions.length) * 100);

  const nav = session.questions
    .map(
      (item, index) =>
        `<button class="nav-task ${index === currentIndex ? "current" : ""} ${String(session.answers[item.number] ?? "").trim() ? "answered" : ""}" data-index="${index}" aria-label="Р—Р°РґР°РЅРёРµ ${item.number}">${item.number}</button>`
    )
    .join("");

  const inputType = question.answerType === "number" ? "number" : "text";
  const modeLabel = session.mode === "event"
    ? `РЎРѕР±С‹С‚РёРµ: ${escapeHtml(session.eventTitle || session.eventCode || "")}`
    : "РўСЂРµРЅРёСЂРѕРІРєР°";

  root.innerHTML = `
    <div class="exam-topbar">
      <div class="student-meta">
        <div class="student-avatar" aria-hidden="true">${escapeHtml((session.studentName || "РЈ")[0])}</div>
        <div class="student-meta-text">
          <b>${escapeHtml(session.studentName || "РЈС‡РµРЅРёРє")}${session.className ? ` <span style="color:var(--text-muted);font-weight:600">(${escapeHtml(session.className)})</span>` : ""}</b>
          <span>${modeLabel} В· ID: ${escapeHtml(session.code)}</span>
        </div>
      </div>
      <div id="timer" class="timer-box" aria-live="polite">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <span class="timer-value">30:00</span>
      </div>
    </div>

    <div class="exam-layout">
      <aside class="card task-nav" aria-label="РќР°РІРёРіР°С†РёСЏ РїРѕ Р·Р°РґР°РЅРёСЏРј">
        <p class="nav-header">РќР°РІРёРіР°С†РёСЏ РїРѕ С‚РµСЃС‚Сѓ</p>
        <div class="nav-grid">${nav}</div>
        <div class="nav-legend" aria-label="РћР±РѕР·РЅР°С‡РµРЅРёСЏ">
          <div class="legend-item"><span class="legend-color legend-color-current" aria-hidden="true"></span><span>РўРµРєСѓС‰РёР№ РІРѕРїСЂРѕСЃ</span></div>
          <div class="legend-item"><span class="legend-color legend-color-answered" aria-hidden="true"></span><span>РћС‚РІРµС‚ СЃРѕС…СЂР°РЅС‘РЅ</span></div>
          <div class="legend-item"><span class="legend-color legend-color-empty" aria-hidden="true"></span><span>РќРµ РѕС‚РІРµС‡РµРЅРѕ</span></div>
        </div>
      </aside>

      <article class="card task-content-card">
        <div class="task-eyebrow">
          <span class="task-pill">Р—Р°РґР°РЅРёРµ ${question.number}</span>
          <span class="task-points">1 РїРµСЂРІРёС‡РЅС‹Р№ Р±Р°Р»Р»</span>
        </div>
        <h2 class="task-title">${escapeHtml(question.title)}</h2>
        <div class="task-prompt">${question.prompt}</div>

        <div class="task-answer-box">
          <label for="answer-input">РћС‚РІРµС‚ РЅР° Р·Р°РґР°РЅРёРµ</label>
          <input
            id="answer-input"
            class="task-answer-input"
            type="${inputType}"
            inputmode="${inputType === "number" ? "numeric" : "text"}"
            autocomplete="off"
            spellcheck="false"
            value="${escapeHtml(session.answers[question.number] ?? "")}"
            placeholder="Р’РІРµРґРёС‚Рµ РѕС‚РІРµС‚"
            aria-label="РћС‚РІРµС‚ РЅР° Р·Р°РґР°РЅРёРµ ${question.number}"
          >
        </div>

        <div class="task-nav-buttons">
          <button class="button button-ghost" type="button" id="prev-task" ${currentIndex === 0 ? "disabled" : ""}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>РџСЂРµРґС‹РґСѓС‰РµРµ</span>
          </button>
          <button class="button button-primary" type="button" id="next-task">
            <span>${currentIndex === session.questions.length - 1 ? "Рљ РїСЂРѕРІРµСЂРєРµ" : "РЎР»РµРґСѓСЋС‰РµРµ"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </article>
    </div>

    <div class="exam-footer-bar">
      <div class="progress-info">
        <span class="progress-meta">РџСЂРѕРіСЂРµСЃСЃ: <b>${answeredCount} РёР· ${session.questions.length}</b></span>
        <div class="progress-bar-wrap" aria-hidden="true">
          <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
        </div>
      </div>
      <button class="button button-danger" type="button" id="finish-exam">
        <span>Р—Р°РІРµСЂС€РёС‚СЊ Рё РѕС‚РїСЂР°РІРёС‚СЊ</span>
      </button>
    </div>
  `;

  root.querySelectorAll(".nav-task").forEach((button) => {
    button.addEventListener("click", () => {
      currentIndex = Number(button.dataset.index);
      persistIndex().then(renderExam);
    });
  });

  const answerInput = $("#answer-input");
  answerInput.addEventListener("input", (event) => {
    session.answers[question.number] = event.target.value;
    clearTimeout(inputSaveTimer);
    inputSaveTimer = setTimeout(async () => {
      if (!session || examFinished) return;
      await saveAnswers(session.answers);
      await persistIndex();

      const newAnsweredCount = session.questions.filter((item) =>
        String(session.answers[item.number] ?? "").trim()
      ).length;
      const progressFill = $(".progress-bar-fill");
      if (progressFill) {
        progressFill.style.width = `${Math.round((newAnsweredCount / session.questions.length) * 100)}%`;
      }
      const progressSpan = $(".progress-info .progress-meta b") || $(".progress-info span b");
      if (progressSpan) {
        progressSpan.textContent = `${newAnsweredCount} РёР· ${session.questions.length}`;
      }

      root.querySelectorAll(".nav-task").forEach((btn, index) => {
        const item = session.questions[index];
        btn.classList.toggle("answered", Boolean(String(session.answers[item.number] ?? "").trim()));
      });
    }, 300);
  });

  $("#prev-task").addEventListener("click", () => moveTo(currentIndex - 1));
  $("#next-task").addEventListener("click", () => {
    if (currentIndex === session.questions.length - 1) {
      confirmFinish();
    } else {
      moveTo(currentIndex + 1);
    }
  });
  $("#finish-exam").addEventListener("click", confirmFinish);
}

async function persistIndex() {
  if (!session || examFinished) return;
  await saveProgress({ answers: session.answers, lastIndex: currentIndex });
}

async function moveTo(index) {
  clearTimeout(inputSaveTimer);
  await saveAnswers(session.answers);
  currentIndex = index;
  await persistIndex();
  renderExam();
}

function updateTimer() {
  if (!session || examFinished) return;
  const remaining = Math.max(0, 30 * 60 * 1000 - (Date.now() - session.startedAt));
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const formatted = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const timer = $("#timer");
  if (timer) {
    const valueEl = timer.querySelector(".timer-value");
    if (valueEl) valueEl.textContent = formatted;
    else timer.textContent = formatted;
    timer.classList.toggle("urgent", remaining <= 5 * 60 * 1000);
  }
  if (remaining <= 0) finishExam("Р’СЂРµРјСЏ РёСЃС‚РµРєР»Рѕ");
}

function confirmFinish() {
  const answeredCount = session.questions.filter((item) =>
    String(session.answers[item.number] ?? "").trim()
  ).length;
  const unanswered = session.questions.length - answeredCount;

  modal(`
    <h2>Р—Р°РІРµСЂС€РёС‚СЊ С‚РµСЃС‚РёСЂРѕРІР°РЅРёРµ?</h2>
    <p>${unanswered > 0 ? `Р’С‹ РЅРµ РѕС‚РІРµС‚РёР»Рё РЅР° <b>${unanswered}</b> РёР· 8 Р·Р°РґР°РЅРёР№.` : "Р’СЃРµ 8 Р·Р°РґР°РЅРёР№ Р·Р°РїРѕР»РЅРµРЅС‹."} РџРѕСЃР»Рµ РѕС‚РїСЂР°РІРєРё РёР·РјРµРЅРёС‚СЊ РѕС‚РІРµС‚С‹ Р±СѓРґРµС‚ РЅРµРІРѕР·РјРѕР¶РЅРѕ.</p>
    <div class="modal-actions">
      <button class="button button-ghost" type="button" id="cancel-modal">Р’РµСЂРЅСѓС‚СЊСЃСЏ</button>
      <button class="button button-primary" type="button" id="confirm-finish">РћС‚РїСЂР°РІРёС‚СЊ СЂР°Р±РѕС‚Сѓ</button>
    </div>
  `);
  $("#cancel-modal").addEventListener("click", clearModal);
  $("#confirm-finish").addEventListener("click", () => {
    clearModal();
    finishExam("Р—Р°РІРµСЂС€С‘РЅ С€С‚Р°С‚РЅРѕ");
  });
}

// ---------------- Р—РђР’Р•Р РЁР•РќРР• Р­РљР—РђРњР•РќРђ ----------------

async function finishExam(status) {
  if (!session || examFinished) return;
  examFinished = true;
  clearInterval(timerHandle);
  clearTimeout(inputSaveTimer);
  await saveAnswers(session.answers);

  const checked = session.questions.map((question) => {
    const rawVal = session.answers[question.number];
    return {
      number: question.number,
      title: question.title,
      answer: String(rawVal ?? ""),
      correct: isAnswerCorrect(rawVal, question.answer),
    };
  });

  const result = {
    id: session.id,
    code: session.code,
    studentName: session.studentName || "РЈС‡РµРЅРёРє",
    className: session.className || "",
    profileCode: session.profileCode || "",
    eventCode: session.eventCode || "",
    eventTitle: session.eventTitle || "",
    mode: session.mode || "practice",
    startedAt: new Date(session.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)),
    score: checked.filter((item) => item.correct).length,
    tabSwitches: session.tabSwitches || 0,
    status,
    answers: checked,
  };

  if (result.mode === "practice") {
    await saveResult(result);
  } else {
    await saveResult(result);
  }
  document.body.classList.remove("in-exam");
  document.removeEventListener("contextmenu", blockContextMenu);
  session = null;
  showResult(result);
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes} РјРёРЅ ${String(seconds % 60).padStart(2, "0")} СЃРµРє`;
}

function showResult(result) {
  showView("result-view");
  const grade =
    result.score >= 7 ? "РћС‚Р»РёС‡РЅРѕ (РѕС†РµРЅРєР° 5)" :
    result.score >= 5 ? "РҐРѕСЂРѕС€Рѕ (РѕС†РµРЅРєР° 4)" :
    result.score >= 3 ? "РЈРґРѕРІР»РµС‚РІРѕСЂРёС‚РµР»СЊРЅРѕ (РѕС†РµРЅРєР° 3)" :
    "РўСЂРµР±СѓРµС‚СЃСЏ РїРѕРІС‚РѕСЂРµРЅРёРµ (РѕС†РµРЅРєР° 2)";
  const gradeTone = result.score >= 5 ? "success" : result.score >= 3 ? "warn" : "danger";

  $("#result-view").innerHTML = `
    <div class="card result-card">
      <div class="result-header">
        <div class="result-badge" aria-hidden="true">
          ${result.score >= 5
            ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
            : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>'}
        </div>
        <p class="card-eyebrow">${result.mode === "practice" ? "Р РµР·СѓР»СЊС‚Р°С‚ С‚СЂРµРЅРёСЂРѕРІРєРё" : "Р РµР·СѓР»СЊС‚Р°С‚ С‚РµСЃС‚РёСЂРѕРІР°РЅРёСЏ"}</p>
        <h2>${result.mode === "practice" ? "РўСЂРµРЅРёСЂРѕРІРєР° Р·Р°РІРµСЂС€РµРЅР°" : "Р Р°Р±РѕС‚Р° Р·Р°РІРµСЂС€РµРЅР°"}</h2>
      </div>

      <div class="result-score-banner">
        <div class="result-big-number">${result.score}<small> / 8</small></div>
        <div class="result-grade" data-tone="${gradeTone}">${grade}</div>
      </div>

      <div class="result-details-grid">
        <div class="result-detail-box">
          <span>РЈС‡РµРЅРёРє</span>
          <b>${escapeHtml(result.studentName)}</b>
        </div>
        <div class="result-detail-box">
          <span>Р’СЂРµРјСЏ СЂР°Р±РѕС‚С‹</span>
          <b>${formatDuration(result.durationSeconds)}</b>
        </div>
        <div class="result-detail-box">
          <span>${result.mode === "practice" ? "Р РµР¶РёРј" : "ID / СЃРѕР±С‹С‚РёРµ"}</span>
          <b>${escapeHtml(result.mode === "practice" ? "РўСЂРµРЅРёСЂРѕРІРєР°" : `${result.code}${result.eventCode ? ` В· ${result.eventCode}` : ""}`)}</b>
        </div>
      </div>

      <h3 class="section-title">Р Р°Р·Р±РѕСЂ Р·Р°РґР°РЅРёР№</h3>
      <div class="review-list">
        ${result.answers
      .map(
        (item) => `
          <div class="review-row ${item.correct ? "correct" : "wrong"}">
            <span class="review-row-main"><span class="review-num">Р—Р°РґР°РЅРёРµ ${item.number}</span><b>${escapeHtml(item.title)}</b></span>
            <span class="review-status-tag">
              ${item.correct
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Р’РµСЂРЅРѕ</span>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg><span>РћС€РёР±РєР°</span>'}
            </span>
          </div>`
      )
      .join("")}
      </div>

      <div class="result-actions">
        <button class="button button-ghost" type="button" id="to-login-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"/><path d="M9 6 3 12l6 6"/></svg>
          <span>Р’РµСЂРЅСѓС‚СЊСЃСЏ РЅР° РіР»Р°РІРЅСѓСЋ</span>
        </button>
      </div>
    </div>
  `;

  $("#to-login-btn").addEventListener("click", () => {
    showView("login-view");
  });
}

// ---------------- РђРќРўРР§РРў (РЈРҐРћР” РЎ Р’РљР›РђР”РљР) ----------------

function registerDeparture() {
  if (!session || examFinished || awayActive) return;
  if (session.mode !== "event") return; // Р°РЅС‚РёС‡РёС‚ С‚РѕР»СЊРєРѕ РґР»СЏ СЃРѕР±С‹С‚РёР№
  awayActive = true;
  handleDeparture();
}

async function handleDeparture() {
  const count = await recordTabSwitch();
  if (!session || examFinished) return;
  session.tabSwitches = count;

  if (count >= 3) {
    await finishExam("РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕ (СѓС…РѕРґ СЃРѕ РІРєР»Р°РґРєРё)");
    modal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-danger" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
        </div>
        <div>
          <h2>РўРµСЃС‚РёСЂРѕРІР°РЅРёРµ РѕСЃС‚Р°РЅРѕРІР»РµРЅРѕ</h2>
          <p>Р—Р°С„РёРєСЃРёСЂРѕРІР°РЅ 3-Р№ СѓС…РѕРґ СЃ РІРєР»Р°РґРєРё. Р Р°Р±РѕС‚Р° Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё Р·Р°РІРµСЂС€РµРЅР° Рё РїРµСЂРµРґР°РЅР° СѓС‡РёС‚РµР»СЋ СЃРѕ СЃС‚Р°С‚СѓСЃРѕРј РЅР°СЂСѓС€РµРЅРёСЏ.</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="button button-primary" type="button" id="close-forced">РџРѕРЅСЏС‚РЅРѕ</button>
      </div>
    `);
    $("#close-forced").addEventListener("click", clearModal);
    return;
  }

  $("#modal-root").innerHTML = `
    <div class="warning-screen" role="alertdialog" aria-modal="true" aria-labelledby="warning-title">
      <div class="warning-card">
        <div class="warning-icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <p class="warning-eyebrow">РќР°СЂСѓС€РµРЅРёРµ ${count} РёР· 3</p>
        <h2 id="warning-title">РќРµ РїРѕРєРёРґР°Р№С‚Рµ СЃС‚СЂР°РЅРёС†Сѓ СЌРєР·Р°РјРµРЅР°</h2>
        <p>Р—Р°С„РёРєСЃРёСЂРѕРІР°РЅРѕ РїРµСЂРµРєР»СЋС‡РµРЅРёРµ РѕРєРЅР°. РџСЂРё 3-Рј РЅР°СЂСѓС€РµРЅРёРё С‚РµСЃС‚ Р·Р°РІРµСЂС€РёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё Р±РµР· РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё РїСЂРѕРґРѕР»Р¶РµРЅРёСЏ.</p>
        <button class="button button-primary" type="button" id="return-exam">Р’РµСЂРЅСѓС‚СЊСЃСЏ Рє РІС‹РїРѕР»РЅРµРЅРёСЋ</button>
      </div>
    </div>
  `;

  $("#return-exam").addEventListener("click", () => {
    clearModal();
    window.focus();
  });
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    registerDeparture();
  } else if (document.visibilityState === "visible") {
    if (awayActive) registerDeparture();
    awayActive = false;
  }
});
window.addEventListener("blur", registerDeparture);
window.addEventListener("focus", () => {
  if (awayActive) registerDeparture();
  awayActive = false;
});

// ---------------- РџРђРќР•Р›Р¬ РЈР§РРўР•Р›РЇ (Р”РђРЁР‘РћР Р” + РЎРўРђРўРРЎРўРРљРђ) ----------------

$("#teacher-open").addEventListener("click", async () => {
  if (session && !examFinished) return;
  if (staffActor) {
    await renderTeacher();
    return;
  }

  modal(`
    <div class="modal-header">
      <div class="modal-icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <div>
        <h2>Р’С…РѕРґ РІ РїР°РЅРµР»СЊ</h2>
        <p>РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ РІС…РѕРґРёС‚ РїРѕ РїР°СЂРѕР»СЋ. РЈС‡РёС‚РµР»СЊ вЂ” РїРѕ Р»РѕРіРёРЅСѓ Рё РїР°СЂРѕР»СЋ.</p>
      </div>
    </div>
    <div class="form-group">
      <label for="staff-login">Р›РѕРіРёРЅ СѓС‡РёС‚РµР»СЏ (РґР»СЏ Р°РґРјРёРЅР° РѕСЃС‚Р°РІСЊС‚Рµ РїСѓСЃС‚С‹Рј)</label>
      <input id="staff-login" type="text" class="task-answer-input" style="max-width:100%" autocomplete="username" placeholder="teacher1">
    </div>
    <div class="form-group">
      <label for="staff-password">РџР°СЂРѕР»СЊ</label>
      <input id="staff-password" type="password" class="task-answer-input" style="max-width:100%" autocomplete="current-password" placeholder="Р’РІРµРґРёС‚Рµ РїР°СЂРѕР»СЊ">
    </div>
    <p id="teacher-login-error" class="form-error" aria-live="polite"></p>
    <div class="modal-actions">
      <button class="button button-ghost" type="button" id="teacher-cancel">РћС‚РјРµРЅР°</button>
      <button class="button button-primary" type="button" id="teacher-login">Р’РѕР№С‚Рё</button>
    </div>
  `);

  $("#teacher-cancel").addEventListener("click", clearModal);
  const submit = async () => {
    const login = $("#staff-login").value;
    const password = $("#staff-password").value;
    try {
      staffActor = await authenticateStaff(password, login);
      clearModal();
      await renderTeacher();
    } catch (err) {
      $("#teacher-login-error").textContent = err.message || "РћС€РёР±РєР° РІС…РѕРґР°.";
    }
  };
  $("#teacher-login").addEventListener("click", submit);
  $("#staff-password").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  $("#staff-login").addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
});

async function renderTeacher() {
  staffActor = getStaffSession();
  if (!staffActor) {
    showView("login-view");
    return;
  }
  showView("teacher-view");
  const events = await getEvents();
  const selectedEventCode = window.__selectedEventCode || (events[0]?.code || "");
  window.__selectedEventCode = selectedEventCode;
  const [allCodes, results, teachers] = await Promise.all([
    getActiveCodes(selectedEventCode),
    getResults(selectedEventCode),
    staffActor.role === "admin" ? getTeachers() : Promise.resolve([]),
  ]);
  const activeCodes = allCodes.filter((c) => !c.used);
  const selectedEvent = events.find((e) => e.code === selectedEventCode) || null;
  const filteredResults = results;
  const sortedResults = [...filteredResults].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));

  // РђРЅР°Р»РёС‚РёС‡РµСЃРєРёРµ Р°РіСЂРµРіР°С‚С‹
  const totalCompleted = sortedResults.length;
  const avgScore = totalCompleted
    ? (sortedResults.reduce((acc, r) => acc + (Number(r.score) || 0), 0) / totalCompleted).toFixed(1)
    : 0;
  const maxScore = totalCompleted ? Math.max(...sortedResults.map((r) => r.score || 0)) : 0;
  const totalTabSwitches = sortedResults.reduce((acc, r) => acc + (r.tabSwitches || 0), 0);

  // РЎС‚Р°С‚РёСЃС‚РёРєР° СѓСЃРїРµС€РЅРѕСЃС‚Рё РїРѕ РєР°Р¶РґРѕРјСѓ Р·Р°РґР°РЅРёСЋ (1, 2, 3, 4, 6, 7, 8, 10)
  const taskNumbers = [1, 2, 3, 4, 6, 7, 8, 10];
  const taskStats = taskNumbers.map((num) => {
    if (!totalCompleted) return { num, correctPct: 0, count: 0 };
    let correctCount = 0;
    sortedResults.forEach((res) => {
      const task = res.answers?.find((a) => a.number === num);
      if (task && task.correct) correctCount += 1;
    });
    return {
      num,
      correctPct: Math.round((correctCount / totalCompleted) * 100),
      count: correctCount,
    };
  });

  $("#teacher-view").innerHTML = `
    <div class="teacher-wrap">
      <div class="teacher-header-bar">
        <div class="teacher-header-text">
          <p class="card-eyebrow">${staffActor.role === "admin" ? "РђРґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ" : "РЈС‡РёС‚РµР»СЊ"}</p>
          <h1>${staffActor.role === "admin" ? "РџР°РЅРµР»СЊ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂР°" : "РџР°РЅРµР»СЊ СѓС‡РёС‚РµР»СЏ"}</h1>
          <p class="panel-subtitle">${escapeHtml(staffActor.name)} В· СѓРїСЂР°РІР»РµРЅРёРµ РґРѕСЃС‚СѓРїРѕРј, Р°РЅР°Р»РёС‚РёРєР° Рё СЂРµР·СѓР»СЊС‚Р°С‚С‹ РћР“Р­.</p>
        </div>
        <div class="teacher-header-actions">
          <button class="button button-ghost" type="button" id="teacher-logout">Р’С‹Р№С‚Рё</button>
          <button class="button button-ghost" type="button" id="teacher-home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"/><path d="M9 6 3 12l6 6"/></svg>
            <span>РќР° РіР»Р°РІРЅСѓСЋ</span>
          </button>
        </div>
      </div>

      <div class="analytics-grid" aria-label="РЎРІРѕРґРЅР°СЏ Р°РЅР°Р»РёС‚РёРєР°">
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg></span>
            <span>РЎРґР°РЅРѕ СЂР°Р±РѕС‚</span>
          </div>
          <div class="analytic-number highlight">${totalCompleted}</div>
        </article>
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 16 4-4 3 3 5-7"/></svg></span>
            <span>РЎСЂРµРґРЅРёР№ Р±Р°Р»Р»</span>
          </div>
          <div class="analytic-number">${avgScore}<small class="analytic-suffix"> / 8</small></div>
        </article>
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>
            <span>РњР°РєСЃРёРјР°Р»СЊРЅС‹Р№ Р±Р°Р»Р»</span>
          </div>
          <div class="analytic-number">${maxScore}<small class="analytic-suffix"> / 8</small></div>
        </article>
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon analytic-icon-danger" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
            <span>РЈС…РѕРґРѕРІ СЃРѕ РІРєР»Р°РґРєРё</span>
          </div>
          <div class="analytic-number danger">${totalTabSwitches}</div>
        </article>
      </div>

      

      <section class="task-stats-panel" aria-label="РЈСЃРїРµС€РЅРѕСЃС‚СЊ РїРѕ Р·Р°РґР°РЅРёСЏРј">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">РЈСЃРїРµС€РЅРѕСЃС‚СЊ РїРѕ Р·Р°РґР°РЅРёСЏРј</h3>
            <p class="panel-subtitle">РџСЂРѕС†РµРЅС‚ РїСЂР°РІРёР»СЊРЅС‹С… РѕС‚РІРµС‚РѕРІ РїРѕ РєР°Р¶РґРѕРјСѓ РЅРѕРјРµСЂСѓ РїРµСЂРІРѕР№ С‡Р°СЃС‚Рё.</p>
          </div>
        </div>
        <div class="task-bars-grid">
          ${taskStats
      .map(
        (t) => `
            <div class="task-bar-col">
              <div class="task-bar-track" aria-hidden="true">
                <div class="task-bar-fill" style="height: ${Math.max(6, t.correctPct)}%"></div>
              </div>
              <span class="task-bar-label">в„–${t.num}</span>
              <span class="task-bar-pct">${t.correctPct}%</span>
            </div>`
      )
      .join("")}
        </div>
      </section>

      <div class="teacher-main-grid">
        <div class="teacher-sidebar">
          <div class="card">
            <div class="card-block-head">
              <h2>РџСЂРѕС„РёР»Рё СѓС‡РµРЅРёРєРѕРІ</h2>
              <p class="panel-subtitle">РўРѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂ/СѓС‡РёС‚РµР»СЊ СЃРѕР·РґР°С‘С‚ РїСЂРѕС„РёР»Рё РґР»СЏ С‚СЂРµРЅРёСЂРѕРІРєРё. Р’С‹РґР°Р№С‚Рµ СѓС‡РµРЅРёРєСѓ 6-Р·РЅР°С‡РЅС‹Р№ ID.</p>
            </div>
            <div class="form-group">
              <label for="new-profile-name">РРјСЏ Рё С„Р°РјРёР»РёСЏ</label>
              <input id="new-profile-name" class="task-answer-input" style="max-width:100%" placeholder="РРІР°РЅРѕРІ РРІР°РЅ">
            </div>
            <div class="form-group">
              <label for="new-profile-class">РљР»Р°СЃСЃ (РЅРµРѕР±СЏР·Р°С‚РµР»СЊРЅРѕ)</label>
              <input id="new-profile-class" class="task-answer-input" style="max-width:100%" placeholder="9Рђ">
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-profile">РЎРѕР·РґР°С‚СЊ РїСЂРѕС„РёР»СЊ</button>
            </div>
            <p id="created-profile-note" class="form-note hidden"></p>
          </div>

          <div class="card">
            <div class="card-block-head">
              <h2>РЎРѕР±С‹С‚РёСЏ</h2>
              <p class="panel-subtitle">РЎРѕР·РґР°Р№С‚Рµ СЃРѕР±С‹С‚РёРµ, СЂР°Р·РґР°Р№С‚Рµ РµРіРѕ ID Рё 6-Р·РЅР°С‡РЅС‹Рµ ID СѓС‡РµРЅРёРєРѕРІ. РЎС‚Р°С‚РёСЃС‚РёРєР° Рё Р°РЅС‚РёС‡РёС‚ СЂР°Р±РѕС‚Р°СЋС‚ РІРЅСѓС‚СЂРё СЃРѕР±С‹С‚РёСЏ.</p>
            </div>
            <div class="form-group">
              <label for="event-title">РќР°Р·РІР°РЅРёРµ СЃРѕР±С‹С‚РёСЏ</label>
              <input id="event-title" class="task-answer-input" style="max-width:100%" placeholder="РџСЂРѕР±РЅРёРє 9Рђ, РјР°СЂС‚">
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-event">РЎРѕР·РґР°С‚СЊ СЃРѕР±С‹С‚РёРµ</button>
            </div>
            <div class="form-group" style="margin-top:12px">
              <label for="event-select">РђРєС‚РёРІРЅРѕРµ СЃРѕР±С‹С‚РёРµ</label>
              <select id="event-select" class="task-answer-input" style="max-width:100%">
                ${events.length ? events.map((e) => `<option value="${escapeHtml(e.code)}" ${e.code===selectedEventCode?"selected":""}>${escapeHtml(e.title)} (${escapeHtml(e.code)})</option>`).join("") : `<option value="">РќРµС‚ СЃРѕР±С‹С‚РёР№</option>`}
              </select>
            </div>
            ${selectedEvent ? `<p class="form-note">ID СЃРѕР±С‹С‚РёСЏ: <b>${escapeHtml(selectedEvent.code)}</b></p>` : `<p class="form-note">РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№С‚Рµ СЃРѕР±С‹С‚РёРµ.</p>`}
          </div>

          ${staffActor.role === "admin" ? `
          <div class="card">
            <div class="card-block-head">
              <h2>РЈС‡РёС‚РµР»СЏ</h2>
              <p class="panel-subtitle">РќР°Р·РЅР°С‡СЊС‚Рµ СѓС‡РёС‚РµР»РµР№: РѕРЅРё СЃРјРѕРіСѓС‚ РІС…РѕРґРёС‚СЊ РїРѕ СЃРІРѕРµРјСѓ Р»РѕРіРёРЅСѓ Рё РїР°СЂРѕР»СЋ.</p>
            </div>
            <div class="form-group">
              <label for="new-teacher-name">РРјСЏ СѓС‡РёС‚РµР»СЏ</label>
              <input id="new-teacher-name" class="task-answer-input" style="max-width:100%" placeholder="РРІР°РЅРѕРІР° Рњ.Рђ.">
            </div>
            <div class="form-group">
              <label for="new-teacher-login">Р›РѕРіРёРЅ</label>
              <input id="new-teacher-login" class="task-answer-input" style="max-width:100%" placeholder="teacher1" autocomplete="off">
            </div>
            <div class="form-group">
              <label for="new-teacher-password">РџР°СЂРѕР»СЊ</label>
              <input id="new-teacher-password" class="task-answer-input" style="max-width:100%" placeholder="РџР°СЂРѕР»СЊ СѓС‡РёС‚РµР»СЏ" autocomplete="new-password">
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-teacher">Р”РѕР±Р°РІРёС‚СЊ СѓС‡РёС‚РµР»СЏ</button>
            </div>
            <div class="sidebar-section">
              <div class="sidebar-section-header">
                <span class="sidebar-section-title">РќР°Р·РЅР°С‡РµРЅРЅС‹Рµ СѓС‡РёС‚РµР»СЏ <span class="count-chip">${teachers.length}</span></span>
              </div>
              <div class="active-codes-list">
                ${teachers.length ? teachers.map((t) => `
                  <div class="code-item-row">
                    <span class="code-student" title="${escapeHtml(t.name)} (${escapeHtml(t.login)})">${escapeHtml(t.name)} В· <code>${escapeHtml(t.login)}</code></span>
                    <button class="button button-ghost button-compact" type="button" data-delete-teacher="${escapeHtml(t.id)}">РЈРґР°Р»РёС‚СЊ</button>
                  </div>`).join("") : '<div class="empty-note">РЈС‡РёС‚РµР»СЏ РЅРµ РЅР°Р·РЅР°С‡РµРЅС‹.</div>'}
              </div>
            </div>
          </div>` : ""}

                    <div class="card">
            <div class="card-block-head">
              <h2>ID СѓС‡РµРЅРёРєРѕРІ РґР»СЏ СЃРѕР±С‹С‚РёСЏ</h2>
              <p class="panel-subtitle">6-Р·РЅР°С‡РЅС‹Рµ РєРѕРґС‹. РЎРѕР·РґР°РІР°Р№С‚Рµ РёС… РІРЅСѓС‚СЂРё РІС‹Р±СЂР°РЅРЅРѕРіРѕ СЃРѕР±С‹С‚РёСЏ.</p>
            </div>

            <div class="form-group">
              <label for="students-class">РљР»Р°СЃСЃ (РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ)</label>
              <input id="students-class" class="task-answer-input" style="max-width:100%" placeholder="9Рђ" value="9Рђ">
            </div>
            <div class="form-group">
              <label for="students-names">РЎРїРёСЃРѕРє СѓС‡РµРЅРёРєРѕРІ</label>
              <textarea id="students-names" class="student-input-textarea" placeholder="РРІР°РЅРѕРІ Р.&#10;РџРµС‚СЂРѕРІР° Рђ.&#10;РЎРёРґРѕСЂРѕРІ Р”."></textarea>
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-named-codes" ${selectedEvent ? "" : "disabled"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                <span>РЎРѕР·РґР°С‚СЊ 6-Р·РЅР°С‡РЅС‹Рµ ID</span>
              </button>
            </div>

            <div class="sidebar-section">
              <div class="sidebar-section-header">
                <span class="sidebar-section-title">РђРєС‚РёРІРЅС‹Рµ ID <span class="count-chip">${activeCodes.length}</span></span>
                <button class="button button-ghost button-compact" type="button" id="copy-active-codes">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>РЎРєРѕРїРёСЂРѕРІР°С‚СЊ</span>
                </button>
              </div>
              <div class="active-codes-list">
                ${activeCodes.length
      ? activeCodes
        .map(
          (c) => `
                    <div class="code-item-row">
                      <span class="code-badge">${escapeHtml(c.code)}</span>
                      <span class="code-student" title="${escapeHtml(c.studentName || "РЈС‡РµРЅРёРє")} (${escapeHtml(c.className || "9Рђ")})">${escapeHtml(c.studentName || "РЈС‡РµРЅРёРє")} (${escapeHtml(c.className || "9Рђ")})</span>
                    </div>`
        )
        .join("")
      : '<div class="empty-note">РќРµС‚ Р°РєС‚РёРІРЅС‹С… ID. РЎРѕР·РґР°Р№С‚Рµ РёС… РІС‹С€Рµ.</div>'
    }
              </div>
            </div>

            ${staffActor.role === "admin" ? `
            <div class="sidebar-section sidebar-section-danger">
              <button class="button button-danger button-wide" type="button" id="clear-local-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>РћС‡РёСЃС‚РёС‚СЊ Р»РѕРєР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ</span>
              </button>
            </div>` : ""}
          </div>
        </div>

        <div class="teacher-content">
          <div class="card">
            <div class="results-header">
              <div>
                <h2>Р’РµРґРѕРјРѕСЃС‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ</h2>
                <p class="panel-subtitle">Р’СЃРµРіРѕ Р·Р°РїРёСЃРµР№: ${sortedResults.length}</p>
              </div>
              <div class="results-header-actions">
                <button class="button button-primary" type="button" id="download-csv-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                  <span>РЎРєР°С‡Р°С‚СЊ РІРµРґРѕРјРѕСЃС‚СЊ (.csv)</span>
                </button>
              </div>
            </div>

            <div class="table-responsive">
              ${sortedResults.length
      ? `
                <table class="table-results">
                  <thead>
                    <tr>
                      <th class="col-student">РЈС‡РµРЅРёРє (РРјСЏ Р¤.)</th>
                      <th class="col-class">РљР»Р°СЃСЃ</th>
                      <th class="col-code">ID</th>
                      <th class="col-event">РЎРѕР±С‹С‚РёРµ</th>
                      <th class="col-date">Р”Р°С‚Р°</th>
                      <th class="col-time">Р’СЂРµРјСЏ</th>
                      <th class="col-score">Р‘Р°Р»Р»С‹</th>
                      <th class="col-answers">РћС‚РІРµС‚С‹ РїРѕ Р·Р°РґР°РЅРёСЏРј</th>
                      <th class="col-exits">Р’С‹С…РѕРґС‹</th>
                      <th class="col-status">РЎС‚Р°С‚СѓСЃ</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sortedResults
        .map(
          (res) => `
                      <tr>
                        <td class="col-student"><b>${escapeHtml(res.studentName || res.fullName || "вЂ”")}</b></td>
                        <td class="col-class">${escapeHtml(res.className || "вЂ”")}</td>
                        <td class="col-code"><code>${escapeHtml(res.code)}</code></td>
                        <td class="col-event">${res.eventCode ? `<div><b>${escapeHtml(res.eventTitle || "РЎРѕР±С‹С‚РёРµ")}</b><div class="muted small">${escapeHtml(res.eventCode)}</div></div>` : '<span class="muted">РўСЂРµРЅРёСЂРѕРІРєР°</span>'}</td>
                        <td class="col-date">${escapeHtml(new Date(res.finishedAt).toLocaleString("ru-RU"))}</td>
                        <td class="col-time">${formatDuration(res.durationSeconds)}</td>
                        <td class="col-score score-cell">${res.score} / 8</td>
                        <td class="col-answers answers-cell">
                          ${(res.answers || [])
              .map((a) => `в„–${a.number}: В«${escapeHtml(a.answer || "вЂ”")}В» ${a.correct ? "вњ“" : "вњ—"}`)
              .join(" В· ")}
                        </td>
                        <td class="col-exits"><span style="color:${res.tabSwitches > 0 ? "var(--danger-text)" : "inherit"};font-weight:700">${res.mode === "practice" ? "вЂ”" : res.tabSwitches}</span></td>
                        <td class="col-status">
                          <span class="status-badge ${res.status.includes("РџСЂРёРЅСѓРґРёС‚РµР»СЊРЅРѕ") ? "forced" : "completed"}">
                            ${escapeHtml(res.status)}
                          </span>
                        </td>
                      </tr>`
        )
        .join("")}
                  </tbody>
                </table>`
      : '<div class="empty-state">РџРѕРєР° РЅРµС‚ СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ РїРѕ РІС‹Р±СЂР°РЅРЅРѕРјСѓ С„РёР»СЊС‚СЂСѓ.</div>'
    }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // РћР±СЂР°Р±РѕС‚С‡РёРєРё РїР°РЅРµР»Рё СѓС‡РёС‚РµР»СЏ
  $("#teacher-home").addEventListener("click", () => showView("login-view"));
  $("#teacher-logout").addEventListener("click", () => {
    clearStaffSession();
    staffActor = null;
    showView("login-view");
  });

  $("#btn-create-profile")?.addEventListener("click", async () => {
    const name = $("#new-profile-name").value.trim();
    const className = $("#new-profile-class").value.trim();
    const note = $("#created-profile-note");
    try {
      const profile = await registerProfile({ name, className });
      $("#new-profile-name").value = "";
      $("#new-profile-class").value = "";
      if (note) {
        note.textContent = `РџСЂРѕС„РёР»СЊ СЃРѕР·РґР°РЅ: ${profile.name} вЂ” ID ${profile.code}. Р’С‹РґР°Р№С‚Рµ СЌС‚РѕС‚ ID СѓС‡РµРЅРёРєСѓ.`;
        note.classList.remove("hidden");
      }
    } catch (err) { alert(err.message || "РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ РїСЂРѕС„РёР»СЊ."); }
  });

  $("#btn-create-event")?.addEventListener("click", async () => {
    const title = $("#event-title").value.trim();
    try {
      const ev = await createEvent({ title, owner: staffActor.name });
      window.__selectedEventCode = ev.code;
      await renderTeacher();
    } catch (err) { alert(err.message || "Не удалось создать событие."); }
  });
  $("#event-select")?.addEventListener("change", async (e) => {
    window.__selectedEventCode = e.target.value;
    await renderTeacher();
  });

  if (staffActor.role === "admin") {
    $("#btn-create-teacher")?.addEventListener("click", async () => {
      const name = $("#new-teacher-name").value.trim();
      const login = $("#new-teacher-login").value.trim();
      const password = $("#new-teacher-password").value.trim();
      try {
        await createTeacher({ name, login, password });
        await renderTeacher();
      } catch (err) {
        alert(err.message || "РќРµ СѓРґР°Р»РѕСЃСЊ РґРѕР±Р°РІРёС‚СЊ СѓС‡РёС‚РµР»СЏ.");
      }
    });
    document.querySelectorAll("[data-delete-teacher]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-teacher");
        if (!id) return;
        if (!confirm("РЈРґР°Р»РёС‚СЊ СЌС‚РѕРіРѕ СѓС‡РёС‚РµР»СЏ?")) return;
        await deleteTeacher(id);
        await renderTeacher();
      });
    });
    $("#clear-local-btn")?.addEventListener("click", () => {
      modal(`
        <div class="modal-header">
          <div class="modal-icon modal-icon-danger" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </div>
          <div>
            <h2>РћС‡РёСЃС‚РёС‚СЊ Р»РѕРєР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ?</h2>
            <p>Р‘СѓРґСѓС‚ СѓРґР°Р»РµРЅС‹ Р»РѕРєР°Р»СЊРЅС‹Рµ РєРѕРґС‹, СЂРµР·СѓР»СЊС‚Р°С‚С‹ Рё СѓС‡РёС‚РµР»СЏ РЅР° СЌС‚РѕРј СѓСЃС‚СЂРѕР№СЃС‚РІРµ. Р”РµР№СЃС‚РІРёРµ РЅРµР»СЊР·СЏ РѕС‚РјРµРЅРёС‚СЊ.</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button button-ghost" type="button" id="cancel-clear">РћС‚РјРµРЅР°</button>
          <button class="button button-danger" type="button" id="confirm-clear">РћС‡РёСЃС‚РёС‚СЊ</button>
        </div>
      `);
      $("#cancel-clear").addEventListener("click", clearModal);
      $("#confirm-clear").addEventListener("click", async () => {
        await clearLocalData();
        clearModal();
        clearStaffSession();
        staffActor = null;
        showView("login-view");
      });
    });
  }

  $("#btn-create-named-codes")?.addEventListener("click", async () => {
    const rawNames = $("#students-names").value;
    const defaultCls = $("#students-class").value.trim() || "9Рђ";
    const lines = rawNames.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!selectedEvent) { alert("РЎРЅР°С‡Р°Р»Р° СЃРѕР·РґР°Р№С‚Рµ РёР»Рё РІС‹Р±РµСЂРёС‚Рµ СЃРѕР±С‹С‚РёРµ."); return; }
    if (lines.length === 0) { alert("Р’РІРµРґРёС‚Рµ С…РѕС‚СЏ Р±С‹ РѕРґРЅРѕ РёРјСЏ СѓС‡РµРЅРёРєР°."); return; }
    try {
      const created = await createStudentCodes(lines, defaultCls, selectedEvent);
      $("#students-names").value = "";
      await renderTeacher();
      modal(`
        <h2>ID СЃРѕР·РґР°РЅС‹</h2>
        <p>РЎРѕР±С‹С‚РёРµ: <b>${escapeHtml(selectedEvent.title)}</b> (${escapeHtml(selectedEvent.code)})</p>
        <p>РЎРѕР·РґР°РЅРѕ 6-Р·РЅР°С‡РЅС‹С… ID: <b>${created.length}</b>.</p>
        <div class="modal-actions"><button class="button button-primary" type="button" id="modal-ok">РћС‚Р»РёС‡РЅРѕ</button></div>
      `);
      $("#modal-ok").addEventListener("click", clearModal);
    } catch (err) {
      alert(err.message || "РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєРѕРґРѕРІ");
    }
  });

  $("#copy-active-codes").addEventListener("click", async () => {
    const active = activeCodes;
    if (!active.length) {
      alert("РќРµС‚ Р°РєС‚РёРІРЅС‹С… РєРѕРґРѕРІ.");
      return;
    }
    const text = active
      .map((item) => `${item.code} вЂ” ${item.studentName || "РЈС‡РµРЅРёРє"} (${item.className || "9Рђ"})`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      alert(`РЎРєРѕРїРёСЂРѕРІР°РЅРѕ ${active.length} РєРѕРґРѕРІ РІ Р±СѓС„РµСЂ РѕР±РјРµРЅР°!`);
    } catch {
      modal(`
        <div class="modal-header">
          <div class="modal-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </div>
          <div>
            <h2>РЎРїРёСЃРѕРє Р°РєС‚РёРІРЅС‹С… РєРѕРґРѕРІ</h2>
            <p>РЎРєРѕРїРёСЂСѓР№С‚Рµ РєРѕРґС‹ РІСЂСѓС‡РЅСѓСЋ.</p>
          </div>
        </div>
        <textarea class="student-input-textarea" style="min-height:160px" readonly>${escapeHtml(text)}</textarea>
        <div class="modal-actions">
          <button class="button button-primary" type="button" id="close-copy">Р—Р°РєСЂС‹С‚СЊ</button>
        </div>
      `);
      $("#close-copy").addEventListener("click", clearModal);
    }
  });

  $("#download-csv-btn").addEventListener("click", () => downloadCsv(sortedResults));
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(results) {
  const answerColumns = [1, 2, 3, 4, 6, 7, 8, 10];
  const header = [
    "РРјСЏ Р¤.",
    "РљР»Р°СЃСЃ",
    "ID",
    "РЎРѕР±С‹С‚РёРµ",
    "Р РµР¶РёРј",
    "Р”Р°С‚Р° РЅР°С‡Р°Р»Р°",
    "Р”Р°С‚Р° Р·Р°РІРµСЂС€РµРЅРёСЏ",
    "Р—Р°С‚СЂР°С‡РµРЅРЅРѕРµ РІСЂРµРјСЏ",
    "Р‘Р°Р»Р»С‹",
    ...answerColumns.map((n) => `Р—Р°РґР°РЅРёРµ ${n}`),
    "РљРѕР»РёС‡РµСЃС‚РІРѕ РІС‹С…РѕРґРѕРІ",
    "РЎС‚Р°С‚СѓСЃ Р·Р°РІРµСЂС€РµРЅРёСЏ",
  ];

  const lines = [
    header,
    ...results.map((res) => {
      const answerMap = Object.fromEntries(
        (res.answers || []).map((item) => [
          item.number,
          `${item.answer || ""}${item.correct ? " (РІРµСЂРЅРѕ)" : " (РЅРµРІРµСЂРЅРѕ)"}`,
        ])
      );
      return [
        res.studentName || res.fullName || "",
        res.className || "",
        res.code,
        res.eventTitle || res.eventCode || "",
        res.mode || "",
        new Date(res.startedAt).toLocaleString("ru-RU"),
        new Date(res.finishedAt).toLocaleString("ru-RU"),
        formatDuration(res.durationSeconds),
        `${res.score}/8`,
        ...answerColumns.map((n) => answerMap[n] || ""),
        res.tabSwitches || 0,
        res.status,
      ];
    }),
  ]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n");

  const blob = new Blob(["\uFEFF", lines], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `oge-vedomost-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Р—Р°РїСѓСЃРє РёРЅРёС†РёР°Р»РёР·Р°С†РёРё РїСЂРёР»РѕР¶РµРЅРёСЏ
initialize();


