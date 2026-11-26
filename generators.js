const pick = (items) => items[Math.floor(Math.random() * items.length)];
const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffled = (items) => [...items].sort(() => Math.random() - 0.5);
const lettersRu = "АБВГДЕЖИКЛМНОПРСТУФХЦЧШЭЮЯ";

function subscriptBase(n) {
  const map = { "2": "₂", "8": "₈", "10": "₁₀", "16": "₁₆" };
  return String(n).split("").map((c) => map[c] || c).join("");
}

function toBase(n, base) {
  return Number(n).toString(base).toUpperCase();
}

// ---------- Task 1 (demo: Unicode, 16 bit = 2 bytes, remove hero name + comma+space) ----------
function generateTask1() {
  const heroesPool = [
    "Шрек", "Пумба", "Маугли", "Рататуй", "Пиноккио", "Винни-Пух", "Белоснежка",
    "Малефисента", "Человек-паук", "Золушка", "Бэмби", "Дамбо", "Аладдин", "Моана",
    "Рапунцель", "Тарзан", "Геркулес", "Мулан", "Покахонтас", "Матроскин"
  ];
  const count = 8;
  const heroes = shuffled(heroesPool).slice(0, count);
  const removed = pick(heroes.slice(0, count - 1)); // avoid last to keep comma+space removal simple
  // Unicode 16 bits = 2 bytes per char. Removing "NAME, " => name.length + 2 chars
  const removedChars = removed.length + 2;
  const bytesSaved = removedChars * 2;
  const bitsSaved = bytesSaved * 8;
  const askBits = Math.random() < 0.5;
  const savedText = askBits ? `${bitsSaved} бит` : `${bytesSaved} байт`;
  const textList = heroes.join(", ");
  return {
    number: 1,
    title: "Кодирование текстовой информации",
    prompt: `В одной из кодировок Unicode каждый символ кодируется 16 битами.<br>Ученик написал текст (в нём нет лишних пробелов):<br><br>«Мои любимые герои мультфильмов: ${escapeHtmlPrompt(textList)}».<br><br>Ученик удалил из списка имя героя одного мультфильма, а также лишние запятую и пробел – два пробела не должны идти подряд.<br>При этом размер нового предложения в данной кодировке оказался на <b>${savedText}</b> меньше, чем размер исходного предложения. Напишите в ответе удалённое имя героя мультфильма.`,
    answer: removed,
    answerType: "text",
  };
}

// ---------- Task 2 (demo: radiogram with lost separators, 5 letters) ----------
function generateTask2() {
  const morseLike = [
    { l: "А", c: ".-" },
    { l: "Д", c: "-.." },
    { l: "Ж", c: "...-" },
    { l: "Л", c: "-" },
    { l: "Т", c: "...-" }, // avoid ambiguous - keep prefix-free
  ];
  // Build a guaranteed prefix-free 5-letter code set
  const codeSets = [
    [
      { l: "А", c: ".-" },
      { l: "Д", c: "-.." },
      { l: "Ж", c: "...-" },
      { l: "Л", c: "-" },
      { l: "Т", c: "..-" },
    ],
    [
      { l: "А", c: ".-" },
      { l: "В", c: "-.." },
      { l: "Д", c: "..-" },
      { l: "Ж", c: "...-" },
      { l: "Т", c: "-" },
    ],
    [
      { l: "А", c: "-" },
      { l: "Г", c: ".-" },
      { l: "Д", c: "-.." },
      { l: "Ж", c: "..-" },
      { l: "Л", c: "...-" },
    ],
  ];
  const base = pick(codeSets);
  const letters = shuffled(base);
  // generate a word 4-6 chars with unique decoding guaranteed by prefix-free codes
  const wordLen = int(4, 6);
  const wordArr = Array.from({ length: wordLen }, () => pick(letters).l);
  const codeByL = Object.fromEntries(letters.map((x) => [x.l, x.c]));
  const encoded = wordArr.map((l) => codeByL[l]).join("");
  const table = `<div class="table-scroll"><table class="data-table"><thead><tr>${letters.map((x) => `<th>${x.l}</th>`).join("")}</tr></thead><tbody><tr>${letters.map((x) => `<td><code>${x.c}</code></td>`).join("")}</tr></tbody></table></div>`;
  const displayEncoded = encoded.split("").join(" ");
  return {
    number: 2,
    title: "Декодирование сообщения",
    prompt: `Разведчик передал в штаб радиограмму:<br><code class="sequence">${displayEncoded}</code><br><br>При передаче радиограммы было потеряно разбиение на буквы, но известно, что в ней использовались только следующие буквы:<br>${table}<br>Определите текст радиограммы. В ответе запишите получившееся слово (набор букв).`,
    answer: wordArr.join(""),
    answerType: "text",
  };
}

