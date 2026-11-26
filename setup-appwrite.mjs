прям// Скрипт автоматического создания базы данных и таблиц (коллекций) в Appwrite Cloud
// Работает на стандартном Node.js (без установки npm-библиотек) через нативный fetch.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ENDPOINT = "https://cloud.appwrite.io/v1";
const DATABASE_ID = "oge_db";

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function api(path, options, projectId, apiKey) {
  const res = await fetch(`${ENDPOINT}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": projectId,
      "X-Appwrite-Key": apiKey,
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }

  return { ok: res.ok, status: res.status, data: json };
}

async function main() {
  console.log("\n=======================================================");
  console.log("   🚀 Автоматическая настройка Appwrite Cloud для ОГЭ   ");
  console.log("=======================================================\n");

  let projectId = process.argv[2];
  let apiKey = process.argv[3];

  if (!projectId) {
    projectId = await ask("1. Введите ваш Appwrite Project ID: ");
  }

  if (!apiKey) {
    console.log("\n💡 Как получить API Key в Appwrite:");
    console.log("   1) Перейдите в Settings -> API Keys -> Create API Key.");
    console.log("   2) Назовите его 'setup', выберите область: Database (Все права).");
    console.log("   3) Скопируйте секретный ключ.\n");
    apiKey = await ask("2. Введите ваш Appwrite API Secret Key: ");
  }

  if (!projectId || !apiKey) {
    console.error("❌ Ошибка: Project ID и API Key обязательны!");
    process.exit(1);
  }

  console.log("\n[1/4] Создание базы данных (oge_db)...");
  const dbRes = await api("/databases", {
    method: "POST",
    body: JSON.stringify({ databaseId: DATABASE_ID, name: "ОГЭ База данных" }),
  }, projectId, apiKey);

  if (dbRes.ok) {
    console.log("  ✓ База данных 'oge_db' успешно создана!");
  } else if (dbRes.status === 409) {
    console.log("  ℹ База данных 'oge_db' уже существует, продолжаем.");
  } else {
    console.error(`  ❌ Ошибка базы данных (${dbRes.status}):`, dbRes.data?.message || dbRes.data);
    process.exit(1);
  }

  // --- Таблица 1: access_codes ---
  console.log("\n[2/4] Создание коллекции 'access_codes' и атрибутов...");
  const colCodesRes = await api(`/databases/${DATABASE_ID}/collections`, {
    method: "POST",
    body: JSON.stringify({
      collectionId: "access_codes",
      name: "Коды доступа",
      permissions: [
        'read("any")',
        'create("any")',
        'update("any")',
      ],
      documentSecurity: false,
    }),
  }, projectId, apiKey);

  if (colCodesRes.ok) {
    console.log("  ✓ Коллекция 'access_codes' создана!");
  } else if (colCodesRes.status === 409) {
    console.log("  ℹ Коллекция 'access_codes' уже существует.");
  }

  const codeAttributes = [
    { type: "string", key: "code", size: 32, required: true },
    { type: "string", key: "studentName", size: 128, required: true },
    { type: "string", key: "className", size: 32, required: false },
    { type: "boolean", key: "used", required: true, default: false },
    { type: "string", key: "createdAt", size: 64, required: false },
    { type: "string", key: "usedAt", size: 64, required: false },
    { type: "string", key: "sessionId", size: 128, required: false },
  ];

  for (const attr of codeAttributes) {
    const attrRes = await api(
      `/databases/${DATABASE_ID}/collections/access_codes/attributes/${attr.type}`,
      { method: "POST", body: JSON.stringify(attr) },
      projectId,
      apiKey
    );
    if (attrRes.ok || attrRes.status === 409) {
      console.log(`    + Атрибут '${attr.key}' готов.`);
    } else {
      console.log(`    ⚠ Атрибут '${attr.key}': ${attrRes.data?.message || attrRes.status}`);
    }
    await sleep(250);
  }

  // --- Таблица 2: exam_results ---
  console.log("\n[3/4] Создание коллекции 'exam_results' и атрибутов...");
  const colResRes = await api(`/databases/${DATABASE_ID}/collections`, {
    method: "POST",
    body: JSON.stringify({
      collectionId: "exam_results",
      name: "Результаты экзаменов",
      permissions: [
        'read("any")',
        'create("any")',
      ],
      documentSecurity: false,
    }),
  }, projectId, apiKey);

  if (colResRes.ok) {
    console.log("  ✓ Коллекция 'exam_results' создана!");
  } else if (colResRes.status === 409) {
    console.log("  ℹ Коллекция 'exam_results' уже существует.");
  }

  const resultAttributes = [
    { type: "string", key: "id", size: 128, required: true },
    { type: "string", key: "code", size: 32, required: true },
    { type: "string", key: "studentName", size: 128, required: true },
    { type: "string", key: "className", size: 32, required: false },
    { type: "string", key: "startedAt", size: 64, required: false },
    { type: "string", key: "finishedAt", size: 64, required: false },
    { type: "integer", key: "durationSeconds", required: false, min: 0, max: 86400 },
    { type: "integer", key: "score", required: false, min: 0, max: 100 },
    { type: "integer", key: "tabSwitches", required: false, min: 0, max: 1000 },
    { type: "string", key: "status", size: 64, required: false },
    { type: "string", key: "answers", size: 5000, required: false },
  ];

  for (const attr of resultAttributes) {
    const attrRes = await api(
      `/databases/${DATABASE_ID}/collections/exam_results/attributes/${attr.type}`,
      { method: "POST", body: JSON.stringify(attr) },
      projectId,
      apiKey
    );
    if (attrRes.ok || attrRes.status === 409) {
      console.log(`    + Атрибут '${attr.key}' готов.`);
    } else {
      console.log(`    ⚠ Атрибут '${attr.key}': ${attrRes.data?.message || attrRes.status}`);
    }
    await sleep(250);
  }

  // --- Автоматическое обновление storage.js ---
  console.log("\n[4/4] Обновление файла storage.js...");
  const storagePath = path.resolve("storage.js");
  if (fs.existsSync(storagePath)) {
    let content = fs.readFileSync(storagePath, "utf-8");
    content = content.replace(
      /projectId:\s*["'][^"']*["']/,
      `projectId: "${projectId}"`
    );
    fs.writeFileSync(storagePath, content, "utf-8");
    console.log(`  ✓ Project ID "${projectId}" автоматически прописан в storage.js!`);
  }

  console.log("\n🎉 ГОТОВО! Все таблицы, колонки и права в Appwrite созданы автоматически.");
  console.log("   Теперь открывайте index.html — сайт подключен к облаку!");
}

main().catch(console.error);
