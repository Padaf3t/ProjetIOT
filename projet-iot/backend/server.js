// backend.js

// === IMPORT DES MODULES NECESSAIRES ===

// Framework web minimaliste pour créer des API REST
const express = require('express');

// Module HTTP natif de Node.js, utilisé pour créer un serveur
const http = require('http');

// WebSocket pour la communication bidirectionnelle en temps réel avec les clients
const WebSocket = require('ws');

// Middleware pour parser les données JSON envoyées via les requêtes HTTP
const bodyParser = require('body-parser');

// Client MySQL pour interagir avec la base de données
const mysql = require('mysql2');

// Middleware pour gérer les requêtes cross-origin (CORS)
const cors = require('cors');

// Module pour gérer la communication série avec un périphérique (ex: Arduino)
const { SerialPort, ReadlineParser } = require('serialport');


// === CONSTANTES DE CONFIGURATION ===

// Chemin vers le port série utilisé par l'Arduino
const SERIAL_PORT_PATH = 'COM18';

// Vitesse de communication série (doit correspondre à celle de l'Arduino)
const BAUD_RATE = 9600;

// Informations de connexion à la base de données MySQL
const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'object'
};


// === INITIALISATION DES SERVEURS ===

// Création d'une application Express
const app = express();

// Création d'un serveur HTTP basé sur Express
const server = http.createServer(app);

// Initialisation du serveur WebSocket attaché au serveur HTTP
const wss = new WebSocket.Server({ server });


// === GESTION DES CONNEXIONS WEBSOCKET ===

// Événement déclenché lorsqu’un client WebSocket se connecte
wss.on('connection', (ws) => {
    console.log('Client WebSocket connecté');

    // Événement déclenché à la déconnexion du client
    ws.on('close', () => {
        console.log('Client WebSocket déconnecté');
    });

    // Gestion des erreurs WebSocket
    ws.on('error', (err) => {
        console.error('Erreur WS côté serveur:', err);
    });
});

// Deuxième déclaration du même événement "connection" (fusionnable avec l'autre en réalité)
wss.on('connection', (ws) => {
    // Attribut pour vérifier que le client est actif
    ws.isAlive = true;

    // Quand un pong est reçu, on note que le client est encore vivant
    ws.on('pong', () => {
        ws.isAlive = true;
    });
});

// Intervalle régulier pour envoyer des "ping" aux clients et détecter les connexions inactives
const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate(); // Si pas de réponse, fermeture de la connexion
        ws.isAlive = false; // Réinitialisation de l'état
        ws.ping(); // Envoi du ping
    });
}, 30000); // Toutes les 30 secondes

// Nettoyage du timer si le serveur WebSocket est fermé
wss.on('close', () => clearInterval(interval));


// === MIDDLEWARES EXPRESS ===

// Autoriser les requêtes cross-origin
app.use(cors());

// Parser le corps des requêtes en JSON
app.use(bodyParser.json());


// === CONNEXION A LA BASE DE DONNEES ===

// Connexion à la base de données MySQL
const db = mysql.createConnection(DB_CONFIG);
db.connect(err => {
    if (err) console.error('Erreur MySQL :', err);
    else console.log('Connecté à MySQL');
});


// === BROADCAST VIA WEBSOCKET ===

// Fonction pour envoyer des données à tous les clients connectés en WebSocket
function broadcast(data) {
    const json = JSON.stringify(data); // Transformation des données en JSON
    wss.clients.forEach(client => {
        // Envoi uniquement aux clients dont la connexion est ouverte
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}


// === COMMUNICATION SERIE AVEC L'ARDUINO ===

// Configuration du port série pour communiquer avec l’Arduino
const serialPort = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: BAUD_RATE
});

// Parser pour découper les messages terminés par un saut de ligne
const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

// Événement déclenché quand le port série est ouvert
serialPort.on('open', () => {
    console.log('Connexion série avec Arduino ouverte');
});

// Événement en cas d'erreur de communication série
serialPort.on('error', (err) => {
    console.error('Erreur série :', err.message);
});

// Traitement des données reçues de l’Arduino
parser.on('data', (line) => {
    const cleaned = line.trim(); // Nettoyage des retours chariot / espaces
    console.log('Reçu de l’Arduino:', cleaned);

    // Si l’Arduino envoie une mise à jour de fréquence
    if (cleaned.startsWith('FREQ_UPDATE:')) {
        const freqMs = parseInt(cleaned.substring('FREQ_UPDATE:'.length).trim(), 10);
        if (!isNaN(freqMs)) {
            console.log('Nouvelle fréquence reçue depuis Arduino:', freqMs);
            updateIntervalInDB(freqMs, true); // Mise à jour en BDD + envoi WS
        }
    } 
    // Si l’Arduino signale une ouverture
    else if (cleaned === 'LOG_OUVERTURE') {
        console.log('Ouverture détectée – log en base...');
        addOuverture(true); // Log en base de données + notification WS
    }
});


