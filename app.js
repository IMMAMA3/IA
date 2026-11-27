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
} from "./storage.js?v=20261127h";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const views = ["login-view", "exam-view", "result-view", "teacher-view"];

let session = null;
let currentIndex = 0;
let timerHandle = null;
let awayActive = false;
let examFinished = false;
let inputSaveTimer = null;
let staffActor = getStaffSession();
let studentProfile = getLocalProfile();
let loginMode = "profile"; // profile | event (legacy; event entry now inside profile)

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

// ---------------- ТЕМА ОФОРМЛЕНИЯ (DARK / LIGHT) ----------------

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

// ---------------- ИНИЦИАЛИЗАЦИЯ ----------------

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
  showProfileDashboard();
  bindProfileDashboard();

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
        await finishExam("Время истекло");
        return;
      }
      activateExam();
    }
  } catch (err) {
    console.warn("Session restore failed:", err);
  }
}


// ---------------- ВХОД УЧЕНИКА (ТОЛЬКО ID) ----------------

function bindProfileDashboard() {
  $("#profile-logout")?.addEventListener("click", () => {
    localStorage.removeItem("oge.profile.v1");
    studentProfile = null;
    $("#profile-name").value = "";
    $("#profile-code").value = "";
    $("#profile-event-code").value = "";
    $("#profile-event-student-code").value = "";
    $("#profile-event-error").textContent = "";
    showProfileDashboard();
  });

  $("#start-practice-btn")?.addEventListener("click", async () => {
    const err = $("#profile-event-error");
    err.textContent = "";
    try {
      if (!studentProfile?.code) throw new Error("Сначала войдите в профиль.");
      const created = await startExam({ code: studentProfile.code, questions: createExam(), profile: studentProfile });
      session = created;
      currentIndex = 0;
      activateExam();
    } catch (e) {
      err.textContent = e.message || "Не удалось начать тренировку.";
    }
  });

  $("#start-event-btn")?.addEventListener("click", async () => {
    const err = $("#profile-event-error");
    err.textContent = "";
    const btn = $("#start-event-btn");
    btn.disabled = true;
    try {
      const eventCode = String($("#profile-event-code").value || "").trim().toUpperCase();
      const code = String($("#profile-event-student-code").value || "").trim().toUpperCase();
      if (!/^EVT-\d{6}$/.test(eventCode)) throw new Error("Введите корректный ID события (EVT-123456).");
      if (!/^\d{6}$/.test(code)) throw new Error("Введите 6-значный ID участника.");
      const created = await startExam({ code, questions: createExam(), eventCode, profile: studentProfile });
      session = created;
      currentIndex = 0;
      activateExam();
    } catch (e) {
      err.textContent = e.message || "Не удалось войти в событие.";
    } finally {
      btn.disabled = false;
    }
  });
}

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

function showProfileDashboard() {
  const logged = !!studentProfile?.code;
  $("#login-form")?.classList.toggle("hidden", logged);
  $("#profile-dashboard")?.classList.toggle("hidden", !logged);
  if (logged) {
    $("#profile-greeting").textContent = studentProfile.name || "Ученик";
    const meta = [studentProfile.className, `ID ${studentProfile.code}`].filter(Boolean).join(" · ");
    $("#profile-meta").textContent = meta;
  }
  renderProfileHistory();
}

