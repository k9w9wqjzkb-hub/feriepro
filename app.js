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
function toITDate(iso) {
  return new Date(iso).toLocaleDateString('it-IT');
}

// Calcolo Pasqua (Meeus/Jones/Butcher)
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
  const pasquaISO = isoLocalDate(anno, pasqua.getMonth(), pasqua.getDate());

  const pasquetta = new Date(pasqua);
  pasquetta.setDate(pasqua.getDate() + 1);
  const pasquettaISO = isoLocalDate(anno, pasquetta.getMonth(), pasquetta.getDate());

  return [...fixed, pasquaISO, pasquettaISO];
}

/* =========================
   STORAGE
   ========================= */
function initSettings() {
  if (!localStorage.getItem('userSettings')) {
    localStorage.setItem('userSettings', JSON.stringify(defaultSettings));
  }
}
function getSettings() {
  return JSON.parse(localStorage.getItem('userSettings')) || defaultSettings;
}
function getMovimenti() {
  return JSON.parse(localStorage.getItem('movimenti')) || [];
}
function setMovimenti(m) {
  localStorage.setItem('movimenti', JSON.stringify(m));
}

/* =========================
   MODALE UNICA (ADD + EDIT)
   ========================= */
let editingId = null;

function ensureAddEditModal() {
  // La dashboard (index) ce l'ha già: qui aggiungiamo solo se manca (ferie/malattia)
  if (document.getElementById('add-modal')) return;

  const body = document.body;

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-backdrop';
  overlay.addEventListener('click', () => toggleModal(false));

  const modal = document.createElement('div');
  modal.id = 'add-modal';
  modal.className = 'ios-page-sheet';
  modal.style.height = '72%';

  modal.innerHTML = `
    <div class="modal-nav">
      <button onclick="toggleModal(false)" class="btn-link">Annulla</button>
      <span class="modal-title" style="font-weight:600;" id="modal-form-title">Nuovo Record</span>
      <button onclick="saveData()" class="btn-link" style="font-weight:700;" id="modal-form-save">Aggiungi</button>
    </div>
    <div style="padding: 20px; background: #F2F2F7; height: 100%;">
      <div class="ios-input-group">
        <div class="ios-input-row">
          <label>Tipo</label>
          <select id="in-tipo" onchange="gestisciAutoOre()">
            <option value="ferie">Ferie (Personali)</option>
            <option value="ferie_az">Ferie (Aziendali)</option>
            <option value="rol">Permessi (ROL)</option>
            <option value="conto">Perm.B.Ore</option>
            <option value="malattia">Malattia</option>
            <option value="avis">🩸 AVIS</option>
            <option value="maturazione">➕ Maturazione</option>
          </select>
        </div>
        <div class="ios-input-row">
          <label>Ore</label>
          <input type="number" id="in-ore" step="0.01" placeholder="0.00">
        </div>
        <div class="ios-input-row">
          <label>Data</label>
          <input type="date" id="in-data">
        </div>
        <div class="ios-input-row">
          <label>Note</label>
          <input type="text" id="in-note" placeholder="Opzionale">
        </div>
        <div class="ios-input-row">
          <label>Solo Pianificato</label>
          <input type="checkbox" id="soloPianificato">
        </div>
      </div>
    </div>
  `;

  body.appendChild(overlay);
  body.appendChild(modal);

  // pulsante + floating (solo se la pagina non lo ha)
  if (!document.querySelector('.ios-fab')) {
    const fab = document.createElement('button');
    fab.className = 'ios-fab';
    fab.textContent = '+';
    fab.addEventListener('click', () => toggleModal(true));
    body.appendChild(fab);
  }
}

function openEditModal(id) {
  const mov = getMovimenti();
  const r = mov.find(x => x.id === id);
  if (!r) return alert('Record non trovato');

  ensureAddEditModal();

  editingId = id;

  const title = document.getElementById('modal-form-title');
  const saveBtn = document.getElementById('modal-form-save');
  if (title) title.textContent = 'Modifica Record';
  if (saveBtn) saveBtn.textContent = 'Salva';

  const tipoEl = document.getElementById('in-tipo');
  const oreEl = document.getElementById('in-ore');
  const dataEl = document.getElementById('in-data');
  const noteEl = document.getElementById('in-note');
  const pianEl = document.getElementById('soloPianificato');

  if (tipoEl) tipoEl.value = r.tipo;
  if (oreEl) oreEl.value = (Number.isFinite(Number(r.ore)) ? Number(r.ore) : 0);
  if (dataEl) dataEl.value = r.data;
  if (noteEl) noteEl.value = r.note || '';
  if (pianEl) pianEl.checked = !!(r.pianificato || r.soloPianificato);

  // coerente col tipo
  gestisciAutoOre();

  toggleModal(true);
}

