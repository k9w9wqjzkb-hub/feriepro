/* --- CONFIGURAZIONE ORIGINALE --- */
const ORE_GIORNO = 8;
const defaultSettings = {
    residuiAP: { ferie: 36.15, rol: 64.58249, conto: 2.00 },
    spettanteAnnuo: { ferie: 216.00, rol: 62.00, conto: 0.00 },
    annoRiferimento: 2026
};

/* --- LOGICA AGGIORNAMENTO DASHBOARD --- */
function aggiornaInterfaccia(page) {
    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
    const settings = defaultSettings; // Usa i tuoi valori predefiniti
    
    let calcoli = {
        ferie: { ap: settings.residuiAP.ferie, spet: settings.spettanteAnnuo.ferie, god: 0, pian: 0 },
        rol: { ap: settings.residuiAP.rol, spet: settings.spettanteAnnuo.rol, god: 0, pian: 0 },
        conto: { ap: settings.residuiAP.conto, spet: settings.spettanteAnnuo.conto, god: 0, pian: 0 },
        malattia: 0
    };

    movimenti.forEach(m => {
        const ore = parseFloat(m.ore) || 0;
        if (m.tipo === 'malattia') {
            calcoli.malattia += ore;
        } else if (calcoli[m.tipo]) {
            if (m.pianificato) calcoli[m.tipo].pian += ore;
            else calcoli[m.tipo].god += ore;
        }
    });

    if (page === 'dashboard') {
        /* Funzione interna per iniettare i dati nelle tue card */
        const renderCard = (valId, pianId, data) => {
            const valEl = document.getElementById(valId);
            const pianEl = document.getElementById(pianId);
            // Residuo = (Precedente + Spettante) - Goduto
            const residuo = (data.ap + data.spet - data.god) / ORE_GIORNO;
            if (valEl) valEl.innerText = residuo.toFixed(2).replace('.', ',');
            if (pianEl) pianEl.innerText = (data.pian / ORE_GIORNO).toFixed(2).replace('.', ',');
        };

        renderCard('val-ferie', 'ferie-pian', calcoli.ferie);
        renderCard('val-rol', 'rol-pian', calcoli.rol);
        renderCard('val-conto', 'conto-pian', calcoli.conto);
        
        const malEl = document.getElementById('val-malattia');
        if (malEl) malEl.innerText = (calcoli.malattia / ORE_GIORNO).toFixed(2).replace('.', ',');
    }
}

/* --- FUNZIONE SALVATAGGIO (Dalla tua modale) --- */
function saveData() {
    const t = document.getElementById('in-tipo').value;
    const o = parseFloat(document.getElementById('in-ore').value) || 0;
    const d = document.getElementById('in-data').value;
    const p = document.getElementById('in-pianificato').checked;
    
    if(!d) return alert("Inserisci la data");

    const m = JSON.parse(localStorage.getItem('movimenti')) || [];
    m.push({ tipo: t, ore: o, data: d, pianificato: p, id: Date.now() });
    localStorage.setItem('movimenti', JSON.stringify(m));
    
    location.reload(); // Ricarica per aggiornare i calcoli
}
/* ... resto delle tue funzioni (setupDate, toggleModal, renderizzaCalendario) ... */