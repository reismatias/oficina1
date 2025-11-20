#!/usr/bin/env node
// test-api.js
// Script para simular o ESP32 enviando dados para a API

const BASE_URL = process.env.API_URL || 'http://localhost:3333';
const DEVICE_ID = process.env.DEVICE_ID || 'test_device_simulated';
const INTERVAL_MS = parseInt(process.env.INTERVAL_MS) || 5000;

let count = 0;

function getRandomDb() {
  // Gera valor aleatório entre 20 e 100
  return Math.floor(Math.random() * (100 - 20 + 1)) + 20;
}

async function sendData() {
  count++;
  const db = getRandomDb();
  const timestamp = Date.now();

  const payload = {
    device_id: DEVICE_ID,
    db: db,
    timestamp: timestamp
  };

  try {
    const response = await fetch(`${BASE_URL}/dados`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      const result = await response.json();
      console.log(`[${count}] ✅ Enviado: ${db}dB @ ${new Date(timestamp).toLocaleTimeString()} - ${result.message}`);
    } else {
      const error = await response.text();
      console.error(`[${count}] ❌ Erro ao enviar dados: ${response.status} - ${error}`);
    }
  } catch (err) {
    console.error(`[${count}] ❌ Falha na requisição: ${err.message}`);
  }
}

console.log('========================================');
console.log('  Simulador de ESP32 - Teste de API');
console.log('========================================');
console.log(`  URL da API:    ${BASE_URL}/dados`);
console.log(`  Device ID:     ${DEVICE_ID}`);
console.log(`  Intervalo:     ${INTERVAL_MS}ms (${INTERVAL_MS / 1000}s)`);
console.log('----------------------------------------');
console.log('  Pressione Ctrl+C para parar');
console.log('========================================\n');

// Envia o primeiro imediatamente
sendData();

// Configura intervalo para envios subsequentes
const interval = setInterval(sendData, INTERVAL_MS);

// Lida com Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n========================================');
  console.log(`  Teste finalizado!`);
  console.log(`  Total de envios: ${count}`);
  console.log('========================================\n');
  clearInterval(interval);
  process.exit(0);
});