function resetModalToAdd() {
  editingId = null;
  const title = document.getElementById('modal-form-title');
  const saveBtn = document.getElementById('modal-form-save');
  if (title) title.textContent = 'Nuovo Record';
  if (saveBtn) saveBtn.textContent = 'Aggiungi';

  const tipoEl = document.getElementById('in-tipo');
  const oreEl = document.getElementById('in-ore');
  const dataEl = document.getElementById('in-data');
  const noteEl = document.getElementById('in-note');
  const pianEl = document.getElementById('soloPianificato');

  if (tipoEl) tipoEl.value = 'ferie';
  if (oreEl) oreEl.value = '';
  if (dataEl) dataEl.value = todayLocalISO();
  if (noteEl) noteEl.value = '';
  if (pianEl) pianEl.checked = false;

  gestisciAutoOre();
}

/* =========================
   INIT
   ========================= */
window.onload = () => {
  initSettings();

  const activePage = document.body.getAttribute('data-page');

  // modal unica anche fuori index
  ensureAddEditModal();

  popolaFiltroAnni();

  const fA = document.getElementById('filter-anno');
  const fT = document.getElementById('filter-tipo');
  if (fA) fA.onchange = () => {
    renderizzaTabella(activePage);
    aggiornaInterfaccia(activePage);
    if (activePage === 'calendario') renderizzaCalendario();
  };
  if (fT) fT.onchange = () => {
    renderizzaTabella(activePage);
    aggiornaInterfaccia(activePage);
    if (activePage === 'calendario') renderizzaCalendario();
  };

  aggiornaInterfaccia(activePage);
  if (document.getElementById('history-body')) renderizzaTabella(activePage);
  if (activePage === 'calendario') renderizzaCalendario();

  setupDate();
  setupLiquidIndicator();
};

/* =========================
   LIQUID TAB INDICATOR
   ========================= */
function setupLiquidIndicator(){
  const bar = document.querySelector('.tab-bar.tab-liquid');
  const indicator = document.querySelector('.tab-bar.tab-liquid .liquid-indicator');
  if (!bar || !indicator) return;

  const active = bar.querySelector('.tab-item.active') || bar.querySelector('.tab-item');
  if (!active) return;

  const move = () => {
    const tabWidth = active.offsetWidth;
    const tabLeft = active.offsetLeft;
    indicator.style.width = Math.max(50, tabWidth - 12) + 'px';
    indicator.style.transform = `translateY(-50%) translateX(${tabLeft + 6}px)`;
  };

  // move now + after layout
  move();
  requestAnimationFrame(move);

  window.addEventListener('resize', () => {
    const a = bar.querySelector('.tab-item.active') || active;
    if (!a) return;
    const tabWidth = a.offsetWidth;
    const tabLeft = a.offsetLeft;
    indicator.style.width = Math.max(50, tabWidth - 12) + 'px';
    indicator.style.transform = `translateY(-50%) translateX(${tabLeft + 6}px)`;
  });
}

/* =========================
   CALENDARIO (orizzontale)
   - anno corrente
   - festività rosso
   - ferie aziendali arancio
   - ferie personali verde
   - ROL giallo
   - malattia marrone
   - AVIS blu
   - pianificato: bordo tratteggiato (is-pian)
   ========================= */