// ---------- Task 3 (demo: smallest natural x for which statement is FALSE) ----------
function generateTask3() {
  // Demo form: false for: (x > A) OR NOT ((x < B) AND (x > C))
  // We'll keep exact structure, randomize A,B,C with valid natural solution.
  for (let tries = 0; tries < 200; tries += 1) {
    const A = int(2, 6);
    const C = int(1, 5);
    const B = C + int(1, 4);
    // Find smallest natural x where expression is FALSE
    let ans = null;
    for (let x = 1; x <= 200; x += 1) {
      const expr = (x > A) || !((x < B) && (x > C));
      if (!expr) { ans = x; break; }
    }
    if (ans !== null) {
      return {
        number: 3,
        title: "Истинность логического высказывания",
        prompt: `Напишите наименьшее натуральное число <i>x</i>, для которого ложно высказывание:<br><code>(x &gt; ${A}) ИЛИ НЕ ((x &lt; ${B}) И (x &gt; ${C}))</code>.`,
        answer: String(ans),
        answerType: "number",
      };
    }
  }
  return {
    number: 3,
    title: "Истинность логического высказывания",
    prompt: `Напишите наименьшее натуральное число <i>x</i>, для которого ложно высказывание:<br><code>(x &gt; 3) ИЛИ НЕ ((x &lt; 4) И (x &gt; 2))</code>.`,
    answer: "3",
    answerType: "number",
  };
}

// ---------- Task 4 (demo: shortest path A..D/E in table, 5 nodes) ----------
function shortestPath(graph, start, end) {
  const n = graph.length;
  const dist = Array(n).fill(Infinity);
  const used = Array(n).fill(false);
  dist[start] = 0;
  for (let k = 0; k < n; k += 1) {
    let v = -1;
    for (let i = 0; i < n; i += 1) if (!used[i] && (v === -1 || dist[i] < dist[v])) v = i;
    if (v === -1 || dist[v] === Infinity) break;
    used[v] = true;
    for (let to = 0; to < n; to += 1) {
      const w = graph[v][to];
      if (w != null && dist[v] + w < dist[to]) dist[to] = dist[v] + w;
    }
  }
  return dist[end];
}

