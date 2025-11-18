// public/js/dashboard.js (poll por arquivo selecionado + logout robusto)
const deviceListEl = document.getElementById('deviceList');
const metricSelectEl = document.getElementById('metricSelect');
const lastUpdateEl = document.getElementById('lastUpdate');
const statusEl = document.getElementById('status');
const logoutBtn = document.getElementById('logoutBtn');
const pollIntervalSel = document.getElementById('pollInterval');
const noDataEl = document.getElementById('noData');
const chartCanvas = document.getElementById('chart');

let devices = [];
let selectedDevice = null; // should match filename (e.g. esp32_test.json)
let selectedMetric = null;
let listPollHandle = null;
let devicePollHandle = null;
let listPollInterval = 10000; // 10s to refresh list
let devicePollInterval = Number(pollIntervalSel.value) || 3000;
let localHistory = {};
const MAX_POINTS = 200;

const chart = new Chart(chartCanvas, {
  type: 'line',
  data: { datasets: [{ label: '', data: [], fill: false, tension: 0.25, pointRadius: 2, borderWidth: 2 }] },
  options: {
    animation: false,
    maintainAspectRatio: false,
    scales: {
      x: { type: 'time', time: { tooltipFormat: 'YYYY-MM-DD HH:mm:ss' }, title: { display: true, text: 'Time' } },
      y: { beginAtZero: false, title: { display: true, text: '' } }
    },
    plugins: { legend: { display: true } }
  }
});

function extractTimestamp(entry) {
  if (!entry) return Date.now();
  const cand = ['timestamp','time','ts','date','createdAt'];
  for (const k of cand) {
    if (entry[k] !== undefined && entry[k] !== null) {
      const v = entry[k];
      if (typeof v === 'number') return (v < 1e11) ? v*1000 : v;
      const p = Date.parse(String(v));
      if (!isNaN(p)) return p;
    }
  }
  for (const k of Object.keys(entry)) {
    const v = entry[k];
    if (typeof v === 'number' && v > 1e9) return (v < 1e12) ? v*1000 : v;
  }
  return Date.now();
}

function findNumericKeys(entry) {
  if (!entry) return [];
  return Object.keys(entry).filter(k => typeof entry[k] === 'number' && k !== 'device_id');
}

function mergeEntries(filename, entries, metricKey) {
  if (!localHistory[filename]) localHistory[filename] = [];
  const hist = localHistory[filename];
  const pts = (entries || []).map(e => {
    const t = extractTimestamp(e);
    let v = null;
    if (metricKey && (metricKey in e)) v = Number(e[metricKey]);
    else {
      const keys = Object.keys(e);
      for (const k of keys) {
        if (['timestamp','time','ts','date','createdAt','device_id'].includes(k)) continue;
        if (typeof e[k] === 'number') { v = Number(e[k]); break; }
      }
    }
    return (v !== null && !isNaN(v)) ? { x: t, y: v } : null;
  }).filter(Boolean);

  const map = new Map(hist.map(p => [p.x, p]));
  for (const p of pts) map.set(p.x, p);
  const merged = Array.from(map.values()).sort((a,b)=>a.x - b.x);
  while (merged.length > MAX_POINTS) merged.shift();
  localHistory[filename] = merged;
}

function renderDeviceList() {
  if (!devices || devices.length === 0) {
    deviceListEl.innerHTML = '<div class="empty">Nenhum device encontrado.</div>';
    return;
  }
  deviceListEl.innerHTML = '';
  devices.forEach(d => {
    const el = document.createElement('div');
    el.className = 'device-item';
    if (selectedDevice === d.filename) el.classList.add('active');
    el.innerHTML = `<div><strong>${d.filename.replace('.json','')}</strong></div>
                    <div class="small info-line">${(d.entries && d.entries.length)>0 ? d.entries.length + ' registros' : 'sem registros'}</div>`;
    el.onclick = () => onSelectDevice(d.filename);
    deviceListEl.appendChild(el);
  });
}

function pickPreferredMetric(entry) {
  if (!entry) return null;
  const preferred = ['value','temp','temperature','humidity','db','rssi','vbat'];
  for (const p of preferred) if (entry[p] !== undefined && typeof entry[p] === 'number') return p;
  const numerics = findNumericKeys(entry);
  return numerics.length ? numerics[0] : null;
}

function populateMetricSelect(keys) {
  metricSelectEl.innerHTML = '';
  if (!keys || keys.length === 0) {
    metricSelectEl.style.display = 'none';
    selectedMetric = null;
    chart.options.scales.y.title.text = '';
    return;
  }
  metricSelectEl.style.display = '';
  keys.forEach((k, idx) => {
    const o = document.createElement('option'); o.value = k; o.textContent = k; metricSelectEl.appendChild(o);
    if (idx === 0 && !selectedMetric) selectedMetric = k;
  });
  metricSelectEl.value = selectedMetric;
  chart.options.scales.y.title.text = selectedMetric || '';
  chart.data.datasets[0].label = selectedMetric || 'valor';
}

