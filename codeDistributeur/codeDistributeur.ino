#include <SPI.h>      // Pour la communication SPI avec le module RFID
#include <MFRC522.h>  // Pour le lecteur RFID RC522
#include <Servo.h>    // Pour contrôler le servo moteur (couvercle)
#include <Wire.h>     // Pour la communication I2C (utilisée avec le module RTC)
#include <RTClib.h>   // Pour l’utilisation de l’horloge temps réel DS1307

// === Définition des broches utilisées ===
#define MOTOR_STEP_PIN 3    // Broche IN1 du moteur pas à pas
#define MOTOR_DIR_PIN 4     // Broche IN2 du moteur pas à pas
#define MOTOR_IN3_PIN 5     // Broche IN3 du moteur pas à pas
#define MOTOR_IN4_PIN 6     // Broche IN4 du moteur pas à pas (aussi utilisée pour le servo dans certains cas)
#define SERVO_PIN 7         // Broche de signal pour contrôler le servo moteur

#define RFID_RST_PIN 9      // Broche RST pour le module RFID (Reset)
#define RFID_SDA_PIN 10     // Broche SDA (SS/CS) du module RFID (Chip Select)

#define BTN_INC_PIN A0      // Bouton connecté à A0 pour augmenter la fréquence
#define BTN_DEC_PIN A1      // Bouton connecté à A1 pour diminuer la fréquence
#define TRIG_PIN A2         // Broche TRIG du capteur ultrason
#define ECHO_PIN A3         // Broche ECHO du capteur ultrason

// === Constantes de configuration ===
#define STEPS_PER_REVOLUTION 2048  // Nombre de pas pour une rotation complète du moteur pas à pas
#define STEPPER_SPEED 30           // Vitesse du moteur en tours par minute (non utilisée ici directement)
#define STEP_DELAY 5               // Délai entre chaque pas du moteur (ms)
#define ANGLE_OUVERT 90           // Angle pour ouvrir le couvercle avec le servo
#define ANGLE_FERME 0             // Angle pour fermer le couvercle avec le servo

#define DEBOUNCE_DELAY 50         // Délai anti-rebond pour les boutons (ms)

// === Création des objets ===
MFRC522 rfid(RFID_SDA_PIN, RFID_RST_PIN); // Instance du module RFID avec les broches définies
Servo servo;                              // Création du servo moteur
RTC_DS1307 rtc;                           // Création du module RTC

// === Variables globales ===
bool estOuvert = false;                  // État du couvercle : false = fermé, true = ouvert
unsigned long lastMotorTime = 0;         // Temps de la dernière activation du moteur
unsigned long motorInterval = 8UL * 60 * 60 * 1000; // Fréquence de distribution de nourriture (8h en ms)
unsigned long motorDuration = 10000;     // Durée de rotation du moteur (pas utilisée directement)

// Séquence de pas pour le moteur pas à pas (stockée en mémoire flash pour optimiser la RAM)
const byte stepSequence[8][4] PROGMEM = {
  { 1, 0, 0, 0 },
  { 1, 1, 0, 0 },
  { 0, 1, 0, 0 },
  { 0, 1, 1, 0 },
  { 0, 0, 1, 0 },
  { 0, 0, 1, 1 },
  { 0, 0, 0, 1 },
  { 1, 0, 0, 1 }
};

unsigned long lastDebounceTimeInc = 0;   // Dernier appui du bouton +
unsigned long lastDebounceTimeDec = 0;   // Dernier appui du bouton -

String expectedUID = "ac1ff21";          // UID autorisé (badge RFID valide)

// Déclaration des fonctions
void activerMoteur();
void tournerUnPas();
long mesurerDistance();

// === Fonction d'initialisation ===
void setup() {
  Serial.begin(9600);             // Démarre la communication série
  SPI.begin();                    // Initialise le bus SPI
  rfid.PCD_Init();                // Initialise le module RFID

  if (!rfid.PCD_PerformSelfTest()) {
    Serial.println("Test du module RFID échoué !");
  } else {
    Serial.println("Module RFID initialisé avec succès.");
  }

  servo.attach(SERVO_PIN);       // Attache le servo à sa broche
  servo.write(ANGLE_FERME);      // Met le servo en position fermée au démarrage

  pinMode(BTN_INC_PIN, INPUT_PULLUP);  // Bouton + avec résistance de tirage interne
  pinMode(BTN_DEC_PIN, INPUT_PULLUP);  // Bouton - avec résistance de tirage interne

  pinMode(MOTOR_STEP_PIN, OUTPUT);     // Broches du moteur en sortie
  pinMode(MOTOR_DIR_PIN, OUTPUT);
  pinMode(MOTOR_IN3_PIN, OUTPUT);
  pinMode(MOTOR_IN4_PIN, OUTPUT);

  pinMode(TRIG_PIN, OUTPUT);     // Capteur ultrason : TRIG en sortie
  pinMode(ECHO_PIN, INPUT);      // Capteur ultrason : ECHO en entrée

  Wire.begin();                  // Initialisation du bus I2C pour le RTC
  if (!rtc.begin()) {
    Serial.println("Impossible de trouver un RTC DS1307");
    while (1); // Arrêt du programme
  }

  if (!rtc.isrunning()) {
    Serial.println("RTC n'est pas en marche, mise à jour de l'heure");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__))); // Mise à l'heure automatique
  }
}

