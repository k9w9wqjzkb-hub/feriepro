/* ============================================================
   iWork v17 - Logic Core (Aggiornato)
   ============================================================ */

// 1. Registrazione Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=17')
      .then(reg => console.log('SW iWork registrato', reg))
      .catch(err => console.error('Errore SW:', err));
  });
}

const ORE_GIORNO = 8;
const defaultSettings = {
  residuiAP: { ferie: 36.15000, rol: 64.58249, conto: 2.00000 },
  spettanteAnnuo: { ferie: 216.00000, rol: 62.00000, conto: 0.00000 },
  dataInizioConteggio: "2026-01-01",
  annoRiferimento: 2026
};

/* =========================
   HELPERS (Date & Festività)
   ========================= */
function isoLocalDate(y, m0, d) {
  const mm = String(m0 + 1).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function todayLocalISO() {
  const t = new Date();
  return isoLocalDate(t.getFullYear(), t.getMonth(), t.getDate());
}

function toITDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT');
}

// Algoritmo Meeus/Jones/Butcher per Pasqua
function getPasqua(anno) {
  const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, month - 1, day);
}

function getFestivitaNazionaliIT(anno) {
  const fixed = [
    [0, 1], [0, 6], [3, 25], [4, 1], [5, 2],
    [7, 15], [10, 1], [11, 8], [11, 25], [11, 26],
  ].map(([m0, d]) => isoLocalDate(anno, m0, d));

  const pasqua = getPasqua(anno);
  const pasquetta = new Date(pasqua);
  pasquetta.setDate(pasqua.getDate() + 1);

  const pasquaISO = isoLocalDate(anno, pasqua.getMonth(), pasqua.getDate());
  const pasquettaISO = isoLocalDate(anno, pasquetta.getMonth(), pasquetta.getDate());
  
  // Patrono DINAMICO (Sant'Ambrogio)
  const patrono = `${anno}-12-07`;

  return [...fixed, pasquaISO, pasquettaISO, patrono];
}

/* =========================
   STORAGE & STATE
   ========================= */
function initSettings() {
  if (!localStorage.getItem('userSettings')) {
    localStorage.setItem('userSettings', JSON.stringify(defaultSettings));
  }
}

const getSettings = () => JSON.parse(localStorage.getItem('userSettings')) || defaultSettings;
const getMovimenti = () => JSON.parse(localStorage.getItem('movimenti')) || [];
const setMovimenti = (m) => localStorage.setItem('movimenti', JSON.stringify(m));

let EDIT_ID = null;

function canHavePianificato(tipo) {
  return ['ferie', 'ferie_az', 'rol', 'conto'].includes(tipo);
}

function getPianificatoCheckboxEl() {
  return document.getElementById('soloPianificato') || document.getElementById('in-pianificato');
}

function getPianificatoChecked() {
  const cb = getPianificatoCheckboxEl();
  return cb ? !!cb.checked : false;
}

function setPianificatoChecked(v) {
  const cb = getPianificatoCheckboxEl();
  if (cb) cb.checked = !!v;
}

/* =========================
   INITIALIZATION
   ========================= */
window.onload = () => {
  initSettings();
  const activePage = document.body.getAttribute('data-page');
  const settings = getSettings();
  const annoCorrente = settings.annoRiferimento || new Date().getFullYear();

  if (activePage === 'calendario') {
    const ct = document.getElementById('calendar-title');
    if (ct) ct.textContent = `Calendario ${annoCorrente}`;
  }

  popolaFiltroAnni();

  // Event Listeners Filtri
  ['filter-anno', 'filter-tipo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.onchange = () => {
      renderizzaTabella(activePage);
      aggiornaInterfaccia(activePage);
      if (activePage === 'calendario') renderizzaCalendario();
    };
  });

  aggiornaInterfaccia(activePage);
  if (document.getElementById('history-body')) renderizzaTabella(activePage);
  if (activePage === 'calendario') renderizzaCalendario();

  setupDate();
  initLiquidTabBar();
};

/* =========================
   CALENDARIO
   ========================= */