function onSelectDevice(filename) {
  selectedDevice = filename;
  // fetch immediately the selected file (single-file endpoint)
  fetchSelectedDevice().then(() => {
    renderDeviceList();
    renderChartForSelected();
    // restart device polling
    restartDevicePolling();
  });
}

function renderChartForSelected() {
  if (!selectedDevice) {
    noDataEl.style.display = '';
    chart.data.datasets[0].data = [];
    chart.update();
    return;
  }
  const hist = localHistory[selectedDevice] || [];
  if (!hist.length) {
    noDataEl.style.display = '';
    chart.data.datasets[0].data = [];
    chart.update();
    return;
  }
  noDataEl.style.display = 'none';
  chart.data.datasets[0].data = hist.map(p => ({ x: p.x, y: p.y }));
  chart.options.scales.y.title.text = selectedMetric || '';
  chart.data.datasets[0].label = `${selectedDevice.replace('.json','')} — ${selectedMetric || 'valor'}`;
  chart.update('none');
}

// Fetch list of devices (lightweight) - runs less frequently
async function fetchDeviceList() {
  try {
    const res = await fetch('/api/dados', { credentials: 'same-origin' });
    if (res.status === 401) return window.location.href = '/login';
    const j = await res.json();
    devices = j.devices || [];
    renderDeviceList();
  } catch (err) {
    console.error('fetch device list error', err);
    statusEl.textContent = 'Erro lista';
  }
}

// Fetch only the selected device file (fast)
async function fetchSelectedDevice() {
  if (!selectedDevice) return;
  try {
    const encoded = encodeURIComponent(selectedDevice);
    const res = await fetch(`/api/dados/${encoded}`, { credentials: 'same-origin' });
    if (res.status === 401) return window.location.href = '/login';
    if (res.status === 404) {
      // file went away
      statusEl.textContent = 'Arquivo não encontrado';
      return;
    }
    const j = await res.json(); // {filename, entries}
    // infer metric if not set
    const latest = (j.entries && j.entries.length) ? j.entries[j.entries.length - 1] : null;
    const preferred = pickPreferredMetric(latest);
    if (preferred && !selectedMetric) selectedMetric = preferred;
    const numericKeys = findNumericKeys(latest);
    populateMetricSelect(numericKeys.length ? numericKeys : (latest ? Object.keys(latest).filter(k=>typeof latest[k]==='number') : []));
    // merge incremental entries
    mergeEntries(j.filename, j.entries || [], selectedMetric);
    renderChartForSelected();
    lastUpdateEl.textContent = 'Última atualização: ' + new Date().toLocaleTimeString();
    statusEl.textContent = 'Conectado';
  } catch (err) {
    console.error('fetch selected device error', err);
    statusEl.textContent = 'Erro device';
  }
}

// Polling control
function restartListPolling() {
  if (listPollHandle) clearInterval(listPollHandle);
  listPollHandle = setInterval(fetchDeviceList, listPollInterval);
}
function restartDevicePolling() {
  if (devicePollHandle) clearInterval(devicePollHandle);
  if (!selectedDevice) return;
  devicePollHandle = setInterval(fetchSelectedDevice, devicePollInterval);
}

// change device interval
pollIntervalSel.addEventListener('change', () => {
  devicePollInterval = Number(pollIntervalSel.value) || 3000;
  restartDevicePolling();
});

// metric select change
metricSelectEl.addEventListener('change', () => {
  selectedMetric = metricSelectEl.value;
  if (selectedDevice) {
    // rebuild history for selected device using new metric
    const d = devices.find(x => x.filename === selectedDevice);
    if (d) { localHistory[selectedDevice] = []; mergeEntries(selectedDevice, d.entries || [], selectedMetric); renderChartForSelected(); }
  }
});

// Logout: send POST and check response before redirect
logoutBtn.addEventListener('click', async () => {
  try {
    const res = await fetch('/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      window.location.href = '/login';
    } else {
      console.warn('Logout failed', res.status);
      // try redirect anyway
      window.location.href = '/login';
    }
  } catch (e) {
    console.error('logout error', e);
    window.location.href = '/login';
  }
});

(async function init() {
  statusEl.textContent = 'Carregando...';
  await fetchDeviceList();
  if (!selectedDevice) {
    const first = devices.find(d => d.entries && d.entries.length);
    if (first) onSelectDevice(first.filename);
  }
  restartListPolling();
  restartDevicePolling();
})();
