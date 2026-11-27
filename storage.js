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
  profile: "oge.profile.v1",
  events: "oge.events.v1",
};

const PROFILE_MARK = "__PROFILE__";
const EVENT_MARK = "__EVENT__";

const readLocal = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
};

const writeLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const makeId = () => String(Math.floor(100000 + Math.random() * 900000));
export const makeEventId = () => `EVT-${String(Math.floor(100000 + Math.random() * 900000))}`;

export async function validateMasterPassword(password) {
  return String(password).trim() === MASTER_PASSWORD;
}

// ---------------- УЧИТЕЛЯ / ДОСТУП АДМИНА ----------------

function isProfileCode(code) {
  return /^\d{6}$/.test(String(code || "").trim());
}

function normalizeProfile(record) {
  const code = String(record?.code || "").trim().toUpperCase();
  return {
    code,
    name: String(record?.name || record?.student_name || record?.studentName || record?.fullName || "Ученик").trim(),
    className: String(record?.className || record?.class_name || "").trim(),
    createdAt: record?.createdAt || record?.created_at || new Date().toISOString(),
  };
}

function normalizeEvent(record) {
  const code = String(record?.code || record?.eventCode || record?.id || "").trim().toUpperCase();
  return {
    code,
    title: String(record?.title || record?.name || "Событие").trim(),
    owner: String(record?.owner || record?.ownerName || "").trim(),
    createdAt: record?.createdAt || record?.created_at || new Date().toISOString(),
    active: record?.active === false ? false : true,
  };
}

function isEventRow(row) {
  return String(row?.class_name || "") === EVENT_MARK || String(row?.code || "").startsWith("EVT-");
}

function isProfileRow(row) {
  if (isTeacherCodeRecord(row) || isEventRow(row)) return false;
  const code = String(row?.code || "").trim().toUpperCase();
  const sid = String(row?.session_id || "");
  return String(row?.class_name || "") === PROFILE_MARK || sid.startsWith("PROFILE:") || isProfileCode(code);
}

function isStaffRow(row) {
  const code = String(row?.code || "");
  const cls = String(row?.class_name || "");
  return code.startsWith("TCHR-") || cls === "__STAFF__" || cls === "STAFF" || cls === "__TEACHER__";
}
function isServiceRow(row) {
  return isTeacherCodeRecord(row) || isEventRow(row) || isProfileRow(row) || isStaffRow(row);
}

function profileFromRow(row) {
  let payload = {};
  const rawSid = String(row?.session_id || "");
  try { payload = JSON.parse(rawSid.replace(/^PROFILE:/, "") || "{}"); } catch { payload = {}; }
  return normalizeProfile({
    code: row?.code,
    name: row?.student_name || payload.name,
    className: payload.className || "",
    createdAt: row?.created_at || payload.createdAt,
  });
}

function profileToRow(profile) {
  const p = normalizeProfile(profile);
  return {
    code: p.code,
    student_name: p.name,
    class_name: PROFILE_MARK,
    used: false,
    created_at: p.createdAt,
    used_at: null,
    session_id: `PROFILE:${JSON.stringify({ name: p.name, className: p.className, createdAt: p.createdAt })}`,
  };
}

function eventFromRow(row) {
  let payload = {};
  const rawSid = String(row?.session_id || "");
  try { payload = JSON.parse(rawSid.replace(/^EVENT:/, "") || "{}"); } catch { payload = {}; }
  return normalizeEvent({
    code: row?.code,
    title: row?.student_name || payload.title,
    owner: payload.owner || "",
    createdAt: row?.created_at || payload.createdAt,
    active: payload.active !== false && row?.used !== true,
  });
}