async function renderProfileHistory() {
  const box = $("#profile-history");
  if (!box) return;
  if (!studentProfile?.code) {
    box.innerHTML = `<div class="empty-note">Создайте профиль или войдите, чтобы видеть историю.</div>`;
    return;
  }
  box.innerHTML = `<div class="empty-note">Загружаем историю…</div>`;
  try {
    const history = await getProfileHistory(studentProfile.code);
    if (!history.length) {
      box.innerHTML = `<div class="empty-note">Пока нет завершённых попыток.</div>`;
      return;
    }
    box.innerHTML = history.slice(0, 8).map((r) => `
      <div class="history-row">
        <div>
          <b>${r.score}/8</b> <span class="muted">· ${escapeHtml(new Date(r.finishedAt).toLocaleString("ru-RU"))}</span>
          <div class="muted small">${r.eventCode ? `Событие: ${escapeHtml(r.eventTitle || r.eventCode)}` : "Тренировка"}</div>
        </div>
        <span class="status-badge ${String(r.status).includes("Принуд") ? "forced" : "completed"}">${escapeHtml(r.status)}</span>
      </div>`).join("");
  } catch {
    box.innerHTML = `<div class="empty-note">Не удалось загрузить историю.</div>`;
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
    const name = String(form.get("profileName") || "").trim();
    const code = String(form.get("profileCode") || "").trim().toUpperCase();
    if (!/^\d{6}$/.test(code)) throw new Error("Введите 6-значный ID профиля.");
    const profile = await loginProfile({ code, name });
    studentProfile = profile;
    showProfileDashboard();
  } catch (error) {
    errorEl.textContent = error.message || "Не удалось войти.";
  } finally {
    submitBtn.disabled = false;
    submitBtn.style.opacity = "1";
  }
});

