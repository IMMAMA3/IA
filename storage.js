// Модуль хранения данных (Supabase Cloud + автоматический fallback на localStorage).
// Для включения облака Supabase укажите параметры supabaseConfig ниже.
// Если конфиг пустой, сайт автоматически работает автономно в localStorage без внешних запросов!

export const MASTER_PASSWORD = "admin2026";

export const supabaseConfig = {
  url: "https://umhhntnghqmxbgvmvrvg.supabase.co",
  anonKey: "sb_publishable_Mk5IzlDnS8aBrdcNJpjG7Q_y1ApaQGD",
};

let supabase = null;
let isSupabaseReady = false;
let supabaseInitError = null;

export async function initSupabase() {
  if (isSupabaseReady && supabase) return supabase;

  const isConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey);
  if (!isConfigured) {
    supabaseInitError = "Supabase не настроен: отсутствует url или anonKey.";
    return null;
  }

  try {
    const mod = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const createClient = mod?.createClient;
    if (typeof createClient !== "function") {
      throw new Error("Supabase SDK не экспортирует createClient");
    }
    supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

    // Лёгкая проверка доступности API/ключа
    const { error } = await supabase.from("access_codes").select("code").limit(1);
    if (error) throw error;

    isSupabaseReady = true;
    supabaseInitError = null;
    return supabase;
  } catch (err) {
    supabaseInitError = err?.message || String(err);
    console.warn("Supabase недоступен, переключаемся на localStorage:", err);
    supabase = null;
    isSupabaseReady = false;
    return null;
  }
}

export function getSupabaseInitError() {
  return supabaseInitError;
}

export function isUsingCloud() {
  return isSupabaseReady;
}

export function getSupabaseStatus() {
  return { ready: isSupabaseReady, error: supabaseInitError };
}

const KEYS = {
  codes: "oge.codes.v2",
  results: "oge.results.v2",
  session: "oge.session.v2",
  theme: "oge.theme.v1",
};

const readLocal = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const makeId = () => `OGE-${String(Math.floor(1000 + Math.random() * 9000))}`;

export async function validateMasterPassword(password) {
  return String(password).trim() === MASTER_PASSWORD;
}

// ---------------- КОДЫ ДОСТУПА ----------------

export async function getCodes() {
  const sb = await initSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("access_codes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (data && !error) {
        return data.map((doc) => ({
          code: doc.code,
          studentName: doc.student_name,
          className: doc.class_name || "",
          used: Boolean(doc.used),
          createdAt: doc.created_at,
          usedAt: doc.used_at || null,
          sessionId: doc.session_id || null,
        }));
      }
    } catch (err) {
      console.warn("Ошибка загрузки кодов из Supabase, читаем локальные:", err);
    }
  }
  return readLocal(KEYS.codes, []);
}

export async function getActiveCodes() {
  const codes = await getCodes();
  return codes.filter((code) => !code.used);
}

// Создание кодов для списка учеников ("Имя Ф.")
export async function createStudentCodes(studentsList, defaultClass = "") {
  const sb = await initSupabase();
  const existing = await getCodes();
  const known = new Set(existing.map((item) => item.code));

  const itemsToCreate = Array.isArray(studentsList) ? studentsList : [studentsList];
  const newCodes = [];

  for (const item of itemsToCreate) {
    let name = typeof item === "string" ? item.trim() : (item.fullName || "").trim();
    let cls = typeof item === "string" ? defaultClass.trim() : (item.className || defaultClass).trim();
    if (!name) continue;

    let code = makeId();
    while (known.has(code)) {
      code = makeId();
    }
    known.add(code);

    const record = {
      code,
      studentName: name,
      className: cls,
      used: false,
      createdAt: new Date().toISOString(),
      usedAt: null,
      sessionId: null,
    };
    newCodes.push(record);

    if (sb) {
      try {
        await sb.from("access_codes").insert([
          {
            code: record.code,
            student_name: record.studentName,
            class_name: record.className,
            used: false,
            created_at: record.createdAt,
            used_at: null,
            session_id: null,
          },
        ]);
      } catch (err) {
        console.error("Ошибка сохранения кода в Supabase:", err);
      }
    }
  }

  const allLocal = [...readLocal(KEYS.codes, []), ...newCodes];
  writeLocal(KEYS.codes, allLocal);
  return newCodes;
}

// ---------------- ЭКЗАМЕНАЦИОННАЯ СЕССИЯ ----------------