function renderizzaCalendario() {
  const tableBody = document.getElementById('calendarBody');
  const tableHeader = document.getElementById('calendarHeader');
  if (!tableBody || !tableHeader) return;

  const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const anno = (getSettings().annoRiferimento || new Date().getFullYear());
  const movimentiAnno = getMovimenti().filter(m => new Date(m.data).getFullYear() === anno);
  const festivi = new Set(getFestivitaNazionaliIT(anno));

  tableHeader.innerHTML = '<th class="col-mese">MESE</th>';
  for (let i = 1; i <= 31; i++) tableHeader.innerHTML += `<th>${i}</th>`;
  tableBody.innerHTML = '';

  mesi.forEach((mese, indexMese) => {
    let riga = `<tr><td class="col-mese">${mese}</td>`;
    for (let giorno = 1; giorno <= 31; giorno++) {
      const dt = new Date(anno, indexMese, giorno);
      if (dt.getMonth() !== indexMese) {
        riga += `<td class="bg-empty"></td>`;
        continue;
      }

      const dataISO = isoLocalDate(anno, indexMese, giorno);
      const dow = dt.getDay();
      let classe = (dow === 0 || dow === 6) ? "bg-weekend" : "";
      if (festivi.has(dataISO)) classe = "bg-festivo";

      const movGiorno = movimentiAnno.filter(m => m.data === dataISO);
      let contenuto = (dataISO === `${anno}-12-07`) ? "P" : ""; // "P" per Patrono se vuoto

      if (movGiorno.length) {
        const priority = ['malattia', 'ferie_az', 'avis', 'ferie', 'rol', 'conto'];
        let mSelected = null;
        for (let p of priority) {
          mSelected = movGiorno.find(m => m.tipo === p);
          if (mSelected) break;
        }

        if (mSelected) {
          const labels = { malattia:'M', ferie_az:'AZ', avis:'AV', ferie:'F' };
          classe = `bg-${mSelected.tipo.replace('_', '-')}`;
          if (mSelected.pianificato || mSelected.soloPianificato) classe += " is-pian";
          
          if (labels[mSelected.tipo]) {
            contenuto = labels[mSelected.tipo];
            if (mSelected.tipo === 'ferie' && (Number(mSelected.ore) < 8)) {
                contenuto = String(mSelected.ore).replace('.', ',');
            }
          } else {
            contenuto = String(mSelected.ore).replace('.', ',');
          }
        }
      }
      riga += `<td class="${classe}">${contenuto}</td>`;
    }
    tableBody.innerHTML += riga + `</tr>`;
  });
}

/* =========================
   DASHBOARD & LOGICA SALDI
   ========================= */
function aggiornaInterfaccia(page) {
  const mov = getMovimenti();
  const settings = getSettings();
  const annoRif = settings.annoRiferimento || new Date().getFullYear();
  
  const fA = document.getElementById('filter-anno');
  const annoSelezionato = (fA && fA.value !== 'all') ? parseInt(fA.value) : annoRif;
  const isAnnoRif = annoSelezionato === annoRif;

  let calc = {
    ferie: { ap: isAnnoRif ? settings.residuiAP.ferie : 0, spet: isAnnoRif ? settings.spettanteAnnuo.ferie : 0, god: 0, pian: 0 },
    rol:   { ap: isAnnoRif ? settings.residuiAP.rol   : 0, spet: isAnnoRif ? settings.spettanteAnnuo.rol   : 0, god: 0, pian: 0 },
    conto: { ap: isAnnoRif ? settings.residuiAP.conto : 0, spet: isAnnoRif ? settings.spettanteAnnuo.conto : 0, god: 0, pian: 0 },
    malattia: 0
  };

  mov.forEach(m => {
    if (new Date(m.data).getFullYear() !== annoSelezionato) return;
    const ore = Number(m.ore) || 0;
    if (m.tipo === 'malattia') { calc.malattia += ore; return; }
    if (m.tipo.startsWith('mat_')) {
      const cat = m.tipo.split('_')[1];
      if (calc[cat]) calc[cat].spet += ore;
      return;
    }
    const t = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
    if (calc[t]) {
      if (m.pianificato || m.soloPianificato) calc[t].pian += ore;
      else calc[t].god += ore;
    }
  });

  const fmt = (o) => (o / ORE_GIORNO).toFixed(2).replace('.', ',') + " gg";
  
  ['ferie', 'rol', 'conto'].forEach(id => {
    const saldo = calc[id].ap + calc[id].spet - calc[id].god;
    const elS = document.getElementById(`val-${id}`);
    const elP = document.getElementById(`val-${id}-pian`);
    if (elS) elS.innerText = fmt(saldo);
    if (elP) elP.innerText = "Prev: " + fmt(Math.max(0, saldo - calc[id].pian));
  });

  const elM = document.getElementById('val-malattia');
  if (elM) elM.innerText = fmt(calc.malattia);

  // Tabella Consuntivo (index.html)
  const tbody = document.getElementById('consuntivo-body');
  if (tbody) {
    tbody.innerHTML = ['ferie', 'rol', 'conto'].map(id => `
      <tr>
        <td style="padding:10px;">${id.toUpperCase()}</td>
        <td style="text-align:center;">${calc[id].ap.toFixed(2)}</td>
        <td style="text-align:center;">${calc[id].spet.toFixed(2)}</td>
        <td style="text-align:center;">${calc[id].god.toFixed(2)}</td>
        <td style="text-align:right; font-weight:700;">${(calc[id].ap + calc[id].spet - calc[id].god).toFixed(2)}</td>
      </tr>`).join('');
  }
}

/* =========================
   BACKUP & IMPORT (FIXED)
   ========================= */
function exportBackup() {
  const payload = { m: getMovimenti(), s: getSettings() };
  const b = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = `iWork_Backup_${todayLocalISO()}.json`;
  a.click();
}

function importBackup(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (x) => {
    try {
      const data = JSON.parse(x.target.result);
      if (data.m && data.s) {
        localStorage.setItem('movimenti', JSON.stringify(data.m));
        localStorage.setItem('userSettings', JSON.stringify(data.s));
        alert("Importazione completata con successo!");
        location.reload();
      } else throw new Error();
    } catch (err) {
      alert("Errore: Il file non è un backup iWork valido.");
    }
  };
  r.readAsText(file);
}

