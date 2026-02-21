// iWork - app.js (v25)
// PWA: Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('SW registrato', reg))
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
   HELPERS
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
  try { return new Date(iso).toLocaleDateString('it-IT'); } catch { return iso; }
}

function fmtGG(ore) {
  return (ore / ORE_GIORNO).toFixed(2).replace('.', ',') + ' gg';
}

// Pasqua (Meeus/Jones/Butcher)
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
   LIQUID TAB BAR
   ========================= */
function initLiquidTabBar() {
  const bar = document.querySelector('nav.tab-bar');
  if (!bar) return;

  bar.classList.add('tab-liquid');

  let indicator = bar.querySelector('.liquid-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'liquid-indicator';
    bar.prepend(indicator);
  }

  const items = [...bar.querySelectorAll('.tab-item')];
  if (!items.length) return;

  const page = (document.body.getAttribute('data-page') || '').trim();
  const byPage = {
    index: 'index.html',
    ferie: 'ferie.html',
    malattia: 'malattia.html',
    calendario: 'calendario.html'
  };
  const targetHref = byPage[page];

  items.forEach(a => a.classList.remove('active'));
  let active = null;
  if (targetHref) {
    active = items.find(a => (a.getAttribute('href') || '').endsWith(targetHref)) || null;
  }
  if (!active) {
    const path = (location.pathname || '').split('/').pop() || 'index.html';
    active = items.find(a => (a.getAttribute('href') || '').endsWith(path)) || items[0];
  }
  if (active) active.classList.add('active');

  const place = () => {
    const a = bar.querySelector('.tab-item.active') || items[0];
    if (!a) return;
    const rectA = a.getBoundingClientRect();
    const rectB = bar.getBoundingClientRect();
    const left = rectA.left - rectB.left;
    indicator.style.width = `${rectA.width}px`;
    indicator.style.height = `${Math.max(54, rectA.height)}px`;
    indicator.style.transform = `translateY(-50%) translateX(${left}px)`;
  };

  place();
  window.addEventListener('resize', place);
  window.addEventListener('orientationchange', place);
}

/* =========================
   MODALS (ADD / EDIT)
   ========================= */
