import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styles from './OuverturesTable.module.css';

function OuverturesTable() {
    const [logs, setLogs] = useState([]);
    const [error, setError] = useState('');

    // Fonction pour récupérer les logs d'ouvertures
    const fetchLogs = async () => {
        try {
            const response = await axios.get('http://localhost:3001/logs-ouvertures');
            setLogs(response.data); // On met à jour l'état avec les logs
        } catch (err) {
            setError('Erreur lors de la récupération des logs d\'ouverture');
            console.error(err);
        }
    };

    // Utilisation de useEffect pour charger les logs lors du montage du composant
    useEffect(() => {
        fetchLogs();
    }, []);

    return (
        <div className={styles.container}>
            <h2 className={styles.heading}>Logs d'Ouverture</h2>

            {/* Affichage des erreurs éventuelles */}
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
                        logs.map((log, index) => (
                            <tr key={index}>
                                <td>{log.date_ouv}</td>
                                <td>{log.nb_ouv}</td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan="2">Aucun log trouvé</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

export default OuverturesTable;
