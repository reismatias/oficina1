#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>

// --- CONFIGURAÇÃO DE REDE WiFi ---
const char* ssid = "projandi";
const char* password = "ANDERSON2005";

// --- Pinos e Configurações ---
const int pinoSensor = 0;            // pino analógico para sensor de som (KY-037)
const int janelaDeAmostragem = 200;  // em milissegundos
const int numAmostras = 500;         // leituras por janela para oversampling

// --- Giroflex (LED 5V) ---
const int giroflexPin = 9;           // pino digital para acionar o giroflex

// --- Interpolação calibrada ---
const float rmsValores[] = {20.14, 21.91, 37.5, 48.90};
const float dbValores[]  = {36.6, 37.1, 78.0, 80.0};

// --- Para evitar log de zero ---
const float RMS_MIN = 0.0001;

// --- LCD (I2C) ---
LiquidCrystal_I2C lcd(0x27, 16, 2);

// --- Envio de dados e tempo ---
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = -3 * 3600;
const int   daylightOffset_sec = 0;
String url = "http://172.20.10.4:3333/dados";
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

// --- Envia dados ao servidor e checa resposta para acionar giroflex ---
void enviarDadosDbIntervalado(String endpoint, float db, time_t& ultimoTempo) {
  time_t now = time(nullptr);

  if ((now - ultimoTempo) >= 5) {  // envia a cada 5 segundos
    HTTPClient http;
    http.begin(endpoint);
    http.addHeader("Content-Type", "application/json");

    // Monta JSON para envio
    StaticJsonDocument<200> docEnvio;
    docEnvio["device_id"] = "esp32_c3_mini";
    docEnvio["db"] = db;
    docEnvio["timestamp"] = (unsigned long) now;

    String payload;
    serializeJson(docEnvio, payload);

    int httpResponseCode = http.POST(payload);

    if (httpResponseCode > 0) {
      String response = http.getString();
      Serial.print("Resposta servidor: ");
      Serial.println(response);

      // Parse da resposta JSON
      StaticJsonDocument<200> respDoc;
      DeserializationError error = deserializeJson(respDoc, response);
      if (!error) {
        bool acender = respDoc["acender_giroflex"];
        if (acender) {
          digitalWrite(giroflexPin, HIGH);
        } else {
          digitalWrite(giroflexPin, LOW);
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

void setup() {
  Serial.begin(115200);
  delay(1000);

  conectarWiFi();

  Wire.begin(3, 4);
  lcd.init();
  lcd.backlight();

  pinMode(giroflexPin, OUTPUT);
  digitalWrite(giroflexPin, LOW);

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  time_t now;
  while ((now = time(nullptr)) < 8 * 3600 * 2) {
    delay(500);
    Serial.print(".");
  }

  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("DECIBELIMETRO");
  lcd.setCursor(0, 1);
  lcd.print("Iniciando...");
  delay(1500);
}

void loop() {
  unsigned long inicioMillis = millis();
  double somaDosQuadrados = 0;
  int contagem = 0;

  // Amostragem para cálculo RMS
  while (millis() - inicioMillis < janelaDeAmostragem) {
    for (int i = 0; i < numAmostras; i++) {
      int leitura = analogRead(pinoSensor);
      double ajustada = leitura - 2048;  // remove offset DC aproximado
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

  // Exibe no LCD
  lcd.setCursor(0, 0);
  lcd.print("DECIBELIMETRO    ");
  lcd.setCursor(0, 1);
  lcd.print("dB: ");
  lcd.print(decibeis, 1);
  lcd.print("   ");

  // Envia dados e checa resposta
  enviarDadosDbIntervalado(url, decibeis, ultimoTempoEnvio);

  delay(1000);
}