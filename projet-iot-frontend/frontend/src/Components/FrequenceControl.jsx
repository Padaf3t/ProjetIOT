import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from './FrequenceControl.module.css';

function FrequenceControl() {
    const [totalMinutes, setTotalMinutes] = useState(480);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fonction pour récupérer la fréquence actuelle depuis le backend
    useEffect(() => {
        console.log('Fetching the current frequency...');  // Ajout du log pour déboguer
        axios.get('http://localhost:3001/current-frequency') // Assure-toi d'utiliser l'URL correcte
            .then(response => {
                console.log('Réponse de l\'API:', response.data);  // Log pour afficher la réponse
                setTotalMinutes(response.data.intervalMs / 60000);  // Convertir les millisecondes en minutes
                setLoading(false);
            })
            .catch(err => {
                console.error('Erreur lors de la récupération de la fréquence:', err);  // Log d'erreur
                setError('Erreur lors de la récupération de la fréquence');
                setLoading(false);
            });
    }, []);  // Le tableau vide [] signifie que ce code s'exécute uniquement au premier rendu

    // Fonction pour incrémenter la fréquence
    const incrementTime = () => {
        setTotalMinutes(prevMinutes => {
            let newTotal = prevMinutes + 30;
            if (newTotal > 24 * 60) { // 24 heures * 60 minutes = 1440 minutes
                newTotal = 24 * 60; // Bloquer à 24h00
            }
            return newTotal;
        });
    };

    // Fonction pour décrémenter la fréquence
    const decrementTime = () => {
        setTotalMinutes(prevMinutes => {
            let newTotal = prevMinutes - 30;
            if (newTotal < 30) {
                newTotal = 30; // Bloquer à 0h30
            }
            return newTotal;
        });
    };

    // Formatage de la fréquence en heures et minutes
    const formatTime = (minutes) => {
        const heures = Math.floor(minutes / 60);
        const minutesRestantes = minutes % 60;
        const heuresFormattees = heures < 10 ? `0${heures}` : heures;
        const minutesRestantesFormattees = minutesRestantes < 10 ? `0${minutesRestantes}` : minutesRestantes;
        return `${heuresFormattees} h ${minutesRestantesFormattees} min`;
    };

    // Fonction pour soumettre la nouvelle fréquence au backend
    const handleSubmit = (event) => {
        event.preventDefault();

        const intervalMs = totalMinutes * 60 * 1000;  // Convertir en millisecondes

        // Envoi de la nouvelle fréquence au backend
        axios.post('http://localhost:3001/set-frequency', { minutes: totalMinutes })
            .then(response => {
                alert(`L'alimentation sera programmée pour ${formatTime(totalMinutes)} !`);
            })
            .catch(err => {
                console.error("Erreur lors de l'enregistrement de la fréquence", err);
                setError('Erreur lors de la mise à jour de la fréquence');
            });
    };

    // Affichage pendant le chargement
    if (loading) {
        return <p>Chargement...</p>;
    }

    return (
        <div className={styles.container}>
            <h2 className={styles.heading}>Configuration de la fréquence d'alimentation</h2>

            {/* Affichage des erreurs éventuelles */}
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
