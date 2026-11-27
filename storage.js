// Модуль хранения данных (Supabase + fallback на localStorage).
// Если Supabase недоступен, сайт продолжает работать локально.

export const MASTER_PASSWORD = "aOGE2026p";

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

  const timeout = (ms, label) => new Promise((_, reject) => setTimeout(() => reject(new Error(`Таймаут: ${label}`)), ms));

  try {
    const mod = await Promise.race([
      import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"),
      timeout(7000, "загрузка Supabase SDK"),
    ]);
    const createClient = mod?.createClient;
    if (typeof createClient !== "function") {
      throw new Error("Supabase SDK не экспортирует createClient");
    }
    supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

    const { error } = await Promise.race([
      supabase.from("access_codes").select("code").limit(1),
      timeout(7000, "проверка Supabase API"),
    ]);
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
  staff: "oge.staff.v1",
  staffSession: "oge.staff.session.v1",
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

// ---------------- УЧИТЕЛЯ / ДОСТУП АДМИНА ----------------

function normalizeTeacher(record) {
  return {
    id: String(record?.id || record?.code || `T-${Date.now()}`),
    name: String(record?.name || record?.full_name || record?.teacher_name || "").trim(),
    login: String(record?.login || record?.username || "").trim().toLowerCase(),
    password: String(record?.password || "").trim(),
    createdAt: record?.createdAt || record?.created_at || new Date().toISOString(),
  };
}

function isTeacherCodeRecord(row) {
  return String(row?.class_name || row?.className || "") === "__STAFF__" || String(row?.code || "").startsWith("TCHR-");
}

function teacherFromCodeRow(row) {
  let payload = {};
  try { payload = JSON.parse(row?.session_id || "{}"); } catch { payload = {}; }
  return normalizeTeacher({
    id: payload.id || row?.used_at || row?.code,
    name: row?.student_name || payload.name,
    login: payload.login || String(row?.code || "").replace(/^TCHR-/i, "").toLowerCase(),
    password: payload.password || "",
    createdAt: row?.created_at || payload.createdAt,
  });
}

function teacherToCodeRow(t) {
  const teacher = normalizeTeacher(t);
  return {
    code: `TCHR-${teacher.login.toUpperCase()}`,
    student_name: teacher.name,
    class_name: "__STAFF__",
    used: false,
    created_at: teacher.createdAt,
    used_at: null,
    session_id: JSON.stringify({ id: teacher.id, login: teacher.login, password: teacher.password, name: teacher.name, createdAt: teacher.createdAt }),
  };
}

function mergeTeachers(...lists) {
  const map = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      const t = normalizeTeacher(item);
      if (!t.login || !t.password || !t.name) continue;
      const prev = map.get(t.login);
      if (!prev || new Date(t.createdAt || 0) > new Date(prev.createdAt || 0)) map.set(t.login, t);
    }
  }
  return [...map.values()].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

async function getTeachersFromCodeFallback(sb) {
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("access_codes")
      .select("*")
      .eq("class_name", "__STAFF__")
      .limit(200);
    if (error || !Array.isArray(data)) return [];
    return data.filter(isTeacherCodeRecord).map(teacherFromCodeRow);
  } catch {
    return [];
  }
}

async function upsertTeacherCodeFallback(sb, teacher) {
  if (!sb) return false;
  const row = teacherToCodeRow(teacher);
  try {
    const { error } = await sb.from("access_codes").upsert([row], { onConflict: "code" });
    if (!error) return true;
  } catch {}
  try {
    const { error } = await sb.from("access_codes").insert([row]);
    if (!error) return true;
  } catch {}
  try {
    const { error } = await sb.from("access_codes").update(row).eq("code", row.code);
    return !error;
  } catch {
    return false;
  }
}

async function deleteTeacherCodeFallback(sb, teacher) {
  if (!sb) return false;
  const code = `TCHR-${String(teacher.login || "").toUpperCase()}`;
  try {
    const { error } = await sb.from("access_codes").delete().eq("code", code);
    return !error;
  } catch {
    return false;
  }
}

