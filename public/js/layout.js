// ========================================
// Layout Common Logic
// Funcionalidades compartilhadas por todas as páginas que usam o layout
// ========================================

document.addEventListener('DOMContentLoaded', () => {
  // ========================================
  // Sidebar & Navigation
  // ========================================
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('toggleSidebar');

  if (sidebar && toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      console.log('🔘 [DEBUG] Botão Toggle Sidebar clicado');
      e.stopPropagation();

      if (window.matchMedia('(max-width:900px)').matches) {
        console.log('📱 [DEBUG] Modo Mobile: Alternando classe .open');
        sidebar.classList.toggle('open');
      } else {
        console.log('💻 [DEBUG] Modo Desktop: Alternando classe .collapsed');
        sidebar.classList.toggle('collapsed');
        // Atualiza o tooltip do botão
        if (sidebar.classList.contains('collapsed')) {
          toggleBtn.setAttribute('title', 'Abrir barra lateral');
        } else {
          toggleBtn.setAttribute('title', 'Fechar barra lateral');
        }
      }
    });
  }

  // ========================================
  // Logout
  // ========================================
  const logoutBtn = document.getElementById('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      console.log('🚪 [DEBUG] Botão Logout clicado');
      try {
        const res = await fetch('/logout', { method: 'POST', credentials: 'same-origin' });
        if (res.ok) {
          console.log('✅ [DEBUG] Logout realizado com sucesso, redirecionando...');
          location.href = '/login';
        } else {
          console.error('❌ [DEBUG] Erro ao deslogar');
          alert('Erro ao deslogar.');
        }
      } catch (err) {
        console.error('❌ [DEBUG] Exceção no logout:', err);
        alert('Falha ao chamar /logout');
      }
    });
  }

  // ========================================
  // User Menu
  // Menu do usuário com opções de trocar senha e logout.
  // ========================================
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userMenu = document.getElementById('userMenu');
  const changePasswordBtn = document.getElementById('changePassword');

  if (userMenuBtn && userMenu) {
    function showUserMenu() {
      console.log('🔽 [DEBUG] Abrindo menu do usuário');
      userMenu.removeAttribute('hidden');
      userMenuBtn.setAttribute('aria-expanded', 'true');
    }

    function hideUserMenu() {
      console.log('🔼 [DEBUG] Fechando menu do usuário');
      userMenu.setAttribute('hidden', '');
      userMenuBtn.setAttribute('aria-expanded', 'false');
    }

    function ensureSidebarExpandedAndThen(cb) {
      const isMobile = window.matchMedia('(max-width:900px)').matches;

      if (isMobile) {
        const alreadyOpen = sidebar.classList.contains('open');
        if (!alreadyOpen) {
          console.log('📱 [DEBUG] Mobile: Abrindo sidebar antes de mostrar menu');
          sidebar.classList.add('open');
          setTimeout(cb, 220);
          return;
        }
        cb();
      } else {
        const isCollapsed = sidebar.classList.contains('collapsed');
        if (isCollapsed) {
          console.log('💻 [DEBUG] Desktop: Expandindo sidebar antes de mostrar menu');
          sidebar.classList.remove('collapsed');
          setTimeout(cb, 220);
          return;
        }
        cb();
      }
    }

    userMenuBtn.addEventListener('click', (e) => {
      console.log('👤 [DEBUG] Botão Menu de Usuário clicado');
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

    // Fecha o menu se clicar fora dele
    document.addEventListener('click', (e) => {
      if (!userMenu.contains(e.target) && !userMenuBtn.contains(e.target)) {
        // Só loga se o menu estiver aberto para não poluir o console
        if (!userMenu.hasAttribute('hidden')) {
          console.log('🖱️ [DEBUG] Clique fora do menu detectado, fechando menu');
          hideUserMenu();
        }
      }
    });
  }

  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', () => {
      alert('Trocar senha — funcionalidade não implementada ainda.');
    });
  }

  // ========================================
  // User Info
  // Busca e exibe informações do usuário logado.
  // ========================================
  async function fetchUser() {
    const usernameEl = document.getElementById('username');
    const avatarEl = document.getElementById('avatar');

    if (!usernameEl || !avatarEl) return;

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

  // Inicializa as informações do usuário
  fetchUser();
});