export async function startExam({ code, questions }) {
  const normalizedCode = String(code).trim().toUpperCase();
  const sb = await initSupabase();

  let accessCode = null;

  if (sb) {
    try {
      const { data, error } = await sb
        .from("access_codes")
        .select("*")
        .eq("code", normalizedCode)
        .single();

      if (data && !error) {
        if (data.used) {
          throw new Error("Этот код доступа уже был использован.");
        }
        accessCode = {
          code: data.code,
          studentName: data.student_name,
          className: data.class_name || "",
          used: data.used,
          createdAt: data.created_at,
          usedAt: data.used_at,
          sessionId: data.session_id,
        };
      }
    } catch (err) {
      if (err.message && err.message.includes("уже был")) throw err;
      console.warn("Проверка в Supabase не удалась, ищем локально:", err);
    }
  }

  const localCodes = readLocal(KEYS.codes, []);
  const localIndex = localCodes.findIndex((item) => item.code === normalizedCode);

  if (!accessCode && localIndex !== -1) {
    accessCode = localCodes[localIndex];
  }

  if (!accessCode) {
    throw new Error("Код доступа не найден в системе. Обратитесь к учителю.");
  }
  if (accessCode.used) {
    throw new Error("Данный ID доступа уже использован и завершён.");
  }

  const session = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    code: normalizedCode,
    studentName: accessCode.studentName || "Ученик",
    className: accessCode.className || "",
    startedAt: Date.now(),
    questions,
    answers: {},
    tabSwitches: 0,
    lastIndex: 0,
  };

  accessCode.used = true;
  accessCode.usedAt = new Date(session.startedAt).toISOString();
  accessCode.sessionId = session.id;

  if (localIndex !== -1) {
    localCodes[localIndex] = accessCode;
    writeLocal(KEYS.codes, localCodes);
  } else {
    localCodes.push(accessCode);
    writeLocal(KEYS.codes, localCodes);
  }

  if (sb) {
    try {
      await sb
        .from("access_codes")
        .update({
          used: true,
          used_at: accessCode.usedAt,
          session_id: session.id,
        })
        .eq("code", normalizedCode);
    } catch (err) {
      console.error("Ошибка обновления статуса кода в Supabase:", err);
    }
  }

  writeLocal(KEYS.session, session);
  return session;
}

export async function getSession() {
  return readLocal(KEYS.session, null);
}

export async function saveAnswers(answers) {
  const session = await getSession();
  if (!session) return null;
  session.answers = { ...answers };
  writeLocal(KEYS.session, session);
  return session;
}

export async function saveProgress({ answers, lastIndex }) {
  const session = await getSession();
  if (!session) return null;
  session.answers = { ...answers };
  session.lastIndex = Number(lastIndex) || 0;
  writeLocal(KEYS.session, session);
  return session;
}

export async function recordTabSwitch() {
  const session = await getSession();
  if (!session) return 0;
  session.tabSwitches = (session.tabSwitches || 0) + 1;
  writeLocal(KEYS.session, session);
  return session.tabSwitches;
}

// ---------------- РЕЗУЛЬТАТЫ И СТАТИСТИКА ----------------

export async function saveResult(result) {
  const sb = await initSupabase();
  const results = readLocal(KEYS.results, []);
  results.push(result);
  writeLocal(KEYS.results, results);
  localStorage.removeItem(KEYS.session);

  if (sb) {
    try {
      await sb.from("exam_results").insert([
        {
          id: result.id,
          code: result.code,
          student_name: result.studentName,
          class_name: result.className || "",
          started_at: result.startedAt,
          finished_at: result.finishedAt,
          duration_seconds: result.durationSeconds,
          score: result.score,
          tab_switches: result.tabSwitches,
          status: result.status,
          answers: JSON.stringify(result.answers || []),
        },
      ]);
    } catch (err) {
      console.error("Ошибка сохранения результата в Supabase:", err);
    }
  }
  return result;
}

export async function getResults() {
  const sb = await initSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("exam_results")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (data && !error && data.length > 0) {
        return data.map((doc) => {
          let parsedAnswers = [];
          try {
            parsedAnswers = typeof doc.answers === "string" ? JSON.parse(doc.answers) : (doc.answers || []);
          } catch {
            parsedAnswers = [];
          }

          return {
            id: doc.id,
            code: doc.code,
            studentName: doc.student_name,
            className: doc.class_name || "",
            startedAt: doc.started_at,
            finishedAt: doc.finished_at || doc.created_at,
            durationSeconds: Number(doc.duration_seconds) || 0,
            score: Number(doc.score) || 0,
            tabSwitches: Number(doc.tab_switches) || 0,
            status: doc.status || "Завершён штатно",
            answers: parsedAnswers,
          };
        });
      }
    } catch (err) {
      console.warn("Не удалось прочитать результаты из Supabase, читаем локальные:", err);
    }
  }
  return readLocal(KEYS.results, []);
}

export async function clearLocalData() {
  Object.values(KEYS).forEach((key) => {
    if (key !== KEYS.theme) localStorage.removeItem(key);
  });
}

// ---------------- ТЕМА ОФОРМЛЕНИЯ ----------------

export function getSavedTheme() {
  return localStorage.getItem(KEYS.theme) || "light";
}

export function saveTheme(theme) {
  localStorage.setItem(KEYS.theme, theme);
}
