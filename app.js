/* --- CONFIGURAZIONE E SERVICE WORKER --- */
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log("iWork: Pronto per l'uso offline"))
        .catch((err) => console.log("Errore SW:", err));
}

const ORE_GIORNO = 8;
const defaultSettings = {
    residuiAP: { ferie: 36.15000, rol: 64.58249, conto: 2.00000 },
    spettanteAnnuo: { ferie: 216.00000, rol: 62.00000, conto: 0.00000 },
    dataInizioConteggio: "2026-01-01",
    annoRiferimento: 2026
};

const FESTIVITA_2026 = [
    "2026-01-01", "2026-01-06", "2026-04-05", "2026-04-06", 
    "2026-04-25", "2026-05-01", "2026-06-02", "2026-08-15", 
    "2026-11-01", "2026-12-08", "2026-12-25", "2026-12-26"
];

/* --- INIZIALIZZAZIONE --- */
document.addEventListener('DOMContentLoaded', () => {
    initSettings();
    const activePage = document.body.getAttribute('data-page');
    
    setupDate();
    aggiornaInterfaccia(activePage); 

    if (activePage === 'calendario') {
        renderizzaCalendario();
    } else if (activePage === 'malattia' || activePage === 'ferie') {
        renderizzaListaSpecifica(activePage);
    }
});

/* --- LOGICA CALENDARIO --- */
function renderizzaCalendario() {
    const tableBody = document.getElementById('calendarBody');
    const tableHeader = document.getElementById('calendarHeader');
    if (!tableBody) return;

    const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUGL", "AGO", "SET", "OTT", "NOV", "DIC"];
    const anno = 2026; 
    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];

    let headerHtml = `<th class="col-mese">${anno}</th>`;
    for (let i = 1; i <= 31; i++) headerHtml += `<th>${i}</th>`;
    tableHeader.innerHTML = headerHtml;

    tableBody.innerHTML = '';
    mesi.forEach((nomeMese, indexMese) => {
        let riga = `<tr><td class="col-mese">${nomeMese}</td>`;
        for (let giorno = 1; giorno <= 31; giorno++) {
            const dataCorrente = new Date(anno, indexMese, giorno, 12, 0, 0);
            
            if (dataCorrente.getMonth() !== indexMese) {
                riga += `<td style="background:#F2F2F7;"></td>`;
                continue;
            }

            const y = dataCorrente.getFullYear();
            const m = String(dataCorrente.getMonth() + 1).padStart(2, '0');
            const d = String(dataCorrente.getDate()).padStart(2, '0');
            const dataLocale = `${y}-${m}-${d}`;

            const giornoSett = dataCorrente.getDay(); 
            let classeCella = "";
            let contenuto = "";

            if (giornoSett === 6) classeCella = "bg-sabato";
            if (giornoSett === 0) classeCella = "bg-domenica";
            if (FESTIVITA_2026.includes(dataLocale)) classeCella = "bg-festivo";

            const movGiorno = movimenti.find(mov => mov.data === dataLocale);
            if (movGiorno) {
                switch(movGiorno.tipo) {
                    case 'ferie': classeCella = "bg-ferie-ind"; contenuto = "F"; break;
                    case 'ferie_az': classeCella = "bg-ferie-coll"; contenuto = "A"; break;
                    case 'malattia': classeCella = "bg-malattia"; contenuto = "M"; break;
                    case 'avis': classeCella = "bg-avis"; contenuto = "AV"; break;
                    case 'rol':
                    case 'conto':
                        contenuto = `<span class="text-rol">${movGiorno.ore.toString().replace('.', ',')}</span>`;
                        break;
                }
            }
            riga += `<td class="${classeCella}">${contenuto}</td>`;
        }
        riga += `</tr>`;
        tableBody.innerHTML += riga;
    });
}

/* --- LOGICA RENDERING LISTE (MODIFICA/ELIMINA ATTIVI) --- */
function renderizzaListaSpecifica(page) {
    const container = document.getElementById(page === 'malattia' ? 'lista-malattia' : 'lista-ferie');
    if (!container) return;

    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
    const filtrati = movimenti.filter(m => 
        page === 'malattia' ? m.tipo === 'malattia' : (m.tipo === 'ferie' || m.tipo === 'ferie_az' || m.tipo === 'rol')
    ).sort((a, b) => new Date(b.data) - new Date(a.data));

    let html = '';
    filtrati.forEach(m => {
        const label = m.tipo === 'ferie_az' ? 'FERIE AZ.' : m.tipo.toUpperCase();
        const badgeColor = m.tipo === 'malattia' ? 'var(--purple)' : (m.tipo === 'rol' ? 'var(--orange)' : 'var(--blue)');
        
        html += `
            <div class="ios-input-row" style="justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 16px;">${new Date(m.data).toLocaleDateString('it-IT')}</span>
                    <span style="border: 1px dashed ${badgeColor}; color: ${badgeColor}; font-size: 10px; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${label}</span>
                    ${m.pianificato ? '<span style="color: var(--orange); font-size: 14px;">●</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-weight: 700; font-size: 16px;">${parseFloat(m.ore).toFixed(2)}h</span>
                    <button onclick="editRecord(${m.id})" class="btn-link" style="padding:0; font-size:18px;">✏️</button>
                    <button onclick="deleteRecord(${m.id})" class="btn-link" style="padding:0; font-size:18px;">🗑️</button>
                </div>
            </div>`;
    });

    container.innerHTML = html || '<div style="padding:20px; text-align:center; color:#8E8E93;">Nessun record</div>';
}