function eventToRow(event) {
  const e = normalizeEvent(event);
  return {
    code: e.code,
    student_name: e.title,
    class_name: EVENT_MARK,
    used: !e.active,
    created_at: e.createdAt,
    used_at: null,
    session_id: `EVENT:${JSON.stringify({ title: e.title, owner: e.owner, createdAt: e.createdAt, active: e.active })}`,
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

export async function getCodes(eventCode = "") {
  const normalizedEvent = String(eventCode || "").trim().toUpperCase();
  const sb = await initSupabase();
  if (sb) {
    try {
      let query = sb.from("access_codes").select("*").order("created_at", { ascending: false }).limit(200);
      const { data, error } = await query;

      if (data && !error) {
        return data
          .filter((doc) => !isServiceRow(doc))
          .filter((doc) => !normalizedEvent || String(doc.session_id || "").includes(`"eventCode":"${normalizedEvent}"`) || String(doc.session_id || "").includes(`EVENT:${normalizedEvent}`))
          .map((doc) => {
            let payload = {};
            try { payload = JSON.parse(doc.session_id || "{}"); } catch { payload = {}; }
            return {
              code: doc.code,
              studentName: doc.student_name,
              className: doc.class_name || "",
              used: Boolean(doc.used),
              createdAt: doc.created_at,
              usedAt: doc.used_at || null,
              sessionId: doc.session_id || null,
              eventCode: payload.eventCode || "",
              eventTitle: payload.eventTitle || "",
              profileCode: payload.profileCode || "",
            };
          });
      }
    } catch (err) {
      console.warn("Ошибка загрузки кодов из Supabase, читаем локальные:", err);
    }
  }
  return readLocal(KEYS.codes, [])
    .filter((c) => String(c.className || "") !== "__STAFF__" && !String(c.code || "").startsWith("TCHR-"))
    .filter((c) => !normalizedEvent || c.eventCode === normalizedEvent);
}

export async function getActiveCodes(eventCode = "") {
  const codes = await getCodes(eventCode);
  return codes.filter((code) => !code.used);
}

// Создание кодов для события (список учеников)
export async function createStudentCodes(studentsList, defaultClass = "", eventInfo = null) {
  const sb = await initSupabase();
  const existing = await getCodesRaw(sb);
  const known = new Set(existing.map((item) => String(item.code || "").toUpperCase()));

  const itemsToCreate = Array.isArray(studentsList) ? studentsList : [studentsList];
  const newCodes = [];
  const normalizedEvent = eventInfo ? normalizeEvent(eventInfo) : null;

  for (const item of itemsToCreate) {
    const name = typeof item === "string" ? item.trim() : (item.fullName || "").trim();
    const cls = typeof item === "string" ? String(defaultClass || "").trim() : (item.className || defaultClass || "").trim();
    if (!name) continue;

    let code = makeId();
    while (known.has(code)) code = makeId();
    known.add(code);

    const payload = normalizedEvent ? { eventCode: normalizedEvent.code, eventTitle: normalizedEvent.title } : {};
    const record = {
      code,
      studentName: name,
      className: cls,
      used: false,
      createdAt: new Date().toISOString(),
      usedAt: null,
      sessionId: Object.keys(payload).length ? JSON.stringify(payload) : null,
      eventCode: normalizedEvent?.code || "",
      eventTitle: normalizedEvent?.title || "",
    };
    newCodes.push(record);

    await upsertCodeRow(sb, {
      code: record.code,
      student_name: record.studentName,
      class_name: record.className,
      used: false,
      created_at: record.createdAt,
      used_at: null,
      session_id: record.sessionId,
    });
  }

  const allLocal = [...readLocal(KEYS.codes, []), ...newCodes];
  writeLocal(KEYS.codes, allLocal);
  return newCodes;
}

// ---------------- ЭКЗАМЕНАЦИОННАЯ СЕССИЯ ----------------

export async function startExam({ code, questions, eventCode = "", profile = null, mode = "exam" }) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const normalizedEvent = String(eventCode || "").trim().toUpperCase();
  const sb = await initSupabase();

  let accessCode = null;
  let profileCode = "";

  if (isProfileCode(normalizedCode) && !normalizedEvent) {
    const rows = await getCodesRaw(sb);
    const pRow = rows.find((r) => String(r.code || "").toUpperCase() === normalizedCode && isProfileRow(r));
    if (!pRow) throw new Error("Профиль с таким ID не найден.");
    const p = profileFromRow(pRow);
    const suppliedName = String(profile?.name || "").trim();
    if (suppliedName && p.name.toLowerCase().replace(/\s+/g, " ") !== suppliedName.toLowerCase().replace(/\s+/g, " ")) {
      throw new Error("Имя не совпадает с профилем.");
    }
    accessCode = { code: p.code, studentName: p.name, className: p.className || "Тренировка", used: false, isProfile: true, eventCode: "", eventTitle: "" };
    profileCode = p.code;
    saveLocalProfile(p);
  } else {
    if (sb) {
      try {
        const { data, error } = await sb.from("access_codes").select("*").eq("code", normalizedCode).single();
        if (data && !error && !isServiceRow(data)) {
          if (data.used) throw new Error("Данный ID доступа уже использован.");
          let payload = {};
          try { payload = JSON.parse(data.session_id || "{}"); } catch { payload = {}; }
          accessCode = {
            code: data.code,
            studentName: data.student_name,
            className: data.class_name || "",
            used: Boolean(data.used),
            eventCode: payload.eventCode || "",
            eventTitle: payload.eventTitle || "",
          };
        }
      } catch (err) {
        if (err.message && err.message.includes("использован")) throw err;
        console.warn("Проверка в Supabase не удалась, ищем локально:", err);
      }
    }

    if (!accessCode) {
      const localCodes = readLocal(KEYS.codes, []);
      const found = localCodes.find((item) => String(item.code || "").toUpperCase() === normalizedCode);
      if (found) {
        let payload = {};
        try { payload = JSON.parse(found.sessionId || "{}"); } catch { payload = {}; }
        accessCode = { ...found, eventCode: found.eventCode || payload.eventCode || "", eventTitle: found.eventTitle || payload.eventTitle || "" };
      }
    }

    if (!accessCode) throw new Error("Код доступа не найден. Проверьте ID.");
    if (accessCode.used) throw new Error("Данный ID доступа уже использован.");

    if (normalizedEvent) {
      const event = await findEventByCode(normalizedEvent);
      if (!event) throw new Error("Событие с таким ID не найдено или неактивно.");
      if (accessCode.eventCode && accessCode.eventCode !== normalizedEvent) throw new Error("Этот ID привязан к другому событию.");
      accessCode.eventCode = normalizedEvent;
      accessCode.eventTitle = event.title;
    } else if (accessCode.eventCode) {
      throw new Error("Этот ID нужно вводить через ID события.");
    }
  }

  const session = {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    code: normalizedCode,
    studentName: accessCode.studentName || "Ученик",
    className: accessCode.className || "",
    profileCode,
    eventCode: accessCode.eventCode || "",
    eventTitle: accessCode.eventTitle || "",
    mode: accessCode.eventCode ? "event" : "practice",
    startedAt: Date.now(),
    updatedAt: Date.now(),
    questions,
    answers: {},
    tabSwitches: 0,
    lastIndex: 0,
  };

  if (!accessCode.isProfile) {
    accessCode.used = true;
    accessCode.usedAt = new Date(session.startedAt).toISOString();
    const localCodes = readLocal(KEYS.codes, []);
    const localIndex = localCodes.findIndex((item) => String(item.code || "").toUpperCase() === normalizedCode);
    const stored = { ...accessCode, sessionId: JSON.stringify({ sessionId: session.id, eventCode: session.eventCode, eventTitle: session.eventTitle, profileCode: session.profileCode }) };
    if (localIndex !== -1) localCodes[localIndex] = { ...localCodes[localIndex], ...stored };
    else localCodes.push(stored);
    writeLocal(KEYS.codes, localCodes);

    if (sb) {
      try {
        await sb.from("access_codes").update({
          used: true,
          used_at: accessCode.usedAt,
          session_id: stored.sessionId,
        }).eq("code", normalizedCode);
      } catch (err) {
        console.error("Ошибка обновления статуса кода в Supabase:", err);
      }
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
          event_code: result.eventCode || null,
          event_title: result.eventTitle || null,
          profile_code: result.profileCode || null,
          mode: result.mode || null,
        },
      ]);
    } catch (err) {
      console.error("Ошибка сохранения результата в Supabase:", err);
    }
  }
  return result;
}

