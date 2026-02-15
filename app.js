// Registrazione Service Worker per PWA (percorso relativo per GitHub Pages)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrato con successo', reg))
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
   HELPERS (date, festività)
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

// Calcolo Pasqua (Meeus/Jones/Butcher) -> Date
function getPasqua(anno) {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anno, month - 1, day);
}

function getFestivitaNazionaliIT(anno) {
  // Fisse (mese 0-based)
  const fixed = [
    [0, 1],   // 1/1
    [0, 6],   // 6/1
    [3, 25],  // 25/4
    [4, 1],   // 1/5
    [5, 2],   // 2/6
    [7, 15],  // 15/8
    [10, 1],  // 1/11
    [11, 8],  // 8/12
    [11, 25], // 25/12
    [11, 26], // 26/12
  ].map(([m0, d]) => isoLocalDate(anno, m0, d));

  const pasqua = getPasqua(anno);
  const pasquaISO = isoLocalDate(anno, pasqua.getMonth(), pasqua.getDate());

  const pasquetta = new Date(pasqua);
  pasquetta.setDate(pasqua.getDate() + 1);
  const pasquettaISO = isoLocalDate(anno, pasquetta.getMonth(), pasquetta.getDate());

  return [...fixed, pasquaISO, pasquettaISO];
}

/* =========================
   INIT
   ========================= */
window.onload = () => {
  initSettings();

  const activePage = document.body.getAttribute('data-page');

  popolaFiltroAnni();

  // Gestione Eventi Filtri
  const fA = document.getElementById('filter-anno');
  const fT = document.getElementById('filter-tipo');
  if (fA) fA.onchange = () => { renderizzaTabella(activePage); aggiornaInterfaccia(activePage); };
  if (fT) fT.onchange = () => { renderizzaTabella(activePage); aggiornaInterfaccia(activePage); };

  // Inizializzazione in base alla pagina
  aggiornaInterfaccia(activePage);
  if (document.getElementById('history-body')) renderizzaTabella(activePage);
  if (activePage === 'calendario') renderizzaCalendario();

  setupDate();
};

/* =========================
   LOGICA CALENDARIO ORIZZONTALE
   ========================= */
function renderizzaCalendario() {
  const tableBody = document.getElementById('calendarBody');
  const tableHeader = document.getElementById('calendarHeader');
  if (!tableBody || !tableHeader) return;

  const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const settings = getSettings();
  const anno = settings.annoRiferimento || new Date().getFullYear();

  const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
  const festivi = new Set(getFestivitaNazionaliIT(anno));

  // Header: MESE + 1-31 (RESET ogni render)
  tableHeader.innerHTML = '<th class="col-mese">MESE</th>';
  for (let i = 1; i <= 31; i++) tableHeader.innerHTML += `<th>${i}</th>`;

  // Body: reset
  tableBody.innerHTML = '';

  mesi.forEach((mese, indexMese) => {
    let riga = `<tr><td class="col-mese">${mese}</td>`;

    for (let giorno = 1; giorno <= 31; giorno++) {
      const dt = new Date(anno, indexMese, giorno);

      // giorno non valido per quel mese
      if (dt.getMonth() !== indexMese) {
        riga += `<td style="background:#F2F2F7;"></td>`;
        continue;
      }

      const dataISO = isoLocalDate(anno, indexMese, giorno);
      const dow = dt.getDay(); // 0=Dom, 6=Sab

      let classe = "";
      let contenuto = "";

      // Weekend (classi coerenti con calendario.html)
      if (dow === 6) classe = "bg-sabato";
      if (dow === 0) classe = "bg-domenica";

      // Festivi nazionali
      if (festivi.has(dataISO)) classe = "bg-festivo";

      // Patrono Milano (Sant'Ambrogio) 07/12
      if (dataISO === `${anno}-12-07`) {
        classe = "bg-patrono";
        contenuto = "P";
      }

      // Movimenti hanno priorità sul colore
      const movGiorno = movimenti.find(m => m.data === dataISO);
      if (movGiorno) {
        if (movGiorno.tipo === 'ferie') {
          classe = "bg-ferie-ind";
          contenuto = "F";
        } else if (movGiorno.tipo === 'ferie_az') {
          classe = "bg-ferie-coll";
          contenuto = "F";
        } else if (movGiorno.tipo === 'malattia') {
          classe = "bg-malattia";
          contenuto = "";
        } else if (movGiorno.tipo === 'avis') {
          classe = "bg-avis";
          contenuto = "A";
        } else if (movGiorno.tipo === 'rol') {
          classe = "text-rol";
          const ore = Number(movGiorno.ore);
          contenuto = Number.isFinite(ore) ? String(ore) : "";
        }
      }

      riga += `<td class="${classe}">${contenuto}</td>`;
    }

    riga += `</tr>`;
    tableBody.innerHTML += riga;
  });
}

