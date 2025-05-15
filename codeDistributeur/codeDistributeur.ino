#include <SPI.h>
// #include <UIPEthernet.h>  // Commenté car pas de module Ethernet
#include <MFRC522.h>
#include <Servo.h>
#include <Wire.h>
#include <RTClib.h>

// Définition des broches
#define PIR_PIN          2   // OUT pour le capteur PIR
#define MOTOR_STEP_PIN   3   // IN1 pour le moteur pas à pas
#define MOTOR_DIR_PIN    4   // IN2 pour le moteur pas à pas
#define MOTOR_IN3_PIN    5   // IN3 pour le moteur pas à pas
#define MOTOR_IN4_PIN    6   // IN4 pour le moteur pas à pas (partagé avec servo)
#define SERVO_PIN        7   // Signal pour le servo moteur (déplacé à D7)

#define RFID_RST_PIN     9    // RST pour le module RFID
#define RFID_SDA_PIN     10   // SS (CS) pour le module RFID
#define BTN_INC_PIN      A0  // Bouton +
#define BTN_DEC_PIN      A1  // Bouton -

// Initialisation des modules
MFRC522 rfid(RFID_SDA_PIN, RFID_RST_PIN);
Servo servo;
RTC_DS1307 rtc;
// EthernetServer server(80);  // Commenté pour désactiver Ethernet

const int stepsPerRevolution = 2048;  // Nombre de pas pour une révolution complète du moteur
int stepperSpeed = 15; // Vitesse du moteur en tours par minute
int angleOuvert = 90;   // Angle pour ouvrir le servo
int angleFerme = 0;     // Angle pour fermer le servo
bool estOuvert = false;
unsigned long lastMotorTime = 0;
unsigned long motorInterval = 8UL * 60 * 60 * 1000;  // 8 heures en ms
unsigned long motorDuration = 10000; // 10 secondes
unsigned long lastDebounceTimeInc = 0;
unsigned long lastDebounceTimeDec = 0;
unsigned long debounceDelay = 50;
String expectedUID = "ac1ff21";

void setup() {
  Serial.begin(9600);
  SPI.begin();

  // Initialisation RFID
  rfid.PCD_Init();

  // Initialisation du servo
  servo.attach(SERVO_PIN);  // Utilise D7 pour le servo
  servo.write(angleFerme);  // Position fermée du servo

  // Configuration des broches
  pinMode(PIR_PIN, INPUT);     // Capteur PIR
  pinMode(BTN_INC_PIN, INPUT_PULLUP);  // Bouton +
  pinMode(BTN_DEC_PIN, INPUT_PULLUP);  // Bouton -
  pinMode(MOTOR_STEP_PIN, OUTPUT);  // IN1 pour le moteur
  pinMode(MOTOR_DIR_PIN, OUTPUT);   // IN2 pour le moteur
  pinMode(MOTOR_IN3_PIN, OUTPUT);  // IN3 pour le moteur
  pinMode(MOTOR_IN4_PIN, OUTPUT);  // IN4 pour le moteur (partagé avec le servo)

  // Initialisation du serveur Ethernet (commenté)
  // uint8_t mac[6] = {0xDE, 0xAD, 0xBE, 0xEF, 0xFE, 0xED};
  // Ethernet.begin(mac);
  // server.begin();
  // Serial.print("Serveur web démarré à l'adresse IP : ");
  // Serial.println(Ethernet.localIP());

  // Initialisation du module RTC
  Wire.begin();
  if (!rtc.begin()) {
    Serial.println("Impossible de trouver un RTC DS1307");
    while (1);
  }

  // Vérifier si le module RTC fonctionne
  if (!rtc.isrunning()) {
    Serial.println("RTC n'est pas en marche, mise à jour de l'heure");
    // Si le RTC n'est pas en marche, on initialise avec la date/heure actuelle
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
}

void loop() {
  DateTime now = rtc.now();

  // Serveur web (commenté)
  // EthernetClient client = server.available();
  // if (client) {
  //     // Code du serveur web ici
  // }

  // Activation automatique du moteur
  if ((millis() - lastMotorTime >= motorInterval) && !estOuvert) {
    activerMoteur();
  }

  // Détection RFID
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    Serial.println("Puce RFID détectée !");
    if (!estOuvert) {
      String uid = "";
      for (byte i = 0; i < rfid.uid.size; i++) {
        uid += String(rfid.uid.uidByte[i], HEX);  // Convertit chaque byte en hex
      }
      if (uid == expectedUID) {  // Si l'UID correspond à celui attendu
  // Action à effectuer pour cette puce
        Serial.println("Puce autorisée détectée !");
        servo.write(angleOuvert);
        estOuvert = true;
        Serial.println("Couvercle ouvert.");
      } else {
        Serial.println("Puce non autorisée.");
      }
    }
    delay(1000);
  }

  // Détection PIR
  if (estOuvert && digitalRead(PIR_PIN) == LOW) {
    servo.write(angleFerme);  // Ferme le servo
    estOuvert = false;
    Serial.println("Couvercle fermé.");
    delay(1000);
  }

  // Bouton Augmenter
  if (digitalRead(BTN_INC_PIN) == LOW && (millis() - lastDebounceTimeInc) > debounceDelay) {
    lastDebounceTimeInc = millis();
    motorInterval += 30.0 * 60 * 1000;  // Augmenter l'intervalle de 30 minutes en millisecondes (en double)
    
    Serial.print("Intervalle augmenté à : ");
    Serial.print(motorInterval);
    Serial.println(" millisecondes");
    delay(1000);
  }

  // Bouton Diminuer
  if (digitalRead(BTN_DEC_PIN) == LOW && (millis() - lastDebounceTimeDec) > debounceDelay) {
    lastDebounceTimeDec = millis();
    if (motorInterval > 30.0 * 60 * 1000) {  // Ne pas descendre en dessous de 30 minutes
        motorInterval -= 30.0 * 60 * 1000;  // Diminuer l'intervalle de 30 minutes en millisecondes (en double)

        Serial.print("Intervalle réduit à : ");
        Serial.print(motorInterval);
        Serial.println(" millisecondes");

        delay(1000);  // Délais pour éviter les rebonds de bouton
    }
  }
}

void activerMoteur() {
  Serial.println("Activation du moteur pas à pas...");
  digitalWrite(MOTOR_DIR_PIN, HIGH);
  for (int i = 0; i < stepsPerRevolution; i++) {
    digitalWrite(MOTOR_STEP_PIN, HIGH);
    delay(1000 / stepperSpeed);
    digitalWrite(MOTOR_STEP_PIN, LOW);
    delay(1000 / stepperSpeed);
  }
  delay(motorDuration);
  lastMotorTime = millis();
  Serial.println("Moteur désactivé.");
}