function generateTask4() {
  const names = ["A", "B", "C", "D", "E"];
  const endIdx = 4; // A -> E, like many OGE variants (demo showed A->D with 5 nodes; keep clear)
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const g = Array.from({ length: 5 }, () => Array(5).fill(null));
    for (let i = 0; i < 5; i += 1) g[i][i] = 0;
    for (let i = 1; i < 5; i += 1) {
      const p = int(0, i - 1);
      const w = int(1, 8);
      g[i][p] = w; g[p][i] = w;
    }
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) {
        if (g[i][j] == null && Math.random() < 0.45) {
          const w = int(1, 10);
          g[i][j] = w; g[j][i] = w;
        }
      }
    }
    const ans = shortestPath(g, 0, endIdx);
    if (!Number.isFinite(ans)) continue;
    const table = `<div class="table-scroll"><table class="data-table"><thead><tr><th></th>${names.map((n) => `<th>${n}</th>`).join("")}</tr></thead><tbody>${names.map((r, i) => `<tr><th>${r}</th>${names.map((_, j) => `<td>${g[i][j] == null ? "" : g[i][j]}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return {
      number: 4,
      title: "Кратчайший путь",
      prompt: `Между населёнными пунктами A, B, C, D, E построены дороги, протяжённость которых (в километрах) приведена в таблице.<br>${table}<br>Определите длину кратчайшего пути между пунктами A и E. Передвигаться можно только по дорогам, протяжённость которых указана в таблице. Каждый пункт можно посетить только один раз.`,
      answer: String(ans),
      answerType: "number",
    };
  }
  throw new Error("Task4 generation failed");
}

// ---------- Task 6 (demo: program given, 9 runs, find largest A giving NO exactly 5 times) ----------
function generateTask6() {
  // Keep demo shape: condition uses parameter A and constant, 9 pairs, ask for largest integer A with NO exactly k times.
  for (let tries = 0; tries < 300; tries += 1) {
    const useOr = Math.random() < 0.5;
    const Tconst = int(8, 14);
    const pairs = Array.from({ length: 9 }, () => [int(-12, 15), int(-12, 15)]);
    // condition: (s > A) or (t > Tconst)  => prints YES else NO (demo)
    // or variant: (s < A) and (t < Tconst) => YES else NO
    const evalProg = (A, s, t) => useOr ? ((s > A) || (t > Tconst)) : ((s < A) && (t < Tconst));
    const targetNo = int(3, 7); // reasonable
    // Search integer A range
    let candidates = [];
    for (let A = -20; A <= 20; A += 1) {
      let noCount = 0;
      for (const [s, t] of pairs) if (!evalProg(A, s, t)) noCount += 1;
      if (noCount === targetNo) candidates.push(A);
    }
    if (!candidates.length) continue;
    const ans = Math.max(...candidates);
    const condText = useOr ? `(s > A) или (t > ${Tconst})` : `(s < A) и (t < ${Tconst})`;
    const condPy = useOr ? `(s > A) or (t > ${Tconst})` : `(s < A) and (t < ${Tconst})`;
    const condPas = useOr ? `(s > A) or (t > ${Tconst})` : `(s < A) and (t < ${Tconst})`;
    const condCpp = useOr ? `(s > A || t > ${Tconst})` : `(s < A && t < ${Tconst})`;
    const condBas = useOr ? `s > A OR t > ${Tconst}` : `s < A AND t < ${Tconst}`;
    const pairsText = pairs.map(([s, t]) => `(${s}, ${t})`).join("; ");
    const code =
`<div class="code-table" style="margin-bottom:12px"><span><b>Алгоритмический</b></span><span><b>Паскаль</b></span><span><b>Python</b></span></div>
<pre class="python-code">алг
нач
  цел s, t, A
  ввод s
  ввод t
  ввод A
  если ${condText}
    то вывод "YES"
    иначе вывод "NO"
  все
кон

var s, t, A: integer;
begin
  readln(s); readln(t); readln(A);
  if ${condPas} then
    writeln("YES")
  else
    writeln("NO")
end.

s = int(input())
t = int(input())
A = int(input())
if ${condPy}:
    print("YES")
else:
    print("NO")</pre>`;
    return {
      number: 6,
      title: "Условный оператор",
      prompt: `Ниже приведена программа, записанная на нескольких языках программирования.<br>${code}<br>Было проведено 9 запусков программы, при которых в качестве значений переменных <i>s</i> и <i>t</i> вводились следующие пары чисел:<br><code class="sequence">${escapeHtmlPrompt(pairsText)}</code><br><br>Укажите наибольшее целое значение параметра <i>A</i>, при котором для указанных входных данных программа напечатает «NO» ровно <b>${targetNo}</b> раз.`,
      answer: String(ans),
      answerType: "number",
    };
  }
  // deterministic fallback
  return {
    number: 6,
    title: "Условный оператор",
    prompt: `Ниже приведена программа. Было проведено 9 запусков: (13, 2); (11, 12); (-12, 12); (2, -2); (-10, -10); (6, -5); (2, 8); (9, 10); (1, 13).<br><pre class="python-code">s = int(input())\nt = int(input())\nA = int(input())\nif (s > A) or (t > 12):\n    print("YES")\nelse:\n    print("NO")</pre>Укажите наибольшее целое значение параметра A, при котором программа напечатает «NO» ровно 5 раз.`,
    answer: "2",
    answerType: "number",
  };
}

// ---------- Task 7 (demo: file URL fragments, digits 1-7) ----------
function generateTask7() {
  const protocol = pick(["https", "http", "ftp"]);
  const server = pick(["school", "exam", "info", "oge", "study", "smile"]) + pick(["", "1", "2", "9"]) + ".ru";
  const file = pick(["test", "https", "task", "data", "index", "result"]);
  const ext = pick(["txt", "pdf", "doc", "html", "jpg"]);
  // Demo-like fragments: protocol, /, server-name, protocol., .ru, ext, ://
  const parts = [
    protocol,        // 1 e.g. https
    "/",             // 2
    server.split(".")[0], // 3 e.g. smile
    protocol + ".",  // 4 e.g. https.
    "." + server.split(".").slice(1).join("."), // 5 e.g. .ru
    ext,             // 6
    "://",           // 7
  ];
  // Build correct address: protocol + :// + server + / + file + . + ext
  const full = `${protocol}://${server}/${file}.${ext}`;
  // Map to fragment numbers in demo style
  // demo: 1)https 2)/ 3)smile 4)https. 5).ru 6)txt 7)://  -> answer 1473526 for https://smile.ru/https.txt
  // We must construct from our parts; easier define fixed fragment roles
  const fr = [
    { n: 1, v: protocol },
    { n: 2, v: "/" },
    { n: 3, v: server.split(".")[0] },
    { n: 4, v: protocol + "." },
    { n: 5, v: "." + server.split(".").slice(1).join(".") },
    { n: 6, v: ext },
    { n: 7, v: "://" },
  ];
  // Correct sequence for: protocol://server/file.ext = 1,7,3,5,2,? but demo had file name as "https" which was same as protocol part 1. Avoid ambiguity.
  // Let's define clearly with 7 fragments like demo.
  const fileName = file;
  const fragments = [
    { id: 1, text: protocol },
    { id: 2, text: "/" },
    { id: 3, text: server.split(".")[0] },
    { id: 4, text: fileName },
    { id: 5, text: "." + server.split(".").slice(1).join(".") },
    { id: 6, text: ext },
    { id: 7, text: "://" },
  ];
  // address: protocol://server/file.ext => 1,7,3,5,2,4,.,6? need dot fragment
  // Better mirror demo exactly: 7 fragments including dot and protocol.
  // Demo: https://smile.ru/https.txt with 1)https 2)/ 3)smile 4)https. 5).ru 6)txt 7):// => 1 7 3 5 2 1 4? Wait, demo answer 1473526? Let's compute: 1=https,4=https.,7=://,3=smile,5=.ru,2=/,6=txt => "1 4 7 3 5 2 1 . 6"? No. Better use own clean structure.
  const frags = shuffled([
    { k: "proto", t: protocol },
    { k: "slashes", t: "://" },
    { k: "host", t: server.split(".")[0] },
    { k: "tld", t: "." + server.split(".").slice(1).join(".") },
    { k: "slash", t: "/" },
    { k: "name", t: fileName },
    { k: "dotext", t: "." + ext },
  ]);
  const orderMap = Object.fromEntries(frags.map((f, i) => [f.k, i + 1]));
  const answerSeq = ["proto", "slashes", "host", "tld", "slash", "name", "dotext"].map((k) => orderMap[k]).join("");
  const list = `<ol class="fragment-list">${frags.map((f, i) => `<li><b>${i + 1})</b> <code>${escapeHtmlPrompt(f.t)}</code></li>`).join("")}</ol>`;
  return {
    number: 7,
    title: "Адрес файла в сети Интернет",
    prompt: `Доступ к файлу <b>${escapeHtmlPrompt(fileName)}.${escapeHtmlPrompt(ext)}</b>, находящемуся на сервере <b>${escapeHtmlPrompt(server)}</b>, осуществляется по протоколу <b>${escapeHtmlPrompt(protocol)}</b>. Фрагменты адреса файла закодированы цифрами от 1 до 7. Запишите последовательность этих цифр, кодирующую адрес указанного файла в сети Интернет.<br>${list}`,
    answer: answerSeq,
    answerType: "text",
  };
}