function ensureModalExists() {
  const existingSheet = document.getElementById('add-modal');
  const existingOverlay = document.getElementById('modal-overlay');

  // If modal exists but is incomplete (common on ferie/malattia), rebuild its content safely.
  if (existingSheet && existingOverlay) {
    if (!document.getElementById('in-tipo') || !document.getElementById('in-ore') || !document.getElementById('in-data')) {
      existingSheet.style.height = existingSheet.style.height || '72%';
      existingSheet.innerHTML = `
        <div class="modal-nav">
          <button onclick="toggleModal(false)" class="btn-link">Annulla</button>
          <span class="modal-title" id="modal-title" style="font-weight:600;">Nuovo Record</span>
          <button onclick="saveData()" class="btn-link" id="modal-save" style="font-weight:700;">Aggiungi</button>
        </div>
        <div class="sheet-body" style="padding: 20px; background: var(--bg); height: 100%;">
          <input type="hidden" id="edit-id" value="">
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
            <div class="ios-input-row" id="row-pian" style="border-bottom:none;">
              <label>Solo Pianificato</label>
              <input type="checkbox" id="soloPianificato" style="width:auto;">
            </div>
          </div>
        </div>
      `;
    }
    if (!document.getElementById('edit-id')) {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.id = 'edit-id';
      existingSheet.prepend(h);
    }
    return;
  }

  const overlay = document.createElement('div');
  overlay.id = 'modal-overlay';
  overlay.className = 'modal-backdrop';
  overlay.addEventListener('click', () => toggleModal(false));

  const sheet = document.createElement('div');
  sheet.id = 'add-modal';
  sheet.className = 'ios-page-sheet';
  sheet.style.height = '72%';
  sheet.innerHTML = `
    <div class="modal-nav">
      <button onclick="toggleModal(false)" class="btn-link">Annulla</button>
      <span class="modal-title" id="modal-title" style="font-weight:600;">Nuovo Record</span>
      <button onclick="saveData()" class="btn-link" id="modal-save" style="font-weight:700;">Aggiungi</button>
    </div>
    <div class="sheet-body" style="padding: 20px; background: var(--bg); height: 100%;">
      <input type="hidden" id="edit-id" value="">
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
        <div class="ios-input-row" id="row-pian" style="border-bottom:none;">
          <label>Solo Pianificato</label>
          <input type="checkbox" id="soloPianificato" style="width:auto;">
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);
}

function setModalMode(mode) {
  const title = document.getElementById('modal-title');
  const btn = document.getElementById('modal-save');
  const editId = document.getElementById('edit-id');
  if (mode === 'edit') {
    if (title) title.textContent = 'Modifica Record';
    if (btn) btn.textContent = 'Salva';
  } else {
    if (title) title.textContent = 'Nuovo Record';
    if (btn) btn.textContent = 'Aggiungi';
    if (editId) editId.value = '';
  }
}

function toggleModal(show) {
  ensureModalExists();
  const sheet = document.getElementById('add-modal');
  const overlay = document.getElementById('modal-overlay');
  if (sheet) sheet.classList.toggle('active', !!show);
  if (overlay) overlay.style.display = show ? 'block' : 'none';
}

function openAddModal() {
  ensureModalExists();
  setModalMode('add');

  const tipo = document.getElementById('in-tipo');
  const ore = document.getElementById('in-ore');
  const data = document.getElementById('in-data');
  const note = document.getElementById('in-note');
  const pian = document.getElementById('soloPianificato');

  if (tipo) tipo.value = 'ferie';
  if (ore) ore.value = '';
  if (data) data.value = todayLocalISO();
  if (note) note.value = '';
  if (pian) pian.checked = false;

  gestisciAutoOre();
  toggleModal(true);
}

function openEditModal(id) {
  ensureModalExists();
  const mov = getMovimenti();
  const r = mov.find(x => x.id === id);
  if (!r) return alert('Record non trovato');

  setModalMode('edit');
  const editId = document.getElementById('edit-id');
  if (editId) editId.value = String(id);

  const tipo = document.getElementById('in-tipo');
  const ore = document.getElementById('in-ore');
  const data = document.getElementById('in-data');
  const note = document.getElementById('in-note');
  const pian = document.getElementById('soloPianificato');
  const rowPian = document.getElementById('row-pian');

  if (tipo) tipo.value = r.tipo;
  if (ore) ore.value = (Number(r.ore) || 0).toFixed(2);
  if (data) data.value = r.data;
  if (note) note.value = r.note || '';

  const canHavePian = (r.tipo === 'ferie' || r.tipo === 'ferie_az' || r.tipo === 'rol' || r.tipo === 'conto');
  if (rowPian) rowPian.style.display = canHavePian ? 'flex' : 'none';
  if (pian) pian.checked = !!r.pianificato;

  gestisciAutoOre();
  toggleModal(true);
}

/* =========================
   SHEET (CONSUNTIVO)
   ========================= */
function toggleSheet(show) {
  const sheet = document.getElementById('ios-sheet');
  const overlay = document.getElementById('overlay-sheet');
  if (sheet) sheet.classList.toggle('active', !!show);
  if (overlay) overlay.style.display = show ? 'block' : 'none';
  if (show) aggiornaInterfaccia(document.body.getAttribute('data-page') || 'index');
}

/* =========================
   PAGE INIT
   ========================= */
window.addEventListener('load', () => {
  initSettings();
  initLiquidTabBar();

  const page = document.body.getAttribute('data-page') || 'index';

  const fab = document.querySelector('.ios-fab');
  if (fab) {
    fab.addEventListener('click', (e) => {
      e.preventDefault();
      openAddModal();
    });
  }

  const cd = document.getElementById('current-date');
  if (cd) {
    cd.innerText = new Date().toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    });
  }

  popolaFiltroAnni();
  const fA = document.getElementById('filter-anno');
  const fT = document.getElementById('filter-tipo');
  if (fA) fA.onchange = () => { renderizzaTabella(page); aggiornaInterfaccia(page); if (page === 'calendario') renderizzaCalendario(); };
  if (fT) fT.onchange = () => { renderizzaTabella(page); aggiornaInterfaccia(page); if (page === 'calendario') renderizzaCalendario(); };

  aggiornaInterfaccia(page);
  if (document.getElementById('history-body')) renderizzaTabella(page);
  if (page === 'calendario') renderizzaCalendario();
});

/* =========================
   CALENDARIO
   ========================= */
function renderizzaCalendario() {
  const tableBody = document.getElementById('calendarBody');
  const tableHeader = document.getElementById('calendarHeader');
  if (!tableBody || !tableHeader) return;

  const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"]; 
  const anno = new Date().getFullYear();
  const movimentiAnno = getMovimenti().filter(m => new Date(m.data).getFullYear() === anno);
  const festivi = new Set(getFestivitaNazionaliIT(anno));
  const patrono = `${anno}-12-07`;

  tableHeader.innerHTML = '<th class="col-mese">MESE</th>';
  for (let i = 1; i <= 31; i++) tableHeader.innerHTML += `<th>${i}</th>`;
  tableBody.innerHTML = '';

  const sumOre = (arr) => arr.reduce((acc, x) => acc + (Number(x.ore) || 0), 0);
  const hasPian = (arr) => arr.some(x => !!x.pianificato);

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

      let classe = '';
      let contenuto = '';

      if (dow === 0 || dow === 6) classe = 'bg-weekend';
      if (festivi.has(dataISO) || dataISO === patrono) {
        classe = 'bg-festivo';
        if (dataISO === patrono) contenuto = 'P';
      }

      const movGiorno = movimentiAnno.filter(m => m.data === dataISO);
      if (movGiorno.length) {
        const mal = movGiorno.filter(m => m.tipo === 'malattia');
        const ferAz = movGiorno.filter(m => m.tipo === 'ferie_az');
        const avis = movGiorno.filter(m => m.tipo === 'avis');
        const ferie = movGiorno.filter(m => m.tipo === 'ferie');
        const rol = movGiorno.filter(m => m.tipo === 'rol');
        const conto = movGiorno.filter(m => m.tipo === 'conto');

        if (mal.length) {
          classe = 'bg-malattia';
          contenuto = 'M';
        } else if (ferAz.length) {
          classe = 'bg-ferie-az';
          contenuto = 'AZ';
          if (hasPian(ferAz)) classe += ' is-pian';
        } else if (avis.length) {
          classe = 'bg-avis';
          contenuto = 'AV';
        } else if (ferie.length) {
          classe = 'bg-ferie';
          const ore = sumOre(ferie);
          contenuto = (Math.abs(ore - 8) < 0.001) ? 'F' : String(ore % 1 === 0 ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(ferie)) classe += ' is-pian';
        } else if (rol.length) {
          classe = 'bg-rol';
          const ore = sumOre(rol);
          contenuto = String(ore % 1 === 0 ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(rol)) classe += ' is-pian';
        } else if (conto.length) {
          classe = 'bg-conto';
          const ore = sumOre(conto);
          contenuto = String(ore % 1 === 0 ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(conto)) classe += ' is-pian';
        }
      }

      riga += `<td class="${classe}">${contenuto}</td>`;
    }
    riga += `</tr>`;
    tableBody.innerHTML += riga;
  });
}

/* =========================
   FILTER YEARS
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
   ========================= */
function aggiornaInterfaccia(page) {
  const movimenti = getMovimenti();
  const settings = getSettings();

  const filtroAnnoEl = document.getElementById('filter-anno');
  const filtroAnnoVal = filtroAnnoEl ? filtroAnnoEl.value : 'all';
  const annoSelezionato = (filtroAnnoEl && filtroAnnoVal !== 'all')
    ? parseInt(filtroAnnoVal, 10)
    : new Date().getFullYear();
  const isAnnoCorrente = annoSelezionato === new Date().getFullYear();

  const calcoli = {
    ferie: { ap: isAnnoCorrente ? settings.residuiAP.ferie : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.ferie : 0, god: 0, pian: 0 },
    rol: { ap: isAnnoCorrente ? settings.residuiAP.rol : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.rol : 0, god: 0, pian: 0 },
    conto: { ap: isAnnoCorrente ? settings.residuiAP.conto : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.conto : 0, god: 0, pian: 0 },
    malattia: 0
  };

  movimenti.forEach(m => {
    const annoM = new Date(m.data).getFullYear();
    if (annoM !== annoSelezionato) return;
    const ore = Number(m.ore) || 0;

    if (m.tipo === 'malattia') { calcoli.malattia += ore; return; }
    if (m.tipo.startsWith('mat_')) {
      const cat = m.tipo.split('_')[1];
      if (calcoli[cat]) calcoli[cat].spet += ore;
      return;
    }
    if (m.tipo === 'avis') return;

    const tipoReale = (m.tipo === 'ferie_az') ? 'ferie' : m.tipo;
    if (!calcoli[tipoReale]) return;
    if (m.pianificato) calcoli[tipoReale].pian += ore;
    else calcoli[tipoReale].god += ore;
  });

  const saldoFerie = calcoli.ferie.ap + calcoli.ferie.spet - calcoli.ferie.god;
  const saldoRol = calcoli.rol.ap + calcoli.rol.spet - calcoli.rol.god;
  const saldoConto = calcoli.conto.ap + calcoli.conto.spet - calcoli.conto.god;

  const setText = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };
  if (document.getElementById('val-ferie')) setText('val-ferie', fmtGG(saldoFerie));
  if (document.getElementById('val-rol')) setText('val-rol', fmtGG(saldoRol));
  if (document.getElementById('val-conto')) setText('val-conto', fmtGG(saldoConto));
  if (document.getElementById('val-malattia')) setText('val-malattia', fmtGG(calcoli.malattia));

  // Prev (if elements exist)
  const prevFerie = Math.max(0, saldoFerie - calcoli.ferie.pian);
  const prevRol = Math.max(0, saldoRol - calcoli.rol.pian);
  const prevConto = Math.max(0, saldoConto - calcoli.conto.pian);
  if (document.getElementById('val-ferie-prev')) setText('val-ferie-prev', `Prev: ${fmtGG(prevFerie)}`);
  if (document.getElementById('val-rol-prev')) setText('val-rol-prev', `Prev: ${fmtGG(prevRol)}`);
  if (document.getElementById('val-conto-prev')) setText('val-conto-prev', `Prev: ${fmtGG(prevConto)}`);

  // Consuntivo table
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
   TABLE (REPORT)
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
      const isPian = !!m.pianificato && (m.tipo === 'ferie' || m.tipo === 'ferie_az' || m.tipo === 'rol' || m.tipo === 'conto');
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
   SAVE / AUTO ORE
   ========================= */
function gestisciAutoOre() {
  const t = document.getElementById('in-tipo')?.value;
  const i = document.getElementById('in-ore');
  const rowPian = document.getElementById('row-pian');
  if (!t || !i) return;

  const canHavePian = (t === 'ferie' || t === 'ferie_az' || t === 'rol' || t === 'conto');
  if (rowPian) rowPian.style.display = canHavePian ? 'flex' : 'none';

  if (t === 'malattia' || t === 'ferie_az') i.value = 8;
  else if (t === 'avis') i.value = 0;
  else if (!document.getElementById('edit-id')?.value) i.value = '';
}

function saveData() {
  ensureModalExists();
  const editId = document.getElementById('edit-id')?.value || '';
  const t = document.getElementById('in-tipo')?.value;
  let o = parseFloat(document.getElementById('in-ore')?.value);
  const d = document.getElementById('in-data')?.value;
  const note = document.getElementById('in-note') ? (document.getElementById('in-note').value || '') : '';
  const pianFlag = document.getElementById('soloPianificato')?.checked || false;

  if (!d) return alert('Data mancante');
  if (!t) return alert('Tipo mancante');

  if (t !== 'avis') {
    if (!Number.isFinite(o) || o <= 0) return alert('Inserisci un numero di ore > 0');
  } else {
    if (!Number.isFinite(o) || o < 0) o = 0;
  }

  const pianificato = (t === 'ferie' || t === 'ferie_az' || t === 'rol' || t === 'conto') ? pianFlag : false;
  const mov = getMovimenti();

  if (editId) {
    const idNum = Number(editId);
    const idx = mov.findIndex(x => x.id === idNum);
    if (idx < 0) return alert('Record non trovato');
    mov[idx] = { ...mov[idx], tipo: t, ore: o, data: d, note, pianificato };
    setMovimenti(mov);
    toggleModal(false);
    location.reload();
    return;
  }

  mov.push({ tipo: t, ore: o, data: d, note, pianificato, id: Date.now() });
  setMovimenti(mov);
  toggleModal(false);
  location.reload();
}

/* =========================
   RECORD ACTIONS
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
  const pian = r.pianificato ? 'Sì' : 'No';
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
   SETTINGS PANEL
   ========================= */
function toggleSettings() {
  const p = document.getElementById('settings-panel');
  if (!p) return;
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
  if (p.style.display !== 'block') return;

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

function saveSettings() {
  const s = getSettings();
  ['ferie', 'rol', 'conto'].forEach(c => {
    s.residuiAP[c] = parseFloat(document.getElementById(`set-ap-${c}`)?.value) || 0;
    s.spettanteAnnuo[c] = parseFloat(document.getElementById(`set-spet-${c}`)?.value) || 0;
  });
  localStorage.setItem('userSettings', JSON.stringify(s));
  location.reload();
}

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
        if (m.tipo === 'mat_' + cat) mat += o;
        else if (m.tipo === cat || (cat === 'ferie' && m.tipo === 'ferie_az')) {
          if (!m.pianificato) god += o;
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
   BACKUP
   ========================= */
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
