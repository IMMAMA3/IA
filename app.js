import { createExam, normalizeAnswer } from "./generators.js";
import {
  validateMasterPassword,
  getCodes,
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
  isUsingCloud,
  initSupabase,
  getSupabaseStatus,
} from "./storage.js?v=20261127";

const $ = (selector) => document.querySelector(selector);
const views = ["login-view", "exam-view", "result-view", "teacher-view"];

let session = null;
let currentIndex = 0;
let timerHandle = null;
let awayActive = false;
let examFinished = false;
let inputSaveTimer = null;

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
  await initSupabase();
  updateStorageIndicator();

  const saved = await getSession();
  if (saved) {
    session = saved;
    currentIndex = Math.max(0, Math.min(saved.lastIndex || 0, saved.questions.length - 1));
    if (Date.now() - saved.startedAt >= 30 * 60 * 1000) {
      await finishExam("Время истекло");
      return;
    }
    activateExam();
  }
}

function updateStorageIndicator() {
  const indicator = $("#storage-indicator");
  if (!indicator) return;
  const status = typeof getSupabaseStatus === "function"
    ? getSupabaseStatus()
    : { ready: isUsingCloud(), error: null };

  if (status.ready) {
    indicator.textContent = "🚀 Подключен Supabase Cloud";
    indicator.style.color = "var(--primary)";
    indicator.title = "";
    return;
  }

  const err = status.error ? String(status.error) : "инициализация не выполнена или завершилась ошибкой";
  indicator.textContent = `⚠️ localStorage (Supabase: ${err})`;
  indicator.style.color = "var(--danger, #c0392b)";
  indicator.title = err;
}