/* =========================
   FUNZIONI UI & UTILITY
   ========================= */
function popolaFiltroAnni() {
  const fA = document.getElementById('filter-anno');
  if (!fA) return;
  const anni = [...new Set([...getMovimenti().map(m => new Date(m.data).getFullYear()), getSettings().annoRiferimento])];
  fA.innerHTML = '<option value="all">Tutti gli anni</option>' + 
    anni.sort((a,b)=>b-a).map(a => `<option value="${a}" ${a==getSettings().annoRiferimento?'selected':''}>${a}</option>`).join('');
}

function gestisciAutoOre() {
  const t = document.getElementById('in-tipo')?.value;
  const i = document.getElementById('in-ore');
  if (!i || !t) return;
  if (['malattia', 'ferie_az'].includes(t)) i.value = 8;
  else if (t === 'avis') i.value = 0;
  
  const cbWrap = getPianificatoCheckboxEl()?.closest('.form-row') || getPianificatoCheckboxEl()?.parentElement;
  if (cbWrap) cbWrap.style.display = canHavePianificato(t) ? 'flex' : 'none';
}

function saveData() {
  let t = document.getElementById('in-tipo')?.value;
  let o = parseFloat(document.getElementById('in-ore')?.value);
  const d = document.getElementById('in-data')?.value;
  const note = document.getElementById('in-note')?.value || '';

  if (!d || !t || (t!=='avis' && isNaN(o))) return alert('Compila i campi obbligatori');
  if (t === 'maturazione') {
    const res = prompt('Destinazione? (ferie, rol, conto)');
    if (['ferie', 'rol', 'conto'].includes(res)) t = 'mat_' + res; else return;
  }

  const m = getMovimenti();
  const entry = { tipo: t, ore: o || 0, data: d, note, pianificato: canHavePianificato(t) && getPianificatoChecked(), id: EDIT_ID || Date.now() };

  if (EDIT_ID) {
    const idx = m.findIndex(x => x.id === EDIT_ID);
    if (idx !== -1) m[idx] = entry;
  } else {
    m.push(entry);
  }
  
  setMovimenti(m);
  location.reload();
}

function elimina(id) {
  if (confirm('Eliminare questo record?')) {
    setMovimenti(getMovimenti().filter(x => x.id !== id));
    location.reload();
  }
}

// ... (Includi qui le restanti funzioni UI: modifica, info, toggleModal, initLiquidTabBar, etc.)
// Nota: Le funzioni UI sono rimaste invariate rispetto alla tua versione ma ora interagiscono con la logica corretta.

function setupDate() {
  const cd = document.getElementById('current-date');
  if (cd) cd.innerText = new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long' });
  const id = document.getElementById('in-data');
  if (id) id.value = todayLocalISO();
}

function initLiquidTabBar() {
  const nav = document.querySelector('.tab-liquid');
  if (!nav) return;
  const indicator = nav.querySelector('.liquid-indicator') || document.createElement('div');
  if (!indicator.className) { indicator.className = 'liquid-indicator'; nav.appendChild(indicator); }
  
  const move = () => {
    const active = nav.querySelector('.tab-item.active');
    if (!active) return;
    const nR = nav.getBoundingClientRect(), aR = active.getBoundingClientRect();
    indicator.style.width = aR.width + 'px';
    indicator.style.transform = `translateX(${aR.left - nR.left}px)`;
  };
  requestAnimationFrame(move);
  window.addEventListener('resize', move);
}

function renderizzaTabella(page) {
  const mov = getMovimenti();
  const tbody = document.getElementById('history-body');
  if (!tbody) return;

  const fA = document.getElementById('filter-anno')?.value || 'all';
  const fT = document.getElementById('filter-tipo')?.value || 'all';

  let filtered = mov.filter(m => page === 'malattia' ? m.tipo === 'malattia' : m.tipo !== 'malattia');
  if (fA !== 'all') filtered = filtered.filter(m => new Date(m.data).getFullYear().toString() === fA);
  if (fT !== 'all' && page !== 'malattia') {
    filtered = filtered.filter(m => m.tipo === fT || (fT === 'ferie' && m.tipo === 'ferie_az') || (fT === 'maturazione' && m.tipo.startsWith('mat_')));
  }

  tbody.innerHTML = filtered.sort((a,b) => new Date(b.data) - new Date(a.data)).map(m => `
    <tr style="border-bottom:0.5px solid #EEE;">
      <td style="padding:12px;">${toITDate(m.data)}</td>
      <td><span class="badge-${m.tipo.startsWith('mat_')?'maturazione':m.tipo}">${m.tipo.replace('mat_','MAT. ').toUpperCase()}</span></td>
      <td style="font-weight:700;">${m.tipo==='avis'?'-':m.ore.toFixed(2)+'h'}</td>
      <td class="azioni-cell">
        <button onclick="modifica(${m.id})">✏️</button>
        <button onclick="elimina(${m.id})">🗑️</button>
      </td>
    </tr>`).join('');
}