/* =========================
   FUNZIONI CORE GESTIONE DATI
   ========================= */
function initSettings() {
  if (!localStorage.getItem('userSettings')) {
    localStorage.setItem('userSettings', JSON.stringify(defaultSettings));
  }
}

function getSettings() {
  return JSON.parse(localStorage.getItem('userSettings')) || defaultSettings;
}

function popolaFiltroAnni() {
  const filterAnno = document.getElementById('filter-anno');
  if (!filterAnno) return;

  const movimenti = JSON.parse(localStorage.getItem('movimenti')) || [];
  const anni = movimenti.map(m => new Date(m.data).getFullYear());
  anni.push(new Date().getFullYear());

  const anniUnici = [...new Set(anni)].sort((a, b) => b - a);

  let html = '<option value="all">Tutti gli anni</option>';
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
  const filtroAnnoVal = filtroAnnoEl ? filtroAnnoEl.value : 'all';

  // Manteniamo il comportamento attuale: se "all", per le card usiamo l'anno corrente
  const annoSelezionato = (filtroAnnoEl && filtroAnnoVal !== 'all')
    ? parseInt(filtroAnnoVal, 10)
    : new Date().getFullYear();

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
    const ore = Number(m.ore) || 0;

    // Nota: su "all" manteniamo lo storico tabellare completo,
    // ma i calcoli rimangono sull'anno selezionato (come nel tuo comportamento attuale).
    if (annoM === annoSelezionato || (filtroAnnoVal === 'all' && m.tipo === 'malattia')) {
      if (m.tipo === 'malattia') {
        calcoli.malattia += ore;
      } else if (m.tipo.startsWith('mat_')) {
        const cat = m.tipo.split('_')[1];
        if (calcoli[cat]) calcoli[cat].spet += ore;
      } else if (m.tipo !== 'avis') {
        let tipoReale = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
        if (calcoli[tipoReale]) {
          if (m.pianificato) calcoli[tipoReale].pian += ore;
          else calcoli[tipoReale].god += ore;
        }
      }
    }
  });

  // CARD GG (2 decimali)
  const fmtGG = (ore) => (ore / ORE_GIORNO).toFixed(2).replace('.', ',') + " gg";

  const setCard = (id, ore) => {
    const el = document.getElementById(id);
    if (el) el.innerText = fmtGG(ore);
  };

  const setPrev = (id, saldoOre, pianOre) => {
    const el = document.getElementById(id);
    if (!el) return;
    const prevOre = Math.max(0, (saldoOre || 0) - (pianOre || 0));
    el.innerText = (pianOre > 0) ? ("Prev: " + fmtGG(prevOre)) : "";
  };

  // ✅ NUMERO GRANDE = RESTANTI/EFFETTIVI (saldo reale)
  const saldoFerie = (calcoli.ferie.ap + calcoli.ferie.spet - calcoli.ferie.god);
  const saldoRol   = (calcoli.rol.ap + calcoli.rol.spet - calcoli.rol.god);
  const saldoConto = (calcoli.conto.ap + calcoli.conto.spet - calcoli.conto.god);

  setCard('val-ferie', saldoFerie);
  setCard('val-rol', saldoRol);
  setCard('val-conto', saldoConto);

  // ✅ PICCOLO = PREVISIONE (saldo - programmato)
  setPrev('val-ferie-pian', saldoFerie, calcoli.ferie.pian);
  setPrev('val-rol-pian', saldoRol, calcoli.rol.pian);
  setPrev('val-conto-pian', saldoConto, calcoli.conto.pian);

  const elMal = document.getElementById('val-malattia');
  if (elMal) elMal.innerText = fmtGG(calcoli.malattia);