/* --- FUNZIONI AZIONE (ELIMINA E MODIFICA) --- */
function deleteRecord(id) {
    if (confirm("Vuoi eliminare definitivamente questo inserimento?")) {
        let m = JSON.parse(localStorage.getItem('movimenti')) || [];
        m = m.filter(item => item.id !== id);
        localStorage.setItem('movimenti', JSON.stringify(m));
        location.reload();
    }
}

function editRecord(id) {
    const m = JSON.parse(localStorage.getItem('movimenti')) || [];
    const record = m.find(item => item.id === id);
    if (record) {
        document.getElementById('in-tipo').value = record.tipo;
        document.getElementById('in-ore').value = record.ore;
        document.getElementById('in-data').value = record.data;
        document.getElementById('in-pianificato').checked = record.pianificato;
        
        // Trasforma il tasto salva in "Aggiorna"
        const saveBtn = document.querySelector('.modal-nav button[onclick="saveData()"]');
        saveBtn.innerText = "Aggiorna";
        saveBtn.setAttribute('onclick', `updateRecord(${id})`);
        
        toggleModal(true);
    }
}

function updateRecord(id) {
    let m = JSON.parse(localStorage.getItem('movimenti')) || [];
    const index = m.findIndex(item => item.id === id);
    
    if (index !== -1) {
        m[index] = {
            tipo: document.getElementById('in-tipo').value,
            ore: parseFloat(document.getElementById('in-ore').value) || 0,
            data: document.getElementById('in-data').value,
            pianificato: document.getElementById('in-pianificato').checked,
            id: id // mantiene lo stesso ID
        };
        localStorage.setItem('movimenti', JSON.stringify(m));
        location.reload();
    }
}

/* --- AGGIORNAMENTO DASHBOARD E CARD --- */
function aggiornaInterfaccia(page) {
    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
    const settings = getSettings();
    
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
        } else {
            let t = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
            if (calcoli[t]) {
                if (m.pianificato) calcoli[t].pian += ore;
                else calcoli[t].god += ore;
            }
        }
    });

    // Aggiorna Card Principali
    const updateCard = (idVal, idPian, obj) => {
        const valEl = document.getElementById(idVal);
        const pianEl = document.getElementById(idPian);
        const totaleOre = (obj.ap + obj.spet - obj.god);
        if(valEl) valEl.innerText = (totaleOre / ORE_GIORNO).toFixed(2).replace('.', ',');
        if(pianEl) pianEl.innerText = ((totaleOre - obj.pian) / ORE_GIORNO).toFixed(2).replace('.', ',');
    };

    updateCard('val-ferie', 'ferie-pian', calcoli.ferie);
    updateCard('val-rol', 'rol-pian', calcoli.rol);
    
    const elConto = document.getElementById('val-conto');
    if(elConto) elConto.innerText = (calcoli.conto.ap / ORE_GIORNO).toFixed(2).replace('.', ',');

    const elMal = document.getElementById('total-malattia') || document.getElementById('val-malattia');
    if(elMal) elMal.innerText = (calcoli.malattia / ORE_GIORNO).toFixed(2).replace('.', ',');
}

/* --- SALVATAGGIO --- */
function saveData() {
    const t = document.getElementById('in-tipo').value;
    const o = parseFloat(document.getElementById('in-ore').value) || 0;
    const d = document.getElementById('in-data').value;
    const p = document.getElementById('in-pianificato').checked;
    
    if(!d) return alert("Seleziona una data");
    
    const m = JSON.parse(localStorage.getItem('movimenti')) || [];
    m.push({tipo:t, ore:o, data:d, pianificato:p, id: Date.now()});
    localStorage.setItem('movimenti', JSON.stringify(m));
    
    toggleModal(false);
    location.reload();
}

/* --- UTILITY --- */
function initSettings() {
    if (!localStorage.getItem('userSettings')) {
        localStorage.setItem('userSettings', JSON.stringify(defaultSettings));
    }
}
function getSettings() { return JSON.parse(localStorage.getItem('userSettings')); }

function setupDate() { 
    const curDate = document.getElementById('current-date');
    if(curDate) curDate.innerText = new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'}); 
    const inData = document.getElementById('in-data');
    if(inData) inData.value = new Date().toISOString().split('T')[0]; 
}

function toggleModal(s) { 
    const mod = document.getElementById('add-modal');
    const over = document.getElementById('modal-overlay');
    if(mod) {
        mod.classList.toggle('active', s); 
        if(over) over.style.display = s ? 'block' : 'none'; 
    }
}