// ---------------- ЭКРАН ЭКЗАМЕНА ----------------

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
        `<button class="nav-task ${index === currentIndex ? "current" : ""} ${String(session.answers[item.number] ?? "").trim() ? "answered" : ""}" data-index="${index}" aria-label="Задание ${item.number}">${item.number}</button>`
    )
    .join("");

  const inputType = question.answerType === "number" ? "number" : "text";
  const modeLabel = session.mode === "event"
    ? `Событие: ${escapeHtml(session.eventTitle || session.eventCode || "")}`
    : "Тренировка";

  root.innerHTML = `
    <div class="exam-topbar">
      <div class="student-meta">
        <div class="student-avatar" aria-hidden="true">${escapeHtml((session.studentName || "У")[0])}</div>
        <div class="student-meta-text">
          <b>${escapeHtml(session.studentName || "Ученик")}${session.className ? ` <span style="color:var(--text-muted);font-weight:600">(${escapeHtml(session.className)})</span>` : ""}</b>
          <span>${modeLabel} · ID: ${escapeHtml(session.code)}</span>
        </div>
      </div>
      <div id="timer" class="timer-box" aria-live="polite">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
        <span class="timer-value">30:00</span>
      </div>
    </div>

    <div class="exam-layout">
      <aside class="card task-nav" aria-label="Навигация по заданиям">
        <p class="nav-header">Навигация по тесту</p>
        <div class="nav-grid">${nav}</div>
        <div class="nav-legend" aria-label="Обозначения">
          <div class="legend-item"><span class="legend-color legend-color-current" aria-hidden="true"></span><span>Текущий вопрос</span></div>
          <div class="legend-item"><span class="legend-color legend-color-answered" aria-hidden="true"></span><span>Ответ сохранён</span></div>
          <div class="legend-item"><span class="legend-color legend-color-empty" aria-hidden="true"></span><span>Не отвечено</span></div>
        </div>
      </aside>

      <article class="card task-content-card">
        <div class="task-eyebrow">
          <span class="task-pill">Задание ${question.number}</span>
          <span class="task-points">1 первичный балл</span>
        </div>
        <h2 class="task-title">${escapeHtml(question.title)}</h2>
        <div class="task-prompt">${question.prompt}</div>

        <div class="task-answer-box">
          <label for="answer-input">Ответ на задание</label>
          <input
            id="answer-input"
            class="task-answer-input"
            type="${inputType}"
            inputmode="${inputType === "number" ? "numeric" : "text"}"
            autocomplete="off"
            spellcheck="false"
            value="${escapeHtml(session.answers[question.number] ?? "")}"
            placeholder="Введите ответ"
            aria-label="Ответ на задание ${question.number}"
          >
        </div>

        <div class="task-nav-buttons">
          <button class="button button-ghost" type="button" id="prev-task" ${currentIndex === 0 ? "disabled" : ""}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            <span>Предыдущее</span>
          </button>
          <button class="button button-primary" type="button" id="next-task">
            <span>${currentIndex === session.questions.length - 1 ? "К проверке" : "Следующее"}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </button>
        </div>
      </article>
    </div>

    <div class="exam-footer-bar">
      <div class="progress-info">
        <span class="progress-meta">Прогресс: <b>${answeredCount} из ${session.questions.length}</b></span>
        <div class="progress-bar-wrap" aria-hidden="true">
          <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
        </div>
      </div>
      <button class="button button-danger" type="button" id="finish-exam">
        <span>Завершить и отправить</span>
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
        progressSpan.textContent = `${newAnsweredCount} из ${session.questions.length}`;
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
  if (remaining <= 0) finishExam("Время истекло");
}

function confirmFinish() {
  const answeredCount = session.questions.filter((item) =>
    String(session.answers[item.number] ?? "").trim()
  ).length;
  const unanswered = session.questions.length - answeredCount;

  modal(`
    <h2>Завершить тестирование?</h2>
    <p>${unanswered > 0 ? `Вы не ответили на <b>${unanswered}</b> из 8 заданий.` : "Все 8 заданий заполнены."} После отправки изменить ответы будет невозможно.</p>
    <div class="modal-actions">
      <button class="button button-ghost" type="button" id="cancel-modal">Вернуться</button>
      <button class="button button-primary" type="button" id="confirm-finish">Отправить работу</button>
    </div>
  `);
  $("#cancel-modal").addEventListener("click", clearModal);
  $("#confirm-finish").addEventListener("click", () => {
    clearModal();
    finishExam("Завершён штатно");
  });
}

// ---------------- ЗАВЕРШЕНИЕ ЭКЗАМЕНА ----------------

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
    studentName: session.studentName || "Ученик",
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
  return `${minutes} мин ${String(seconds % 60).padStart(2, "0")} сек`;
}

function showResult(result) {
  showView("result-view");
  const grade =
    result.score >= 7 ? "Отлично (оценка 5)" :
    result.score >= 5 ? "Хорошо (оценка 4)" :
    result.score >= 3 ? "Удовлетворительно (оценка 3)" :
    "Требуется повторение (оценка 2)";
  const gradeTone = result.score >= 5 ? "success" : result.score >= 3 ? "warn" : "danger";

  $("#result-view").innerHTML = `
    <div class="card result-card">
      <div class="result-header">
        <div class="result-badge" aria-hidden="true">
          ${result.score >= 5
            ? '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
            : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>'}
        </div>
        <p class="card-eyebrow">${result.mode === "practice" ? "Результат тренировки" : "Результат тестирования"}</p>
        <h2>${result.mode === "practice" ? "Тренировка завершена" : "Работа завершена"}</h2>
      </div>

      <div class="result-score-banner">
        <div class="result-big-number">${result.score}<small> / 8</small></div>
        <div class="result-grade" data-tone="${gradeTone}">${grade}</div>
      </div>

      <div class="result-details-grid">
        <div class="result-detail-box">
          <span>Ученик</span>
          <b>${escapeHtml(result.studentName)}</b>
        </div>
        <div class="result-detail-box">
          <span>Время работы</span>
          <b>${formatDuration(result.durationSeconds)}</b>
        </div>
        <div class="result-detail-box">
          <span>${result.mode === "practice" ? "Режим" : "ID / событие"}</span>
          <b>${escapeHtml(result.mode === "practice" ? "Тренировка" : `${result.code}${result.eventCode ? ` · ${result.eventCode}` : ""}`)}</b>
        </div>
      </div>

      <h3 class="section-title">Разбор заданий</h3>
      <div class="review-list">
        ${result.answers
      .map(
        (item) => `
          <div class="review-row ${item.correct ? "correct" : "wrong"}">
            <span class="review-row-main"><span class="review-num">Задание ${item.number}</span><b>${escapeHtml(item.title)}</b></span>
            <span class="review-status-tag">
              ${item.correct
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Верно</span>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg><span>Ошибка</span>'}
            </span>
          </div>`
      )
      .join("")}
      </div>

      <div class="result-actions">
        <button class="button button-ghost" type="button" id="to-login-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"/><path d="M9 6 3 12l6 6"/></svg>
          <span>Вернуться на главную</span>
        </button>
      </div>
    </div>
  `;

  $("#to-login-btn").addEventListener("click", () => {
    showView("login-view");
  });
}

// ---------------- АНТИЧИТ (УХОД С ВКЛАДКИ) ----------------

function registerDeparture() {
  if (!session || examFinished || awayActive) return;
  if (session.mode !== "event") return; // античит только для событий
  awayActive = true;
  handleDeparture();
}

async function handleDeparture() {
  const count = await recordTabSwitch();
  if (!session || examFinished) return;
  session.tabSwitches = count;

  if (count >= 3) {
    await finishExam("Принудительно (уход со вкладки)");
    modal(`
      <div class="modal-header">
        <div class="modal-icon modal-icon-danger" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
        </div>
        <div>
          <h2>Тестирование остановлено</h2>
          <p>Зафиксирован 3-й уход с вкладки. Работа автоматически завершена и передана учителю со статусом нарушения.</p>
        </div>
      </div>
      <div class="modal-actions">
        <button class="button button-primary" type="button" id="close-forced">Понятно</button>
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
        <p class="warning-eyebrow">Нарушение ${count} из 3</p>
        <h2 id="warning-title">Не покидайте страницу экзамена</h2>
        <p>Зафиксировано переключение окна. При 3-м нарушении тест завершится автоматически без возможности продолжения.</p>
        <button class="button button-primary" type="button" id="return-exam">Вернуться к выполнению</button>
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

// ---------------- ПАНЕЛЬ УЧИТЕЛЯ (ДАШБОРД + СТАТИСТИКА) ----------------

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
        <h2>Вход в панель</h2>
        <p>Администратор входит по паролю. Учитель — по логину и паролю.</p>
      </div>
    </div>
    <div class="form-group">
      <label for="staff-login">Логин учителя (для админа оставьте пустым)</label>
      <input id="staff-login" type="text" class="task-answer-input" style="max-width:100%" autocomplete="username" placeholder="teacher1">
    </div>
    <div class="form-group">
      <label for="staff-password">Пароль</label>
      <input id="staff-password" type="password" class="task-answer-input" style="max-width:100%" autocomplete="current-password" placeholder="Введите пароль">
    </div>
    <p id="teacher-login-error" class="form-error" aria-live="polite"></p>
    <div class="modal-actions">
      <button class="button button-ghost" type="button" id="teacher-cancel">Отмена</button>
      <button class="button button-primary" type="button" id="teacher-login">Войти</button>
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
      $("#teacher-login-error").textContent = err.message || "Ошибка входа.";
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

  // Аналитические агрегаты
  const totalCompleted = sortedResults.length;
  const avgScore = totalCompleted
    ? (sortedResults.reduce((acc, r) => acc + (Number(r.score) || 0), 0) / totalCompleted).toFixed(1)
    : 0;
  const maxScore = totalCompleted ? Math.max(...sortedResults.map((r) => r.score || 0)) : 0;
  const totalTabSwitches = sortedResults.reduce((acc, r) => acc + (r.tabSwitches || 0), 0);

  // Статистика успешности по каждому заданию (1, 2, 3, 4, 6, 7, 8, 10)
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
          <p class="card-eyebrow">${staffActor.role === "admin" ? "Администратор" : "Учитель"}</p>
          <h1>${staffActor.role === "admin" ? "Панель администратора" : "Панель учителя"}</h1>
          <p class="panel-subtitle">${escapeHtml(staffActor.name)} · управление доступом, аналитика и результаты ОГЭ.</p>
        </div>
        <div class="teacher-header-actions">
          <button class="button button-ghost" type="button" id="teacher-logout">Выйти</button>
          <button class="button button-ghost" type="button" id="teacher-home">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"/><path d="M9 6 3 12l6 6"/></svg>
            <span>На главную</span>
          </button>
        </div>
      </div>

      <div class="analytics-grid" aria-label="Сводная аналитика">
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6"/><path d="M23 11h-6"/></svg></span>
            <span>Сдано работ</span>
          </div>
          <div class="analytic-number highlight">${totalCompleted}</div>
        </article>
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m7 16 4-4 3 3 5-7"/></svg></span>
            <span>Средний балл</span>
          </div>
          <div class="analytic-number">${avgScore}<small class="analytic-suffix"> / 8</small></div>
        </article>
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>
            <span>Максимальный балл</span>
          </div>
          <div class="analytic-number">${maxScore}<small class="analytic-suffix"> / 8</small></div>
        </article>
        <article class="analytic-card">
          <div class="analytic-card-head">
            <span class="analytic-icon analytic-icon-danger" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
            <span>Уходов со вкладки</span>
          </div>
          <div class="analytic-number danger">${totalTabSwitches}</div>
        </article>
      </div>

      

      <section class="task-stats-panel" aria-label="Успешность по заданиям">
        <div class="panel-head">
          <div>
            <h3 class="panel-title">Успешность по заданиям</h3>
            <p class="panel-subtitle">Процент правильных ответов по каждому номеру первой части.</p>
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
              <span class="task-bar-label">№${t.num}</span>
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
              <h2>Профили учеников</h2>
              <p class="panel-subtitle">Только администратор/учитель создаёт профили для тренировки. Выдайте ученику 6-значный ID.</p>
            </div>
            <div class="form-group">
              <label for="new-profile-name">Имя и фамилия</label>
              <input id="new-profile-name" class="task-answer-input" style="max-width:100%" placeholder="Иванов Иван">
            </div>
            <div class="form-group">
              <label for="new-profile-class">Класс (необязательно)</label>
              <input id="new-profile-class" class="task-answer-input" style="max-width:100%" placeholder="9А">
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-profile">Создать профиль</button>
            </div>
            <p id="created-profile-note" class="form-note hidden"></p>
          </div>

          <div class="card">
            <div class="card-block-head">
              <h2>События</h2>
              <p class="panel-subtitle">Создайте событие, раздайте его ID и 6-значные ID учеников. Статистика и античит работают внутри события.</p>
            </div>
            <div class="form-group">
              <label for="event-title">Название события</label>
              <input id="event-title" class="task-answer-input" style="max-width:100%" placeholder="Пробник 9А, март">
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-event">Создать событие</button>
            </div>
            <div class="form-group" style="margin-top:12px">
              <label for="event-select">Активное событие</label>
              <select id="event-select" class="task-answer-input" style="max-width:100%">
                ${events.length ? events.map((e) => `<option value="${escapeHtml(e.code)}" ${e.code===selectedEventCode?"selected":""}>${escapeHtml(e.title)} (${escapeHtml(e.code)})</option>`).join("") : `<option value="">Нет событий</option>`}
              </select>
            </div>
            ${selectedEvent ? `<p class="form-note">ID события: <b>${escapeHtml(selectedEvent.code)}</b></p>` : `<p class="form-note">Сначала создайте событие.</p>`}
          </div>

          ${staffActor.role === "admin" ? `
          <div class="card">
            <div class="card-block-head">
              <h2>Учителя</h2>
              <p class="panel-subtitle">Назначьте учителей: они смогут входить по своему логину и паролю.</p>
            </div>
            <div class="form-group">
              <label for="new-teacher-name">Рмя учителя</label>
              <input id="new-teacher-name" class="task-answer-input" style="max-width:100%" placeholder="Рванова М.А.">
            </div>
            <div class="form-group">
              <label for="new-teacher-login">Логин</label>
              <input id="new-teacher-login" class="task-answer-input" style="max-width:100%" placeholder="teacher1" autocomplete="off">
            </div>
            <div class="form-group">
              <label for="new-teacher-password">Пароль</label>
              <input id="new-teacher-password" class="task-answer-input" style="max-width:100%" placeholder="Пароль учителя" autocomplete="new-password">
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-teacher">Добавить учителя</button>
            </div>
            <div class="sidebar-section">
              <div class="sidebar-section-header">
                <span class="sidebar-section-title">Назначенные учителя <span class="count-chip">${teachers.length}</span></span>
              </div>
              <div class="active-codes-list">
                ${teachers.length ? teachers.map((t) => `
                  <div class="code-item-row">
                    <span class="code-student" title="${escapeHtml(t.name)} (${escapeHtml(t.login)})">${escapeHtml(t.name)} · <code>${escapeHtml(t.login)}</code></span>
                    <button class="button button-ghost button-compact" type="button" data-delete-teacher="${escapeHtml(t.id)}">Удалить</button>
                  </div>`).join("") : '<div class="empty-note">Учителя не назначены.</div>'}
              </div>
            </div>
          </div>` : ""}

                    <div class="card">
            <div class="card-block-head">
              <h2>ID учеников для события</h2>
              <p class="panel-subtitle">6-значные коды. Создавайте их внутри выбранного события.</p>
            </div>

            <div class="form-group">
              <label for="students-class">Класс (по умолчанию)</label>
              <input id="students-class" class="task-answer-input" style="max-width:100%" placeholder="9А" value="9А">
            </div>
            <div class="form-group">
              <label for="students-names">Список учеников</label>
              <textarea id="students-names" class="student-input-textarea" placeholder="Рванов Р.&#10;Петрова А.&#10;Сидоров Д."></textarea>
            </div>
            <div class="sidebar-actions">
              <button class="button button-primary" type="button" id="btn-create-named-codes" ${selectedEvent ? "" : "disabled"}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                <span>Создать 6-значные ID</span>
              </button>
            </div>

            <div class="sidebar-section">
              <div class="sidebar-section-header">
                <span class="sidebar-section-title">Активные ID <span class="count-chip">${activeCodes.length}</span></span>
                <button class="button button-ghost button-compact" type="button" id="copy-active-codes">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span>Скопировать</span>
                </button>
              </div>
              <div class="active-codes-list">
                ${activeCodes.length
      ? activeCodes
        .map(
          (c) => `
                    <div class="code-item-row">
                      <span class="code-badge">${escapeHtml(c.code)}</span>
                      <span class="code-student" title="${escapeHtml(c.studentName || "Ученик")} (${escapeHtml(c.className || "9А")})">${escapeHtml(c.studentName || "Ученик")} (${escapeHtml(c.className || "9А")})</span>
                    </div>`
        )
        .join("")
      : '<div class="empty-note">Нет активных ID. Создайте их выше.</div>'
    }
              </div>
            </div>

            ${staffActor.role === "admin" ? `
            <div class="sidebar-section sidebar-section-danger">
              <button class="button button-danger button-wide" type="button" id="clear-local-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>Очистить локальные данные</span>
              </button>
            </div>` : ""}
          </div>
        </div>

        <div class="teacher-content">
          <div class="card">
            <div class="results-header">
              <div>
                <h2>Ведомость результатов</h2>
                <p class="panel-subtitle">Всего записей: ${sortedResults.length}</p>
              </div>
              <div class="results-header-actions">
                <button class="button button-primary" type="button" id="download-csv-btn">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                  <span>Скачать ведомость (.csv)</span>
                </button>
              </div>
            </div>

            <div class="table-responsive">
              ${sortedResults.length
      ? `
                <table class="table-results">
                  <thead>
                    <tr>
                      <th class="col-student">Ученик (Рмя Ф.)</th>
                      <th class="col-class">Класс</th>
                      <th class="col-code">ID</th>
                      <th class="col-event">Событие</th>
                      <th class="col-date">Дата</th>
                      <th class="col-time">Время</th>
                      <th class="col-score">Баллы</th>
                      <th class="col-answers">Ответы по заданиям</th>
                      <th class="col-exits">Выходы</th>
                      <th class="col-status">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sortedResults
        .map(
          (res) => `
                      <tr>
                        <td class="col-student"><b>${escapeHtml(res.studentName || res.fullName || "—")}</b></td>
                        <td class="col-class">${escapeHtml(res.className || "—")}</td>
                        <td class="col-code"><code>${escapeHtml(res.code)}</code></td>
                        <td class="col-event">${res.eventCode ? `<div><b>${escapeHtml(res.eventTitle || "Событие")}</b><div class="muted small">${escapeHtml(res.eventCode)}</div></div>` : '<span class="muted">Тренировка</span>'}</td>
                        <td class="col-date">${escapeHtml(new Date(res.finishedAt).toLocaleString("ru-RU"))}</td>
                        <td class="col-time">${formatDuration(res.durationSeconds)}</td>
                        <td class="col-score score-cell">${res.score} / 8</td>
                        <td class="col-answers answers-cell">
                          ${(res.answers || [])
              .map((a) => `№${a.number}: «${escapeHtml(a.answer || "—")}» ${a.correct ? "✓" : "✗"}`)
              .join(" · ")}
                        </td>
                        <td class="col-exits"><span style="color:${res.tabSwitches > 0 ? "var(--danger-text)" : "inherit"};font-weight:700">${res.mode === "practice" ? "—" : res.tabSwitches}</span></td>
                        <td class="col-status">
                          <span class="status-badge ${res.status.includes("Принудительно") ? "forced" : "completed"}">
                            ${escapeHtml(res.status)}
                          </span>
                        </td>
                      </tr>`
        )
        .join("")}
                  </tbody>
                </table>`
      : '<div class="empty-state">Пока нет результатов по выбранному фильтру.</div>'
    }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Обработчики панели учителя
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
        note.textContent = `Профиль создан: ${profile.name} — ID ${profile.code}. Выдайте этот ID ученику.`;
        note.classList.remove("hidden");
      }
    } catch (err) { alert(err.message || "Не удалось создать профиль."); }
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
        alert(err.message || "Не удалось добавить учителя.");
      }
    });
    document.querySelectorAll("[data-delete-teacher]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-delete-teacher");
        if (!id) return;
        if (!confirm("Удалить этого учителя?")) return;
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
            <h2>Очистить локальные данные?</h2>
            <p>Будут удалены локальные коды, результаты и учителя на этом устройстве. Действие нельзя отменить.</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="button button-ghost" type="button" id="cancel-clear">Отмена</button>
          <button class="button button-danger" type="button" id="confirm-clear">Очистить</button>
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
    const defaultCls = $("#students-class").value.trim() || "9А";
    const lines = rawNames.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!selectedEvent) { alert("Сначала создайте или выберите событие."); return; }
    if (lines.length === 0) { alert("Введите хотя бы одно имя ученика."); return; }
    try {
      const created = await createStudentCodes(lines, defaultCls, selectedEvent);
      $("#students-names").value = "";
      await renderTeacher();
      modal(`
        <h2>ID созданы</h2>
        <p>Событие: <b>${escapeHtml(selectedEvent.title)}</b> (${escapeHtml(selectedEvent.code)})</p>
        <p>Создано 6-значных ID: <b>${created.length}</b>.</p>
        <div class="modal-actions"><button class="button button-primary" type="button" id="modal-ok">Отлично</button></div>
      `);
      $("#modal-ok").addEventListener("click", clearModal);
    } catch (err) {
      alert(err.message || "Ошибка создания кодов");
    }
  });

  $("#copy-active-codes").addEventListener("click", async () => {
    const active = activeCodes;
    if (!active.length) {
      alert("Нет активных кодов.");
      return;
    }
    const text = active
      .map((item) => `${item.code} — ${item.studentName || "Ученик"} (${item.className || "9А"})`)
      .join("\n");

    try {
      await navigator.clipboard.writeText(text);
      alert(`Скопировано ${active.length} кодов в буфер обмена!`);
    } catch {
      modal(`
        <div class="modal-header">
          <div class="modal-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </div>
          <div>
            <h2>Список активных кодов</h2>
            <p>Скопируйте коды вручную.</p>
          </div>
        </div>
        <textarea class="student-input-textarea" style="min-height:160px" readonly>${escapeHtml(text)}</textarea>
        <div class="modal-actions">
          <button class="button button-primary" type="button" id="close-copy">Закрыть</button>
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
    "Рмя Ф.",
    "Класс",
    "ID",
    "Событие",
    "Режим",
    "Дата начала",
    "Дата завершения",
    "Затраченное время",
    "Баллы",
    ...answerColumns.map((n) => `Задание ${n}`),
    "Количество выходов",
    "Статус завершения",
  ];

  const lines = [
    header,
    ...results.map((res) => {
      const answerMap = Object.fromEntries(
        (res.answers || []).map((item) => [
          item.number,
          `${item.answer || ""}${item.correct ? " (верно)" : " (неверно)"}`,
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

// Запуск инициализации приложения
initialize();