// TABELLA CONSUNTIVO
  const tbody = document.getElementById('consuntivo-body');
  if (tbody) {
    tbody.innerHTML = '';
    ['ferie', 'rol', 'conto'].forEach(id => {
      const c = calcoli[id];
      const saldo = c.ap + c.spet - c.god;
      tbody.innerHTML += `<tr>
        <td style="padding:10px;">${id.toUpperCase()}</td>
        <td style="text-align:center;">${c.ap.toFixed(2)}</td>
        <td style="text-align:center;">${c.spet.toFixed(2)}</td>
        <td style="text-align:center;">${c.god.toFixed(2)}</td>
        <td style="text-align:right; font-weight:700;">${saldo.toFixed(2)}</td>
      </tr>`;
    });
  }
}

function renderizzaTabella(page) {
  const mov = JSON.parse(localStorage.getItem('movimenti')) || [];
  const tbody = document.getElementById('history-body');
  if (!tbody) return;

  const fA = document.getElementById('filter-anno')?.value || 'all';
  const fT = document.getElementById('filter-tipo')?.value || 'all';

  let filtered = mov.filter(m => page === 'malattia' ? m.tipo === 'malattia' : m.tipo !== 'malattia');

  if (fA !== 'all') filtered = filtered.filter(m => new Date(m.data).getFullYear().toString() === fA);

  if (fT !== 'all' && page !== 'malattia') {
    filtered = filtered.filter(m =>
      m.tipo === fT ||
      (fT === 'ferie' && m.tipo === 'ferie_az') ||
      (fT === 'maturazione' && m.tipo.startsWith('mat_'))
    );
  }

  tbody.innerHTML = filtered
    .sort((a, b) => new Date(b.data) - new Date(a.data))
    .map(m => {
      let label = m.tipo.replace('mat_', 'MAT. ').toUpperCase();
      if (m.tipo === 'ferie_az') label = "FERIE AZ.";

      const oreNum = Number(m.ore);
      const oreTxt = (m.tipo === 'avis') ? '-' : (Number.isFinite(oreNum) ? oreNum.toFixed(2) + 'h' : '0.00h');

      return `<tr style="border-bottom:0.5px solid #EEE;">
        <td style="padding:12px;">${new Date(m.data).toLocaleDateString('it-IT')}</td>
        <td><span class="badge-${m.tipo.startsWith('mat_') ? 'maturazione' : m.tipo}">${label}</span></td>
        <td style="font-weight:700;">${oreTxt}</td>
        <td><button onclick="elimina(${m.id})" style="border:none; background:none;">🗑️</button></td>
      </tr>`;
    })
    .join('');
}

/* =========================
   FUNZIONI INTERFACCIA
   ========================= */
function toggleModal(s) {
  document.getElementById('add-modal')?.classList.toggle('active', !!s);
  const o = document.getElementById('modal-overlay');
  if (o) o.style.display = s ? 'block' : 'none';

  // reset del flag quando apro la modale (evita che resti selezionato)
  if (s) {
    const cb = document.getElementById('soloPianificato');
    if (cb) cb.checked = false;
  }
}

function toggleSheet(s) {
  if (s) aggiornaInterfaccia(document.body.getAttribute('data-page'));
  document.getElementById('ios-sheet')?.classList.toggle('active', !!s);
  const o = document.getElementById('overlay-sheet');
  if (o) o.style.display = s ? 'block' : 'none';
}

/* =========================
   FUNZIONI DI SISTEMA
   ========================= */
function azzeraGoduti() {
  if (!confirm("Consolidare il saldo attuale al 01/01?")) return;

  let s = getSettings();
  const mov = JSON.parse(localStorage.getItem('movimenti')) || [];
  const dInizio = new Date(s.dataInizioConteggio);

  ['ferie', 'rol', 'conto'].forEach(cat => {
    let god = 0, mat = 0;

    mov.forEach(m => {
      if (new Date(m.data) >= dInizio) {
        const o = Number(m.ore) || 0;
        if (m.tipo === 'mat_' + cat) mat += o;
        else if (m.tipo === cat || (cat === 'ferie' && m.tipo === 'ferie_az')) god += o;
      }
    });

    s.residuiAP[cat] = (s.residuiAP[cat] + s.spettanteAnnuo[cat] + mat) - god;
    s.spettanteAnnuo[cat] = (cat === 'conto') ? 0 : (cat === 'ferie' ? 216 : 62);
  });

  s.dataInizioConteggio = new Date().getFullYear() + "-01-01";
  localStorage.setItem('userSettings', JSON.stringify(s));
  location.reload();
}

