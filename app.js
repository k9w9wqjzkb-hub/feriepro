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

// Festività Nazionali Italiane 2026
const FESTIVITA_2026 = [
    "2026-01-01", "2026-01-06", "2026-04-05", "2026-04-06", 
    "2026-04-25", "2026-05-01", "2026-06-02", "2026-08-15", 
    "2026-11-01", "2026-12-08", "2026-12-25", "2026-12-26"
];

/* --- INIZIALIZZAZIONE --- */
window.onload = () => {
    initSettings();
    const activePage = document.body.getAttribute('data-page');
    popolaFiltroAnni();
    
    const fA = document.getElementById('filter-anno');
    const fT = document.getElementById('filter-tipo');
    if(fA) fA.onchange = () => { renderizzaTabella(activePage); aggiornaInterfaccia(activePage); };
    if(fT) fT.onchange = () => { renderizzaTabella(activePage); aggiornaInterfaccia(activePage); };

    aggiornaInterfaccia(activePage); 
    if (document.getElementById('history-body')) renderizzaTabella(activePage);
    if (activePage === 'calendario') renderizzaCalendario();
    
    setupDate();
};

/* --- LOGICA CALENDARIO (ORIZZONTALE & SINCRONIZZATO) --- */
function renderizzaCalendario() {
    const tableBody = document.getElementById('calendarBody');
    const tableHeader = document.getElementById('calendarHeader');
    if (!tableBody) return;

    // Nomi abbreviati per display iPhone verticale/orizzontale
    const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUGL", "AGO", "SET", "OTT", "NOV", "DIC"];
    const settings = getSettings();
    const anno = settings.annoRiferimento || 2026;
    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];

    // Header: Giorno 1-31
    let headerHtml = '<th class="col-mese">2026</th>';
    for (let i = 1; i <= 31; i++) headerHtml += `<th>${i}</th>`;
    tableHeader.innerHTML = headerHtml;

    tableBody.innerHTML = '';
    mesi.forEach((nomeMese, indexMese) => {
        let riga = `<tr><td class="col-mese">${nomeMese}</td>`;
        for (let giorno = 1; giorno <= 31; giorno++) {
            const dataCorrente = new Date(anno, indexMese, giorno);
            if (dataCorrente.getMonth() !== indexMese) {
                riga += `<td style="background:#F2F2F7;"></td>`; // Cella vuota per mesi < 31gg
                continue;
            }

            const dataISO = dataCorrente.toISOString().split('T')[0];
            const giornoSett = dataCorrente.getDay(); // 0=Dom, 6=Sab
            let classeCella = "";
            let contenuto = "";

            // 1. Colorazione base Sabato (Grigio Chiaro) e Domenica (Grigio Scuro)
            if (giornoSett === 6) classeCella = "bg-sabato";
            if (giornoSett === 0) classeCella = "bg-domenica";
            
            // 2. Festività (Rosso) - Vince sul weekend
            if (FESTIVITA_2026.includes(dataISO)) classeCella = "bg-festivo";

            // 3. Sincronizzazione con Dati inseriti (Report Ferie/Malattia)
            const movGiorno = movimenti.find(m => m.data === dataISO);
            if (movGiorno) {
                if (movGiorno.tipo === 'ferie') { 
                    classeCella = "bg-ferie-ind"; contenuto = "F"; // Verde
                } else if (movGiorno.tipo === 'ferie_az') { 
                    classeCella = "bg-ferie-coll"; contenuto = "A"; // Blu Scuro
                } else if (movGiorno.tipo === 'malattia') { 
                    classeCella = "bg-malattia"; contenuto = "M"; // Viola
                } else if (movGiorno.tipo === 'avis') { 
                    classeCella = "bg-avis"; contenuto = "AV"; // Giallo
                } else if (movGiorno.tipo === 'rol' || movGiorno.tipo === 'conto') {
                    // ROL: Mostra ore in arancio mantenendo il colore di sfondo (weekend o bianco)
                    contenuto = `<span class="text-rol">${movGiorno.ore.toString().replace('.',',')}</span>`;
                }
            }
            riga += `<td class="${classeCella}">${contenuto}</td>`;
        }
        riga += `</tr>`;
        tableBody.innerHTML += riga;
    });
}