export async function getTeachers() {
  const local = readLocal(KEYS.staff, []).map(normalizeTeacher).filter((t) => t.name && t.login && t.password);
  const sb = await initSupabase();
  if (!sb) return local;

  let cloud = [];
  let cloudOk = false;
  try {
    const { data, error } = await sb.from("teachers").select("*").order("created_at", { ascending: false }).limit(200);
    if (!error && Array.isArray(data)) {
      cloud = data.map(normalizeTeacher).filter((t) => t.name && t.login && t.password);
      cloudOk = true;
    }
  } catch (err) {
    console.warn("Ошибка загрузки учителей из Supabase:", err);
  }

  const fallback = await getTeachersFromCodeFallback(sb);
  const merged = mergeTeachers(cloud, fallback, local);

  // heal: push local-only teachers to cloud/fallback
  for (const t of merged) {
    const inCloud = cloud.some((c) => c.login === t.login);
    const inFallback = fallback.some((c) => c.login === t.login);
    if (cloudOk && !inCloud) {
      try { await sb.from("teachers").upsert([{ id: t.id, name: t.name, login: t.login, password: t.password, created_at: t.createdAt }], { onConflict: "id" }); } catch {}
    }
    if (!inCloud && !inFallback) await upsertTeacherCodeFallback(sb, t);
  }

  writeLocal(KEYS.staff, merged);
  return merged;
}