export async function getEvents() {
  const local = readLocal(KEYS.events, []).map(normalizeEvent).filter((e) => e.code);
  const sb = await initSupabase();
  if (!sb) return local.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  let cloud = [];
  try {
    const { data, error } = await sb.from("access_codes").select("*").eq("class_name", EVENT_MARK).limit(200);
    if (!error && Array.isArray(data)) cloud = data.filter(isEventRow).map(eventFromRow);
  } catch {}
  const map = new Map();
  for (const item of [...cloud, ...local]) map.set(item.code, item);
  const merged = [...map.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  writeLocal(KEYS.events, merged);
  return merged;
}

export async function findEventByCode(eventCode) {
  const code = String(eventCode || "").trim().toUpperCase();
  if (!/^EVT-\d{6}$/.test(code)) return null;
  const events = await getEvents();
  return events.find((e) => e.code === code) || null;
}

// ---------------- ПРОФИЛИ УЧЕНИКОВ ----------------

export function getLocalProfile() {
  const raw = readLocal(KEYS.profile, null);
  if (!raw || !raw.code) return null;
  return normalizeProfile(raw);
}

export function saveLocalProfile(profile) {
  const p = normalizeProfile(profile);
  if (!isProfileCode(p.code) || !p.name) return null;
  writeLocal(KEYS.profile, p);
  return p;
}

export function clearLocalProfile() {
  localStorage.removeItem(KEYS.profile);
}

async function upsertCodeRow(sb, row) {
  if (!sb) return false;
  try { const { error } = await sb.from("access_codes").upsert([row], { onConflict: "code" }); if (!error) return true; } catch {}
  try { const { error } = await sb.from("access_codes").insert([row]); if (!error) return true; } catch {}
  try { const { error } = await sb.from("access_codes").update(row).eq("code", row.code); return !error; } catch { return false; }
}

async function getCodesRaw(sb) {
  const client = sb || await initSupabase();
  if (!client) return readLocal(KEYS.codes, []);
  try {
    const { data, error } = await client.from("access_codes").select("*").order("created_at", { ascending: false }).limit(500);
    if (!error && Array.isArray(data)) return data;
  } catch {}
  return readLocal(KEYS.codes, []);
}

export async function registerProfile({ name, className = "" }) {
  const cleanName = String(name || "").trim();
  const cleanClass = String(className || "").trim();
  if (cleanName.length < 2) throw new Error("Введите имя и фамилию.");
  const sb = await initSupabase();
  const existing = new Set();
  try { (await getCodesRaw(sb)).forEach((r) => existing.add(String(r.code || "").toUpperCase())); } catch {}
  let code = makeId();
  while (existing.has(code)) code = makeId();
  const profile = normalizeProfile({ code, name: cleanName, className: cleanClass, createdAt: new Date().toISOString() });
  await upsertCodeRow(sb, profileToRow(profile));
  saveLocalProfile(profile);
  return profile;
}

export async function loginProfile({ code, name }) {
  const normalizedCode = String(code || "").trim().toUpperCase();
  const cleanName = String(name || "").trim();
  if (!isProfileCode(normalizedCode)) throw new Error("ID профиля должен состоять из 6 цифр.");
  if (cleanName.length < 2) throw new Error("Введите имя.");
  const sb = await initSupabase();
  const rows = await getCodesRaw(sb);
  const row = rows.find((r) => String(r.code || "").toUpperCase() === normalizedCode && isProfileRow(r));
  if (!row) throw new Error("Профиль с таким ID не найден.");
  const profile = profileFromRow(row);
  const same = profile.name.toLowerCase().replace(/\s+/g, " ") === cleanName.toLowerCase().replace(/\s+/g, " ");
  if (!same) throw new Error("Имя не совпадает с профилем.");
  saveLocalProfile(profile);
  return profile;
}

export async function getProfileHistory(profileCode) {
  const code = String(profileCode || "").trim().toUpperCase();
  if (!isProfileCode(code)) return [];
  const sb = await initSupabase();
  let rows = [];
  if (sb) {
    try {
      const { data, error } = await sb.from("exam_results").select("*").eq("code", code).order("created_at", { ascending: false }).limit(100);
      if (!error && Array.isArray(data)) rows = data;
    } catch {}
  }
  if (!rows.length) rows = readLocal(KEYS.results, []).filter((r) => String(r.code || "").toUpperCase() === code);
  return rows.map((doc) => ({
    id: doc.id,
    code: doc.code,
    studentName: doc.student_name || doc.studentName,
    className: doc.class_name || doc.className || "",
    startedAt: doc.started_at || doc.startedAt,
    finishedAt: doc.finished_at || doc.finishedAt || doc.created_at,
    durationSeconds: Number(doc.duration_seconds ?? doc.durationSeconds) || 0,
    score: Number(doc.score) || 0,
    tabSwitches: Number(doc.tab_switches ?? doc.tabSwitches) || 0,
    status: doc.status || "Завершён штатно",
    eventCode: doc.event_code || doc.eventCode || "",
    eventTitle: doc.event_title || doc.eventTitle || "",
  })).sort((a,b)=>new Date(b.finishedAt)-new Date(a.finishedAt));
}

export async function createEvent({ title, owner }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) throw new Error("Введите название события.");
  const event = normalizeEvent({
    code: makeEventId(),
    title: cleanTitle,
    owner: String(owner || "").trim(),
    createdAt: new Date().toISOString(),
    active: true,
  });
  const sb = await initSupabase();
  if (sb) {
    try { await sb.from("access_codes").upsert([eventToRow(event)], { onConflict: "code" }); } catch {}
  }
  const events = readLocal(KEYS.events, []).map(normalizeEvent);
  events.unshift(event);
  writeLocal(KEYS.events, events);
  return event;
}