function renderizzaCalendario() {
  const tableBody = document.getElementById('calendarBody');
  const tableHeader = document.getElementById('calendarHeader');
  if (!tableBody || !tableHeader) return;

  const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const anno = new Date().getFullYear();

  const movimentiAnno = getMovimenti().filter(m => new Date(m.data).getFullYear() === anno);
  const festivi = new Set(getFestivitaNazionaliIT(anno));
  const patrono = `${anno}-12-07`; // Sant'Ambrogio

  // Header
  tableHeader.innerHTML = '<th class="col-mese">MESE</th>';
  for (let i = 1; i <= 31; i++) tableHeader.innerHTML += `<th>${i}</th>`;
  tableBody.innerHTML = '';

  const sumOre = (arr) => arr.reduce((acc, x) => acc + (Number(x.ore) || 0), 0);
  const hasPian = (arr) => arr.some(x => !!(x.pianificato || x.soloPianificato));

  mesi.forEach((mese, indexMese) => {
    let riga = `<tr><td class="col-mese">${mese}</td>`;

    for (let giorno = 1; giorno <= 31; giorno++) {
      const dt = new Date(anno, indexMese, giorno);
      if (dt.getMonth() !== indexMese) {
        riga += `<td style="background:#F2F2F7;"></td>`;
        continue;
      }

      const dataISO = isoLocalDate(anno, indexMese, giorno);
      const dow = dt.getDay();

      let classe = "";
      let contenuto = "";

      // weekend
      if (dow === 0 || dow === 6) classe = "bg-weekend";

      // festività + patrono
      if (festivi.has(dataISO) || dataISO === patrono) {
        classe = "bg-festivo";
        if (dataISO === patrono) contenuto = "P";
      }

      const movGiorno = movimentiAnno.filter(m => m.data === dataISO);
      if (movGiorno.length) {
        const mal = movGiorno.filter(m => m.tipo === 'malattia');
        const ferAz = movGiorno.filter(m => m.tipo === 'ferie_az');
        const avis = movGiorno.filter(m => m.tipo === 'avis');
        const ferie = movGiorno.filter(m => m.tipo === 'ferie');
        const rol = movGiorno.filter(m => m.tipo === 'rol');
        const conto = movGiorno.filter(m => m.tipo === 'conto');

        // Priorità: malattia > ferie az > avis > ferie > rol > conto
        if (mal.length) {
          classe = "bg-malattia";
          contenuto = "M";
        } else if (ferAz.length) {
          classe = "bg-ferie-az";
          contenuto = "AZ";
          if (hasPian(ferAz)) classe += " is-pian";
        } else if (avis.length) {
          classe = "bg-avis";
          contenuto = "AV";
        } else if (ferie.length) {
          classe = "bg-ferie";
          const ore = sumOre(ferie);
          contenuto = (Math.abs(ore - 8) < 0.001) ? "F" : String(ore % 1 === 0 ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(ferie)) classe += " is-pian";
        } else if (rol.length) {
          classe = "bg-rol";
          const ore = sumOre(rol);
          contenuto = String(ore % 1 === 0 ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(rol)) classe += " is-pian";
        } else if (conto.length) {
          classe = "bg-conto";
          const ore = sumOre(conto);
          contenuto = String(ore % 1 === 0 ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(conto)) classe += " is-pian";
        }
      }

      riga += `<td class="${classe}">${contenuto}</td>`;
    }

    riga += `</tr>`;
    tableBody.innerHTML += riga;
  });
}

/* =========================
   FILTRI
   ========================= */
function popolaFiltroAnni() {
  const filterAnno = document.getElementById('filter-anno');
  if (!filterAnno) return;

  const movimenti = getMovimenti();
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

/* =========================
   DASHBOARD / CONSUNTIVO
   - Grande: SALDO (restanti reali)
   - Prev: SALDO - PIANIFICATO (sempre visibile)
   ========================= */
function aggiornaInterfaccia(page) {
  const movimenti = getMovimenti();
  const settings = getSettings();

  const filtroAnnoEl = document.getElementById('filter-anno');
  const filtroAnnoVal = filtroAnnoEl ? filtroAnnoEl.value : 'all';

  // Se "all" => per le CARD uso anno corrente
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
    const annoM = new Date(m.data).getFullYear();
    if (annoM !== annoSelezionato) return;

    const ore = Number(m.ore) || 0;
    const isPian = !!(m.pianificato || m.soloPianificato);

    if (m.tipo === 'malattia') {
      calcoli.malattia += ore;
      return;
    }

    if (m.tipo.startsWith('mat_')) {
      const cat = m.tipo.split('_')[1];
      if (calcoli[cat]) calcoli[cat].spet += ore;
      return;
    }

    if (m.tipo === 'avis') return;

    const tipoReale = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
    if (!calcoli[tipoReale]) return;

    if (isPian) calcoli[tipoReale].pian += ore;
    else calcoli[tipoReale].god += ore;
  });

  const fmtGG = (ore) => (ore / ORE_GIORNO).toFixed(2).replace('.', ',') + " gg";
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; };

  const saldoFerie = (calcoli.ferie.ap + calcoli.ferie.spet - calcoli.ferie.god);
  const saldoRol   = (calcoli.rol.ap + calcoli.rol.spet - calcoli.rol.god);
  const saldoConto = (calcoli.conto.ap + calcoli.conto.spet - calcoli.conto.god);

  setText('val-ferie', fmtGG(saldoFerie));
  setText('val-rol', fmtGG(saldoRol));
  setText('val-conto', fmtGG(saldoConto));
  setText('val-malattia', fmtGG(calcoli.malattia));

  // Prev sempre visibile (anche se 0 pianificato)
  setText('val-ferie-prev', "Prev: " + fmtGG(Math.max(0, saldoFerie - calcoli.ferie.pian)));
  setText('val-rol-prev',   "Prev: " + fmtGG(Math.max(0, saldoRol   - calcoli.rol.pian)));
  setText('val-conto-prev', "Prev: " + fmtGG(Math.max(0, saldoConto - calcoli.conto.pian)));

  // Consuntivo (ore)
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

