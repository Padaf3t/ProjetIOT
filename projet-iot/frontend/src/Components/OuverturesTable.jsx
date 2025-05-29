// === IMPORT DES MODULES REQUIS ===
import React, { useState, useEffect, useRef } from 'react';  // React + hooks
import axios from 'axios';                                   // Pour les requêtes HTTP
import styles from './OuverturesTable.module.css';           // Styles CSS modulaires

// === COMPOSANT PRINCIPAL ===
function OuverturesTable() {
  // État contenant les logs d'ouvertures (tableau de dates + nb d'ouvertures)
  const [logs, setLogs] = useState([]);

  // État pour stocker un éventuel message d'erreur
  const [error, setError] = useState('');

  // Référence persistante à l’objet WebSocket
  const ws = useRef(null);

  // === useEffect principal : récupération initiale + WebSocket ===
  useEffect(() => {
    // Fonction asynchrone pour récupérer les logs depuis l’API backend
    const fetchLogs = async () => {
      try {
        // Requête GET vers l'endpoint des logs
        const response = await axios.get('http://localhost:3001/logs-ouvertures');

        // Mise à jour de l'état avec les données reçues
        setLogs(response.data);
      } catch {
        // En cas d’échec, afficher une erreur
        setError('Erreur lors de la récupération des logs d\'ouverture');
      }
    };

    // Exécution de la fonction au montage
    fetchLogs();

    // === Connexion WebSocket à l’API backend ===
    ws.current = new WebSocket('ws://localhost:3001');

    // Événement déclenché quand la connexion WebSocket s'ouvre
    ws.current.onopen = () => {
        console.log('Connexion WebSocket ouverte');
    };

    // Événement déclenché lorsqu’un message est reçu via WebSocket
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data); // On parse les données

      // Si le message indique une mise à jour d’ouverture
      if (message.type === 'update_ouverture') {
        setLogs(prevLogs => {
          // Cherche si une entrée existe déjà pour cette date
          const idx = prevLogs.findIndex(log => log.date_ouv === message.date_ouv);

          if (idx !== -1) {
            // Si l’entrée existe, on met à jour le nombre d’ouvertures
            const updatedLogs = [...prevLogs];
            updatedLogs[idx].nb_ouv = message.nb_ouv;
            return updatedLogs;
          } else {
            // Sinon, on ajoute une nouvelle entrée en début de tableau
            return [{ date_ouv: message.date_ouv, nb_ouv: message.nb_ouv }, ...prevLogs];
          }
        });
      }
    };

    // Événement déclenché quand la connexion WebSocket se ferme
    ws.current.onclose = () => {
        console.log('Connexion WebSocket fermée');
    };

    // Nettoyage à la destruction du composant
    return () => {
      if (ws.current) {
        ws.current.close(); // Fermeture propre de la connexion
      }
    };
  }, []); // Ne s’exécute qu’au montage


  // === Deuxième effet : reconnexion WebSocket après délai (incomplet) ===
  useEffect(() => {
    // Timer de 500 ms pour déclencher une reconnexion
    const timer = setTimeout(() => {
      ws.current = new WebSocket('ws://localhost:3001');
    }, 500); // Délai en ms

    // Nettoyage du timer si le composant est démonté entre-temps
    return () => clearTimeout(timer);
  }, []); // Exécuté aussi une seule fois


  // === RENDU DU COMPOSANT ===
  return (
    <div className={styles.container}>
      {/* Titre principal */}
      <h2 className={styles.heading}>Logs d'Ouverture</h2>

      {/* Affichage d’un message d’erreur s’il y en a un */}
      {error && <div className={styles.error}>{error}</div>}

      {/* Table HTML avec en-têtes et contenu dynamique */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Nombre d'ouvertures</th>
          </tr>
        </thead>
        <tbody>
          {/* Si des logs sont présents, on les affiche */}
          {logs.length > 0 ? (
            logs.map((log, i) => (
              <tr key={i}>
                <td>{log.date_ouv}</td>
                <td>{log.nb_ouv}</td>
              </tr>
            ))
          ) : (
            // Si aucun log trouvé, on affiche une ligne vide informative
            <tr><td colSpan="2">Aucun log trouvé</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// === EXPORT DU COMPOSANT POUR UTILISATION EXTERNE ===
export default OuverturesTable;