export async function createTeacher({ name, login, password }) {
  const cleanName = String(name || "").trim();
  const cleanLogin = String(login || "").trim().toLowerCase();
  const cleanPassword = String(password || "").trim();
  if (!cleanName || !cleanLogin || !cleanPassword) {
    throw new Error("Заполните имя, логин и пароль учителя.");
  }
  if (cleanLogin.length < 3) throw new Error("Логин учителя слишком короткий.");
  if (cleanPassword.length < 4) throw new Error("Пароль учителя слишком короткий.");

  const teachers = await getTeachers();
  if (teachers.some((t) => t.login === cleanLogin)) {
    throw new Error("Учитель с таким логином уже существует.");
  }

  const record = normalizeTeacher({
    id: crypto.randomUUID ? crypto.randomUUID() : `T-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: cleanName,
    login: cleanLogin,
    password: cleanPassword,
    createdAt: new Date().toISOString(),
  });

  const sb = await initSupabase();
  let cloudSaved = false;
  if (sb) {
    try {
      const { error } = await sb.from("teachers").insert([{
        id: record.id,
        name: record.name,
        login: record.login,
        password: record.password,
        created_at: record.createdAt,
      }]);
      cloudSaved = !error;
    } catch (err) {
      console.warn("Ошибка сохранения учителя в Supabase:", err);
    }
    if (!cloudSaved) cloudSaved = await upsertTeacherCodeFallback(sb, record);
  }

  const local = readLocal(KEYS.staff, []).map(normalizeTeacher).filter((t) => t.login !== record.login);
  local.unshift(record);
  writeLocal(KEYS.staff, local);
  if (sb && !cloudSaved) {
    console.warn("Учитель сохранён только локально:", record.login);
  }
  return record;
}

export async function deleteTeacher(id) {
  const target = String(id || "").trim();
  if (!target) return;
  const localBefore = readLocal(KEYS.staff, []).map(normalizeTeacher);
  const victim = localBefore.find((t) => t.id === target);
  const sb = await initSupabase();
  if (sb) {
    try { await sb.from("teachers").delete().eq("id", target); } catch {}
    if (victim) await deleteTeacherCodeFallback(sb, victim);
  }
  const local = localBefore.filter((t) => t.id !== target);
  writeLocal(KEYS.staff, local);
}

export async function authenticateStaff(password, login = "") {
  const cleanPassword = String(password || "").trim();
  const cleanLogin = String(login || "").trim().toLowerCase();

  if (!cleanLogin) {
    if (await validateMasterPassword(cleanPassword)) {
      const actor = { role: "admin", name: "Администратор", login: "admin" };
      writeLocal(KEYS.staffSession, actor);
      return actor;
    }
    throw new Error("Неверный пароль администратора.");
  }

  const teachers = await getTeachers();
  const teacher = teachers.find((t) => t.login === cleanLogin && t.password === cleanPassword);
  if (!teacher) throw new Error("Неверный логин или пароль учителя.");
  const actor = { role: "teacher", name: teacher.name, login: teacher.login, id: teacher.id };
  writeLocal(KEYS.staffSession, actor);
  return actor;
}

export function getStaffSession() {
  const raw = readLocal(KEYS.staffSession, null);
  if (!raw || !raw.role) return null;
  return {
    role: raw.role === "admin" ? "admin" : "teacher",
    name: String(raw.name || "Учитель"),
    login: String(raw.login || ""),
    id: raw.id || null,
  };
}

export function clearStaffSession() {
  localStorage.removeItem(KEYS.staffSession);
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
        return data
          .filter((doc) => String(doc.class_name || "") !== "__STAFF__" && !String(doc.code || "").startsWith("TCHR-"))
          .map((doc) => ({
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
  return readLocal(KEYS.codes, []).filter((c) => String(c.className || "") !== "__STAFF__" && !String(c.code || "").startsWith("TCHR-"));
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
    updatedAt: Date.now(),
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
  const local = readLocal(KEYS.session, null);
  if (!local) return null;

  const sb = await initSupabase();
  if (sb && local.id) {
    try {
      const { data, error } = await sb
        .from("exam_sessions")
        .select("*")
        .eq("id", local.id)
        .maybeSingle();
      if (!error && data) {
        let answers = data.answers;
        if (typeof answers === "string") {
          try { answers = JSON.parse(answers); } catch { answers = local.answers || {}; }
        }
        const remote = {
          ...local,
          answers: answers && typeof answers === "object" ? answers : (local.answers || {}),
          tabSwitches: Number(data.tab_switches ?? local.tabSwitches ?? 0),
          lastIndex: Number(data.last_index ?? local.lastIndex ?? 0),
          updatedAt: new Date(data.updated_at || local.updatedAt || local.startedAt).getTime(),
          finishedAt: data.finished_at || local.finishedAt || null,
        };
        const localUpdated = Number(local.updatedAt || 0);
        const remoteUpdated = Number(remote.updatedAt || 0);
        const merged = remoteUpdated >= localUpdated ? remote : local;
        writeLocal(KEYS.session, merged);
        return merged;
      }
    } catch (err) {
      console.warn("Ошибка чтения сессии из Supabase, используем localStorage:", err);
    }
  }
  return local;
}

async function persistSessionToCloud(session) {
  const sb = await initSupabase();
  if (!sb || !session?.id) return;
  try {
    await sb.from("exam_sessions").upsert([
      {
        id: session.id,
        code: session.code,
        student_name: session.studentName || "Ученик",
        class_name: session.className || "",
        started_at: new Date(session.startedAt).toISOString(),
        updated_at: new Date(session.updatedAt || Date.now()).toISOString(),
        last_index: Number(session.lastIndex || 0),
        tab_switches: Number(session.tabSwitches || 0),
        answers: session.answers || {},
        finished_at: session.finishedAt ? new Date(session.finishedAt).toISOString() : null,
      },
    ], { onConflict: "id" });
  } catch (err) {
    console.warn("Ошибка сохранения сессии в Supabase:", err);
  }
}

export async function saveAnswers(answers) {
  const session = await getSession();
  if (!session) return null;
  session.answers = { ...answers };
  session.updatedAt = Date.now();
  writeLocal(KEYS.session, session);
  await persistSessionToCloud(session);
  return session;
}

export async function saveProgress({ answers, lastIndex }) {
  const session = await getSession();
  if (!session) return null;
  session.answers = { ...answers };
  session.lastIndex = Number(lastIndex) || 0;
  session.updatedAt = Date.now();
  writeLocal(KEYS.session, session);
  await persistSessionToCloud(session);
  return session;
}

export async function recordTabSwitch() {
  const session = await getSession();
  if (!session) return 0;
  session.tabSwitches = (session.tabSwitches || 0) + 1;
  session.updatedAt = Date.now();
  writeLocal(KEYS.session, session);
  await persistSessionToCloud(session);
  return session.tabSwitches;
}

// ---------------- РЕЗУЛЬТАТЫ И СТАТИСТИКА ----------------

export async function saveResult(result) {
  const sb = await initSupabase();
  const results = readLocal(KEYS.results, []);
  results.push(result);
  writeLocal(KEYS.results, results);
  const currentSession = readLocal(KEYS.session, null);
  if (currentSession && currentSession.id) {
    currentSession.finishedAt = result.finishedAt;
    currentSession.updatedAt = Date.now();
    await persistSessionToCloud(currentSession);
  }
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
