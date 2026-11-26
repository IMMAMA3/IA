const pick = (items) => items[Math.floor(Math.random() * items.length)];
const int = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffled = (items) => [...items].sort(() => Math.random() - 0.5);

function generateTask1() {
  const weight = pick([8, 16]);
  const lengths = shuffled([3, 4, 5, 6, 7, 8]);
  const alphabet = "абвгдежзиклмнопрстуфхцчшэюя";
  const list = lengths.map((length) => Array.from({ length }, () => pick(alphabet)).join(""));
  const removed = pick(list.slice(0, -1));
  const savedBits = (removed.length + 2) * weight;
  return {
    number: 1,
    title: "Информационный объём",
    prompt: `В предложении перечислены слова: «${list.join(", ")}». Одно слово удалили вместе с запятой и пробелом. Объём текста уменьшился на ${savedBits} бит. Вес каждого символа — ${weight} бит. Введите удалённое слово.`,
    answer: removed.toLowerCase(),
    answerType: "text",
  };
}

function generateTask2() {
  const letters = shuffled("АБВГД").slice(0, 5);
  const codes = ["0", "10", "110", "1110", "1111"];
  const codeByLetter = Object.fromEntries(letters.map((letter, index) => [letter, codes[index]]));
  const length = int(5, 6);
  const word = Array.from({ length }, () => pick(letters));
  const encoded = word.map((letter) => codeByLetter[letter]).join("");
  return {
    number: 2,
    title: "Декодирование кодовой последовательности",
    prompt: `Кодовая таблица (код является префиксным):<br><div class="code-table">${letters.map((letter) => `<span>${letter} — <code>${codeByLetter[letter]}</code></span>`).join("")}</div>Расшифруйте последовательность <code class="sequence">${encoded}</code> и введите получившееся слово заглавными русскими буквами.`,
    answer: word.join(""),
    answerType: "text",
  };
}

function generateTask3() {
  const divisor = int(3, 9);
  const threshold = int(20, 70);
  const findSmallest = Math.random() < 0.5;
  const satisfying = [];
  for (let x = 1; x <= 100; x += 1) {
    if (x % divisor !== 0 && x > threshold) satisfying.push(x);
  }
  return {
    number: 3,
    title: "Логическое выражение",
    prompt: `Для какого ${findSmallest ? "наименьшего" : "наибольшего"} целого X от 1 до 100 истинно выражение:<br><code>НЕ (X делится на ${divisor}) И (X &gt; ${threshold})</code>? Введите число.`,
    answer: String(findSmallest ? satisfying[0] : satisfying[satisfying.length - 1]),
    answerType: "number",
  };
}

function shortestPath(graph, start, end) {
  const distances = Array(5).fill(Infinity);
  const visited = Array(5).fill(false);
  distances[start] = 0;
  for (let step = 0; step < 5; step += 1) {
    let current = -1;
    for (let i = 0; i < 5; i += 1) {
      if (!visited[i] && (current === -1 || distances[i] < distances[current])) current = i;
    }
    if (current === -1 || distances[current] === Infinity) break;
    visited[current] = true;
    for (let neighbor = 0; neighbor < 5; neighbor += 1) {
      if (graph[current][neighbor] !== null && distances[current] + graph[current][neighbor] < distances[neighbor]) {
        distances[neighbor] = distances[current] + graph[current][neighbor];
      }
    }
  }
  return distances[end];
}