function saveData() {
  let t = document.getElementById('in-tipo').value;
  let o = parseFloat(document.getElementById('in-ore').value);
  const d = document.getElementById('in-data').value;
  const note = document.getElementById('in-note') ? document.getElementById('in-note').value : "";

  if (!d) return alert("Data mancante");

  if (t === 'maturazione') {
    const res = prompt("Destinazione? (ferie, rol, conto)");
    if (['ferie', 'rol', 'conto'].includes(res)) t = 'mat_' + res;
    else return;
  }

  // Validazione ore: AVIS può essere 0, gli altri > 0
  const oreRichieste = (t !== 'avis');
  if (oreRichieste) {
    if (!Number.isFinite(o) || o <= 0) return alert("Inserisci un numero di ore > 0");
  } else {
    if (!Number.isFinite(o)) o = 0;
  }

  const m = JSON.parse(localStorage.getItem('movimenti')) || [];
  m.push({ tipo: t, ore: o, data: d, note, id: Date.now() });
  localStorage.setItem('movimenti', JSON.stringify(m));
  location.reload();
}

function gestisciAutoOre() {
  const t = document.getElementById('in-tipo').value;
  const i = document.getElementById('in-ore');
  if (!i) return;

  if (t === 'malattia' || t === 'ferie_az') i.value = 8;
  else if (t === 'avis') i.value = 0;
  else i.value = "";
}

function toggleSettings() {
  const p = document.getElementById('settings-panel');
  if (!p) return;

  p.style.display = p.style.display === 'block' ? 'none' : 'block';

  if (p.style.display === 'block') {
    const s = getSettings();
    const c = document.getElementById('settings-inputs');
    if (!c) return;

    c.innerHTML = '';
    ['ferie', 'rol', 'conto'].forEach(id => {
      c.innerHTML += `<div style="margin-bottom:10px; border-bottom:1px solid #EEE; padding-bottom:10px;">
        <div style="font-weight:700; font-size:12px; color:#007AFF;">${id.toUpperCase()}</div>
        <div style="display:flex; gap:8px;">
          <div style="flex:1;">
            <label style="font-size:9px;">RES. AP</label>
            <input type="number" id="set-ap-${id}" value="${s.residuiAP[id]}" step="0.00001" style="width:100%;">
          </div>
          <div style="flex:1;">
            <label style="font-size:9px;">SPET.</label>
            <input type="number" id="set-spet-${id}" value="${s.spettanteAnnuo[id]}" step="0.00001" style="width:100%;">
          </div>
        </div>
      </div>`;
    });

    c.innerHTML += `<button onclick="azzeraGoduti()" style="width:100%; background:#FF3B30; color:white; border:none; padding:12px; border-radius:8px; font-weight:700; margin-top:10px;">
      CONSOLIDA E AZZERA
    </button>`;
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

function elimina(id) {
  if (!confirm("Eliminare?")) return;
  const m = JSON.parse(localStorage.getItem('movimenti')) || [];
  localStorage.setItem('movimenti', JSON.stringify(m.filter(x => x.id !== id)));
  location.reload();
}

function setupDate() {
  const cd = document.getElementById('current-date');
  if (cd) {
    cd.innerText = new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  const inData = document.getElementById('in-data');
  if (inData) inData.value = todayLocalISO();
}

function exportBackup() {
  const payload = {
    m: JSON.parse(localStorage.getItem('movimenti')) || [],
    s: getSettings()
  };
  const b = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = 'iWork_Backup.json';
  a.click();
}

function importBackup(e) {
  const file = e?.target?.files?.[0];
  if (!file) return;

  const r = new FileReader();
  r.onload = (x) => {
    const j = JSON.parse(x.target.result);
    localStorage.setItem('movimenti', JSON.stringify(j.m || []));
    localStorage.setItem('userSettings', JSON.stringify(j.s || defaultSettings));
    location.reload();
  };
  r.readAsText(file);
}
