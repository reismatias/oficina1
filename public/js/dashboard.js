document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleSidebar');
  toggleBtn.addEventListener('click', () => {
    if (window.matchMedia('(max-width:900px)').matches) {
      sidebar.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });

  // Logout flow (calls server POST /logout)
  const logoutBtn = document.getElementById('logoutBtn');
  logoutBtn.addEventListener('click', async () => {
    try {
      const res = await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
      if (res.ok) location.href = '/login';
      else {
        alert('Erro ao deslogar.');
      }
    } catch (err) {
      console.error(err); alert('Falha ao chamar /logout');
    }
  });

  // Load devices (assumes backend exposes /api/dados which lista arquivos/device ids)
  const deviceList = document.getElementById('deviceList');
  const refreshBtn = document.getElementById('refreshDevices');
  const lastUpdateEl = document.getElementById('lastUpdate');

  let selectedDevice = null; // Store selected device globally

  async function fetchDevices() {
    // Don't wipe content immediately to avoid flickering
    // deviceList.innerHTML = '<div style="opacity:.7">Carregando...</div>';
    try {
      const res = await fetch('/api/dados');
      if (!res.ok) throw new Error('Não foi possível listar devices');
      const data = await res.json();
      // Fix: API returns { devices: [...] }
      renderDevices(data.devices || []);
    } catch (err) {
      console.error(err);
      deviceList.innerHTML = '<div style="color:#f88">Erro ao carregar devices</div>';
    }
  }

  function renderDevices(items) {
    deviceList.innerHTML = '';
    if (!items || items.length === 0) { deviceList.innerHTML = '<div style="opacity:.7">Nenhum device encontrado</div>'; return }

    // Auto-select first device if none selected
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

      // Re-apply selection style if this device was selected
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
    // Visual update
    [...deviceList.children].forEach(c => {
      if (c.textContent === name.replace('.json', '')) {
        c.style.background = 'rgba(255,255,255,0.03)';
      } else {
        c.style.background = '';
      }
    });

    lastUpdateEl.textContent = new Date().toLocaleTimeString();
    // Fetch data for the selected device
    console.log('Selecting device:', name);
    fetchDeviceData(name);
  }

  async function fetchDeviceData(filename) {
    console.log('Fetching data for:', filename);
    // const chartArea = document.getElementById('chartArea'); // Unused now

    try {
      const res = await fetch(`/api/dados/${filename}`);
      if (!res.ok) throw new Error('Erro ao buscar dados do device');
      const data = await res.json();
      console.log('Data received:', data);
      renderData(data);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados: ' + err.message);
      // chartArea.innerHTML = '<div style="color:#f88">Erro ao carregar dados</div>';
    }
  }

  let myChart = null;

  function renderData(data) {
    console.log('Rendering data...', data);
    // const chartArea = document.getElementById('chartArea'); // Unused

    let ctx = document.getElementById('myChart');

    // If canvas is missing (shouldn't happen with static HTML but just in case)
    if (!ctx) {
      console.error('Canvas element #myChart not found!');
      return;
    }

    if (!data || !data.entries || data.entries.length === 0) {
      console.log('No data entries found');
      // alert('Este dispositivo não possui dados registrados.'); // Annoying on auto-refresh
      if (myChart) {
        // Clear chart data but keep instance? Or destroy?
        // Let's just clear
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

    // Render Logs
    renderLogs(data.entries);

    // Prepare data: Aggregate by minute
    const aggregated = aggregateByMinute(data.entries);

    // Limit to last 20 minutes for better visibility if needed, or show all.
    // Let's show the last 30 minutes to keep it readable.
    const recentAggregated = aggregated.slice(-30);

    const labels = recentAggregated.map(e => new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    const values = recentAggregated.map(e => e.db);

    // Update chart if it exists, otherwise create it
    if (myChart) {
      // Update existing chart data
      myChart.data.labels = labels;
      myChart.data.datasets[0].data = values;
      myChart.update('none'); // 'none' mode = no animation
    } else {
      // Create new chart
      myChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Nível dB (Média/min)',
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
            legend: { labels: { color: '#fff' } }
          }
        }
      });
    }
  }

  function renderLogs(entries) {
    const logsContainer = document.getElementById('eventLogs');
    logsContainer.innerHTML = '';

    // Filter high dB events (e.g., > 80)
    // Show last 20 events
    const highDbEvents = entries.filter(e => e.db > 80).reverse().slice(0, 20);

    if (highDbEvents.length === 0) {
      logsContainer.innerHTML = '<div style="opacity:0.5;font-style:italic">Nenhum evento de alto ruído (>80dB).</div>';
      return;
    }

    highDbEvents.forEach(e => {
      const el = document.createElement('div');
      el.style.padding = '4px 0';
      el.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
      el.style.color = '#f88';
      const time = new Date(e.timestamp).toLocaleTimeString();
      el.textContent = `[${time}] Alerta: ${e.db}dB detectado`;
      logsContainer.appendChild(el);
    });
  }

  refreshBtn.addEventListener('click', fetchDevices);

  function aggregateByMinute(entries) {
    const groups = {};
    entries.forEach(e => {
      const date = new Date(e.timestamp);
      date.setSeconds(0, 0);
      const key = date.getTime();

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

  // func: Pega o nome do usuário.
  async function fetchUser() {
    const usernameEl = document.getElementById('username');
    const avatarEl = document.getElementById('avatar');

    try {
      const res = await fetch('/auth/status', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Not authenticated');

      const data = await res.json();

      usernameEl.textContent = data.username.charAt(0).toUpperCase() + data.username.slice(1).toLowerCase();
      avatarEl.textContent = usernameEl.textContent[0];
    } catch (err) {
      console.error(err);
      usernameEl.textContent = 'Usuário';
      avatarEl.textContent = 'U';
    }
  }

  // --------------- User Menu ---------------
  // Abre a side bar e depois abre o menu de opções.
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userMenu = document.getElementById('userMenu');
  const changePasswordBtn = document.getElementById('changePassword');

  function showUserMenu() {
    userMenu.removeAttribute('hidden');
    userMenuBtn.setAttribute('aria-expanded', 'true');
  }

  function hideUserMenu() {
    userMenu.setAttribute('hidden', '');
    userMenuBtn.setAttribute('aria-expanded', 'false');
  }

  // Para lidar com problemas de escala.
  function ensureSidebarExpandedAndThen(cb) {
    const isMobile = window.matchMedia('(max-width:900px)').matches;

    if (isMobile) {
      // Mobile
      const alreadyOpen = sidebar.classList.contains('open');
      if (!alreadyOpen) {
        sidebar.classList.add('open');

        setTimeout(cb, 220);
        return;
      }
      cb();
    } else {
      // Desktop
      const isCollapsed = sidebar.classList.contains('collapsed');
      if (isCollapsed) {
        sidebar.classList.remove('collapsed');

        setTimeout(cb, 220);
        return;
      }
      cb();
    }
  }

  // Novo click
  userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();

    const hidden = userMenu.hasAttribute('hidden');
    if (hidden) {
      ensureSidebarExpandedAndThen(() => {
        showUserMenu();
        const first = userMenu.querySelector('button, [tabindex]');
        if (first) first.focus();
      });
    } else {
      hideUserMenu();
    }
  });

  // Click fora/fechar
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target) && !userMenuBtn.contains(e.target)) {
      hideUserMenu();
    }
  });
  // ------------------------------

  // TEMPORÁRIO!!!
  changePasswordBtn.addEventListener('click', () => {
    alert('Trocar senha — funcionalidade não implementada ainda.');
  });
  //---------------

  // Initial
  fetchDevices();
  fetchUser();

  // Auto-refresh devices every 10s
  setInterval(() => {
    fetchDevices();
    // Also refresh data if a device is selected
    if (selectedDevice) {
      fetchDeviceData(selectedDevice);
    }
  }, 5000); // Increased frequency to 5s for better responsiveness
});
