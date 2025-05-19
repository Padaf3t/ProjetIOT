#include <SPI.h>                    // Bibliothèque pour la communication SPI (utilisée par le module RFID)
// #include <UIPEthernet.h>         // Commenté car on n'utilise pas encore internet
#include <MFRC522.h>                // Bibliothèque pour le lecteur RFID RC522
#include <Servo.h>                  // Bibliothèque pour contrôler un servo moteur
#include <Wire.h>                   // Bibliothèque pour la communication I2C (utilisée par le module RTC)
#include <RTClib.h>                 // Bibliothèque pour utiliser un module d'horloge temps réel (DS1307)

// Définition des broches utilisées pour les différents composants
#define MOTOR_STEP_PIN   3          // IN1 : Broche de contrôle pour le moteur pas à pas
#define MOTOR_DIR_PIN    4          // IN2 : Broche de contrôle pour le moteur pas à pas
#define MOTOR_IN3_PIN    5          // IN3 : Broche de contrôle pour le moteur pas à pas
#define MOTOR_IN4_PIN    6          // IN4 : Broche de contrôle pour le moteur pas à pas (partagée avec le servo !)
#define SERVO_PIN        7          // Broche de signal pour contrôler le servo moteur

#define RFID_RST_PIN     9          // Broche RST (reset) du module RFID
#define RFID_SDA_PIN     10         // Broche SS (Slave Select / Chip Select) du module RFID
#define BTN_INC_PIN      A0         // Broche pour le bouton d’augmentation d’intervalle
#define BTN_DEC_PIN      A1         // Broche pour le bouton de diminution d’intervalle
#define TRIG_PIN         A2         // Broche TRIG du capteur à ultrasons HC-SR04
#define ECHO_PIN         A3         // Broche ECHO du capteur à ultrasons HC-SR04

// Initialisation des objets
MFRC522 rfid(RFID_SDA_PIN, RFID_RST_PIN);  // Création de l'objet RFID
Servo servo;                               // Création de l'objet Servo
RTC_DS1307 rtc;                            // Création de l'objet horloge RTC
// EthernetServer server(80);              // Commenté pour désactiver Ethernet pour l'instant

// Constantes et variables de configuration
const int stepsPerRevolution = 2048;       // Nombre de pas pour une révolution complète du moteur
int stepperSpeed = 30;                     // Vitesse du moteur en tours par minute (non utilisée ici)
const int stepDelay = 5;                   // Délai entre chaque pas du moteur (en ms)
int angleOuvert = 90;                      // Angle pour ouvrir le couvercle avec le servo
int angleFerme = 0;                        // Angle pour fermer le couvercle
bool estOuvert = false;                    // État actuel du couvercle (ouvert ou fermé)

unsigned long lastMotorTime = 0;           // Dernier moment où le moteur a été activé
unsigned long motorInterval = 8UL * 60 * 60 * 1000;  // Intervalle entre activations auto (8h en ms)
unsigned long motorDuration = 10000;       // Durée d’activation du moteur (non utilisée ici)

unsigned long lastDebounceTimeInc = 0;     // Dernier moment d'appui sur le bouton +
unsigned long lastDebounceTimeDec = 0;     // Dernier moment d'appui sur le bouton -
unsigned long debounceDelay = 50;          // Anti-rebond pour les boutons (en ms)

String expectedUID = "ac1ff21";            // UID autorisé pour ouvrir le couvercle via RFID

void setup() {
  Serial.begin(9600);           // Initialisation du port série
  SPI.begin();                  // Initialisation de la communication SPI
  rfid.PCD_Init();              // Initialisation du lecteur RFID

  servo.attach(SERVO_PIN);      // Attache du servo à la broche définie
  servo.write(angleFerme);      // Position initiale du servo : fermé

  // Configuration des boutons en entrée avec résistance pull-up (+ et -)
  pinMode(BTN_INC_PIN, INPUT_PULLUP);
  pinMode(BTN_DEC_PIN, INPUT_PULLUP);

  // Configuration des broches de contrôle du moteur pas à pas
  pinMode(MOTOR_STEP_PIN, OUTPUT);
  pinMode(MOTOR_DIR_PIN, OUTPUT);
  pinMode(MOTOR_IN3_PIN, OUTPUT);
  pinMode(MOTOR_IN4_PIN, OUTPUT);

  // Configuration du capteur à ultrasons
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

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
    while (1); // Stoppe le programme si RTC non trouvé
  }

  // Vérifier si le module RTC fonctionne
  if (!rtc.isrunning()) {
    Serial.println("RTC n'est pas en marche, mise à jour de l'heure");
    // Si le RTC n'est pas en marche, on initialise avec la date/heure actuelle
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
}

