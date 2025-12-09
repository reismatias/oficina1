w#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// --- CONFIGURAÇÃO DE REDE WiFi ---
const char* ssid = "Cipher";          // Nome da sua rede WiFi
const char* password = "Lalelolelo";  // Senha da sua rede WiFi

// --- PINAGEM ---
const int PIN_KY037 = 0;   // Saída analógica do KY-037 (GPIO 0)
const int PIN_RELE = 5;    // Acionamento do Relé (GPIO 5) - Controla o LED 5V/Giroflex

// --- Configurações de Amostragem ---
const int janelaDeAmostragem = 200;  // em milissegundos
const int numAmostras = 500;         // leituras por janela para oversampling

// --- Interpolação calibrada (RMS -> dB) ---
const float rmsValores[] = {20.14, 21.91, 37.5, 48.90};
const float dbValores[]  = {36.6, 37.1, 78.0, 80.0};

// --- Para evitar log de zero ---
const float RMS_MIN = 0.0001;

// --- LCD (I2C) ---
// Pinos SDA e SCL definidos no Wire.begin(3, 4) dentro do setup
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- Envio de dados e tempo ---
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -3 * 3600; // Fuso horário (Brasil -3)
const int   daylightOffset_sec = 0;
String url = "http://10.212.156.77:3333/dados"; // Endereço do seu servidor
time_t ultimoTempoEnvio = 0;

// --- Função para converter RMS para dB usando interpolação ---
float converterRmsParaDB(float rms) {
  int n = sizeof(rmsValores) / sizeof(rmsValores[0]);
  for (int i = 0; i < n - 1; i++) {
    if (rms >= rmsValores[i] && rms <= rmsValores[i + 1]) {
      float t = (rms - rmsValores[i]) / (rmsValores[i + 1] - rmsValores[i]);
      return dbValores[i] + t * (dbValores[i + 1] - dbValores[i]);
    }
  }
  if (rms < rmsValores[0]) return dbValores[0];
  return dbValores[n - 1];
}

// --- Função para formatar horário ---
String formatarHorario(time_t timestamp) {
  struct tm* timeinfo = localtime(&timestamp);
  if (!timeinfo) return "Hora invalida";
  char buffer[20];
  strftime(buffer, sizeof(buffer), "%d/%m/%Y %H:%M:%S", timeinfo);
  return String(buffer);
}

// --- Verifica se horário está válido (sincronizado via NTP) ---
bool horarioValido() {
  time_t now = time(nullptr);
  return now > 8 * 3600 * 2; // Maior que 1970 + offset
}

// --- Conecta no Wi-Fi ---
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
    Serial.println("\n✅ WiFi conectado!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ Falha ao conectar ao WiFi.");
  }
}

// --- Envia dados ao servidor e checa resposta para acionar o RELÉ ---
void enviarDadosDbIntervalado(String endpoint, float db, time_t& ultimoTempo) {
  time_t now = time(nullptr);

  if ((now - ultimoTempo) >= 5) {  // Envia a cada 5 segundos

    // Se horário não estiver válido, tenta reconectar NTP e aguarda
    if (!horarioValido()) {
       Serial.println("⚠️ Horário inválido, aguardando NTP...");
       return;
    }

    Serial.print("📅 Enviando dados - Horário: ");
    Serial.println(formatarHorario(now));

    HTTPClient http;
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");

    // Monta JSON para envio
    StaticJsonDocument<200> docEnvio;
    docEnvio["device_id"] = "esp32_c3_mini";
    docEnvio["db"] = db;
    docEnvio["timestamp"] = (uint64_t)now * 1000;

    String payload;
    serializeJson(docEnvio, payload);

    int httpResponseCode = http.POST(payload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("Resposta servidor: ");
      Serial.println(response);

      // Parse da resposta JSON para controlar o Relé
      StaticJsonDocument<200> respDoc;
      DeserializationError error = deserializeJson(respDoc, response);
      if (!error) {
        // O servidor decide se acende ou não
        bool acender = respDoc["acender_giroflex"];

        if (acender) {
          digitalWrite(PIN_RELE, LOW); // Liga o Relé (Active Low)
          Serial.println(">>> RELÉ LIGADO (Comando do Servidor) <<<");
        } else {
          digitalWrite(PIN_RELE, HIGH);  // Desliga o Relé (Active Low)
          Serial.println(">>> Relé Desligado (Comando do Servidor) <<<");
        }
      } else {
        Serial.print("Erro JSON: ");
        Serial.println(error.c_str());
      }

    } else {
      Serial.print("Erro ao enviar dados: ");
      Serial.println(httpResponseCode);
    }

    http.end();
    ultimoTempo = now;
  }
}