// === Boucle principale du programme ===
void loop() {
  DateTime now = rtc.now();  // Récupère l’heure actuelle (peut servir pour des logs)

  // --- Communication série pour changement de fréquence ---
  if (Serial.available()) {
    String input = Serial.readStringUntil('\n');  // Lire une ligne de texte depuis le port série
    input.trim();                                 // Retire les espaces inutiles
    if (input.startsWith("FREQ:")) {
      unsigned long newInterval = input.substring(5).toInt(); // Extrait la valeur numérique
      if (newInterval >= 30UL * 60 * 1000 && newInterval <= 24UL * 60 * 60 * 1000) {
        motorInterval = newInterval;  // Applique la nouvelle fréquence
        Serial.print("Nouvel intervalle reçu : ");
        Serial.println(motorInterval);
      } else {
        Serial.println("Intervalle invalide reçu");
      }
    }
  }

  // --- Activation automatique du moteur ---
  if ((millis() - lastMotorTime >= motorInterval) && !estOuvert) {
    activerMoteur();  // Si assez de temps s’est écoulé, active le moteur
  }

  // --- Lecture RFID ---
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    Serial.println("Puce RFID détectée !");
    if (!estOuvert) {
      String uid = "";
      for (byte i = 0; i < rfid.uid.size; i++) {
        uid += String(rfid.uid.uidByte[i], HEX);  // Concatène les octets en HEX
      }

      if (uid == expectedUID) {
        Serial.println("Puce autorisée détectée !");
        servo.write(ANGLE_OUVERT);     // Ouvre le couvercle
        estOuvert = true;
        Serial.println("Couvercle ouvert.");
        Serial.println("LOG_OUVERTURE"); // Message envoyé au backend
      } else {
        Serial.println("Puce non autorisée.");
      }
    }
    delay(1000);  // Pause pour éviter plusieurs lectures rapides
  }

  // --- Vérifie la fermeture du couvercle ---
  long distance = mesurerDistance();  // Mesure de la distance
  if (estOuvert && distance > 15) {
    servo.write(ANGLE_FERME);   // Ferme si la gamelle est vide (plus d'objet proche)
    estOuvert = false;
    Serial.println("Couvercle fermé.");
    delay(1000);  // Laisse le temps au servo
  }

  // --- Bouton pour augmenter l’intervalle ---
  if (digitalRead(BTN_INC_PIN) == LOW && (millis() - lastDebounceTimeInc) > DEBOUNCE_DELAY) {
    lastDebounceTimeInc = millis();
    if (motorInterval < 24.0 * 60 * 60 * 1000) {  // Limite supérieure : 24h
      motorInterval += 30.0 * 60 * 1000;          // +30 minutes
      Serial.print("Intervalle augmenté à : ");
      Serial.print(motorInterval / 1000 / 60 / 60);  // Heures
      Serial.print("h");
      unsigned long minutes = motorInterval / 1000 / 60 % 60;
      if (minutes < 10) Serial.print("0");
      Serial.println(minutes);
      Serial.print("FREQ_UPDATE:");
      Serial.println(motorInterval); // Envoi au backend
      delay(1000);
    }
  }

  // --- Bouton pour diminuer l’intervalle ---
  if (digitalRead(BTN_DEC_PIN) == LOW && (millis() - lastDebounceTimeDec) > DEBOUNCE_DELAY) {
    lastDebounceTimeDec = millis();
    if (motorInterval > 30.0 * 60 * 1000) {  // Limite inférieure : 30 minutes
      motorInterval -= 30.0 * 60 * 1000;     // -30 minutes
      Serial.print("Intervalle réduit à : ");
      Serial.print(motorInterval / 1000 / 60 / 60);
      Serial.print("h");
      unsigned long minutes = motorInterval / 1000 / 60 % 60;
      if (minutes < 10) Serial.print("0");
      Serial.println(minutes);
      Serial.print("FREQ_UPDATE:");
      Serial.println(motorInterval); // Envoi au backend
      delay(1000);
    }
  }
}

// === FONCTIONS ===

// Active le moteur pour une rotation complète
void activerMoteur() {
  Serial.println("Activation du moteur pas à pas...");
  lastMotorTime = millis();  // Mise à jour du temps
  for (int i = 0; i < STEPS_PER_REVOLUTION; i++) {
    tournerUnPas();          // Effectue un pas
    delay(STEP_DELAY);       // Pause entre les pas
  }
  Serial.println("Moteur désactivé.");
}

// Effectue un seul pas du moteur
void tournerUnPas() {
  static int stepIndex = 0;  // Indice du pas courant
  digitalWrite(MOTOR_STEP_PIN, pgm_read_byte(&(stepSequence[stepIndex][0])));
  digitalWrite(MOTOR_DIR_PIN, pgm_read_byte(&(stepSequence[stepIndex][1])));
  digitalWrite(MOTOR_IN3_PIN, pgm_read_byte(&(stepSequence[stepIndex][2])));
  digitalWrite(MOTOR_IN4_PIN, pgm_read_byte(&(stepSequence[stepIndex][3])));
  stepIndex = (stepIndex + 1) % 8;  // Étape suivante
}

// Mesure la distance en cm avec le capteur ultrason
long mesurerDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);     // Déclenche un pulse
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  long duration = pulseIn(ECHO_PIN, HIGH);  // Temps aller-retour
  long distance = duration * 0.034 / 2;     // Convertit en cm
  return distance;
}