/* =========================
   REPORT TABLE (✏️ ℹ️ 🗑)
   ========================= */
function renderizzaTabella(page) {
  const mov = getMovimenti();
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
      if (m.tipo === 'ferie_az') label = 'FERIE AZ.';
      if (m.tipo === 'malattia') label = 'MALATTIA';
      if (m.tipo === 'avis') label = 'AVIS';

      const oreNum = Number(m.ore);
      const oreTxt = (m.tipo === 'avis') ? '-' : (Number.isFinite(oreNum) ? oreNum.toFixed(2) + 'h' : '0.00h');

      const badgeClass = m.tipo.startsWith('mat_') ? 'maturazione' : m.tipo;

      const isPian = !!(m.pianificato || m.soloPianificato) && (m.tipo === 'ferie' || m.tipo === 'ferie_az' || m.tipo === 'rol' || m.tipo === 'conto');
      const pianTxt = isPian ? ' <span style="color:#8E8E93; font-weight:700;">(P)</span>' : '';

      return `<tr style="border-bottom:1px solid rgba(0,0,0,0.06);">
        <td style="padding:12px;">${toITDate(m.data)}</td>
        <td><span class="badge-${badgeClass}">${label}</span>${pianTxt}</td>
        <td style="font-weight:700;">${oreTxt}</td>
        <td class="azioni-cell">
          <div class="azioni-wrap">
            <button class="btn-azione" onclick="openEditModal(${m.id})" aria-label="Modifica">✏️</button>
            <button class="btn-azione" onclick="info(${m.id})" aria-label="Info">ℹ️</button>
            <button class="btn-azione" onclick="elimina(${m.id})" aria-label="Elimina">🗑️</button>
          </div>
        </td>
      </tr>`;
    })
    .join('');
}

/* =========================
   UI (modal / sheet)
   ========================= */
function toggleModal(show) {
  const modal = document.getElementById('add-modal');
  const overlay = document.getElementById('modal-overlay');
  if (!modal || !overlay) return;

  modal.classList.toggle('active', !!show);
  overlay.style.display = show ? 'block' : 'none';

  if (!show) {
    // tornando a "add"
    resetModalToAdd();
  }
}

function toggleSheet(show) {
  if (show) aggiornaInterfaccia(document.body.getAttribute('data-page'));
  document.getElementById('ios-sheet')?.classList.toggle('active', !!show);
  const o = document.getElementById('overlay-sheet');
  if (o) o.style.display = show ? 'block' : 'none';
}

/* =========================
   SAVE / AUTO ORE (ADD+EDIT)
   ========================= */
function saveData() {
  const tipoEl = document.getElementById('in-tipo');
  const oreEl = document.getElementById('in-ore');
  const dataEl = document.getElementById('in-data');
  const noteEl = document.getElementById('in-note');
  const pianEl = document.getElementById('soloPianificato');

  let t = tipoEl ? tipoEl.value : '';
  let o = parseFloat(oreEl ? oreEl.value : 'NaN');
  const d = dataEl ? dataEl.value : '';
  const note = noteEl ? (noteEl.value || '') : '';
  const pianFlag = pianEl ? !!pianEl.checked : false;

  if (!d) return alert('Data mancante');
  if (!t) return alert('Tipo mancante');

  if (t === 'maturazione') {
    const res = prompt('Destinazione? (ferie, rol, conto)', 'ferie');
    if (['ferie', 'rol', 'conto'].includes(res)) t = 'mat_' + res;
    else return;
  }

  // Validazione ore: AVIS può essere 0, gli altri > 0
  const oreRichieste = (t !== 'avis');
  if (oreRichieste) {
    if (!Number.isFinite(o) || o <= 0) return alert('Inserisci un numero di ore > 0');
  } else {
    if (!Number.isFinite(o)) o = 0;
    if (o < 0) return alert('Inserisci un numero di ore valido (>= 0)');
  }

  // pianificato si applica solo a ferie/rol/conto/ferie_az
  const pianificato = (t === 'ferie' || t === 'ferie_az' || t === 'rol' || t === 'conto') ? pianFlag : false;

  const mov = getMovimenti();

  if (editingId) {
    const idx = mov.findIndex(x => x.id === editingId);
    if (idx < 0) return alert('Record non trovato');
    mov[idx] = { ...mov[idx], tipo: t, ore: o, data: d, note, pianificato };
    delete mov[idx].soloPianificato;
  } else {
    mov.push({ tipo: t, ore: o, data: d, note, pianificato, id: Date.now() });
  }

  setMovimenti(mov);
  location.reload();
}