/* --- LOGICA DATI E INTERFACCIA --- */
function initSettings() {
    if (!localStorage.getItem('userSettings')) {
        localStorage.setItem('userSettings', JSON.stringify(defaultSettings));
    }
}

function getSettings() { return JSON.parse(localStorage.getItem('userSettings')) || defaultSettings; }

function popolaFiltroAnni() {
    const filterAnno = document.getElementById('filter-anno');
    if (!filterAnno) return;
    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
    const anni = movimenti.map(m => new Date(m.data).getFullYear());
    anni.push(new Date().getFullYear());
    const anniUnici = [...new Set(anni)].sort((a, b) => b - a);
    
    let html = (document.body.getAttribute('data-page') === 'malattia') ? '<option value="all">Tutti gli anni</option>' : '';
    anniUnici.forEach(anno => {
        const selected = (anno === new Date().getFullYear()) ? 'selected' : '';
        html += `<option value="${anno}" ${selected}>${anno}</option>`;
    });
    filterAnno.innerHTML = html;
}

function aggiornaInterfaccia(page) {
    const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
    const settings = getSettings();
    const filtroAnnoEl = document.getElementById('filter-anno');
    const annoSelezionato = (filtroAnnoEl && filtroAnnoEl.value !== 'all') ? parseInt(filtroAnnoEl.value) : new Date().getFullYear();
    const isAnnoCorrente = annoSelezionato === new Date().getFullYear();

    let calcoli = {
        ferie: { ap: isAnnoCorrente ? settings.residuiAP.ferie : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.ferie : 0, god: 0, pian: 0 },
        rol: { ap: isAnnoCorrente ? settings.residuiAP.rol : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.rol : 0, god: 0, pian: 0 },
        conto: { ap: isAnnoCorrente ? settings.residuiAP.conto : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.conto : 0, god: 0, pian: 0 },
        malattia: 0
    };

    movimenti.forEach(m => {
        const dataM = new Date(m.data);
        const annoM = dataM.getFullYear();
        const ore = parseFloat(m.ore) || 0;
        if (annoM === annoSelezionato || (filtroAnnoEl?.value === 'all' && m.tipo === 'malattia')) {
            if (m.tipo === 'malattia') calcoli.malattia += ore;
            else if (m.tipo.startsWith('mat_')) {
                const cat = m.tipo.split('_')[1];
                if(calcoli[cat]) calcoli[cat].spet += ore;
            } else if (m.tipo !== 'avis') {
                let tipoReale = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
                if (calcoli[tipoReale]) {
                    if (m.pianificato) calcoli[tipoReale].pian += ore;
                    else calcoli[tipoReale].god += ore;
                }
            }
        }
    });

    const setCard = (id, obj) => { 
        const el = document.getElementById(id);
        if(!el) return;
        const attuale = (obj.ap + obj.spet - obj.god) / ORE_GIORNO;
        const prev = attuale - (obj.pian / ORE_GIORNO);
        el.innerHTML = `<div style="font-size:22px; font-weight:700;">${attuale.toFixed(2).replace('.', ',')}</div>
                        <div style="font-size:11px; color:#8E8E93; font-weight:400; margin-top:2px;">Prev: ${prev.toFixed(2).replace('.', ',')} gg</div>`;
    };
    
    setCard('val-ferie', calcoli.ferie);
    setCard('val-rol', calcoli.rol);
    setCard('val-conto', calcoli.conto);
    const elMal = document.getElementById('val-malattia');
    if(elMal) elMal.innerText = (calcoli.malattia / ORE_GIORNO).toFixed(2).replace('.', ',') + " gg";
}

