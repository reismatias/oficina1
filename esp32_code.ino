/*
 * DECIBELÍMETRO - VERSÃO FINAL COM CALIBRAÇÃO MULTI-PONTO + WiFi
 * Compatível com ESP32-C3 Mini no Arduino IDE.
*/

#include <WiFi.h>  // Biblioteca necessária para WiFi na ESP32-C3
#include <HTTPClient.h>
#include <time.h>

// --- CONFIGURAÇÃO DE REDE WiFi ---
const char* ssid = "Matias’ iPhone 15";       // Substitua pelo nome da sua rede WiFi
const char* password = "matias12345";  // Substitua pela senha da sua rede WiFi

// --- Pinos e Configurações ---
const int pinoSensor = 1;           // GPIO 1 (entrada analógica AO)
const int janelaDeAmostragem = 50;  // 50ms de janela de amostragem

// --- PONTOS DE CALIBRAÇÃO ---
const float rmsValores[] = { 20.14, 21.91, 37.5, 48.90 };
const float dbValores[]  = { 36.6, 37.1, 78.0, 80.0 };

// --- Valor de saturação ---
const int RMS_SATURACAO = 1000;

// --- Variáveis e Função para enviar dados ao Servidor
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -3 * 3600;  // (-3h - Brasil/Brasília)
const int   daylightOffset_sec = 0;

String url = "http://172.20.10.4:3333/dados"; // URL do endpoint (POST) do SERVIDOR

#include <ctime>

time_t ultimoTempoEnvio = 0;

void enviarDadosDbIntervalado(String endpoint, int db, time_t& ultimoTempo) {
  time_t now = time(nullptr);

  if ((now - ultimoTempo) >= 5) {  // 5 segundos de intervalo
    HTTPClient http;
    String payload = "{";
    payload += "\"device_id\":\"esp32_test\",";
    payload += "\"db\":";
    payload += db;
    payload += ",";
    payload += "\"timestamp\":";
    payload += (unsigned long)now;
    payload += "},";


    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");
    int httpResponseCode = http.POST(payload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("Resposta servidor: ");
      Serial.println(response);
    } else {
      Serial.print("Erro ao enviar dados: ");
      Serial.println(httpResponseCode);
    }
    http.end();
    ultimoTempo = now;
  }
}
// ---


// --- Função de conversão com interpolação ---
float converterRmsParaDB(float rms) {
  int i;
  for (i = 0; i < (sizeof(rmsValores) / sizeof(rmsValores[0])) - 1; i++) {
    if (rms >= rmsValores[i] && rms <= rmsValores[i + 1]) {
      return map(rms, rmsValores[i], rmsValores[i + 1], dbValores[i], dbValores[i + 1]);
    }
  }

  if (rms < rmsValores[0]) {
    return dbValores[0];
  } else {
    return dbValores[(sizeof(rmsValores) / sizeof(rmsValores[0])) - 1];
  }
}

// --- Função de conexão Wi-Fi ---
void conectarWiFi() {
  Serial.println();
  Serial.print("Conectando-se à rede WiFi: ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi conectado com sucesso!");
    Serial.print("Endereço IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Falha ao conectar ao WiFi.");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  conectarWiFi(); // Conecta à rede antes de iniciar o loop principal

  // Inicializar o tempo com NTP, para pegar o horário correto
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  time_t now;
  struct tm timeinfo;
  while ((now = time(nullptr)) < 8 * 3600 * 2) { // espera até ter um tempo válido
    delay(500);
    Serial.print(".");
  }
  localtime_r(&now, &timeinfo);
}

void loop() {
  unsigned long inicioMillis = millis();
  double somaDosQuadrados = 0;
  int numAmostras = 0;

  while (millis() - inicioMillis < janelaDeAmostragem) {
    int leitura = analogRead(pinoSensor);
    double leituraSemDC = leitura - 2048;
    somaDosQuadrados += leituraSemDC * leituraSemDC;
    numAmostras++;
  }

  double valorRMS = sqrt(somaDosQuadrados / numAmostras);
  float decibeis = 0;

  if (valorRMS >= RMS_SATURACAO) {
    Serial.print("Valor RMS: ");
    Serial.print(valorRMS);
    Serial.println("\t Nível de Ruído: +102 dB (SATURADO)");
  } else {
    decibeis = converterRmsParaDB(valorRMS);
    Serial.print("Valor RMS: ");
    Serial.print(valorRMS);
    Serial.print("\t Nível de Ruído (dB): ");
    Serial.println(decibeis, 1);

    // Envia os dados para o SERVIDOR
    enviarDadosDbIntervalado(url, decibeis, ultimoTempoEnvio);
  }

  delay(1000);
}