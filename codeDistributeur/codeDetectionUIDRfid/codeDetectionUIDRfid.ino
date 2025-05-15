#include <SPI.h>
#include <MFRC522.h>

// Définition des broches pour le module RFID
#define RFID_RST_PIN     9    // RST pour le module RFID
#define RFID_SDA_PIN     10   // SS (CS) pour le module RFID

// Initialisation du module RFID
MFRC522 rfid(RFID_SDA_PIN, RFID_RST_PIN);

void setup() {
  // Initialisation du moniteur série
  Serial.begin(9600);
  SPI.begin(); // Initialise l'interface SPI

  // Initialisation du module RFID
  rfid.PCD_Init();
  Serial.println("Approchez la carte RFID...");
}

void loop() {
  // Vérifie s'il y a une carte RFID présente
  if (rfid.PICC_IsNewCardPresent()) {
    // Vérifie si la carte peut être lue
    if (rfid.PICC_ReadCardSerial()) {
      // Affiche le numéro de série (UID) de la carte RFID
      Serial.print("UID de la carte RFID : ");
      
      // Création d'une chaîne pour l'UID
      String uid = "";
      
      // Affichage de l'UID byte par byte et génération de la chaîne
      for (byte i = 0; i < rfid.uid.size; i++) {
        uid += String(rfid.uid.uidByte[i], HEX);  // Convertit chaque byte en hex
      }
      
      // Affiche l'UID sous forme de chaîne continue
      Serial.println(uid);
      
      // Optionnel : si tu veux une comparaison avec une UID spécifique
      String expectedUID = "ac1ff21";  // UID attendu pour comparaison

      if (uid == expectedUID) {
        Serial.println("Puce autorisée détectée !");
        // Ajouter ici l'action à réaliser si l'UID est correct
      } else {
        Serial.println("Puce non autorisée.");
      }
      
      rfid.PICC_HaltA(); // Arrête la lecture de la carte RFID
    }
  }
}
