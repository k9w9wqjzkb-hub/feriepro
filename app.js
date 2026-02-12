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
    
    // Setup Interfaccia Comune
    setupDate();
    aggiornaInterfaccia(activePage); 

    // Logica Specifica per Pagina
    if (activePage === 'calendario') {
        renderizzaCalendario();
    } else if (activePage === 'malattia' || activePage === 'ferie') {
        renderizzaListaSpecifica(activePage);
    }
    
    // Popola filtri se presenti
    if (document.getElementById('filter-anno')) popolaFiltroAnni();
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

/* --- LOGICA RENDERING LISTE (MALATTIA / FERIE) --- */
function renderizzaListaSpecifica(page) {
    const container = document.getElementById(page === 'malattia' ? 'lista-malattia' : 'lista-ferie');
    const totalEl = document.getElementById(page === 'malattia' ? 'total-malattia' : 'total-ferie-page');
    if (!container) return;

    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
    // Filtro per tipo (se pagina malattia mostra solo malattia, altrimenti ferie e ferie_az)
    const filtrati = movimenti.filter(m => 
        page === 'malattia' ? m.tipo === 'malattia' : (m.tipo === 'ferie' || m.tipo === 'ferie_az')
    ).sort((a, b) => new Date(b.data) - new Date(a.data));

    let html = '';
    let totaleOre = 0;

    filtrati.forEach(m => {
        totaleOre += parseFloat(m.ore) || 0;
        const label = m.tipo === 'ferie_az' ? 'Ferie Aziendali' : m.tipo.toUpperCase();
        html += `
            <div class="ios-input-row" style="flex-direction:column; align-items:flex-start; height:auto; padding:12px 16px;">
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <span style="font-weight:600;">${new Date(m.data).toLocaleDateString('it-IT', {day:'2-digit', month:'long'})}</span>
                    <span style="color:var(--${m.tipo === 'malattia' ? 'purple' : 'blue'}); font-weight:700;">${m.ore}h</span>
                </div>
                <div style="font-size:12px; color:#8E8E93; margin-top:4px;">
                    ${label} ${m.note ? '• ' + m.note : ''}
                </div>
            </div>`;
    });

    container.innerHTML = html || '<div style="padding:20px; text-align:center; color:#8E8E93;">Nessun record</div>';
    if (totalEl) totalEl.innerText = (totaleOre / ORE_GIORNO).toFixed(2).replace('.', ',') + " gg";
}

/* --- AGGIORNAMENTO DASHBOARD --- */
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
        } else if (m.tipo.startsWith('mat_')) {
            const cat = m.tipo.split('_')[1];
            if(calcoli[cat]) calcoli[cat].spet += ore;
        } else {
            let t = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
            if (calcoli[t]) {
                if (m.pianificato) calcoli[t].pian += ore;
                else calcoli[t].god += ore;
            }
        }
    });

    const setCard = (id, obj) => { 
        const el = document.getElementById(id);
        if(!el) return;
        const attuale = (obj.ap + obj.spet - obj.god);
        el.innerText = (attuale / ORE_GIORNO).toFixed(2).replace('.', ',');
    };
    
    setCard('val-ferie', calcoli.ferie);
    setCard('val-rol', calcoli.rol);
    setCard('val-conto', calcoli.conto);
    
    const elMal = document.getElementById('val-malattia') || document.getElementById('total-malattia');
    if(elMal) elMal.innerText = (calcoli.malattia / ORE_GIORNO).toFixed(2).replace('.', ',');
}

/* --- SALVATAGGIO --- */
function saveData() {
    const t = document.getElementById('in-tipo').value;
    const o = parseFloat(document.getElementById('in-ore').value) || 0;
    const d = document.getElementById('in-data').value;
    const n = document.getElementById('in-note').value;
    const p = document.getElementById('in-pianificato').checked;
    
    if(!d) return alert("Seleziona una data");
    
    const m = JSON.parse(localStorage.getItem('movimenti')) || [];
    m.push({tipo:t, ore:o, data:d, note:n, pianificato:p, id: Date.now()});
    localStorage.setItem('movimenti', JSON.stringify(m));
    
    toggleModal(false);
    location.reload();
}

/* --- FUNZIONI UTILITY --- */
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
    if(mod) {
        mod.classList.toggle('active', s); 
        document.getElementById('modal-overlay').style.display = s ? 'block' : 'none'; 
    }
}