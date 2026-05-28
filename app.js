const files = {
  mainFallbacks: [
    "./main_results(tokens90~100).csv",
    "./main_results(tokens90~100,generation300).csv",
    "./main_results(tokens90~200).csv",
    "./main_results(tokens190~200).csv",
  ],
};

const htmlReports = [
  { title: "Anchor Detection: Window 3 Gamma 0.6", path: "./anchor_detection_window3_gamma0.6.html" },
  { title: "Anchor Quality: Rep Split", path: "./debug_rep_split_para_lex60_order0.html" },
  { title: "Anchor Quality: Anchor Gamma 0.6", path: "./debug_window3_30_para_lex60_order0.html" },
  { title: "Anchor Quality: New Method", path: "./debug_window3_30_new_method_para_lex60_order0.html" },
];

const state = {
  main: { path: "", rows: [], headers: [], filteredRows: [] },
  mainFiles: [],
};

const charts = {
  mainOriginal: null,
  mainParaphrased: null,
};

const els = {
  mainFiles: document.querySelector("#mainFiles"),
  mainRows: document.querySelector("#mainRows"),
  reportCount: document.querySelector("#reportCount"),
  mainStatus: document.querySelector("#mainStatus"),
  mainCsvSelect: document.querySelector("#mainCsvSelect"),
  mainSearchInput: document.querySelector("#mainSearchInput"),
  downloadMainCsv: document.querySelector("#downloadMainCsv"),
  mainOriginalChart: document.querySelector("#mainOriginalChart"),
  mainParaphrasedChart: document.querySelector("#mainParaphrasedChart"),
  mainEmpty: document.querySelector("#mainEmpty"),
  mainTableHead: document.querySelector("#mainTableHead"),
  mainTableBody: document.querySelector("#mainTableBody"),
  reportGrid: document.querySelector("#reportGrid"),
};

function parseCsv(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  const headers = (rows.shift() ?? []).map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, "") : header));
  return {
    headers,
    rows: rows.map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
    ),
  };
}

async function loadFirst(paths) {
  const errors = [];
  for (const path of paths) {
    try {
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { path, ...parseCsv(await response.text()) };
    } catch (error) {
      errors.push(`${path}: ${error.message}`);
    }
  }
  throw new Error(errors.join("\n"));
}

function normalizePath(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return path.startsWith(".") || path.startsWith("/") ? path : `./${path}`;
}

async function discoverMainCsvFiles() {
  const found = new Set();

  try {
    const response = await fetch("./");
    if (response.ok) {
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      [...doc.querySelectorAll("a[href]")]
        .map((link) => decodeURIComponent(link.getAttribute("href") || ""))
        .filter((href) => /^main_results.*\.csv$/i.test(href))
        .forEach((href) => found.add(normalizePath(href)));
    }
  } catch (error) {
    console.warn("Could not discover main_results CSV files from directory listing.", error);
  }

  files.mainFallbacks.forEach((path) => found.add(path));

  const available = [];
  for (const path of found) {
    try {
      const response = await fetchPath(path, { method: "HEAD" });
      if (response.ok) available.push(path);
    } catch (error) {
      console.warn(`Could not check ${path}`, error);
    }
  }

  return available.length ? available : files.mainFallbacks;
}

function fileLabel(path) {
  return decodeURIComponent(path.split("/").pop() || path);
}

function fetchPath(path, options) {
  return fetch(encodeURI(path), options);
}