export async function setEventActive(code, active) {
  const target = String(code || "").trim().toUpperCase();
  const events = (await getEvents()).map((e) => e.code === target ? { ...e, active: Boolean(active) } : e);
  writeLocal(KEYS.events, events);
  const sb = await initSupabase();
  const event = events.find((e) => e.code === target);
  if (sb && event) {
    try { await sb.from("access_codes").upsert([eventToRow(event)], { onConflict: "code" }); } catch {}
  }
  return event || null;
}

export function getLocalProfile() {
  const raw = readLocal(KEYS.profile, null);
  return raw ? normalizeProfile(raw) : null;
}

export function saveLocalProfile(profile) {
  const p = normalizeProfile(profile);
  writeLocal(KEYS.profile, p);
  return p;
}

export function clearLocalProfile() {
  localStorage.removeItem(KEYS.profile);
}

export async function upsertProfile(profile) {
  const p = saveLocalProfile(profile);
  const sb = await initSupabase();
  if (sb) {
    try { await sb.from("access_codes").upsert([profileToRow(p)], { onConflict: "code" }); } catch {}
  }
  return p;
}

export async function loginStudentProfile({ name, className }) {
  const cleanName = String(name || "").trim();
  const cleanClass = String(className || "").trim();
  if (!cleanName) throw new Error("Введите имя для профиля.");
  const current = getLocalProfile();
  const profile = normalizeProfile({
    ...(current || {}),
    id: current?.id,
    name: cleanName,
    className: cleanClass,
    lastLoginAt: new Date().toISOString(),
    createdAt: current?.createdAt,
  });
  return await upsertProfile(profile);
}
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

          const rawClass = String(doc.class_name || "");
          const eventMatch = rawClass.match(/(?:^|\|\s*)event:([A-Z0-9-]+)/i);
          const modeMatch = rawClass.match(/(?:^|\|\s*)mode:(exam|practice)/i);
          const cleanClass = rawClass.replace(/\|\s*event:[A-Z0-9-]+/ig, "").replace(/\|\s*mode:(exam|practice)/ig, "").replace(/^\s*\|\s*|\s*\|\s*$/g, "").trim();

          return {
            id: doc.id,
            code: doc.code,
            studentName: doc.student_name,
            className: cleanClass,
            eventCode: eventMatch ? eventMatch[1].toUpperCase() : "",
            mode: modeMatch ? modeMatch[1].toLowerCase() : "exam",
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
      console.warn("Не удалось загрузить результаты из Supabase, читаем локальные:", err);
    }
  }
  const local = readLocal(KEYS.results, []);
  if (local.length) return local;
  return [];
}

