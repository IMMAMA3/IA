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

function escapeHtmlPrompt(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- Task 1 ----------
function generateTask1() {
  const heroesPool = [
    "Алёша", "Борис", "Витя", "Гриша", "Денис", "Егор", "Женя", "Иван",
    "Кирилл", "Лёва", "Миша", "Никита", "Олег", "Паша", "Рома", "Саша",
    "Тимур", "Федя", "Юра", "Яша"
  ];
  const count = 8;
  const heroes = shuffled(heroesPool).slice(0, count);
  const removed = pick(heroes.slice(0, count - 1));
  const removedChars = removed.length + 2; // name + ", "
  const bytesSaved = removedChars * 2; // Unicode 16 bit = 2 bytes
  const bitsSaved = bytesSaved * 8;
  const askBits = Math.random() < 0.5;
  const savedText = askBits ? `${bitsSaved} бит` : `${bytesSaved} байт`;
  const textList = heroes.join(", ");
  return {
    number: 1,
    title: "Кодирование текстовой информации",
    prompt: `В кодировке Unicode каждый символ кодируется 16 битами.<br>Ученица написала текст (в нём нет лишних пробелов):<br><br>«Ученики моего класса: ${escapeHtmlPrompt(textList)}».<br><br>Ученица удалила из списка имя одного ученика, а также лишние запятую и пробел — два пробела не должны идти подряд.<br>При этом размер нового предложения в данной кодировке оказался на <b>${savedText}</b> меньше, чем размер исходного предложения. Напишите в ответе имя удалённого ученика.`,
    answer: removed,
    answerType: "text",
  };
}

// ---------- Task 2 ----------
function generateTask2() {
  const codeSets = [
    [
      { l: "А", c: ".-" },
      { l: "В", c: "-.." },
      { l: "Д", c: "...-" },
      { l: "О", c: "-" },
      { l: "Р", c: "..-" },
    ],
    [
      { l: "К", c: ".-" },
      { l: "Л", c: "-.." },
      { l: "М", c: "..-" },
      { l: "Н", c: "...-" },
      { l: "О", c: "-" },
    ],
    [
      { l: "А", c: "-" },
      { l: "Г", c: ".-" },
      { l: "И", c: "-.." },
      { l: "Н", c: "..-" },
      { l: "Р", c: "...-" },
    ],
    [
      { l: "Е", c: "." },
      { l: "К", c: "-." },
      { l: "Л", c: "..-" },
      { l: "М", c: "--" },
      { l: "О", c: "---" },
    ],
  ];
  const letters = shuffled(pick(codeSets));
  const wordLen = int(4, 6);
  const wordArr = Array.from({ length: wordLen }, () => pick(letters).l);
  const codeByL = Object.fromEntries(letters.map((x) => [x.l, x.c]));
  const encoded = wordArr.map((l) => codeByL[l]).join("");
  const table = `<div class="table-scroll"><table class="data-table"><thead><tr>${letters.map((x) => `<th>${x.l}</th>`).join("")}</tr></thead><tbody><tr>${letters.map((x) => `<td><code>${x.c}</code></td>`).join("")}</tr></tbody></table></div>`;
  const displayEncoded = encoded.split("").join(" ");
  return {
    number: 2,
    title: "Декодирование сообщения",
    prompt: `От разведчика была получена радиограмма:<br><code class="sequence">${displayEncoded}</code><br><br>В этой радиограмме содержится последовательность букв, в которой встречаются только буквы из таблицы. Разделители букв были утрачены.<br>${table}<br>Расшифруйте радиограмму. Запишите в ответе расшифрованную последовательность букв.`,
    answer: wordArr.join(""),
    answerType: "text",
  };
}

// ---------- Task 3 ----------
function generateTask3() {
  for (let tries = 0; tries < 300; tries += 1) {
    const A = int(2, 6);
    const C = int(1, 5);
    const B = C + int(1, 4);
    let ans = null;
    for (let x = 1; x <= 200; x += 1) {
      const expr = (x > A) || !((x < B) && (x > C));
      if (!expr) { ans = x; break; }
    }
    if (ans !== null && ans <= 20) {
      return {
        number: 3,
        title: "Истинность логического выражения",
        prompt: `Напишите наименьшее натуральное число <i>x</i>, для которого ложно высказывание:<br><code>(x &gt; ${A}) ИЛИ НЕ ((x &lt; ${B}) И (x &gt; ${C}))</code>.`,
        answer: String(ans),
        answerType: "number",
      };
    }
  }
  return {
    number: 3,
    title: "Истинность логического выражения",
    prompt: `Напишите наименьшее натуральное число <i>x</i>, для которого ложно высказывание:<br><code>(x &gt; 3) ИЛИ НЕ ((x &lt; 4) И (x &gt; 2))</code>.`,
    answer: "3",
    answerType: "number",
  };
}

// ---------- Task 4 ----------
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
  const endIdx = 4;
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const g = Array.from({ length: 5 }, () => Array(5).fill(null));
    for (let i = 0; i < 5; i += 1) g[i][i] = 0;
    // ensure connectivity
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
    if (!Number.isFinite(ans) || ans <= 0) continue;
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

// ---------- Task 6 ----------
function generateTask6() {
  for (let tries = 0; tries < 400; tries += 1) {
    const useOr = Math.random() < 0.5;
    const Tconst = int(8, 14);
    const pairs = Array.from({ length: 9 }, () => [int(-12, 15), int(-12, 15)]);
    const evalProg = (A, s, t) => useOr ? ((s > A) || (t > Tconst)) : ((s < A) && (t < Tconst));
    const targetNo = int(3, 7);
    let candidates = [];
    for (let A = -20; A <= 20; A += 1) {
      let noCount = 0;
      for (const [s, t] of pairs) if (!evalProg(A, s, t)) noCount += 1;
      if (noCount === targetNo) candidates.push(A);
    }
    if (!candidates.length) continue;
    const ans = Math.max(...candidates);
    const condPy = useOr ? `(s > A) or (t > ${Tconst})` : `(s < A) and (t < ${Tconst})`;
    const condPas = useOr ? `(s > A) or (t > ${Tconst})` : `(s < A) and (t < ${Tconst})`;
    const condCpp = useOr ? `(s > A || t > ${Tconst})` : `(s < A && t < ${Tconst})`;
    const condAlg = useOr ? `(s > A) или (t > ${Tconst})` : `(s < A) и (t < ${Tconst})`;
    const pairsText = pairs.map(([s, t]) => `(${s}, ${t})`).join("; ");
    const code =
`<div class="code-table" style="margin-bottom:12px"><span><b>Алгоритмический</b></span><span><b>Паскаль</b></span><span><b>Python</b></span></div>
<pre class="python-code">алг
нач
  цел s, t, A
  ввод s
  ввод t
  ввод A
  если ${condAlg}
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
      prompt: `Была написана программа, приведённая ниже на трёх языках программирования.<br>${code}<br>Было проведено 9 запусков программы, при которых в качестве значений переменных <i>s</i> и <i>t</i> вводились следующие пары чисел:<br><code class="sequence">${escapeHtmlPrompt(pairsText)}</code><br><br>Укажите наибольшее целое значение параметра <i>A</i>, при котором для указанных входных данных программа напечатает «NO» ровно <b>${targetNo}</b> раз.`,
      answer: String(ans),
      answerType: "number",
    };
  }
  // fallback
  return {
    number: 6,
    title: "Условный оператор",
    prompt: `Была написана программа.<br><pre class="python-code">s = int(input())
t = int(input())
A = int(input())
if (s > A) or (t > 12):
    print("YES")
else:
    print("NO")</pre>Было проведено 9 запусков: (13, 2); (11, 12); (-12, 12); (2, -2); (-10, -10); (6, -5); (2, 8); (9, 10); (1, 13).<br><br>Укажите наибольшее целое значение параметра <i>A</i>, при котором программа напечатает «NO» ровно 5 раз.`,
    answer: "2",
    answerType: "number",
  };
}

// ---------- Task 7 ----------
function generateTask7() {
  const protocol = pick(["https", "http", "ftp"]);
  const hostBase = pick(["school", "exam", "info", "oge", "study", "smile", "test"]);
  const tld = pick(["ru", "org", "edu"]);
  const server = `${hostBase}.${tld}`;
  const fileName = pick(["task", "data", "index", "result", "file", "work"]);
  const ext = pick(["txt", "pdf", "doc", "html", "jpg"]);
  const frags = shuffled([
    { k: "proto", t: protocol },
    { k: "slashes", t: "://" },
    { k: "host", t: hostBase },
    { k: "tld", t: "." + tld },
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

// ---------- Task 8 ----------
function generateTask8() {
  for (let tries = 0; tries < 300; tries += 1) {
    const dzs = int(600, 1200); // D&(Z|S)
    const dz = int(300, dzs - 100); // D&Z
    const dzAndS = int(50, Math.min(dz - 30, 250)); // D&Z&S
    const ds = dzs - dz + dzAndS; // D&S
    if (ds <= 0 || ds > 2000) continue;
    const names = pick([
      ["Динамо", "Зенит", "Спартак"],
      ["ЦСКА", "Локомотив", "Торпедо"],
      ["Сокол", "Орёл", "Беркут"],
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
      prompt: `В языке запросов поискового сервера для обозначения логической операции «ИЛИ» используется символ «|», а для обозначения логической операции «И» — символ «&amp;».<br>В таблице приведены запросы и количество найденных по ним страниц некоторого сегмента сети Интернет.<br>${table}<br>Какое количество страниц (в тысячах) будет найдено по запросу <code>${escapeHtmlPrompt(A)} &amp; ${escapeHtmlPrompt(C)}</code>?<br>Считается, что все запросы выполнялись практически одновременно, так что набор страниц, содержащих все искомые слова, не изменялся за время выполнения запросов.`,
      answer: String(ds),
      answerType: "number",
    };
  }
  return {
    number: 8,
    title: "Запросы в поисковой системе",
    prompt: `В языке запросов поискового сервера для обозначения логической операции «ИЛИ» используется символ «|», а для обозначения логической операции «И» — символ «&amp;».<br><div class="table-scroll"><table class="data-table"><thead><tr><th>Запрос</th><th>Найдено страниц (в тысячах)</th></tr></thead><tbody><tr><td><code>Динамо &amp; (Зенит | Спартак)</code></td><td>840</td></tr><tr><td><code>Динамо &amp; Зенит</code></td><td>530</td></tr><tr><td><code>Динамо &amp; Зенит &amp; Спартак</code></td><td>130</td></tr></tbody></table></div>Какое количество страниц (в тысячах) будет найдено по запросу <code>Динамо &amp; Спартак</code>?`,
    answer: "440",
    answerType: "number",
  };
}

// ---------- Task 10 ----------
function generateTask10() {
  for (let tries = 0; tries < 400; tries += 1) {
    const bases = shuffled([2, 8, 16]).slice(0, 3);
    const nums = bases.map((b) => {
      const maxVal = b === 2 ? int(20, 63) : b === 8 ? int(20, 120) : int(20, 180);
      const val = int(10, maxVal);
      return { val, b, repr: toBase(val, b) };
    });
    const expr = nums.map((n) => `${n.repr}${subscriptBase(n.b)}`).join(" + ");
    const ans = nums.reduce((s, n) => s + n.val, 0);
    if (ans <= 0 || ans > 2000) continue;
    const reprs = nums.map((n) => n.repr);
    if (new Set(reprs).size !== reprs.length) continue;
    return {
      number: 10,
      title: "Системы счисления",
      prompt: `Среди приведённых ниже трёх чисел, записанных в различных системах счисления, найдите их сумму и запишите её в ответе в десятичной системе счисления. В ответе запишите только число, основание системы счисления указывать не нужно.<br><code class="sequence">${expr}</code>`,
      answer: String(ans),
      answerType: "number",
    };
  }
  return {
    number: 10,
    title: "Системы счисления",
    prompt: `Среди приведённых ниже трёх чисел, записанных в различных системах счисления, найдите их сумму и запишите её в ответе в десятичной системе счисления.<br><code class="sequence">110111₂ + 1101₈ + 110₁₆</code>`,
    answer: "400",
    answerType: "number",
  };
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
    .replace(/[«»„‟"'`]/g, "")
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
  return text.replace(/\s+/g, "");
}

export function isAnswerCorrect(userValue, correctValue) {
  const userRaw = String(userValue ?? "").trim();
  const correctRaw = String(correctValue ?? "").trim();
  if (!userRaw) return false;

  const uNum = normalizeNumeric(userRaw);
  const cNum = normalizeNumeric(correctRaw);
  if (uNum !== null && cNum !== null) return uNum === cNum;

  const uText = normalizeText(userRaw);
  const cText = normalizeText(correctRaw);
  if (uText === cText) return true;

  const compact = (s) => normalizeText(s).replace(/[\s\-–—]+/g, "");
  if (compact(userRaw) === compact(correctRaw)) return true;

  if (/^\d+$/.test(uText.replace(/\s/g, "")) && /^\d+$/.test(cText.replace(/\s/g, ""))) {
    const ud = uText.replace(/\s/g, "").replace(/^0+(?=\d)/, "");
    const cd = cText.replace(/\s/g, "").replace(/^0+(?=\d)/, "");
    if (ud === cd) return true;
  }

  return false;
}
