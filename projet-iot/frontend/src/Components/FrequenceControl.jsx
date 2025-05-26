import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import styles from './FrequenceControl.module.css';

function FrequenceControl() {
  const [totalMinutes, setTotalMinutes] = useState(480);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const ws = useRef(null);

  useEffect(() => {
    // Récupérer la fréquence actuelle au montage
    axios.get('http://localhost:3001/current-frequency')
      .then(response => {
        setTotalMinutes(response.data.intervalMs / 60000);
        setLoading(false);
      })
      .catch(err => {
        setError('Erreur lors de la récupération de la fréquence');
        setLoading(false);
      });

    // Connexion WebSocket
    ws.current = new WebSocket('ws://localhost:3001');
    ws.current.onopen = () => {
        console.log('Connexion WebSocket ouverte');
      };
    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'update_frequency') {
        setTotalMinutes(message.intervalMs / 60000);
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

  const incrementTime = () => {
    setTotalMinutes(prev => Math.min(prev + 30, 1440));
  };

  const decrementTime = () => {
    setTotalMinutes(prev => Math.max(prev - 30, 30));
  };

  const formatTime = (minutes) => {
    const heures = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${heures.toString().padStart(2, '0')} h ${mins.toString().padStart(2, '0')} min`;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    axios.post('http://localhost:3001/set-frequency', { minutes: totalMinutes })
      .then(() => {
        alert(`L'alimentation sera programmée pour ${formatTime(totalMinutes)} !`);
      })
      .catch(() => {
        setError('Erreur lors de la mise à jour de la fréquence');
      });
  };

  if (loading) return <p>Chargement...</p>;

  return (
    <div className={styles.container}>
      <h2 className={styles.heading}>Configuration de la fréquence d'alimentation</h2>
      {error && <p className={styles.error}>{error}</p>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.timeSelector}>
          <label className={styles.label}>
            Fréquence :
            <div className={styles.buttonGroup}>
              <button type="button" onClick={decrementTime}>-</button>
              <span className={styles.timeValue}>{formatTime(totalMinutes)}</span>
              <button type="button" onClick={incrementTime}>+</button>
            </div>
          </label>
        </div>
        <button className={styles.button} type="submit">Enregistrer la fréquence</button>
      </form>
      <p className={styles.paragraph}>L'alimentation sera distribuée à chaque {formatTime(totalMinutes)}.</p>
    </div>
  );
}

export default FrequenceControl;