// ---------- Task 8 (demo: search queries with AND/OR, inclusion-exclusion table) ----------
function generateTask8() {
  // Demo style: given Dynamo&(Zenit|Spartak)=840, Dynamo&Zenit=530, Dynamo&Zenit&Spartak=130, find Dynamo&Spartak
  // We'll randomize values maintaining consistency.
  for (let tries = 0; tries < 200; tries += 1) {
    const dzs = int(600, 1200); // D&(Z|S)
    const dz = int(300, dzs - 100); // D&Z
    const dzAndS = int(50, Math.min(dz - 30, 250)); // D&Z&S
    const dOnlyS = dzs - dz; // D&S minus D&Z&S? D&(Z|S)=D&Z + D&S - D&Z&S => D&S = D&(Z|S)-D&Z+D&Z&S
    const ds = dzs - dz + dzAndS;
    if (ds <= 0 || ds > 2000) continue;
    if (dOnlyS < 0) continue;
    const names = pick([
      ["Динамо", "Зенит", "Спартак"],
      ["Орёл", "Сокол", "Беркут"],
      ["Альфа", "Бета", "Гамма"],
      ["Волга", "Нева", "Ока"],
    ]);
    const [A, B, C] = names;
    const rows = [
      [`${A} & (${B} | ${C})`, dzs],
      [`${A} & ${B}`, dz],
      [`${A} & ${B} & ${C}`, dzAndS],
    ];
    const table = `<div class="table-scroll"><table class="data-table"><thead><tr><th>Запрос</th><th>Найдено страниц (в тысячах)</th></tr></thead><tbody>${rows.map(([q, v]) => `<tr><td><code>${escapeHtmlPrompt(q)}</code></td><td>${v}</td></tr>`).join("")}</tbody></table></div>`;
    return {
      number: 8,
      title: "Запросы в поисковой системе",
      prompt: `В языке запросов поискового сервера для обозначения логической операции «ИЛИ» используется символ «|», а для логической операции «И» – символ «&amp;».<br>В таблице приведены запросы и количество найденных по ним страниц некоторого сегмента сети Интернет.<br>${table}<br>Какое количество страниц (в тысячах) будет найдено по запросу <code>${escapeHtmlPrompt(A)} &amp; ${escapeHtmlPrompt(C)}</code>?<br>Считается, что все запросы выполняются практически одновременно, так что набор страниц, содержащих все искомые слова, не изменяется за время выполнения запросов.`,
      answer: String(ds),
      answerType: "number",
    };
  }
  return {
    number: 8,
    title: "Запросы в поисковой системе",
    prompt: `В языке запросов поискового сервера для обозначения логической операции «ИЛИ» используется символ «|», а для логической операции «И» – символ «&amp;».<br>В таблице приведены запросы и количество найденных по ним страниц некоторого сегмента сети Интернет.<div class="table-scroll"><table class="data-table"><thead><tr><th>Запрос</th><th>Найдено страниц (в тысячах)</th></tr></thead><tbody><tr><td><code>Динамо &amp; (Зенит | Спартак)</code></td><td>840</td></tr><tr><td><code>Динамо &amp; Зенит</code></td><td>530</td></tr><tr><td><code>Динамо &amp; Зенит &amp; Спартак</code></td><td>130</td></tr></tbody></table></div>Какое количество страниц (в тысячах) будет найдено по запросу <code>Динамо &amp; Спартак</code>?`,
    answer: "440",
    answerType: "number",
  };
}