export async function getResults(eventCode = "") {
  const normalizedEvent = String(eventCode || "").trim().toUpperCase();
  const mapDoc = (doc) => {
    let parsedAnswers = [];
    try { parsedAnswers = typeof doc.answers === "string" ? JSON.parse(doc.answers) : (doc.answers || []); } catch { parsedAnswers = []; }
    return {
      id: doc.id,
      code: doc.code,
      studentName: doc.student_name || doc.studentName,
      className: doc.class_name || doc.className || "",
      startedAt: doc.started_at || doc.startedAt,
      finishedAt: doc.finished_at || doc.finishedAt || doc.created_at,
      durationSeconds: Number(doc.duration_seconds ?? doc.durationSeconds) || 0,
      score: Number(doc.score) || 0,
      tabSwitches: Number(doc.tab_switches ?? doc.tabSwitches) || 0,
      status: doc.status || "Завершён штатно",
      answers: parsedAnswers,
      eventCode: doc.event_code || doc.eventCode || "",
      eventTitle: doc.event_title || doc.eventTitle || "",
      profileCode: doc.profile_code || doc.profileCode || "",
      mode: doc.mode || (doc.event_code || doc.eventCode ? "event" : "practice"),
    };
  };
  const sb = await initSupabase();
  let rows = [];
  if (sb) {
    try {
      let q = sb.from("exam_results").select("*").order("created_at", { ascending: false }).limit(200);
      if (normalizedEvent) q = q.eq("event_code", normalizedEvent);
      const { data, error } = await q;
      if (!error && Array.isArray(data)) rows = data;
    } catch (err) {
      console.warn("Не удалось загрузить результаты из Supabase, читаем локальные:", err);
    }
  }
  if (!rows.length) rows = readLocal(KEYS.results, []);
  let mapped = rows.map(mapDoc);
  if (normalizedEvent) mapped = mapped.filter((r) => String(r.eventCode || "").toUpperCase() === normalizedEvent);
  return mapped.sort((a,b)=>new Date(b.finishedAt)-new Date(a.finishedAt));
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