/* --- TABELLA E MODALI --- */
function renderizzaTabella(page) {
    const mov = JSON.parse(localStorage.getItem('movimenti')) || [];
    const tbody = document.getElementById('history-body');
    if(!tbody) return;
    const fA = document.getElementById('filter-anno')?.value || 'all';
    const fT = document.getElementById('filter-tipo')?.value || 'all';

    let filtered = mov.filter(m => page === 'malattia' ? m.tipo === 'malattia' : m.tipo !== 'malattia');
    if (fA !== 'all') filtered = filtered.filter(m => new Date(m.data).getFullYear().toString() === fA);
    if (fT !== 'all' && page !== 'malattia') {
        filtered = filtered.filter(m => m.tipo === fT || (fT === 'ferie' && m.tipo === 'ferie_az') || (fT === 'maturazione' && m.tipo.startsWith('mat_')));
    }
    
    tbody.innerHTML = filtered.sort((a,b)=>new Date(b.data)-new Date(a.data)).map(m => {
        let label = m.tipo.replace('mat_', 'MAT. ').toUpperCase();
        if(m.tipo === 'ferie_az') label = "FERIE AZ.";
        const pianBadge = m.pianificato ? '<span style="font-size:9px; color:#FF9500; font-weight:bold; margin-left:5px;">●</span>' : '';
        const haNota = m.note && m.note.trim() !== "";
        const infoBtn = `<button onclick="${haNota ? `mostraInfo('${m.note.replace(/'/g, "\\'")}')` : ''}" 
                         style="border:none; background:none; font-size:18px; padding:5px; opacity:${haNota ? '1' : '0.15'};">ℹ️</button>`;

        return `<tr style="border-bottom:0.5px solid #EEE; ${m.pianificato ? 'background:#FDFDFD; opacity:0.8;' : ''}">
            <td style="padding:12px;">${new Date(m.data).toLocaleDateString()}</td>
            <td><span class="badge-${m.tipo.startsWith('mat_')?'maturazione':m.tipo}">${label}</span>${pianBadge}</td>
            <td style="font-weight:700;">${m.tipo==='avis'?'-':m.ore.toFixed(2)+'h'}</td>
            <td style="text-align:right; padding-right:8px; white-space:nowrap;">
                ${infoBtn}
                <button onclick="avviaModifica(${m.id})" style="border:none; background:none; font-size:16px; padding:5px;">✏️</button>
                <button onclick="elimina(${m.id})" style="border:none; background:none; font-size:16px; padding:5px;">🗑️</button>
            </td></tr>`;
    }).join('');
}

function mostraInfo(testo) {
    const modal = document.getElementById('info-modal');
    const content = document.getElementById('info-text');
    const overlay = document.getElementById('info-overlay');
    if(modal && content) {
        content.innerText = testo;
        modal.classList.add('active');
        overlay.style.display = 'block';
    }
}

function toggleInfoModal(s) {
    document.getElementById('info-modal').classList.toggle('active', s);
    document.getElementById('info-overlay').style.display = s ? 'block' : 'none';
}

function toggleEditModal(s) {
    const mod = document.getElementById('edit-modal');
    if(mod) {
        mod.classList.toggle('active', s);
        document.getElementById('edit-modal-overlay').style.display = s ? 'block' : 'none';
    }
}

function avviaModifica(id) {
    const mov = JSON.parse(localStorage.getItem('movimenti')) || [];
    const item = mov.find(m => m.id === id);
    if (!item) return;
    document.getElementById('edit-id').value = item.id;
    document.getElementById('edit-tipo').value = item.tipo;
    document.getElementById('edit-ore').value = item.ore;
    document.getElementById('edit-data').value = item.data;
    document.getElementById('edit-note').value = item.note || "";
    document.getElementById('edit-pianificato').checked = item.pianificato || false;
    toggleEditModal(true);
}

function updateData() {
    const id = parseInt(document.getElementById('edit-id').value);
    let mov = JSON.parse(localStorage.getItem('movimenti')) || [];
    const index = mov.findIndex(m => m.id === id);
    if (index === -1) return;
    mov[index].tipo = document.getElementById('edit-tipo').value;
    mov[index].ore = parseFloat(document.getElementById('edit-ore').value) || 0;
    mov[index].data = document.getElementById('edit-data').value;
    mov[index].note = document.getElementById('edit-note').value;
    mov[index].pianificato = document.getElementById('edit-pianificato').checked;
    localStorage.setItem('movimenti', JSON.stringify(mov));
    location.reload();
}

function saveData() {
    let t = document.getElementById('in-tipo').value;
    let o = parseFloat(document.getElementById('in-ore').value);
    let d = document.getElementById('in-data').value;
    let n = document.getElementById('in-note').value;
    let p = document.getElementById('in-pianificato').checked;
    if(!d) return alert("Data mancante");
    if(t === 'maturazione') {
        const res = prompt("Destinazione? (ferie, rol, conto)");
        if(['ferie','rol','conto'].includes(res)) t = 'mat_'+res; else return;
    }
    const m = JSON.parse(localStorage.getItem('movimenti')) || [];
    m.push({tipo:t, ore:o||0, data:d, note:n, pianificato:p, id: Date.now()});
    localStorage.setItem('movimenti', JSON.stringify(m));
    location.reload();
}

/* --- UTILS --- */
function gestisciAutoOre() {
    const t = document.getElementById('in-tipo').value;
    const i = document.getElementById('in-ore');
    if (t === 'malattia' || t === 'ferie_az') i.value = 8; else if (t === 'avis') i.value = 0; else i.value = "";
}

function toggleModal(s) { document.getElementById('add-modal').classList.toggle('active', s); document.getElementById('modal-overlay').style.display = s ? 'block' : 'none'; }

function toggleSettings() {
    const p = document.getElementById('settings-panel');
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    if(p.style.display === 'block') {
        const s = getSettings();
        const c = document.getElementById('settings-inputs');
        c.innerHTML = '';
        ['ferie', 'rol', 'conto'].forEach(id => {
            c.innerHTML += `<div style="margin-bottom:10px; border-bottom:1px solid #EEE; padding-bottom:10px;">
                <div style="font-weight:700; font-size:12px; color:#007AFF;">${id.toUpperCase()}</div>
                <div style="display:flex; gap:8px;">
                    <div style="flex:1;"><label style="font-size:9px;">RES. AP</label><input type="number" id="set-ap-${id}" value="${s.residuiAP[id]}" step="0.00001" style="width:100%;"></div>
                    <div style="flex:1;"><label style="font-size:9px;">SPET.</label><input type="number" id="set-spet-${id}" value="${s.spettanteAnnuo[id]}" step="0.00001" style="width:100%;"></div>
                </div>
            </div>`;
        });
    }
}

function saveSettings() {
    const s = getSettings();
    ['ferie', 'rol', 'conto'].forEach(c => {
        s.residuiAP[c] = parseFloat(document.getElementById(`set-ap-${c}`).value) || 0;
        s.spettanteAnnuo[c] = parseFloat(document.getElementById(`set-spet-${c}`).value) || 0;
    });
    localStorage.setItem('userSettings', JSON.stringify(s));
    location.reload();
}

function elimina(id) { if(confirm("Eliminare?")) { const m = JSON.parse(localStorage.getItem('movimenti')); localStorage.setItem('movimenti', JSON.stringify(m.filter(x=>x.id!==id))); location.reload(); } }
function setupDate() { if(document.getElementById('current-date')) document.getElementById('current-date').innerText = new Date().toLocaleDateString('it-IT', {weekday:'long', day:'numeric', month:'long'}); if(document.getElementById('in-data')) document.getElementById('in-data').value = new Date().toISOString().split('T')[0]; }
function exportBackup() { const b = new Blob([JSON.stringify({m:JSON.parse(localStorage.getItem('movimenti')), s:getSettings()})], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download='iWork_Backup.json'; a.click(); }
function importBackup(e) { const r = new FileReader(); r.onload=(x)=>{const j=JSON.parse(x.target.result); localStorage.setItem('movimenti', JSON.stringify(j.m)); localStorage.setItem('userSettings', JSON.stringify(j.s)); location.reload();}; r.readAsText(e.target.files[0]); }