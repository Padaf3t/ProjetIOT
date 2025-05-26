// backend.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const cors = require('cors');
const { SerialPort, ReadlineParser } = require('serialport');

// CONFIG
const SERIAL_PORT_PATH = 'COM18';
const BAUD_RATE = 9600;
const DB_CONFIG = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'object'
};

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
    console.log('Client WebSocket connecté');

    ws.on('close', () => {
        console.log('Client WebSocket déconnecté');
    });

    ws.on('error', (err) => {
        console.error('Erreur WS côté serveur:', err);
    });
});
wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
}
);

const interval = setInterval(() => {
    wss.clients.forEach(ws => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => clearInterval(interval));

app.use(cors());
app.use(bodyParser.json());

const db = mysql.createConnection(DB_CONFIG);
db.connect(err => {
    if (err) console.error('Erreur MySQL :', err);
    else console.log('Connecté à MySQL');
});

// WebSocket broadcast helper
function broadcast(data) {
    const json = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}

// SerialPort setup
const serialPort = new SerialPort({
    path: SERIAL_PORT_PATH,
    baudRate: BAUD_RATE
});
const parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

serialPort.on('open', () => {
    console.log('Connexion série avec Arduino ouverte');
});

serialPort.on('error', (err) => {
    console.error('Erreur série :', err.message);
});

parser.on('data', (line) => {
    const cleaned = line.trim();
    console.log('Reçu de l’Arduino:', cleaned);

    if (cleaned.startsWith('FREQ_UPDATE:')) {
        const freqMs = parseInt(cleaned.substring('FREQ_UPDATE:'.length).trim(), 10);
        if (!isNaN(freqMs)) {
            console.log('Nouvelle fréquence reçue depuis Arduino:', freqMs);
            updateIntervalInDB(freqMs, true);
        }
    } else if (cleaned === 'LOG_OUVERTURE') {
        console.log('Ouverture détectée – log en base...');
        addOuverture(true);
    }
});

// Mise à jour fréquence (avec option broadcast WS)
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

// Log ouverture (avec option broadcast WS)
function addOuverture(broadcastChange = false) {
    const date = new Date().toISOString().slice(0, 10);
    db.query(`SELECT * FROM ouverture_distributeur WHERE date_ouv = ?`, [date], (err, results) => {
        if (err) return console.error("Erreur DB (SELECT):", err);

        if (results.length > 0) {
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

// Routes Express
app.post('/set-frequency', (req, res) => {
    const { minutes } = req.body;
    if (typeof minutes !== 'number' || minutes <= 0 || minutes > 1440) {
        return res.status(400).json({ error: 'La fréquence doit être entre 1 et 1440 minutes.' });
    }
    const ms = minutes * 60 * 1000;

    serialPort.write(`FREQ:${ms}\n`, (err) => {
        if (err) {
            console.error("Erreur d'envoi série :", err);
            return res.status(500).send("Erreur d'envoi vers Arduino.");
        }

        updateIntervalInDB(ms, true);
        res.send("Fréquence mise à jour.");
    });
});

app.get('/current-frequency', (req, res) => {
    db.query("SELECT interval_ms_int FROM interval_distributeur WHERE id_int = 1", (err, results) => {
        if (err || results.length === 0) {
            return res.status(500).json({ error: "Non trouvé." });
        }
        res.json({ intervalMs: results[0].interval_ms_int });
    });
});

app.get('/logs-ouvertures', (req, res) => {
    db.query("SELECT * FROM ouverture_distributeur ORDER BY date_ouv DESC", (err, results) => {
        if (err) return res.status(500).json({ error: "Erreur récupération." });

        const formattedResults = results.map(row => ({
            ...row,
            date_ouv: row.date_ouv.toISOString().slice(0, 10) // format YYYY-MM-DD
        }));

        res.json(formattedResults);
    });
});

server.listen(3001, () => {
    console.log(`Backend démarré sur http://localhost:3001`);
});
