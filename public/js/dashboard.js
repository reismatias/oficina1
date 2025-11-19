document.addEventListener('DOMContentLoaded', () => {
  // Sidebar toggle
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleSidebar');
  const collapseBtn = document.getElementById('collapseSidebar');
  toggleBtn.addEventListener('click', () => {
    if (window.matchMedia('(max-width:900px)').matches) {
      sidebar.classList.toggle('open');
    } else {
      sidebar.classList.toggle('collapsed');
    }
  });
  collapseBtn.addEventListener('click', () => sidebar.classList.toggle('collapsed'));

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

  async function fetchDevices() {
    deviceList.innerHTML = '<div style="opacity:.7">Carregando...</div>';
    try {
      const res = await fetch('/api/dados');
      if (!res.ok) throw new Error('Não foi possível listar devices');
      const data = await res.json();
      renderDevices(data);
    } catch (err) {
      console.error(err);
      deviceList.innerHTML = '<div style="color:#f88">Erro ao carregar devices</div>';
    }
  }

  function renderDevices(items) {
    deviceList.innerHTML = '';
    if (!items || items.length === 0) { deviceList.innerHTML = '<div style="opacity:.7">Nenhum device encontrado</div>'; return }
    items.forEach(it => {
      const name = typeof it === 'string' ? it : (it.name || it.filename || it.device_id || JSON.stringify(it));
      const el = document.createElement('div');
      el.className = 'device-item';
      el.textContent = name.replace('.json', '');
      el.addEventListener('click', () => selectDevice(name));
      deviceList.appendChild(el);
    });
  }

  let selectedDevice = null;
  function selectDevice(name) {
    selectedDevice = name;
    [...deviceList.children].forEach(c => c.style.background = '');
    const match = [...deviceList.children].find(d => d.textContent === name.replace('.json', ''));
    if (match) match.style.background = 'rgba(255,255,255,0.03)';
    lastUpdateEl.textContent = new Date().toLocaleTimeString();
    // Future: fetch /api/dados/:filename and render chart
  }

  refreshBtn.addEventListener('click', fetchDevices);

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

  // Optional: auto-refresh devices every 10s
  setInterval(fetchDevices, 10000);
});
