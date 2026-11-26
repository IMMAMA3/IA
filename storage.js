// Модуль хранения данных (Appwrite Cloud + автоматический fallback на localStorage).
// Для включения облака Appwrite достаточно указать параметры appwriteConfig ниже.
// Если конфиг пустой, сайт автоматически работает автономно в localStorage без внешних запросов!

export const MASTER_PASSWORD = "admin2026";

export const appwriteConfig = {
  endpoint: "https://cloud.appwrite.io/v1", // Или URL вашего собственного инстанса Appwrite
  projectId: "6b085fde00336c9b616c",     // Project ID из настроек консоли Appwrite
  databaseId: "oge_db",                     // ID базы данных в Appwrite
  collectionCodes: "access_codes",           // ID коллекции кодов доступа
  collectionResults: "exam_results",         // ID коллекции результатов тестирования
};

let client = null;
let databases = null;
let isAppwriteReady = false;

// Динамическая инициализация официального браузерного Appwrite Web SDK (v14/v15 через CDN без сборщиков)
export async function initAppwrite() {
  if (isAppwriteReady) return databases;

  const isConfigured = Boolean(
    appwriteConfig.endpoint &&
    appwriteConfig.projectId &&
    !appwriteConfig.projectId.includes("PASTE") &&
    appwriteConfig.databaseId
  );

  if (!isConfigured) {
    return null;
  }

  try {
    const { Client, Databases } = await import("https://cdn.jsdelivr.net/npm/appwrite@14.0.1/+esm");
    client = new Client();
    client
      .setEndpoint(appwriteConfig.endpoint)
      .setProject(appwriteConfig.projectId);

    databases = new Databases(client);
    isAppwriteReady = true;
    return databases;
  } catch (err) {
    console.warn("Не удалось подключить Appwrite SDK, переключаемся на localStorage:", err);
    return null;
  }
}

export function isUsingCloud() {
  return isAppwriteReady;
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
  const db = await initAppwrite();
  if (db) {
    try {
      const { Query } = await import("https://cdn.jsdelivr.net/npm/appwrite@14.0.1/+esm");
      const response = await db.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.collectionCodes,
        [Query.orderDesc("$createdAt"), Query.limit(100)]
      );

      if (response && Array.isArray(response.documents)) {
        return response.documents.map((doc) => ({
          code: doc.code || doc.$id,
          studentName: doc.studentName,
          className: doc.className || "",
          used: Boolean(doc.used),
          createdAt: doc.createdAt || doc.$createdAt,
          usedAt: doc.usedAt || null,
          sessionId: doc.sessionId || null,
        }));
      }
    } catch (err) {
      console.warn("Ошибка загрузки кодов из Appwrite, читаем локальные:", err);
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
  const db = await initAppwrite();
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

    if (db) {
      try {
        const { ID, Permission, Role } = await import("https://cdn.jsdelivr.net/npm/appwrite@14.0.1/+esm");
        // Используем сам код OGE-XXXX в качестве documentId для мгновенного прямого поиска
        await db.createDocument(
          appwriteConfig.databaseId,
          appwriteConfig.collectionCodes,
          code,
          {
            code: record.code,
            studentName: record.studentName,
            className: record.className,
            used: false,
            createdAt: record.createdAt,
            usedAt: null,
            sessionId: null,
          },
          [
            Permission.read(Role.any()),
            Permission.update(Role.any()),
          ]
        );
      } catch (err) {
        console.error("Ошибка сохранения кода в Appwrite:", err);
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
  const db = await initAppwrite();

  let accessCode = null;

  if (db) {
    try {
      const doc = await db.getDocument(
        appwriteConfig.databaseId,
        appwriteConfig.collectionCodes,
        normalizedCode
      );

      if (doc) {
        if (doc.used) {
          throw new Error("Этот код доступа уже был использован.");
        }
        accessCode = {
          code: doc.code || doc.$id,
          studentName: doc.studentName,
          className: doc.className || "",
          used: doc.used,
          createdAt: doc.createdAt || doc.$createdAt,
          usedAt: doc.usedAt,
          sessionId: doc.sessionId,
        };
      }
    } catch (err) {
      if (err.message && err.message.includes("уже был")) throw err;
      console.warn("Проверка в Appwrite не удалась, ищем локально:", err);
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

  if (db) {
    try {
      await db.updateDocument(
        appwriteConfig.databaseId,
        appwriteConfig.collectionCodes,
        normalizedCode,
        {
          used: true,
          usedAt: accessCode.usedAt,
          sessionId: session.id,
        }
      );
    } catch (err) {
      console.error("Ошибка обновления статуса кода в Appwrite:", err);
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
  const db = await initAppwrite();
  const results = readLocal(KEYS.results, []);
  results.push(result);
  writeLocal(KEYS.results, results);
  localStorage.removeItem(KEYS.session);

  if (db) {
    try {
      const { ID, Permission, Role } = await import("https://cdn.jsdelivr.net/npm/appwrite@14.0.1/+esm");
      await db.createDocument(
        appwriteConfig.databaseId,
        appwriteConfig.collectionResults,
        ID.unique(),
        {
          id: result.id,
          code: result.code,
          studentName: result.studentName,
          className: result.className || "",
          startedAt: result.startedAt,
          finishedAt: result.finishedAt,
          durationSeconds: result.durationSeconds,
          score: result.score,
          tabSwitches: result.tabSwitches,
          status: result.status,
          answers: JSON.stringify(result.answers || []),
        },
        [
          Permission.read(Role.any()),
          Permission.write(Role.any()),
        ]
      );
    } catch (err) {
      console.error("Ошибка сохранения результата в Appwrite:", err);
    }
  }
  return result;
}

export async function getResults() {
  const db = await initAppwrite();
  if (db) {
    try {
      const { Query } = await import("https://cdn.jsdelivr.net/npm/appwrite@14.0.1/+esm");
      const response = await db.listDocuments(
        appwriteConfig.databaseId,
        appwriteConfig.collectionResults,
        [Query.orderDesc("$createdAt"), Query.limit(100)]
      );

      if (response && Array.isArray(response.documents) && response.documents.length > 0) {
        return response.documents.map((doc) => {
          let parsedAnswers = [];
          try {
            parsedAnswers = typeof doc.answers === "string" ? JSON.parse(doc.answers) : (doc.answers || []);
          } catch {
            parsedAnswers = [];
          }

          return {
            id: doc.id || doc.$id,
            code: doc.code,
            studentName: doc.studentName,
            className: doc.className || "",
            startedAt: doc.startedAt,
            finishedAt: doc.finishedAt || doc.$createdAt,
            durationSeconds: Number(doc.durationSeconds) || 0,
            score: Number(doc.score) || 0,
            tabSwitches: Number(doc.tabSwitches) || 0,
            status: doc.status || "Завершён штатно",
            answers: parsedAnswers,
          };
        });
      }
    } catch (err) {
      console.warn("Не удалось прочитать результаты из Appwrite, читаем локальные:", err);
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