// ---------------- ВХОД УЧЕНИКА (ТОЛЬКО ID) ----------------

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const code = String(form.get("code") || "").trim().toUpperCase();
  const errorEl = $("#login-error");
  const submitBtn = $("#submit-login");

  errorEl.textContent = "";
  if (!code) return;

  submitBtn.disabled = true;
  submitBtn.style.opacity = "0.7";

  try {
    const created = await startExam({
      code,
      questions: createExam(),
    });
    session = created;
    currentIndex = 0;
    activateExam();
  } catch (error) {
    errorEl.textContent = error.message || "Не удалось войти по данному ID.";
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
  document.addEventListener("contextmenu", blockContextMenu);
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
        `<button class="nav-task ${index === currentIndex ? "current" : ""} ${String(session.answers[item.number] ?? "").trim() ? "answered" : ""
        }" data-index="${index}" aria-label="Задание ${item.number}">${item.number}</button>`
    )
    .join("");

  const inputType = question.answerType === "number" ? "number" : "text";

  root.innerHTML = `
    <div class="exam-topbar">
      <div class="student-meta">
        <div class="student-avatar">${escapeHtml((session.studentName || "У")[0])}</div>
        <div class="student-meta-text">
          <b>${escapeHtml(session.studentName || "Ученик")}${session.className ? ` (${escapeHtml(session.className)})` : ""}</b>
          <span>ID: ${escapeHtml(session.code)}</span>
        </div>
      </div>
      <div id="timer" class="timer-box">30:00</div>
    </div>

    <div class="exam-layout">
      <aside class="card task-nav">
        <div class="nav-header">Навигация по тесту</div>
        <div class="nav-grid">${nav}</div>
        <div class="nav-legend">
          <div class="legend-item"><span class="legend-color" style="background:var(--primary)"></span> Текущий вопрос</div>
          <div class="legend-item"><span class="legend-color" style="background:var(--success)"></span> Ответ сохранён</div>
          <div class="legend-item"><span class="legend-color" style="background:var(--border-subtle)"></span> Не отвечено</div>
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
          <button class="button button-ghost" id="prev-task" ${currentIndex === 0 ? "disabled" : ""}>
            ← Предыдущее
          </button>
          <button class="button button-primary" id="next-task">
            ${currentIndex === session.questions.length - 1 ? "К проверке" : "Следующее →"}
          </button>
        </div>
      </article>
    </div>

    <div class="exam-footer-bar">
      <div class="progress-info">
        <span>Прогресс: <b>${answeredCount} из ${session.questions.length}</b></span>
        <div class="progress-bar-wrap">
          <div class="progress-bar-fill" style="width: ${progressPct}%"></div>
        </div>
      </div>
      <button class="button button-danger" id="finish-exam">Завершить и отправить</button>
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
      const progressSpan = $(".progress-info span b");
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
  const timer = $("#timer");
  if (timer) {
    timer.textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
    <p>
      ${unanswered > 0 ? `Внимание: вы не ответили на <b>${unanswered}</b> из 8 заданий.` : "Все 8 заданий заполнены."}
      После отправки изменить ответы будет невозможно.
    </p>
    <div class="modal-actions">
      <button class="button button-ghost" id="cancel-modal">Вернуться</button>
      <button class="button button-primary" id="confirm-finish">Отправить работу</button>
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
      correct: normalizeAnswer(rawVal) === normalizeAnswer(question.answer),
    };
  });

  const result = {
    id: session.id,
    code: session.code,
    studentName: session.studentName || "Ученик",
    className: session.className || "",
    startedAt: new Date(session.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)),
    score: checked.filter((item) => item.correct).length,
    tabSwitches: session.tabSwitches || 0,
    status,
    answers: checked,
  };

  await saveResult(result);
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
  const grade = result.score >= 7 ? "Отлично (Оценка 5)" : result.score >= 5 ? "Хорошо (Оценка 4)" : result.score >= 3 ? "Удовлетворительно (Оценка 3)" : "Требуется повторение (Оценка 2)";

  $("#result-view").innerHTML = `
    <div class="card result-card">
      <div class="result-header">
        <div class="result-badge">${result.score >= 5 ? "🎉" : "📚"}</div>
        <div class="card-eyebrow">РЕЗУЛЬТАТ ТЕСТИРОВАНИЯ</div>
        <h2>Работа завершена</h2>
      </div>

      <div class="result-score-banner">
        <div class="result-big-number">${result.score}<small> / 8</small></div>
        <div class="result-grade">${grade}</div>
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
          <span>Уходов со вкладки</span>
          <b>${result.tabSwitches}</b>
        </div>
      </div>

      <h3 style="font-size:18px;margin:24px 0 12px">Разбор заданий</h3>
      <div class="review-list">
        ${result.answers
      .map(
        (item) => `
          <div class="review-row ${item.correct ? "correct" : "wrong"}">
            <span>Задание ${item.number}: <b>${escapeHtml(item.title)}</b></span>
            <span class="review-status-tag">
              ${item.correct ? "✓ Решено верно" : "✗ Ошибка"}
            </span>
          </div>`
      )
      .join("")}
      </div>

      <div class="modal-actions" style="justify-content:center;margin-top:30px">
        <button class="button button-ghost" id="to-login-btn">Вернуться на главную</button>
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
      <h2>Тестирование остановлено</h2>
      <p>Зафиксирован 3-й уход с вкладки тестирования. Ваша работа автоматически завершена и передана учителю со статусом нарушения.</p>
      <div class="modal-actions">
        <button class="button button-primary" id="close-forced">Понятно</button>
      </div>
    `);
    $("#close-forced").addEventListener("click", clearModal);
    return;
  }

  $("#modal-root").innerHTML = `
    <div class="warning-screen">
      <div class="warning-card">
        <div class="warning-icon">⚠️</div>
        <h2>Не покидайте страницу экзамена!</h2>
        <p>Зафиксировано переключение окна (нарушение ${count} из 3). При 3-м нарушении тест завершится автоматически без возможности продолжения.</p>
        <button class="button button-primary" id="return-exam">Вернуться к выполнению</button>
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

$("#teacher-open").addEventListener("click", () => {
  if (session && !examFinished) return;
  modal(`
    <h2>Вход в панель учителя</h2>
    <p>Введите мастер-пароль преподавателя для доступа к управлению кодами и подробной аналитике класса:</p>
    <div class="form-group">
      <label for="master-password">Мастер-пароль</label>
      <input id="master-password" type="password" class="code-input" style="font-size:15px;letter-spacing:normal" autocomplete="current-password" placeholder="admin2026">
    </div>
    <p id="teacher-login-error" class="form-error"></p>
    <div class="modal-actions">
      <button class="button button-ghost" id="teacher-cancel">Отмена</button>
      <button class="button button-primary" id="teacher-login">Войти</button>
    </div>
  `);

  $("#teacher-cancel").addEventListener("click", clearModal);
  $("#teacher-login").addEventListener("click", async () => {
    const password = $("#master-password").value;
    if (!(await validateMasterPassword(password))) {
      $("#teacher-login-error").textContent = "Неверный мастер-пароль.";
      return;
    }
    clearModal();
    await renderTeacher();
  });
  $("#master-password").addEventListener("keydown", (event) => {
    if (event.key === "Enter") $("#teacher-login").click();
  });
});

