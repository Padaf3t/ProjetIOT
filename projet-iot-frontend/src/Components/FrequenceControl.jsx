import React, { useState, useEffect } from 'react';
import styles from './FrequenceControl.module.css';

function FrequenceControl() {
    const [totalMinutes, setTotalMinutes] = useState(480);

    const incrementTime = () => {
        setTotalMinutes(prevMinutes => {
            let newTotal = prevMinutes + 30;
            if (newTotal > 24 * 60) { // 24 heures * 60 minutes = 1440 minutes
                newTotal = 24 * 60; // Bloquer à 24h00
            }
            return newTotal;
        });
    };

    const decrementTime = () => {
        setTotalMinutes(prevMinutes => {
            let newTotal = prevMinutes - 30;
            if (newTotal < 30) {
                newTotal = 30; // Bloquer à 0h30
            }
            return newTotal;
        });
    };

    const formatTime = (minutes) => {
        const heures = Math.floor(minutes / 60);
        const minutesRestantes = minutes % 60;
        const heuresFormattees = heures < 10 ? `0${heures}` : heures;
        const minutesRestantesFormattees = minutesRestantes < 10 ? `0${minutesRestantes}` : minutesRestantes;
        return `${heuresFormattees} h ${minutesRestantesFormattees} min`;
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        const heureFormattee = formatTime(totalMinutes);
        console.log("Heure d'alimentation sélectionnée:", heureFormattee);
        alert(`L'alimentation sera programmée pour ${heureFormattee} ! (Simulé)`);
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.heading}>Configuration de la fréquence d'alimentation</h2>
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