// === FONCTIONS DE GESTION DES DONNEES ===

// Met à jour la fréquence dans la base de données (insert ou update)
// Peut également diffuser la mise à jour via WebSocket
function updateIntervalInDB(intervalMs, broadcastChange = false) {
    db.query(
        `INSERT INTO interval_distributeur (id_int, interval_ms_int)
         VALUES (1, ?) ON DUPLICATE KEY UPDATE interval_ms_int = VALUES(interval_ms_int)`,
        [intervalMs],
        (err) => {
            if (err) console.error("Erreur DB :", err);
            else {
                console.log("Intervalle mis à jour :", intervalMs);
                if (broadcastChange) {
                    broadcast({ type: 'update_frequency', intervalMs });
                }
            }
        }
    );
}

// Enregistre ou met à jour le nombre d'ouvertures du jour
function addOuverture(broadcastChange = false) {
    const date = new Date().toISOString().slice(0, 10); // Format AAAA-MM-JJ

    // Vérifie si une entrée existe déjà pour aujourd'hui
    db.query(`SELECT * FROM ouverture_distributeur WHERE date_ouv = ?`, [date], (err, results) => {
        if (err) return console.error("Erreur DB (SELECT):", err);

        if (results.length > 0) {
            // Mise à jour du nombre d'ouvertures
            const newNbOuv = results[0].nb_ouv + 1;
            db.query(
                `UPDATE ouverture_distributeur SET nb_ouv = ? WHERE date_ouv = ?`,
                [newNbOuv, date],
                (updateErr) => {
                    if (updateErr) return console.error("Erreur DB (UPDATE):", updateErr);
                    console.log(`Ouverture du ${date} mise à jour à ${newNbOuv}`);
                    if (broadcastChange) broadcast({ type: 'update_ouverture', nb_ouv: newNbOuv, date_ouv: date });
                }
            );
        } else {
            // Première ouverture de la journée
            db.query(
                `INSERT INTO ouverture_distributeur (date_ouv, nb_ouv) VALUES (?, ?)`,
                [date, 1],
                (insertErr) => {
                    if (insertErr) return console.error("Erreur DB (INSERT):", insertErr);
                    console.log(`Ouverture enregistrée pour la première fois à la date ${date}`);
                    if (broadcastChange) broadcast({ type: 'update_ouverture', nb_ouv: 1, date_ouv: date });
                }
            );
        }
    });
}


// === ROUTES EXPRESS POUR LE FRONTEND ===

// Route POST pour définir une nouvelle fréquence (en minutes)
app.post('/set-frequency', (req, res) => {
    const { minutes } = req.body;

    // Validation de l'entrée
    if (typeof minutes !== 'number' || minutes <= 0 || minutes > 1440) {
        return res.status(400).json({ error: 'La fréquence doit être entre 1 et 1440 minutes.' });
    }

    const ms = minutes * 60 * 1000; // Conversion en millisecondes

    // Envoi de la nouvelle fréquence à l’Arduino via le port série
    serialPort.write(`FREQ:${ms}\n`, (err) => {
        if (err) {
            console.error("Erreur d'envoi série :", err);
            return res.status(500).send("Erreur d'envoi vers Arduino.");
        }

        // Mise à jour en BDD et diffusion WS
        updateIntervalInDB(ms, true);
        res.send("Fréquence mise à jour.");
    });
});

// Route GET pour obtenir la fréquence actuelle depuis la BDD
app.get('/current-frequency', (req, res) => {
    db.query("SELECT interval_ms_int FROM interval_distributeur WHERE id_int = 1", (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ error: "Non trouvé." });
        }
        res.json({ intervalMs: results[0].interval_ms_int });
    });
});

// Route GET pour obtenir les logs d’ouvertures triés par date
app.get('/logs-ouvertures', (req, res) => {
    db.query("SELECT * FROM ouverture_distributeur ORDER BY date_ouv DESC", (err, results) => {
        if (err) return res.status(500).json({ error: "Erreur récupération." });

        // Formatage des dates avant envoi au client
        const formattedResults = results.map(row => ({
            ...row,
            date_ouv: row.date_ouv.toISOString().slice(0, 10)
        }));

        res.json(formattedResults);
    });
});


// === LANCEMENT DU SERVEUR ===

// Le serveur écoute sur le port 3001
server.listen(3001, () => {
    console.log(`Backend démarré sur http://localhost:3001`);
});
