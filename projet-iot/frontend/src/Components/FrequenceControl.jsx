// === IMPORT DES MODULES ===
import React, { useState, useEffect, useRef } from 'react'; // React + hooks
import axios from 'axios';                                  // Client HTTP pour faire des requêtes à l’API
import styles from './FrequenceControl.module.css';         // Import des styles CSS modulaires

// === COMPOSANT PRINCIPAL ===
function FrequenceControl() {
  // État local pour stocker le nombre total de minutes (fréquence d’alimentation)
  const [totalMinutes, setTotalMinutes] = useState(480); // 480 min = 8 heures (valeur par défaut)

  // État pour gérer les erreurs éventuelles
  const [error, setError] = useState(null);

  // État pour indiquer si la donnée est en cours de chargement
  const [loading, setLoading] = useState(true);

  // Référence au WebSocket, stockée dans un useRef (persistant entre rendus)
  const ws = useRef(null);

  // === useEffect #1 : Chargement initial + Connexion WebSocket ===
  useEffect(() => {
    // Appel API pour récupérer la fréquence actuelle depuis le backend
    axios.get('http://localhost:3001/current-frequency')
      .then(response => {
        // Conversion des millisecondes en minutes
        setTotalMinutes(response.data.intervalMs / 60000);
        setLoading(false); // Fin du chargement
      })
      .catch(err => {
        // Gestion d’erreur lors de la récupération des données
        setError('Erreur lors de la récupération de la fréquence');
        setLoading(false);
      });

    // === Initialisation du WebSocket ===
    ws.current = new WebSocket('ws://localhost:3001');

    // Quand la connexion WebSocket est établie
    ws.current.onopen = () => {
        console.log('Connexion WebSocket ouverte');
    };

    // Lors de la réception d’un message WebSocket
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data); // On parse les données reçues

      // Si c’est une mise à jour de la fréquence
      if (message.type === 'update_frequency') {
        setTotalMinutes(message.intervalMs / 60000); // Mise à jour de l’état
      }
    };

    // Gestion de la fermeture de la connexion WebSocket
    ws.current.onclose = () => {
        console.log('Connexion WebSocket fermée');
    };

    // Nettoyage lors du démontage du composant
    return () => {
      if (ws.current) {
        ws.current.close(); // Fermeture propre de la connexion WebSocket
      }
    };
  }, []); // Exécuté une seule fois au montage


  // === useEffect #2 : Tentative de reconnexion WebSocket (non finalisée ici) ===
  useEffect(() => {
    // Timer pour retenter une connexion après un délai
    const timer = setTimeout(() => {
      ws.current = new WebSocket('ws://localhost:3001');
    }, 500); // Délai de 500 ms

    // Nettoyage du timer au démontage
    return () => clearTimeout(timer);
  }, []); // Exécuté aussi au montage (peut créer un double appel)


  // === Fonctions pour augmenter ou diminuer la fréquence par pas de 30 minutes ===

  // Ajoute 30 minutes, sans dépasser 1440 min (24h)
  const incrementTime = () => {
    setTotalMinutes(prev => Math.min(prev + 30, 1440));
  };

  // Retire 30 minutes, sans descendre en dessous de 30 min
  const decrementTime = () => {
    setTotalMinutes(prev => Math.max(prev - 30, 30));
  };

  // Formate les minutes en "hh h mm min" (ex : 02 h 30 min)
  const formatTime = (minutes) => {
    const heures = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${heures.toString().padStart(2, '0')} h ${mins.toString().padStart(2, '0')} min`;
  };


  // === Soumission du formulaire ===
  const handleSubmit = (event) => {
    event.preventDefault(); // Empêche le rechargement de la page

    // Envoi de la nouvelle fréquence au backend
    axios.post('http://localhost:3001/set-frequency', { minutes: totalMinutes })
      .then(() => {
        // Message de confirmation
        alert(`L'alimentation sera programmée pour ${formatTime(totalMinutes)} !`);
      })
      .catch(() => {
        // Gestion d’erreur si la requête échoue
        setError('Erreur lors de la mise à jour de la fréquence');
      });
  };


  // === Affichage conditionnel pendant le chargement ===
  if (loading) return <p>Chargement...</p>;

  // === Rendu JSX du composant ===
  return (
    <div className={styles.container}>
      {/* Titre principal */}
      <h2 className={styles.heading}>Configuration de la fréquence d'alimentation</h2>

      {/* Affichage de l’erreur s’il y en a une */}
      {error && <p className={styles.error}>{error}</p>}

      {/* Formulaire de configuration */}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.timeSelector}>
          <label className={styles.label}>
            Fréquence :
            <div className={styles.buttonGroup}>
              {/* Bouton pour diminuer */}
              <button type="button" onClick={decrementTime}>-</button>

              {/* Affichage de l’heure formatée */}
              <span className={styles.timeValue}>{formatTime(totalMinutes)}</span>

              {/* Bouton pour augmenter */}
              <button type="button" onClick={incrementTime}>+</button>
            </div>
          </label>
        </div>

        {/* Bouton de soumission */}
        <button className={styles.button} type="submit">Enregistrer la fréquence</button>
      </form>

      {/* Résumé de la configuration actuelle */}
      <p className={styles.paragraph}>
        L'alimentation sera distribuée à chaque {formatTime(totalMinutes)}.
      </p>
    </div>
  );
}

// === EXPORT DU COMPOSANT ===
export default FrequenceControl;