async function renderTeacher() {
  showView("teacher-view");
  const [allCodes, results] = await Promise.all([getCodes(), getResults()]);
  const activeCodes = allCodes.filter((c) => !c.used);
  const sortedResults = [...results].sort((a, b) => new Date(b.finishedAt) - new Date(a.finishedAt));

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
        <div>
          <span class="card-eyebrow">МОДУЛЬ АДМИНИСТРАТОРА</span>
          <h1>Панель учителя и аналитика ОГЭ</h1>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <button class="button button-ghost" id="teacher-home">На главную</button>
        </div>
      </div>

      <!-- Виджеты общей сводки -->
      <div class="analytics-grid">
        <div class="analytic-card">
          <span>Сдано работ</span>
          <div class="analytic-number highlight">${totalCompleted}</div>
        </div>
        <div class="analytic-card">
          <span>Средний балл (из 8)</span>
          <div class="analytic-number">${avgScore}</div>
        </div>
        <div class="analytic-card">
          <span>Максимальный балл</span>
          <div class="analytic-number">${maxScore} / 8</div>
        </div>
        <div class="analytic-card">
          <span>Уходов со вкладки всего</span>
          <div class="analytic-number" style="color:var(--danger)">${totalTabSwitches}</div>
        </div>
      </div>

      <!-- График успешности решения по номерам заданий -->
      <div class="task-stats-panel">
        <h3>Успешность решения по заданиям первой части (%)</h3>
        <div class="task-bars-grid">
          ${taskStats
      .map(
        (t) => `
            <div class="task-bar-col">
              <div class="task-bar-track">
                <div class="task-bar-fill" style="height: ${Math.max(6, t.correctPct)}%"></div>
              </div>
              <span class="task-bar-label">№${t.num}</span>
              <span class="task-bar-pct">${t.correctPct}%</span>
            </div>`
      )
      .join("")}
        </div>
      </div>

      <div class="teacher-main-grid">
        <!-- Левая колонка: Генератор кодов с именами учеников -->
        <div class="teacher-sidebar">
          <div class="card">
            <h2>Создать ID для учеников</h2>
            <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px">
              Введите имена (по одному на строку). Формат: «Имя Ф.» или «Иванов И.»:
            </p>
            <div class="form-group">
              <label for="students-class">Класс (по умолчанию)</label>
              <input id="students-class" placeholder="9А" value="9А" style="font-size:13.5px">
            </div>
            <div class="form-group">
              <label for="students-names">Список учеников</label>
              <textarea 
                id="students-names" 
                class="student-input-textarea" 
                placeholder="Иванов И.&#10;Петрова А.&#10;Сидоров Д.&#10;Смирнов М."
              ></textarea>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="button button-primary" id="btn-create-named-codes" style="flex:1">Создать ID</button>
            </div>

            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                <span style="font-size:13px;font-weight:700">Активные ID (${activeCodes.length})</span>
                <button class="button button-ghost" id="copy-active-codes" style="padding:4px 8px;font-size:11.5px">Скопировать</button>
              </div>
              <div class="active-codes-list">
                ${activeCodes.length
      ? activeCodes
        .map(
          (c) => `
                    <div class="code-item-row">
                      <span class="code-badge">${escapeHtml(c.code)}</span>
                      <span class="code-student">${escapeHtml(c.studentName || "Ученик")} (${escapeHtml(c.className || "9А")})</span>
                    </div>`
        )
        .join("")
      : '<div style="padding:14px;text-align:center;color:var(--text-muted)">Нет активных ID. Создайте их выше.</div>'
    }
              </div>
            </div>

            <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-subtle)">
              <button class="button button-danger" id="clear-local-btn" style="width:100%;font-size:12.5px">
                Очистить локальные данные
              </button>
            </div>
          </div>
        </div>

        <!-- Правая колонка: Таблица всех результатов и экспорт в CSV -->
        <div class="teacher-content">
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px">
              <h2>Ведомость результатов (${sortedResults.length})</h2>
              <button class="button button-primary" id="download-csv-btn">
                <span>Скачать ведомость (.csv)</span>
              </button>
            </div>

            <div class="table-responsive">
              ${sortedResults.length
      ? `
                <table class="table-results">
                  <thead>
                    <tr>
                      <th>Ученик (Имя Ф.)</th>
                      <th>Класс</th>
                      <th>ID</th>
                      <th>Дата</th>
                      <th>Время</th>
                      <th>Баллы</th>
                      <th>Ответы по заданиям</th>
                      <th>Выходы</th>
                      <th>Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sortedResults
        .map(
          (res) => `
                      <tr>
                        <td><b>${escapeHtml(res.studentName || res.fullName || "—")}</b></td>
                        <td>${escapeHtml(res.className || "—")}</td>
                        <td><code>${escapeHtml(res.code)}</code></td>
                        <td>${escapeHtml(new Date(res.finishedAt).toLocaleString("ru-RU"))}</td>
                        <td>${formatDuration(res.durationSeconds)}</td>
                        <td class="score-cell">${res.score} / 8</td>
                        <td class="answers-cell">
                          ${(res.answers || [])
              .map((a) => `№${a.number}: «${escapeHtml(a.answer || "—")}» ${a.correct ? "✓" : "✗"}`)
              .join(" · ")}
                        </td>
                        <td><span style="color:${res.tabSwitches > 0 ? "var(--danger)" : "inherit"};font-weight:700">${res.tabSwitches}</span></td>
                        <td>
                          <span class="status-badge ${res.status.includes("Принудительно") ? "forced" : "completed"}">
                            ${escapeHtml(res.status)}
                          </span>
                        </td>
                      </tr>`
        )
        .join("")}
                  </tbody>
                </table>`
      : '<div style="padding:40px;text-align:center;color:var(--text-muted)">Пока никто не завершил тестирование. Раздайте ID ученикам!</div>'
    }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Обработчики панели учителя
  $("#teacher-home").addEventListener("click", () => showView("login-view"));

  $("#btn-create-named-codes").addEventListener("click", async () => {
    const rawNames = $("#students-names").value;
    const defaultCls = $("#students-class").value.trim() || "9А";
    const lines = rawNames
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      alert("Пожалуйста, введите хотя бы одно имя ученика (например, 'Иванов И.').");
      return;
    }

    try {
      const created = await createStudentCodes(lines, defaultCls);
      $("#students-names").value = "";
      await renderTeacher();
      modal(`
        <h2>ID успешно созданы!</h2>
        <p>Создано кодов: <b>${created.length}</b>. Они привязаны к указанным именам и готовы к выдаче ученикам.</p>
        <div class="modal-actions">
          <button class="button button-primary" id="modal-ok">Отлично</button>
        </div>
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
        <h2>Список активных кодов</h2>
        <textarea style="width:100%;height:140px" readonly>${escapeHtml(text)}</textarea>
        <div class="modal-actions">
          <button class="button button-primary" id="close-copy">Закрыть</button>
        </div>
      `);
      $("#close-copy").addEventListener("click", clearModal);
    }
  });

  $("#download-csv-btn").addEventListener("click", () => downloadCsv(sortedResults));

  $("#clear-local-btn").addEventListener("click", () => {
    modal(`
      <h2>Очистить данные?</h2>
      <p>Будут удалены все локально сохранённые коды доступа и результаты с этого браузера. Это действие нельзя отменить.</p>
      <div class="modal-actions">
        <button class="button button-ghost" id="cancel-clear">Отмена</button>
        <button class="button button-danger" id="confirm-clear">Очистить всё</button>
      </div>
    `);
    $("#cancel-clear").addEventListener("click", clearModal);
    $("#confirm-clear").addEventListener("click", async () => {
      await clearLocalData();
      clearModal();
      showView("login-view");
    });
  });
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function downloadCsv(results) {
  const answerColumns = [1, 2, 3, 4, 6, 7, 8, 10];
  const header = [
    "Имя Ф.",
    "Класс",
    "Использованный ID",
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
