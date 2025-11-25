document.addEventListener('DOMContentLoaded', () => {
  // ========================================
  // Device List & Selection
  // Lista todos os devices e mantém o selecionado.
  // ========================================
  const deviceList = document.getElementById('deviceList');
  const refreshBtn = document.getElementById('refreshDevices');
  const lastUpdateEl = document.getElementById('lastUpdate');
  const chartIntervalEl = document.getElementById('chartInterval');
  const dbThresholdEl = document.getElementById('dbThreshold');

  let currentInterval = 'realtime';
  let currentThreshold = 60;

  let selectedDevice = null;

  // ========================================
  // Chart Resize Observer
  // Garante que o gráfico se redimensione corretamente
  // quando a sidebar é alternada.
  // ========================================
  const chartArea = document.getElementById('chartArea');
  if (chartArea) {
    const resizeObserver = new ResizeObserver(() => {
      if (myChart) {
        console.log('📏 [DEBUG] ResizeObserver triggered, resizing chart...');
        myChart.resize();
      }
    });
    resizeObserver.observe(chartArea);
  }

  async function fetchDevices() {
    console.log('🔄 [DEBUG] Buscando devices...');
    try {
      const res = await fetch('/api/dados');
      if (!res.ok) throw new Error('Não foi possível listar devices');
      const data = await res.json();
      console.log('📦 [DEBUG] Dados recebidos:', data);
      renderDevices(data.devices || []);
    } catch (err) {
      console.error('❌ [DEBUG] Erro ao buscar devices:', err);
      deviceList.innerHTML = '<div style="color:#f88">Erro ao carregar devices</div>';
    }
  }

  refreshBtn.addEventListener('click', () => {
    console.log('🔄 [DEBUG] Botão Atualizar clicado');
    fetchDevices();
  });

  if (chartIntervalEl) {
    chartIntervalEl.addEventListener('change', (e) => {
      currentInterval = e.target.value;
      console.log('📊 [DEBUG] Intervalo alterado para:', currentInterval);
      if (selectedDevice) {
        fetchDeviceData(selectedDevice);
      }
    });
  }

  if (dbThresholdEl) {
    dbThresholdEl.addEventListener('change', (e) => {
      currentThreshold = parseInt(e.target.value) || 60;
      console.log('📏 [DEBUG] Limite alterado para:', currentThreshold);
      if (selectedDevice) {
        fetchDeviceData(selectedDevice);
      }
    });
  }

  function renderDevices(items) {
    deviceList.innerHTML = '';
    if (!items || items.length === 0) { deviceList.innerHTML = '<div style="opacity:.7">Nenhum device encontrado</div>'; return }

    // Auto-seleciona o primeiro device se nada estiver selecionado
    if (!selectedDevice && items.length > 0) {
      const first = items[0];
      const firstName = typeof first === 'string' ? first : (first.name || first.filename || first.device_id || JSON.stringify(first));
      selectDevice(firstName);
    }

    items.forEach(it => {
      const name = typeof it === 'string' ? it : (it.name || it.filename || it.device_id || JSON.stringify(it));
      const el = document.createElement('div');
      el.className = 'device-item';
      el.textContent = name.replace('.json', '');

      // Mantém o estilo de seleção ao atualizar a lista
      if (selectedDevice === name) {
        el.style.background = 'rgba(255,255,255,0.03)';
      }

      el.addEventListener('click', () => {
        console.log('Clicked on device:', name);
        selectDevice(name);
      });
      deviceList.appendChild(el);
    });
  }

  function selectDevice(name) {
    selectedDevice = name;
    [...deviceList.children].forEach(c => {
      if (c.textContent === name.replace('.json', '')) {
        c.style.background = 'rgba(255,255,255,0.03)';
      } else {
        c.style.background = '';
      }
    });

    lastUpdateEl.textContent = new Date().toLocaleTimeString();
    console.log('Selecting device:', name);
    fetchDeviceData(name);
  }

  // ========================================
  // Data Fetching & Rendering
  // Busca e exibe os dados do device selecionado.
  // ========================================
  async function fetchDeviceData(filename) {
    console.log('Fetching data for:', filename);

    try {
      const res = await fetch(`/api/dados/${filename}`);
      if (!res.ok) throw new Error('Erro ao buscar dados do device');
      const data = await res.json();
      console.log('Data received:', data);
      renderData(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados: ' + err.message);
    }
  }

  let myChart = null;

  function renderData(data) {
    console.log('Rendering data...', data);

    let ctx = document.getElementById('myChart');

    if (!ctx) {
      console.error('Canvas element #myChart not found!');
      return;
    }

    if (!data || !data.entries || data.entries.length === 0) {
      console.log('No data entries found');
      if (myChart) {
        myChart.data.labels = [];
        myChart.data.datasets.forEach((dataset) => {
          dataset.data = [];
        });
        myChart.update();
      }
      return;
    }

    if (typeof Chart === 'undefined') {
      console.error('Chart.js library not loaded');
      return;
    }

    renderLogs(data.entries);

    renderLogs(data.entries);

    // Processa os dados conforme o intervalo selecionado
    const processedData = processDataByInterval(data.entries, currentInterval);

    // Limita a quantidade de pontos para não travar o gráfico
    // Se for realtime, pega os últimos 100. Se for média, pega mais.
    const limit = currentInterval === 'realtime' ? 100 : 50;
    const recentData = processedData.slice(-limit);

    const labels = recentData.map(e => {
      const d = new Date(e.timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    });
    const values = recentData.map(e => e.db);

    // Atualiza o gráfico se já existir, senão cria um novo
    if (myChart) {
      myChart.data.labels = labels;
      myChart.data.datasets[0].data = values;
      myChart.update('none');
    } else {
      myChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: `Nível dB (${getIntervalLabel(currentInterval)})`,
            data: values,
            borderColor: 'rgba(75, 192, 192, 1)',
            backgroundColor: 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            pointRadius: 3
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(255, 255, 255, 0.1)' },
              ticks: { color: '#aaa' }
            },
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.1)' },
              ticks: { color: '#aaa' }
            }
          },
          plugins: {
            legend: { labels: { color: '#fff' } },
            annotation: {
              annotations: {
                thresholdLine: {
                  type: 'line',
                  yMin: currentThreshold,
                  yMax: currentThreshold,
                  borderColor: 'rgba(244,67,54,0.8)',
                  borderWidth: 2,
                  borderDash: [5, 5],
                  label: {
                    display: true,
                    content: `Limite: ${currentThreshold}dB`,
                    position: 'end',
                    backgroundColor: 'rgba(244,67,54,0.8)',
                    color: '#fff',
                    font: {
                      size: 11
                    },
                    padding: 4
                  }
                }
              }
            }
          }
        }
      });
    }
  }

  // ========================================
  // Event Logs
  // ========================================
  // Event Logs
  // Mostra alertas quando a média de 3 minutos ultrapassa o limite configurado.
  // ========================================
  // ========================================
  function renderLogs(entries) {
    const logsContainer = document.getElementById('eventLogs');
    logsContainer.innerHTML = '';

    if (!entries || entries.length === 0) {
      logsContainer.innerHTML = '<div style="opacity:0.5;font-style:italic">Nenhum dado disponível.</div>';
      return;
    }

    const THREE_MINUTES = 3 * 60 * 1000;
    const intervalGroups = {};

    entries.forEach(e => {
      const intervalStart = Math.floor(e.timestamp / THREE_MINUTES) * THREE_MINUTES;

      if (!intervalGroups[intervalStart]) {
        intervalGroups[intervalStart] = { sum: 0, count: 0, timestamp: intervalStart };
      }

      intervalGroups[intervalStart].sum += e.db;
      intervalGroups[intervalStart].count++;
    });

    const alertIntervals = Object.values(intervalGroups)
      .map(group => ({
        timestamp: group.timestamp,
        avgDb: parseFloat((group.sum / group.count).toFixed(1)),
        count: group.count
      }))
      .filter(interval => interval.avgDb > currentThreshold)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    if (alertIntervals.length === 0) {
      logsContainer.innerHTML = `<div style="opacity:0.5;font-style:italic">Nenhum evento de alto ruído (média 3min > ${currentThreshold}dB).</div>`;
      return;
    }

    alertIntervals.forEach(interval => {
      const el = document.createElement('div');
      el.style.padding = '4px 0';
      el.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
      el.style.color = '#f88';

      const time = new Date(interval.timestamp).toLocaleTimeString();
      const endTime = new Date(interval.timestamp + THREE_MINUTES).toLocaleTimeString();

      el.textContent = `[${time}] Alerta: Média de ${interval.avgDb}dB (${interval.count} leituras)`;
      logsContainer.appendChild(el);
    });
  }

  refreshBtn.addEventListener('click', fetchDevices);

  // ========================================
  // Data Aggregation
  // Agrupa os dados por minuto para o gráfico.
  // ========================================
  // ========================================
  // Data Processing
  // Processa os dados conforme o intervalo.
  // ========================================
  function processDataByInterval(entries, interval) {
    if (!entries || entries.length === 0) return [];

    // Se for realtime, retorna os dados brutos
    if (interval === 'realtime') {
      return entries.map(e => ({
        timestamp: e.timestamp,
        db: e.db
      }));
    }

    // Se for média, agrupa por segundos
    const seconds = parseInt(interval);
    const ms = seconds * 1000;
    const groups = {};

    entries.forEach(e => {
      // Arredonda para o intervalo mais próximo
      const key = Math.floor(e.timestamp / ms) * ms;

      if (!groups[key]) groups[key] = { sum: 0, count: 0 };
      groups[key].sum += e.db;
      groups[key].count++;
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => a - b);

    return sortedKeys.map(key => {
      const g = groups[key];
      return {
        timestamp: parseInt(key),
        db: parseFloat((g.sum / g.count).toFixed(1))
      };
    });
  }

  function getIntervalLabel(interval) {
    if (interval === 'realtime') return 'Tempo Real';
    if (interval === '60') return 'Média 1 min';
    return `Média ${interval}s`;
  }

  // ========================================
  // Initialization & Auto-refresh
  // Carrega os devices e atualiza a cada 5 segundos.
  // ========================================
  fetchDevices();

  setInterval(() => {
    fetchDevices();
    if (selectedDevice) {
      fetchDeviceData(selectedDevice);
    }
  }, 5000);
});