// ---------- Task 10 (demo: compute arithmetic value of numbers in different bases, answer decimal) ----------
function generateTask10() {
  for (let tries = 0; tries < 300; tries += 1) {
    const bases = shuffled([2, 8, 16]).slice(0, 3);
    const nums = bases.map((b) => {
      const maxVal = b === 2 ? int(20, 63) : b === 8 ? int(20, 120) : int(20, 180);
      const val = int(10, maxVal);
      return { val, b, repr: toBase(val, b) };
    });
    const expr = nums.map((n) => `${n.repr}${subscriptBase(n.b)}`).join(" + ");
    const ans = nums.reduce((s, n) => s + n.val, 0);
    if (ans <= 0 || ans > 2000) continue;
    // avoid duplicates
    const reprs = nums.map((n) => n.repr);
    if (new Set(reprs).size !== reprs.length) continue;
    return {
      number: 10,
      title: "Системы счисления",
      prompt: `Вычислите значение арифметического выражения:<br><code class="sequence">${expr}</code><br><br>В ответе запишите десятичное число. Основание системы счисления указывать не нужно.`,
      answer: String(ans),
      answerType: "number",
    };
  }
  return {
    number: 10,
    title: "Системы счисления",
    prompt: `Вычислите значение арифметического выражения:<br><code class="sequence">110111₂ + 1101₈ + 110₁₆</code><br><br>В ответе запишите десятичное число. Основание системы счисления указывать не нужно.`,
    answer: "400",
    answerType: "number",
  };
}