function numericValue(value) {
  const parsed = Number.parseFloat(String(value).replaceAll("%", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function setStatus(element, type, text) {
  element.className = `status ${type}`;
  element.textContent = text;
}

function showEmpty(element, message) {
  element.hidden = false;
  element.textContent = message;
}

function chartColors(count) {
  const palette = ["#0c7a75", "#d9664f", "#d6a13d", "#6f5b89", "#3f6f9f", "#6f7d42"];
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function formatBarLabel(value) {
  return Number.isFinite(value) ? value.toFixed(4) : "";
}

const barValueLabelPlugin = {
  id: "barValueLabelPlugin",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = "#18201f";
    ctx.font = "600 10px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    chart.data.datasets.forEach((dataset, datasetIndex) => {
      const meta = chart.getDatasetMeta(datasetIndex);
      if (meta.hidden) return;

      meta.data.forEach((bar, index) => {
        const label = formatBarLabel(Number(dataset.data[index]));
        if (!label) return;

        ctx.save();
        ctx.translate(bar.x + 2, bar.y - 8);
        ctx.rotate(-Math.PI / 4);
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
    });

    ctx.restore();
  },
};

function isZScore(name) {
  return /z[\s_-]*score|zscore/i.test(name);
}

function isOriginalName(name) {
  return /(^|[_\s-])(orig|original)([_\s-]|$)/i.test(name);
}

function isParaphrasedName(name) {
  return /para|paraphrase|paraphrased|rewrite|rewritten/i.test(name);
}

function pickLabelColumn(headers, rows) {
  const named = headers.find((header) => /method|model|attack|dataset|name|type|config|setting/i.test(header));
  if (named) return named;
  return headers.find((header) => rows.some((row) => numericValue(row[header]) === null && row[header] !== "")) ?? headers[0];
}

function pickNumericColumns(headers, rows) {
  return headers.filter((header) => rows.some((row) => numericValue(row[header]) !== null));
}

function metricLabel(header) {
  return header
    .replace(/(^|[_\s-])(orig|original|para|paraphrase|paraphrased|rewrite|rewritten)([_\s-]|$)/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildWideMainGroup(rows, labelColumn, columns) {
  return {
    labels: rows.map((row, index) => row[labelColumn] || `Row ${index + 1}`),
    datasets: columns.map((column) => ({
      label: metricLabel(column) || column,
      values: rows.map((row) => numericValue(row[column]) ?? 0),
    })),
  };
}

function buildLongMainGroups(headers, rows) {
  const metricColumn = headers.find((header) => /metric|measure|score|name/i.test(header));
  const groupColumn = headers.find((header) => /group|split|variant|text|condition|type/i.test(header));
  const labelColumn = headers.find((header) => /method|model|attack|dataset|config|setting/i.test(header));
  const valueColumn =
    headers.find((header) => /value|mean|avg|result|rate|score/i.test(header) && rows.some((row) => numericValue(row[header]) !== null)) ??
    pickNumericColumns(headers, rows)[0];

  if (!metricColumn || !valueColumn) return null;

  const labels = [...new Set(rows.map((row) => row[labelColumn] || row.method || row.model || "Result"))];
  const originalMetrics = [...new Set(rows.filter((row) => isOriginalName(row[groupColumn] || row[metricColumn])).map((row) => row[metricColumn]))]
    .filter((metric) => !isZScore(metric))
    .slice(0, 3);
  const paraphrasedMetrics = [...new Set(rows.filter((row) => isParaphrasedName(row[groupColumn] || row[metricColumn])).map((row) => row[metricColumn]))]
    .filter((metric) => !isZScore(metric))
    .slice(0, 3);

  function makeGroup(prefix) {
    const metricRows = [
      ["AUC", rowFor(`${prefix} AUC`)],
      ["F1", rowFor(`${prefix} F1`)],
      ["ACC", rowFor(`${prefix} Acc`)],
    ].filter(([, row]) => row);

    return {
      labels: metricRows.map(([metric]) => metric),
      datasets: modelColumns.map((model) => ({
        label: model,
        values: metricRows.map(([, row]) => numericValue(row[model]) ?? 0),
      })),
    };
  } 

  return {
    original: makeGroup(originalMetrics, rows.slice(0, 3)),
    paraphrased: makeGroup(paraphrasedMetrics, rows.slice(3, 6)),
  };
}
function buildMainChartGroups(headers, rows) {
  if (headers[0]?.toLowerCase() === "metrics") {
    const modelColumns = headers.slice(1);

    function rowFor(label) {
      return rows.find((row) => String(row.metrics).toLowerCase() === label.toLowerCase());
    }

    function makeGroup(prefix) {
      const metricRows = [
        ["AUC", rowFor(`${prefix} AUC`)],
        ["F1", rowFor(`${prefix} F1`)],
        ["ACC", rowFor(`${prefix} Acc`)],
      ].filter(([, row]) => row);

      return {
        labels: ["AUC", "F1", "ACC"],
        datasets: modelColumns.map((model) => ({
          label: model,
          values: metricRows.map(([, row]) => numericValue(row[model]) ?? 0),
        })),
      };
    }

    return {
      original: makeGroup("Original"),
      paraphrased: makeGroup("Paraphrased"),
    };
  }

  const labelColumn = pickLabelColumn(headers, rows);
  const numericColumns = pickNumericColumns(headers, rows).filter((header) => header !== labelColumn);

  return {
    original: buildWideMainGroup(rows, labelColumn, numericColumns.slice(0, 3)),
    paraphrased: buildWideMainGroup(rows, labelColumn, numericColumns.slice(3, 6)),
  };
}

function clearMainCharts() {
  Object.keys(charts).forEach((key) => {
    if (!charts[key]) return;
    charts[key].destroy();
    charts[key] = null;
  });
}

function renderGroupedBarChart(canvas, group, chartKey) {
  if (!canvas || !group?.datasets.length) return;
  if (charts[chartKey]) charts[chartKey].destroy();
  const colors = chartColors(group.datasets.length);
  charts[chartKey] = new Chart(canvas, {
    type: "bar",
    data: {
      labels: group.labels,
      datasets: group.datasets.map((dataset, index) => ({
        label: dataset.label,
        data: dataset.values,
        backgroundColor: colors[index],
        borderRadius: 7,
        borderSkipped: false,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 28 } },
      plugins: {
        legend: { position: "bottom", labels: { boxWidth: 12, color: "#18201f" } },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: { ticks: { color: "#68746f" }, grid: { display: false } },
        y: {
          min: 0.7,
          max: 1.04,
          ticks: { color: "#68746f" },
          grid: { color: "#ebe4d5" },
        },
      },
    },
    plugins: [barValueLabelPlugin],
  });
}

function renderMainChart() {
  const { headers, rows } = state.main;
  const groups = buildMainChartGroups(headers, rows);

  if (!rows.length || (!groups.original.datasets.length && !groups.paraphrased.datasets.length)) {
    clearMainCharts();
    showEmpty(els.mainEmpty, `${fileLabel(state.main.path || "main_results.csv")} loaded, but no original/paraphrased numeric metric columns were found.`);
    console.warn("main_results headers:", headers);
    console.warn("main_results rows:", rows);
    return;
  }

  els.mainEmpty.hidden = true;
  renderGroupedBarChart(els.mainOriginalChart, groups.original, "mainOriginal");
  renderGroupedBarChart(els.mainParaphrasedChart, groups.paraphrased, "mainParaphrased");
}

function formatCell(value) {
  if (/^https?:\/\//i.test(value)) {
    return `<a href="${escapeAttribute(value)}" target="_blank" rel="noreferrer">${escapeHtml(value)}</a>`;
  }
  return escapeHtml(value);
}

function renderMainTable() {
  const { headers, filteredRows } = state.main;
  els.mainTableHead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
  if (filteredRows.length === 0) {
    els.mainTableBody.innerHTML = `<tr><td class="empty" colspan="${headers.length || 1}">No rows match the current search.</td></tr>`;
    return;
  }
  els.mainTableBody.innerHTML = filteredRows
    .map((row) => `<tr>${headers.map((header) => `<td>${formatCell(row[header] ?? "")}</td>`).join("")}</tr>`)
    .join("");
}

function applyMainSearch() {
  const query = els.mainSearchInput.value.trim().toLowerCase();
  state.main.filteredRows = state.main.rows.filter((row) =>
    query ? Object.values(row).join(" ").toLowerCase().includes(query) : true,
  );
  renderMainTable();
}

function renderReports() {
  els.reportCount.textContent = htmlReports.length.toLocaleString();
  els.reportGrid.innerHTML = htmlReports
    .map(
      (report) => `<a class="reportCard" href="${escapeAttribute(report.path)}" target="_blank" rel="noreferrer"><strong>${escapeHtml(report.title)}</strong><span>${escapeHtml(report.path)}</span></a>`,
    )
    .join("");
}

async function loadMainCsv(path) {
  try {
    clearMainCharts();
    const response = await fetchPath(path);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const main = { path, ...parseCsv(await response.text()) };
    state.main = { ...main, filteredRows: main.rows };
    els.mainRows.textContent = main.rows.length.toLocaleString();
    setStatus(els.mainStatus, "ready", fileLabel(path));
    els.mainSearchInput.value = "";
    renderMainChart();
    renderMainTable();
  } catch (error) {
    setStatus(els.mainStatus, "missing", "Missing");
    showEmpty(els.mainEmpty, `Could not load ${fileLabel(path)}.`);
    els.mainRows.textContent = "0";
    els.mainTableHead.innerHTML = "";
    els.mainTableBody.innerHTML = `<tr><td class="empty">Could not load ${escapeHtml(fileLabel(path))}.</td></tr>`;
    console.error(error);
  }
}

async function initMainResults() {
  try {
    state.mainFiles = await discoverMainCsvFiles();
    els.mainFiles.textContent = state.mainFiles.length.toLocaleString();
    els.mainCsvSelect.innerHTML = state.mainFiles
      .map((path) => `<option value="${escapeAttribute(path)}">${escapeHtml(fileLabel(path))}</option>`)
      .join("");
    await loadMainCsv(state.mainFiles[0]);
  } catch (error) {
    setStatus(els.mainStatus, "missing", "Missing");
    showEmpty(els.mainEmpty, "Could not find any main_results CSV files.");
    console.error(error);
  }
}

els.mainCsvSelect.addEventListener("change", () => loadMainCsv(els.mainCsvSelect.value));
els.mainSearchInput.addEventListener("input", applyMainSearch);
els.downloadMainCsv.addEventListener("click", () => {
  if (state.main.path) window.location.href = state.main.path;
});

renderReports();
initMainResults();