void loop() {
  DateTime now = rtc.now();  // Récupération de l'heure actuelle

  // Serveur web (commenté)
  // EthernetClient client = server.available();
  // if (client) {
  //     // Code du serveur web ici
  // }

  // Activation automatique du moteur après une période définie
  if ((millis() - lastMotorTime >= motorInterval) && !estOuvert) {
    activerMoteur();
  }

  // Lecture d'une carte RFID
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    Serial.println("Puce RFID détectée !");
    if (!estOuvert) {
      // Construction de l'UID sous forme de chaîne hexadécimale
      String uid = "";
      for (byte i = 0; i < rfid.uid.size; i++) {
        uid += String(rfid.uid.uidByte[i], HEX);
      }

      // Comparaison avec l'UID autorisé
      if (uid == expectedUID) {
        Serial.println("Puce autorisée détectée !");
        servo.write(angleOuvert);  // Ouvre le couvercle
        estOuvert = true;
        Serial.println("Couvercle ouvert.");
      } else {
        Serial.println("Puce non autorisée.");
      }
    }
    delay(1000); // Attente pour éviter plusieurs lectures
  }

  // Si le couvercle est ouvert, vérifie la distance pour savoir si refermer
  long distance = mesurerDistance();
  if (estOuvert && distance > 15) { // Si rien devant (distance > 15 cm), refermer
    servo.write(angleFerme);
    estOuvert = false;
    Serial.println("Couvercle fermé.");
    delay(1000); // Pause pour laisser le temps de fermer
  }

  // Gestion du bouton d’augmentation de l’intervalle
  if (digitalRead(BTN_INC_PIN) == LOW && (millis() - lastDebounceTimeInc) > debounceDelay) {
    lastDebounceTimeInc = millis();
    if(motorInterval < 24.0 * 60 * 60 * 1000) {  // Limite supérieure : 24h
      motorInterval += 30.0 * 60 * 1000;  // +30 minutes
      Serial.print("Intervalle augmenté à : ");
      Serial.print(motorInterval / 1000 / 60 / 60); // Affiche en heures
      Serial.print("h");
      unsigned long minutes = motorInterval / 1000 / 60 % 60;
      if(minutes < 10) Serial.print("0");
      Serial.println(minutes);
      delay(1000); // Pause pour éviter double appui
    }
  }

  // Gestion du bouton de diminution de l’intervalle
  if (digitalRead(BTN_DEC_PIN) == LOW && (millis() - lastDebounceTimeDec) > debounceDelay) {
    lastDebounceTimeDec = millis();
    if (motorInterval > 30.0 * 60 * 1000) { // Limite inférieure : 30 minutes
      motorInterval -= 30.0 * 60 * 1000; // -30 minutes
      Serial.print("Intervalle réduit à : ");
      Serial.print(motorInterval / 1000 / 60 / 60); // Affiche en heures
      Serial.print("h");
      unsigned long minutes = motorInterval / 1000 / 60 % 60;
      if(minutes < 10) Serial.print("0");
      Serial.println(minutes);
      delay(1000); // Pause pour éviter double appui
    }
  }
}

// Fonction pour activer le moteur pas à pas pendant une révolution complète
void activerMoteur() {
  Serial.println("Activation du moteur pas à pas...");
  lastMotorTime = millis();  // Mise à jour du moment de dernière activation
  for (int i = 0; i < stepsPerRevolution; i++) {
    tournerUnPas();          // Effectue un pas
    delay(stepDelay);        // Petite pause entre chaque pas
  }
  Serial.println("Moteur désactivé.");
}

// Fonction pour exécuter une séquence de pas du moteur
void tournerUnPas() {
  static int stepIndex = 0;
  // Séquence de 8 demi-pas pour un moteur 28BYJ-48
  const int sequence[8][4] = {
    {1, 0, 0, 0},
    {1, 1, 0, 0},
    {0, 1, 0, 0},
    {0, 1, 1, 0},
    {0, 0, 1, 0},
    {0, 0, 1, 1},
    {0, 0, 0, 1},
    {1, 0, 0, 1}
  };

  // Application de la séquence sur les broches du moteur
  digitalWrite(MOTOR_STEP_PIN, sequence[stepIndex][0]);
  digitalWrite(MOTOR_DIR_PIN, sequence[stepIndex][1]);
  digitalWrite(MOTOR_IN3_PIN, sequence[stepIndex][2]);
  digitalWrite(MOTOR_IN4_PIN, sequence[stepIndex][3]);

  stepIndex = (stepIndex + 1) % 8; // Passage au pas suivant
}

// Fonction pour mesurer la distance à l'aide du capteur à ultrasons HC-SR04
long mesurerDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);                     // Attente brève
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);                    // Envoie un pulse de 10µs
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH);  // Mesure du temps de retour de l'écho
  long distance = duration * 0.034 / 2;     // Conversion en cm (vitesse du son : 0.034 cm/µs)
  return distance;
}