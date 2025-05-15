import React, { useState, useEffect } from 'react';
import styles from './FrequenceControl.module.css';

function FrequenceControl() {
    const [frequence, setFrequence] = useState(8); // Valeur par défaut dans l'UI

    // useEffect(() => {
    //     fetch('/api/Alimentation/frequence')
    //         .then(response => {
    //             if (!response.ok) {
    //                 throw new Error(`HTTP error! status: ${response.status}`);
    //             }
    //             return response.json();
    //         })
    //         .then(data => {
    //             setFrequence(data);
    //             setLoading(false);
    //         })
    //         .catch(error => {
    //             setError(error.message);
    //             setLoading(false);
    //         });
    // }, []);

    const handleChange = (event) => {
        setFrequence(parseInt(event.target.value, 10));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        console.log("Nouvelle fréquence à enregistrer:", frequence);
        alert(`Fréquence mise à jour (simulé) à ${frequence} heures !`);
        // event.preventDefault();
        // fetch('/api/Alimentation/frequence', {
        //     method: 'POST',
        //     headers: {
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify(frequence),
        // })
        // .then(response => {
        //     if (!response.ok) {
        //         throw new Error(`HTTP error! status: ${response.status}`);
        //     }
        //     alert('Fréquence mise à jour avec succès !');
        // })
        // .catch(error => {
        //     setError(error.message);
        // });
    };

    return (
        <div className={styles.container}>
            <h2 className={styles.heading}>Configuration de la fréquence d'alimentation</h2>
            <form className={styles.form} onSubmit={handleSubmit}>
                <label className={styles.label}>
                    Fréquence (en heures) :
                    <input
                        className={styles.input}
                        type="number"
                        value={frequence}
                        onChange={handleChange}
                        min="1"
                    />
                </label>
                <button className={styles.button} type="submit">Enregistrer la fréquence</button>
            </form>
            <p className={styles.paragraph}>La nourriture sera distribuée automatiquement toutes les {frequence} heures.</p>
        </div>
    );
}

export default FrequenceControl;