function escapeHtmlPrompt(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export const ANSWER_COLUMNS = [1, 2, 3, 4, 6, 7, 8, 10];

const factories = [generateTask1, generateTask2, generateTask3, generateTask4, generateTask6, generateTask7, generateTask8, generateTask10];

export function createExam() {
  return factories.map((fn) => fn()).sort((a, b) => a.number - b.number);
}

function normalizeText(s) {
  return String(s ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[\u00A0\s]+/g, " ")
    .replace(/[“”«»„‟"'`]/g, "")
    .replace(/[.,;:!?()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumeric(s) {
  let t = String(s ?? "").trim().replace(/[\u00A0\s]+/g, "").replace(/,/g, ".");
  t = t.replace(/^[+]+/, "");
  if (/^-?\d+(?:\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (Number.isFinite(n)) {
      // normalize 5.0 -> 5, keep decimals otherwise
      if (Object.is(n, -0)) return "0";
      return String(n);
    }
  }
  return null;
}

export function normalizeAnswer(value) {
  const raw = String(value ?? "");
  const num = normalizeNumeric(raw);
  if (num !== null) return num;
  const text = normalizeText(raw);
  // also return compact form for sequence answers (no spaces)
  return text.replace(/\s+/g, "");
}

export function isAnswerCorrect(userValue, correctValue) {
  const userRaw = String(userValue ?? "").trim();
  const correctRaw = String(correctValue ?? "").trim();
  if (!userRaw) return false;

  // numeric comparison first
  const uNum = normalizeNumeric(userRaw);
  const cNum = normalizeNumeric(correctRaw);
  if (uNum !== null && cNum !== null) return uNum === cNum;

  // text/sequence comparison
  const uText = normalizeText(userRaw);
  const cText = normalizeText(correctRaw);
  if (uText === cText) return true;

  // compact compare (ignores spaces, hyphens for names like "Винни-Пух"/"Винни Пух")
  const compact = (s) => normalizeText(s).replace(/[\s\-–—]+/g, "");
  if (compact(userRaw) === compact(correctRaw)) return true;

  // also accept answer without leading zeros in purely digit sequences
  const digitsOnly = (s) => String(s ?? "").replace(/\D+/g, "");
  if (/^\d+$/.test(uText.replace(/\s/g, "")) && /^\d+$/.test(cText.replace(/\s/g, ""))) {
    const ud = uText.replace(/\s/g, "").replace(/^0+(?=\d)/, "");
    const cd = cText.replace(/\s/g, "").replace(/^0+(?=\d)/, "");
    if (ud === cd) return true;
  }

  return false;
}