function gestisciAutoOre() {
  const t = document.getElementById('in-tipo')?.value;
  const i = document.getElementById('in-ore');
  if (!i || !t) return;

  if (t === 'malattia' || t === 'ferie_az') i.value = 8;
  else if (t === 'avis') i.value = 0;
  else if (!editingId) i.value = '';
}

/* =========================
   SETTINGS PANEL
   ========================= */
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
      c.innerHTML += `<div style="margin-bottom:10px; border-bottom:1px solid rgba(0,0,0,0.06); padding-bottom:10px;">
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

    c.innerHTML += `<button onclick="azzeraGoduti()" style="width:100%; background:#FF3B30; color:white; border:none; padding:12px; border-radius:8px; font-weight:700; margin-top:10px;">CONSOLIDA E AZZERA</button>`;
  }
}

function saveSettings() {
  const s = getSettings();
  ['ferie', 'rol', 'conto'].forEach(c => {
    s.residuiAP[c] = parseFloat(document.getElementById(`set-ap-${c}`)?.value) || 0;
    s.spettanteAnnuo[c] = parseFloat(document.getElementById(`set-spet-${c}`)?.value) || 0;
  });
  localStorage.setItem('userSettings', JSON.stringify(s));
  location.reload();
}

/* =========================
   CONSOLIDA / AZZERA
   ========================= */
function azzeraGoduti() {
  if (!confirm('Consolidare il saldo attuale al 01/01?')) return;

  let s = getSettings();
  const mov = getMovimenti();
  const dInizio = new Date(s.dataInizioConteggio);

  ['ferie', 'rol', 'conto'].forEach(cat => {
    let god = 0, mat = 0;

    mov.forEach(m => {
      if (new Date(m.data) >= dInizio) {
        const o = Number(m.ore) || 0;
        const isPian = !!(m.pianificato || m.soloPianificato);
        if (m.tipo === 'mat_' + cat) mat += o;
        else if (m.tipo === cat || (cat === 'ferie' && m.tipo === 'ferie_az')) {
          // consolido solo i GODUTI (non pianificati)
          if (!isPian) god += o;
        }
      }
    });

    s.residuiAP[cat] = (s.residuiAP[cat] + s.spettanteAnnuo[cat] + mat) - god;
    s.spettanteAnnuo[cat] = (cat === 'conto') ? 0 : (cat === 'ferie' ? 216 : 62);
  });

  s.dataInizioConteggio = new Date().getFullYear() + '-01-01';
  localStorage.setItem('userSettings', JSON.stringify(s));
  location.reload();
}

/* =========================
   AZIONI RECORD
   ========================= */
function elimina(id) {
  if (!confirm('Eliminare?')) return;
  const m = getMovimenti();
  setMovimenti(m.filter(x => x.id !== id));
  location.reload();
}

function info(id) {
  const m = getMovimenti();
  const r = m.find(x => x.id === id);
  if (!r) return alert('Record non trovato');

  let label = r.tipo.replace('mat_', 'MAT. ').toUpperCase();
  if (r.tipo === 'ferie_az') label = 'FERIE AZ.';
  if (r.tipo === 'malattia') label = 'MALATTIA';
  if (r.tipo === 'avis') label = 'AVIS';

  const ore = Number(r.ore) || 0;
  const oreTxt = (r.tipo === 'avis') ? '-' : ore.toFixed(2) + 'h';
  const pian = (r.pianificato || r.soloPianificato) ? 'Sì' : 'No';
  const note = (r.note || '').trim();

  alert(
    `Data: ${toITDate(r.data)}\n` +
    `Tipo: ${label}\n` +
    `Ore: ${oreTxt}\n` +
    ((r.tipo !== 'malattia' && !r.tipo.startsWith('mat_') && r.tipo !== 'avis') ? `Pianificato: ${pian}\n` : '') +
    (note ? `Note: ${note}` : '')
  );
}

/* =========================
   DATE + BACKUP
   ========================= */
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
  if (inData && !editingId) inData.value = todayLocalISO();
}

function exportBackup() {
  const payload = { m: getMovimenti(), s: getSettings() };
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
