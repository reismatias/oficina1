// dashboard.js
async function checkAuth() {
  const res = await fetch('/auth/status', { credentials: 'same-origin' });
  const j = await res.json();
  if (!j.authenticated) {
    window.location.href = '/login.html';
  }
  document.getElementById('status').textContent = `Logged in as ${j.username}`;
}

async function loadData() {
  const res = await fetch('/api/dados', { credentials: 'same-origin' });
  if (res.status === 401) {
    window.location.href = '/login.html';
    return;
  }
  const j = await res.json();
  const container = document.getElementById('devices');
  container.innerHTML = '';
  if (!j.devices || j.devices.length === 0) {
    container.textContent = 'No device data found.';
    return;
  }
  j.devices.forEach(d => {
    const card = document.createElement('div');
    card.className = 'device-card';
    const title = document.createElement('h3');
    title.textContent = d.filename;
    card.appendChild(title);

    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(d.entries.slice(-5), null, 2); // last 5
    card.appendChild(pre);

    container.appendChild(card);
  });
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/logout', { method: 'POST' });
  window.location.href = '/login.html';
});

(async function init() {
  await checkAuth();
  await loadData();
  // optional: poll every 10s
  setInterval(loadData, 10000);
})();
