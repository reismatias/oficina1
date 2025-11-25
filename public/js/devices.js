document.addEventListener('DOMContentLoaded', () => {
  // ========================================
  // Custom Modal System
  // Substitui os alert/prompt/confirm nativos por modais customizados.
  // ========================================
  const modal = document.getElementById('customModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalMessage = document.getElementById('modalMessage');
  const modalInput = document.getElementById('modalInput');
  const modalCancel = document.getElementById('modalCancel');
  const modalConfirm = document.getElementById('modalConfirm');

  function showModal() {
    modal.classList.add('show');
  }

  function hideModal() {
    modal.classList.remove('show');
  }

  // ========================================
  // Confirm Dialog
  // ========================================
  function showConfirmDialog(title, message, confirmBtnText = 'Confirmar', isDanger = false) {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modalInput.style.display = 'none';
      modalConfirm.textContent = confirmBtnText;

      modalConfirm.className = 'btn ' + (isDanger ? 'btn-danger' : 'btn-success');

      showModal();

      const handleConfirm = () => {
        hideModal();
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        hideModal();
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        modalConfirm.removeEventListener('click', handleConfirm);
        modalCancel.removeEventListener('click', handleCancel);
      };

      modalConfirm.addEventListener('click', handleConfirm);
      modalCancel.addEventListener('click', handleCancel);
    });
  }

  // ========================================
  // Prompt Dialog
  // ========================================
  function showPromptDialog(title, message, defaultValue = '') {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modalInput.style.display = 'block';
      modalInput.value = defaultValue;
      modalConfirm.textContent = 'Confirmar';
      modalConfirm.className = 'btn btn-success';

      showModal();
      setTimeout(() => modalInput.focus(), 100);

      const handleConfirm = () => {
        const value = modalInput.value.trim();
        hideModal();
        cleanup();
        resolve(value || null);
      };

      const handleCancel = () => {
        hideModal();
        cleanup();
        resolve(null);
      };

      const handleEnter = (e) => {
        if (e.key === 'Enter') {
          handleConfirm();
        }
      };

      const cleanup = () => {
        modalConfirm.removeEventListener('click', handleConfirm);
        modalCancel.removeEventListener('click', handleCancel);
        modalInput.removeEventListener('keypress', handleEnter);
      };

      modalConfirm.addEventListener('click', handleConfirm);
      modalCancel.addEventListener('click', handleCancel);
      modalInput.addEventListener('keypress', handleEnter);
    });
  }

  // ========================================
  // Lista, seleciona e gerencia devices (renomear, limpar, deletar).
  // ========================================
  const deviceList = document.getElementById('deviceList');
  const refreshBtn = document.getElementById('refreshDevices');
  const deviceDetails = document.getElementById('deviceDetails');

  let selectedDevice = null;

  async function fetchDevices() {
    try {
      const res = await fetch('/api/dados');
      if (!res.ok) throw new Error('Não foi possível listar devices');
      const data = await res.json();
      renderDevices(data.devices || []);
    } catch (err) {
      console.error(err);
      deviceList.innerHTML = '<div style=\"color:#f88\">Erro ao carregar devices</div>';
    }
  }

  function renderDevices(items) {
    deviceList.innerHTML = '';
    if (!items || items.length === 0) {
      deviceList.innerHTML = '<div style=\"opacity:.7\">Nenhum device encontrado</div>';
      return;
    }

    items.forEach(it => {
      const name = typeof it === 'string' ? it : (it.name || it.filename || it.device_id || JSON.stringify(it));
      const el = document.createElement('div');
      el.className = 'device-item';
      el.textContent = name.replace('.json', '');

      if (selectedDevice === name) {
        el.style.background = 'rgba(255,255,255,0.03)';
      }

      el.addEventListener('click', () => selectDevice(name));
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

    fetchDeviceStats(name);
  }

  async function fetchDeviceStats(deviceId) {
    deviceDetails.innerHTML = '<div style="opacity:0.7;text-align:center;padding:40px">Carregando...</div>';

    try {
      const [resStats, resLed] = await Promise.all([
        fetch(`/api/devices/${deviceId}/stats`),
        fetch(`/api/devices/${deviceId}/led`)
      ]);

      if (!resStats.ok) throw new Error('Erro ao buscar estatísticas');

      const stats = await resStats.json();
      const ledData = resLed.ok ? await resLed.json() : { led: false };

      renderDeviceDetails(deviceId, stats, ledData.led);
    } catch (err) {
      console.error(err);
      deviceDetails.innerHTML = '<div style="color:#f88;text-align:center;padding:40px">Erro ao carregar estatísticas</div>';
    }
  }

  function renderDeviceDetails(deviceId, stats, isLedOn) {
    const firstDate = stats.firstActivity ? new Date(stats.firstActivity).toLocaleString() : 'N/A';
    const lastDate = stats.lastActivity ? new Date(stats.lastActivity).toLocaleString() : 'N/A';

    deviceDetails.innerHTML = '';

    const title = document.createElement('h2');
    title.style.margin = '0 0 20px 0';
    title.textContent = deviceId.replace('.json', '');
    deviceDetails.appendChild(title);


    const statsContainer = document.createElement('div');
    statsContainer.style.cssText = 'background:rgba(255,255,255,0.02);padding:16px;border-radius:8px;margin-bottom:20px';
    statsContainer.innerHTML = `
      <h3 style="margin:0 0 12px 0;font-size:14px;opacity:0.8">Estatísticas</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div style="font-size:12px;opacity:0.6">Total de Registros</div>
          <div style="font-size:24px;font-weight:700;color:#4fc3f7">${stats.totalRecords || 0}</div>
        </div>
        <div>
          <div style="font-size:12px;opacity:0.6">Primeira Atividade</div>
          <div style="font-size:13px">${firstDate}</div>
        </div>
        <div style="grid-column:1/3">
          <div style="font-size:12px;opacity:0.6">Última Atividade</div>
          <div style="font-size:13px">${lastDate}</div>
        </div>
      </div>
    `;
    deviceDetails.appendChild(statsContainer);

    const actionsTitle = document.createElement('h3');
    actionsTitle.style.cssText = 'margin:0 0 12px 0;font-size:14px;opacity:0.8';
    actionsTitle.textContent = 'Ações';
    deviceDetails.appendChild(actionsTitle);

    const actionsContainer = document.createElement('div');
    actionsContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px';

    const ledBtn = document.createElement('button');
    ledBtn.className = isLedOn ? 'btn btn-danger' : 'btn btn-success';
    ledBtn.style.cssText = 'width:100%;justify-content:center;display:flex;align-items:center';
    ledBtn.textContent = isLedOn ? '💡 Desligar LED' : '💡 Ligar LED';
    ledBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleLed(deviceId, !isLedOn);
    });
    actionsContainer.appendChild(ledBtn);

    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn';
    renameBtn.style.cssText = 'width:100%;justify-content:center;display:flex;align-items:center';
    renameBtn.textContent = '✏️ Renomear Device';
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Rename button clicked for:', deviceId);
      handleRename(deviceId);
    });
    actionsContainer.appendChild(renameBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-warning';
    clearBtn.style.cssText = 'width:100%;justify-content:center;border-color:rgba(255,193,7,0.3);display:flex;align-items:center';
    clearBtn.textContent = '🗑️ Limpar Dados';
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Clear button clicked for:', deviceId);
      handleClearData(deviceId);
    });
    actionsContainer.appendChild(clearBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.style.cssText = 'width:100%;justify-content:center;border-color:rgba(244,67,54,0.3);display:flex;align-items:center';
    deleteBtn.textContent = '❌ Deletar Device';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('Delete button clicked for:', deviceId);
      handleDelete(deviceId);
    });
    actionsContainer.appendChild(deleteBtn);

    deviceDetails.appendChild(actionsContainer);
  }

  async function handleLed(deviceId, newState) {
    try {
      const res = await fetch(`/api/devices/${deviceId}/led`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState })
      });

      if (!res.ok) throw new Error('Erro ao alterar LED');

      const data = await res.json();
      // Refresh details to update button state
      fetchDeviceStats(deviceId);

    } catch (err) {
      console.error(err);
      await showConfirmDialog('Erro', 'Erro ao alterar LED: ' + err.message, 'OK', true);
    }
  }

  async function handleRename(deviceId) {
    console.log('handleRename called with:', deviceId);

    const newName = await showPromptDialog(
      'Renomear Device',
      `Digite o novo nome para "${deviceId}":`,
      deviceId
    );
    console.log('User entered new name:', newName);

    if (!newName || newName === deviceId) {
      console.log('User cancelled or entered same name');
      return;
    }

    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newId: newName })
      });

      if (!res.ok) throw new Error('Erro ao renomear device');

      await showConfirmDialog('Sucesso', 'Device renomeado com sucesso!', 'OK', false);
      selectedDevice = newName;
      fetchDevices();
      fetchDeviceStats(newName);
    } catch (err) {
      console.error(err);
      await showConfirmDialog('Erro', 'Erro ao renomear device: ' + err.message, 'OK', true);
    }
  }

  async function handleClearData(deviceId) {
    console.log('handleClearData called with:', deviceId);

    const confirmed = await showConfirmDialog(
      'Limpar Dados',
      `Tem certeza que deseja LIMPAR TODOS OS DADOS do device "${deviceId}"?\n\nO device será mantido, mas todos os registros serão apagados.`,
      'Limpar Dados',
      true
    );
    console.log('User confirmed clear data:', confirmed);

    if (!confirmed) {
      console.log('User cancelled clear data');
      return;
    }

    console.log('Proceeding with clear data');
    try {
      const res = await fetch(`/api/devices/${deviceId}/data`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Erro ao limpar dados');

      await showConfirmDialog('Sucesso', 'Dados limpos com sucesso!', 'OK', false);
      fetchDeviceStats(deviceId);
    } catch (err) {
      console.error(err);
      await showConfirmDialog('Erro', 'Erro ao limpar dados: ' + err.message, 'OK', true);
    }
  }

  async function handleDelete(deviceId) {
    console.log('handleDelete called with:', deviceId);

    const confirmed = await showConfirmDialog(
      '⚠️ ATENÇÃO ⚠️',
      `Tem certeza que deseja DELETAR PERMANENTEMENTE o device "${deviceId}" e TODOS OS SEUS DADOS?\n\nEsta ação NÃO pode ser desfeita!`,
      'Deletar Permanentemente',
      true
    );
    console.log('User confirmed delete:', confirmed);

    if (!confirmed) {
      console.log('User cancelled delete');
      return;
    }

    console.log('Proceeding with delete');
    try {
      const res = await fetch(`/api/devices/${deviceId}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error('Erro ao deletar device');

      alert('Device deletado com sucesso!');
      selectedDevice = null;
      deviceDetails.innerHTML = '<div style=\"opacity:0.5;font-style:italic;text-align:center;padding:60px 20px\">Selecione um device para ver detalhes</div>';
      fetchDevices();
    } catch (err) {
      console.error(err);
      alert('Erro ao deletar device: ' + err.message);
    }
  }

  refreshBtn.addEventListener('click', fetchDevices);

  // ========================================
  // Initialization
  // ========================================
  fetchDevices();
});
