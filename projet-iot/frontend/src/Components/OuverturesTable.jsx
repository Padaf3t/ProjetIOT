import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import styles from './OuverturesTable.module.css';

function OuverturesTable() {
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState('');
  const ws = useRef(null);

  // Charger les logs au montage
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await axios.get('http://localhost:3001/logs-ouvertures');
        setLogs(response.data);
      } catch {
        setError('Erreur lors de la récupération des logs d\'ouverture');
      }
    };

    fetchLogs();

    // Connexion WebSocket
    ws.current = new WebSocket('ws://localhost:3001');
    ws.current.onopen = () => {
        console.log('Connexion WebSocket ouverte');
      };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'update_ouverture') {
        setLogs(prevLogs => {
          // Mise à jour si date existe déjà, sinon ajout d’une nouvelle entrée
          const idx = prevLogs.findIndex(log => log.date_ouv === message.date_ouv);
          if (idx !== -1) {
            const updatedLogs = [...prevLogs];
            updatedLogs[idx].nb_ouv = message.nb_ouv;
            return updatedLogs;
          } else {
            return [{ date_ouv: message.date_ouv, nb_ouv: message.nb_ouv }, ...prevLogs];
          }
        });
      }
    };

    //ws.current.onerror = () => setError('Erreur de connexion WebSocket');
    ws.current.onclose = () => {
        console.log('Connexion WebSocket fermée');
      };
      return () => {
        if (ws.current) {
          ws.current.close();
        }
      };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      ws.current = new WebSocket('ws://localhost:3001');
      // ... setup handlers ici
    }, 500); // 500ms delay
  
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Logs d'Ouverture</h2>
      {error && <div className={styles.error}>{error}</div>}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Nombre d'ouvertures</th>
          </tr>
        </thead>
        <tbody>
          {logs.length > 0 ? (
            logs.map((log, i) => (
              <tr key={i}>
                <td>{log.date_ouv}</td>
                <td>{log.nb_ouv}</td>
              </tr>
            ))
          ) : (
            <tr><td colSpan="2">Aucun log trouvé</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default OuverturesTable;
