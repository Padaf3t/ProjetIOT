const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');

// CONFIGURATION
const ARDUINO_IP = 'http://192.168.1.177'; // IP de ton Arduino
const DB_CONFIG = {
    host: 'localhost',
    user: 'ton_user',
    password: 'ton_mot_de_passe',
    database: 'ta_base'
};

const app = express();
const port = 3001;

// Utilisation de CORS pour permettre les requêtes depuis ton frontend
app.use(cors());

// Middleware pour parser le corps des requêtes JSON
app.use(bodyParser.json());

// Connexion à MySQL
const db = mysql.createConnection(DB_CONFIG);
db.connect(err => {
    if (err) {
        console.error('Erreur de connexion MySQL :', err);
    } else {
        console.log('Connecté à MySQL');
    }
});

// Mise à jour de la fréquence sur l'Arduino via HTTP
app.post('/set-frequency', (req, res) => {
    const { minutes } = req.body;

    // Valider que la fréquence est un nombre valide (entre 1 et 1440 minutes)
    if (typeof minutes !== 'number' || minutes <= 0 || minutes > 1440) {
        return res.status(400).json({ error: 'La fréquence doit être un nombre entier compris entre 1 et 1440.' });
    }

    const milliseconds = minutes * 60 * 1000;

    // Envoi de la fréquence à l'Arduino via HTTP
    axios.get(`${ARDUINO_IP}/set-frequency?frequency=${milliseconds}`)
        .then(response => {
            console.log('Réponse Arduino:', response.data);
            // Mise à jour de la base de données
            updateIntervalInDB(milliseconds);
            res.send("Fréquence mise à jour.");
        })
        .catch(err => {
            console.error("Erreur lors de la mise à jour :", err);
            res.status(500).send("Erreur lors de la mise à jour.");
        });
});

// Mise à jour de l'intervalle dans la base de données
function updateIntervalInDB(intervalMs) {
    db.query(
        `INSERT INTO interval_distributeur (id_int, interval_ms_int)
         VALUES (1, ?) ON DUPLICATE KEY UPDATE interval_ms_int = VALUES(interval_ms_int)`,
        [intervalMs],
        (err) => {
            if (err) console.error("Erreur lors de la mise à jour de l'intervalle :", err);
            else console.log("Intervalle mis à jour dans la base de données :", intervalMs);
        }
    );
}

// API pour récupérer la fréquence actuelle de la base de données
app.get('/current-frequency', (req, res) => {
    db.query("SELECT interval_ms_int FROM interval_distributeur WHERE id_int = 1", (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ error: "Intervalle non trouvé." });
        }
        res.json({ intervalMs: results[0].interval_ms_int });
    });
});

// API pour enregistrer une ouverture du distributeur
app.post('/log-ouverture', (req, res) => {
    const date = new Date().toISOString().slice(0, 10); // Formater la date au format "yyyy-mm-dd"
    
    // Vérifier si une entrée pour la date actuelle existe déjà
    db.query(
        `SELECT * FROM ouverture_distributeur WHERE date_ouv = ?`,
        [date],
        (err, results) => {
            if (err) {
                return res.status(500).json({ error: "Erreur lors de la récupération des logs d'ouvertures." });
            }

            if (results.length > 0) {
                // L'entrée pour cette date existe, donc on incrémente
                const newNbOuv = results[0].nb_ouv + 1;

                // Mettre à jour la valeur du nombre d'ouvertures pour cette date
                db.query(
                    `UPDATE ouverture_distributeur SET nb_ouv = ? WHERE date_ouv = ?`,
                    [newNbOuv, date],
                    (updateErr) => {
                        if (updateErr) {
                            return res.status(500).json({ error: "Erreur lors de l'incrémentation du nombre d'ouvertures." });
                        }
                        res.json({ message: "Nombre d'ouvertures mis à jour.", nb_ouv: newNbOuv });
                    }
                );
            } else {
                // L'entrée pour cette date n'existe pas, donc on crée une nouvelle entrée
                db.query(
                    `INSERT INTO ouverture_distributeur (date_ouv, nb_ouv) VALUES (?, ?)`,
                    [date, 1],
                    (insertErr) => {
                        if (insertErr) {
                            return res.status(500).json({ error: "Erreur lors de l'enregistrement du log d'ouverture." });
                        }
                        res.json({ message: "Nouvelle ouverture enregistrée.", nb_ouv: 1 });
                    }
                );
            }
        }
    );
});

// API pour récupérer les logs d'ouverture
app.get('/logs-ouvertures', (req, res) => {
    db.query("SELECT * FROM ouverture_distributeur ORDER BY date_ouv DESC", (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Erreur lors de la récupération des logs." });
        }
        res.json(results); // Envoie les logs d'ouvertures au frontend
    });
});

// Lancer le serveur
app.listen(port, () => {
    console.log(`Serveur backend démarré sur http://localhost:${port}`);
});