// --- SETUP ---
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Configuração do pino do RELÉ
  pinMode(PIN_RELE, OUTPUT);
  digitalWrite(PIN_RELE, HIGH); // Começa desligado (Active Low)

  conectarWiFi();

  // Inicializa I2C (LCD) - GPIO 3 (SDA) e 4 (SCL) na ESP32 C3 Super Mini
  Wire.begin(3, 4);
  lcd.init();
  lcd.backlight();

  // Configuração de Tempo (NTP)
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  time_t now;
  Serial.print("Sincronizando relógio");
  while ((now = time(nullptr)) < 8 * 3600 * 2) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.print("Horário Sincronizado: ");
  Serial.println(ctime(&now));

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("DECIBELIMETRO");
  lcd.setCursor(0, 1);
  lcd.print("Iniciando...");

  Serial.println("\n--- SISTEMA PRONTO ---");
  Serial.println("DICA: Digite 'L' no Serial para Ligar o Relé manualmente ou 'D' para Desligar.");

  delay(1500);
}

// --- LOOP ---
void loop() {
  // -----------------------------------------------------
  // 1. VERIFICAÇÃO DE COMANDO MANUAL VIA SERIAL
  // -----------------------------------------------------
  if (Serial.available() > 0) {
    char comando = Serial.read();
    // Limpa caracteres extras como nova linha
    while(Serial.available() > 0) Serial.read();

    if (comando == 'L' || comando == 'l') {
      digitalWrite(PIN_RELE, LOW); // Active Low
      Serial.println("\n>>> COMANDO MANUAL: RELÉ LIGADO! <<<");
    }
    else if (comando == 'D' || comando == 'd') {
      digitalWrite(PIN_RELE, HIGH); // Active Low
      Serial.println("\n>>> COMANDO MANUAL: RELÉ DESLIGADO! <<<");
    }
  }

  // -----------------------------------------------------
  // 2. LEITURA E CÁLCULO DE DECIBÉIS
  // -----------------------------------------------------
  unsigned long inicioMillis = millis();
  double somaDosQuadrados = 0;
  int contagem = 0;

  // Amostragem para cálculo RMS usando PIN_KY037 (GPIO 0)
  while (millis() - inicioMillis < janelaDeAmostragem) {
    for (int i = 0; i < numAmostras; i++) {
      int leitura = analogRead(PIN_KY037);

      // Ajuste de offset DC (aprox meio da escala de 12 bits: 4095 / 2 = ~2048)
      double ajustada = leitura - 2048;

      somaDosQuadrados += ajustada * ajustada;
      contagem++;
    }
  }

  double mediaQuadratica = somaDosQuadrados / contagem;
  double valorRMS = sqrt(mediaQuadratica);

  if (valorRMS < RMS_MIN) {
    valorRMS = RMS_MIN;
  }

  float decibeis = converterRmsParaDB((float)valorRMS);

  // Impressão no Serial para depuração
  time_t agora = time(nullptr);
  // Serial.print("[");
  // Serial.print(formatarHorario(agora));
  // Serial.print("] dB: ");
  // Serial.println(decibeis, 1);

  // Exibe no LCD
  lcd.setCursor(0, 0);
  lcd.print("DECIBELIMETRO    ");
  lcd.setCursor(0, 1);
  lcd.print("dB: ");
  lcd.print(decibeis, 1);
  lcd.print("   ");

  // -----------------------------------------------------
  // 3. COMUNICAÇÃO COM SERVIDOR (Controla o Relé automaticamente)
  // -----------------------------------------------------
  enviarDadosDbIntervalado(url, decibeis, ultimoTempoEnvio);

  // Pequeno delay para estabilidade
  delay(50);
}