function generateTask4() {
  const names = ["A", "B", "C", "D", "E"];
  const graph = Array.from({ length: 5 }, () => Array(5).fill(null));
  for (let i = 0; i < 5; i += 1) graph[i][i] = 0;
  // A random spanning tree guarantees connectivity; extra links add choice to the route.
  for (let i = 1; i < 5; i += 1) {
    const parent = int(0, i - 1);
    const distance = int(3, 35);
    graph[i][parent] = distance;
    graph[parent][i] = distance;
  }
  for (let i = 0; i < 5; i += 1) {
    for (let j = i + 1; j < 5; j += 1) {
      if (graph[i][j] === null && Math.random() < 0.48) {
        graph[i][j] = int(3, 35);
        graph[j][i] = graph[i][j];
      }
    }
  }
  const table = `<div class="table-scroll"><table class="data-table"><thead><tr><th>Пункт</th>${names.map((name) => `<th>${name}</th>`).join("")}</tr></thead><tbody>${names.map((name, i) => `<tr><th>${name}</th>${names.map((_, j) => `<td>${graph[i][j] === null ? "—" : graph[i][j]}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return {
    number: 4,
    title: "Кратчайший путь в графе",
    prompt: `В таблице указаны длины дорог между пунктами (прочерк означает отсутствие прямой дороги). Найдите длину кратчайшего пути из A в E.<br>${table}`,
    answer: String(shortestPath(graph, 0, 4)),
    answerType: "number",
  };
}

function generateTask6() {
  const useAnd = Math.random() < 0.5;
  const thresholdS = int(2, 10);
  const thresholdT = int(2, 10);
  const condition = useAnd ? `s > ${thresholdS} and t < ${thresholdT}` : `s < ${thresholdS} or t > ${thresholdT}`;
  const rows = Array.from({ length: 9 }, () => [int(0, 15), int(0, 15)]);
  const yesCount = rows.filter(([s, t]) => useAnd ? s > thresholdS && t < thresholdT : s < thresholdS || t > thresholdT).length;
  const code = `for s, t in [\n${rows.map(([s, t]) => `    (${s}, ${t}),`).join("\n")}\n]:\n    if ${condition}:\n        print("YES")\n    else:\n        print("NO")`;
  return {
    number: 6,
    title: "Условный оператор",
    prompt: `Дана программа. Сколько раз при её выполнении будет напечатано слово YES?<pre class="python-code">${code}</pre>Введите целое число.`,
    answer: String(yesCount),
    answerType: "number",
  };
}

function generateTask7() {
  const protocol = pick(["http://", "https://"]);
  const domain = `${pick(["school", "exam", "info", "study", "oge"])}${int(1, 99)}.ru`;
  const directory = pick(["files", "tasks", "docs", "media", "answers"]);
  const filename = pick(["variant", "result", "lesson", "test", "report"]);
  const extension = pick(["pdf", "html", "txt", "jpg", "doc"]);
  const parts = [protocol, domain, "/", directory, "/", filename, ".", extension];
  const order = shuffled(parts.map((_, index) => index));
  const list = `<ol class="fragment-list">${order.map((partIndex, listIndex) => `<li><b>${listIndex + 1}.</b> <code>${parts[partIndex]}</code></li>`).join("")}</ol>`;
  return {
    number: 7,
    title: "Сборка URL-адреса",
    prompt: `Соберите адрес файла, расположенного на сервере ${domain}, в каталоге «${directory}», с именем «${filename}.${extension}». Укажите последовательность номеров фрагментов без пробелов.<br>${list}`,
    answer: parts.map((_, index) => order.indexOf(index) + 1).join(""),
    answerType: "text",
  };
}

function generateTask8() {
  const onlyA = int(12, 90);
  const onlyB = int(12, 90);
  const both = int(5, 50);
  const findUnion = Math.random() < 0.5;
  return {
    number: 8,
    title: "Поисковые запросы",
    prompt: `В таблице указано количество страниц (в тысячах), найденных по запросам. «Только A» — страницы запроса A, не найденные по B; «только B» — наоборот; «A и B» — найденные обоими запросами.<div class="table-scroll"><table class="data-table"><thead><tr><th>Только A</th><th>Только B</th><th>A и B</th></tr></thead><tbody><tr><td>${onlyA}</td><td>${onlyB}</td><td>${both}</td></tr></tbody></table></div>Найдите количество страниц (в тысячах) для выражения <code>${findUnion ? "A | B" : "A & B"}</code>.`,
    answer: String(findUnion ? onlyA + onlyB + both : both),
    answerType: "number",
  };
}

function generateTask10() {
  const value = int(130, 250);
  return {
    number: 10,
    title: "Двоичная система счисления",
    prompt: `Переведите число ${value} из десятичной системы счисления в двоичную. Введите ответ без пробелов и основания системы.`,
    answer: value.toString(2),
    answerType: "text",
  };
}

const factories = [generateTask1, generateTask2, generateTask3, generateTask4, generateTask6, generateTask7, generateTask8, generateTask10];

export function createExam() {
  return factories.map((factory) => factory()).sort(() => Math.random() - 0.5);
}

export function normalizeAnswer(value) {
  return String(value ?? "").trim().toLocaleUpperCase("ru-RU").replace(/\s+/g, "");
}
