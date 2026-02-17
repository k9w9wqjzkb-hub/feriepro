// iWork - app.js (v22) - Dark Glass + PWA + Calendario + Modifica Modale

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
  dataInizioConteggio: `${new Date().getFullYear()}-01-01`,
  annoRiferimento: new Date().getFullYear()
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
  } else {
    // patch soft: se mancano campi
    const s = getSettings();
    if (!s.annoRiferimento) s.annoRiferimento = new Date().getFullYear();
    if (!s.dataInizioConteggio) s.dataInizioConteggio = `${new Date().getFullYear()}-01-01`;
    if (!s.residuiAP) s.residuiAP = { ...defaultSettings.residuiAP };
    if (!s.spettanteAnnuo) s.spettanteAnnuo = { ...defaultSettings.spettanteAnnuo };
    localStorage.setItem('userSettings', JSON.stringify(s));
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
   INIT
   ========================= */
window.addEventListener('load', () => {
  initSettings();

  const activePage = document.body.getAttribute('data-page') || 'index';

  // filtri (se presenti)
  popolaFiltroAnni();
  const fA = document.getElementById('filter-anno');
  const fT = document.getElementById('filter-tipo');
  const onFilter = () => {
    renderizzaTabella(activePage);
    aggiornaInterfaccia(activePage);
    if (activePage === 'calendario') renderizzaCalendario();
  };
  if (fA) fA.onchange = onFilter;
  if (fT) fT.onchange = onFilter;

  aggiornaInterfaccia(activePage);
  if (document.getElementById('history-body')) renderizzaTabella(activePage);
  if (activePage === 'calendario') renderizzaCalendario();

  setupDate();
  initLiquidTabBar();
  ensureEditModal();
});

/* =========================
   LIQUID TAB BAR (goccia)
   ========================= */
function initLiquidTabBar() {
  const nav = document.querySelector('nav.tab-bar');
  if (!nav) return;

  nav.classList.add('tab-liquid');

  // Wrap emoji into span.tab-ico (so indicator can cover both)
  nav.querySelectorAll('a.tab-item').forEach(a => {
    // If first child is a text node with emoji
    const first = a.firstChild;
    if (first && first.nodeType === Node.TEXT_NODE) {
      const emoji = (first.textContent || '').trim();
      if (emoji) {
        const ico = document.createElement('span');
        ico.className = 'tab-ico';
        ico.textContent = emoji;
        a.insertBefore(ico, first);
        first.textContent = '';
      }
    }
    // Ensure label span class
    const sp = a.querySelector('span');
    if (sp) sp.classList.add('tab-label');
  });

  // Ensure indicator
  let indicator = nav.querySelector('.liquid-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'liquid-indicator';
    nav.appendChild(indicator);
  }

  const setActiveFromUrl = () => {
    const path = location.pathname.split('/').pop() || 'index.html';
    nav.querySelectorAll('a.tab-item').forEach(a => {
      const href = (a.getAttribute('href') || '').split('/').pop();
      a.classList.toggle('active', href === path);
    });
  };

  const move = () => {
    const active = nav.querySelector('a.tab-item.active') || nav.querySelector('a.tab-item');
    if (!active) return;

    const navRect = nav.getBoundingClientRect();
    const r = active.getBoundingClientRect();

    // Indicator should cover icon + label (entire anchor)
    const left = r.left - navRect.left;
    const top = r.top - navRect.top;

    indicator.style.transform = `translate(${left}px, ${top}px)`;
    indicator.style.width = `${r.width}px`;
    indicator.style.height = `${r.height}px`;
  };

  // Initial
  setActiveFromUrl();
  move();

  // On click, update quickly (page navigates anyway)
  nav.querySelectorAll('a.tab-item').forEach(a => {
    a.addEventListener('click', () => {
      nav.querySelectorAll('a.tab-item').forEach(x => x.classList.remove('active'));
      a.classList.add('active');
      move();
    });
  });

  window.addEventListener('resize', move);
  // Slight delay after load (fonts/layout)
  setTimeout(move, 60);
}

/* =========================
   CALENDARIO (orizzontale)
   - annoRiferimento (settings) o anno corrente
   - festività rosso
   - ferie aziendali arancio
   - ferie personali verde
   - ROL giallo
   - conto ore turchese
   - malattia marrone
   - AVIS blu
   - pianificato: bordo tratteggiato (is-pian)
   ========================= */
function renderizzaCalendario() {
  const tableBody = document.getElementById('calendarBody');
  const tableHeader = document.getElementById('calendarHeader');
  if (!tableBody || !tableHeader) return;

  const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  const anno = (getSettings().annoRiferimento || new Date().getFullYear());

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
        riga += `<td class="bg-empty"></td>`;
        continue;
      }

      const dataISO = isoLocalDate(anno, indexMese, giorno);
      const dow = dt.getDay(); // 0 dom - 6 sab

      let classe = "";
      let contenuto = "";

      // weekend base
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
        const ferie = movGiorno.filter(m => m.tipo === 'ferie');
        const rol = movGiorno.filter(m => m.tipo === 'rol');
        const conto = movGiorno.filter(m => m.tipo === 'conto');
        const avis = movGiorno.filter(m => m.tipo === 'avis');

        // Priorità: malattia > ferie aziendali > ferie > rol > conto > avis
        if (mal.length) {
          classe = "bg-malattia";
          contenuto = "M";
        } else if (ferAz.length) {
          classe = "bg-ferie-az";
          contenuto = "AZ";
          if (hasPian(ferAz)) classe += " is-pian";
        } else if (ferie.length) {
          classe = "bg-ferie";
          const ore = sumOre(ferie);
          contenuto = (Math.abs(ore - 8) < 0.001) ? "F" : String((ore % 1 === 0) ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(ferie)) classe += " is-pian";
        } else if (rol.length) {
          classe = "bg-rol";
          const ore = sumOre(rol);
          contenuto = String((ore % 1 === 0) ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(rol)) classe += " is-pian";
        } else if (conto.length) {
          classe = "bg-conto";
          const ore = sumOre(conto);
          contenuto = String((ore % 1 === 0) ? ore.toFixed(0) : ore.toFixed(1)).replace('.', ',');
          if (hasPian(conto)) classe += " is-pian";
        } else if (avis.length) {
          classe = "bg-avis";
          contenuto = "AV";
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
   - GRANDE: saldo effettivo (AP + SPET − GOD)
   - PICCOLO "Prev:": saldo − pianificato (sempre visibile)
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
    rol:   { ap: isAnnoCorrente ? settings.residuiAP.rol   : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.rol   : 0, god: 0, pian: 0 },
    conto: { ap: isAnnoCorrente ? settings.residuiAP.conto : 0, spet: isAnnoCorrente ? settings.spettanteAnnuo.conto : 0, god: 0, pian: 0 },
    malattia: 0
  };

  movimenti.forEach(m => {
    const annoM = new Date(m.data).getFullYear();
    if (annoM !== annoSelezionato) return;

    const ore = Number(m.ore) || 0;
    const pian = !!(m.pianificato || m.soloPianificato);

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

    if (pian) calcoli[tipoReale].pian += ore;
    else calcoli[tipoReale].god += ore;
  });

  const fmtGG = (ore) => (ore / ORE_GIORNO).toFixed(2).replace('.', ',') + " gg";
  const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };

  const saldoFerie = (calcoli.ferie.ap + calcoli.ferie.spet - calcoli.ferie.god);
  const saldoRol   = (calcoli.rol.ap   + calcoli.rol.spet   - calcoli.rol.god);
  const saldoConto = (calcoli.conto.ap + calcoli.conto.spet - calcoli.conto.god);

  const prevFerie = Math.max(0, saldoFerie - calcoli.ferie.pian);
  const prevRol   = Math.max(0, saldoRol   - calcoli.rol.pian);
  const prevConto = Math.max(0, saldoConto - calcoli.conto.pian);

  setTxt('val-ferie', fmtGG(saldoFerie));
  setTxt('val-rol', fmtGG(saldoRol));
  setTxt('val-conto', fmtGG(saldoConto));
  setTxt('val-malattia', fmtGG(calcoli.malattia));

  // Prev: sempre visibile (anche 0)
  setTxt('val-ferie-prev', `Prev: ${fmtGG(prevFerie)}`);
  setTxt('val-rol-prev',   `Prev: ${fmtGG(prevRol)}`);
  setTxt('val-conto-prev', `Prev: ${fmtGG(prevConto)}`);

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
            <button class="btn-azione" onclick="modifica(${m.id})" aria-label="Modifica">✏️</button>
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
function toggleModal(s) {
  const modal = document.getElementById('add-modal');
  const overlay = document.getElementById('modal-overlay');
  if (modal) modal.classList.toggle('active', !!s);
  if (overlay) overlay.style.display = s ? 'block' : 'none';
}
function toggleSheet(s) {
  if (s) aggiornaInterfaccia(document.body.getAttribute('data-page'));
  const sheet = document.getElementById('ios-sheet');
  const overlay = document.getElementById('overlay-sheet');
  if (sheet) sheet.classList.toggle('active', !!s);
  if (overlay) overlay.style.display = s ? 'block' : 'none';
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
        const pian = !!(m.pianificato || m.soloPianificato);
        if (m.tipo === 'mat_' + cat) mat += o;
        else if (m.tipo === cat || (cat === 'ferie' && m.tipo === 'ferie_az')) {
          // consolido solo i GODUTI (non pianificati)
          if (!pian) god += o;
        }
      }
    });

    s.residuiAP[cat] = (s.residuiAP[cat] + s.spettanteAnnuo[cat] + mat) - god;
    s.spettanteAnnuo[cat] = (cat === 'conto') ? 0 : (cat === 'ferie' ? 216 : 62);
  });

  s.dataInizioConteggio = new Date().getFullYear() + '-01-01';
  s.annoRiferimento = new Date().getFullYear();
  localStorage.setItem('userSettings', JSON.stringify(s));
  location.reload();
}

/* =========================
   SAVE / AUTO ORE (nuovo record)
   ========================= */
function saveData() {
  let t = document.getElementById('in-tipo')?.value;
  let o = parseFloat(document.getElementById('in-ore')?.value);
  const d = document.getElementById('in-data')?.value;
  const note = document.getElementById('in-note') ? (document.getElementById('in-note').value || '') : '';
  const pianFlag = document.getElementById('soloPianificato')?.checked || false;

  if (!d) return alert('Data mancante');
  if (!t) return alert('Tipo mancante');

  // Validazione ore: AVIS può essere 0, gli altri > 0
  const oreRichieste = (t !== 'avis');
  if (oreRichieste) {
    if (!Number.isFinite(o) || o <= 0) return alert('Inserisci un numero di ore > 0');
  } else {
    if (!Number.isFinite(o)) o = 0;
  }

  // pianificato si applica solo a ferie/rol/conto/ferie_az
  const pianificato = (t === 'ferie' || t === 'ferie_az' || t === 'rol' || t === 'conto') ? pianFlag : false;

  const m = getMovimenti();
  m.push({ tipo: t, ore: o, data: d, note, pianificato, id: Date.now() });
  setMovimenti(m);
  location.reload();
}

function gestisciAutoOre() {
  const t = document.getElementById('in-tipo')?.value;
  const i = document.getElementById('in-ore');
  const rowPian = document.getElementById('row-soloPian');
  if (rowPian) {
    const show = (t === 'ferie' || t === 'ferie_az' || t === 'rol' || t === 'conto');
    rowPian.style.display = show ? 'flex' : 'none';
  }
  if (!i || !t) return;

  if (t === 'malattia' || t === 'ferie_az') i.value = 8;
  else if (t === 'avis') i.value = 0;
  else i.value = '';
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
   MODIFICA (modale unica)
   ========================= */
function ensureEditModal() {
  if (document.getElementById('edit-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'edit-overlay';
  overlay.className = 'modal-backdrop';
  overlay.addEventListener('click', () => toggleEditModal(false));
  document.body.appendChild(overlay);

  const modal = document.createElement('div');
  modal.id = 'edit-modal';
  modal.className = 'ios-page-sheet';
  modal.style.height = '72%';
  modal.innerHTML = `
    <div class="modal-nav">
      <button id="edit-cancel" class="btn-link">Annulla</button>
      <span class="modal-title" style="font-weight:600;">Modifica Record</span>
      <button id="edit-save" class="btn-link" style="font-weight:700;">Salva</button>
    </div>
    <div class="sheet-body">
      <div class="ios-input-group">
        <div class="ios-input-row">
          <label>Tipo</label>
          <select id="edit-tipo">
            <option value="ferie">Ferie (Personali)</option>
            <option value="ferie_az">Ferie (Aziendali)</option>
            <option value="rol">Permessi (ROL)</option>
            <option value="conto">Perm.B.Ore</option>
            <option value="malattia">Malattia</option>
            <option value="avis">🩸 AVIS</option>
            <option value="mat_ferie">MAT. Ferie</option>
            <option value="mat_rol">MAT. ROL</option>
            <option value="mat_conto">MAT. Conto</option>
          </select>
        </div>
        <div class="ios-input-row">
          <label>Ore</label>
          <input type="number" id="edit-ore" step="0.01" placeholder="0.00">
        </div>
        <div class="ios-input-row">
          <label>Data</label>
          <input type="date" id="edit-data">
        </div>
        <div class="ios-input-row">
          <label>Note</label>
          <input type="text" id="edit-note" placeholder="Opzionale">
        </div>
        <div class="ios-input-row" id="edit-row-pian">
          <label style="display:flex; align-items:center; gap:10px; width:100%; justify-content:space-between;">
            <span>Solo Pianificato</span>
            <input type="checkbox" id="edit-pian" style="transform: scale(1.1);">
          </label>
        </div>
      </div>
      <div style="padding:0 6px; color: var(--muted); font-size:12px;">
        * Il flag Pianificato vale solo per Ferie/ROL/Conto/Ferie Aziendali.
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('edit-cancel')?.addEventListener('click', () => toggleEditModal(false));
}

function toggleEditModal(open) {
  const modal = document.getElementById('edit-modal');
  const overlay = document.getElementById('edit-overlay');
  if (!modal || !overlay) return;
  modal.classList.toggle('active', !!open);
  overlay.style.display = open ? 'block' : 'none';
}

let __editingId = null;

function modifica(id) {
  ensureEditModal();
  const mov = getMovimenti();
  const r = mov.find(x => x.id === id);
  if (!r) return alert('Record non trovato');

  __editingId = id;

  const tipoEl = document.getElementById('edit-tipo');
  const oreEl = document.getElementById('edit-ore');
  const dataEl = document.getElementById('edit-data');
  const noteEl = document.getElementById('edit-note');
  const pianEl = document.getElementById('edit-pian');
  const rowPian = document.getElementById('edit-row-pian');
  const btnSave = document.getElementById('edit-save');

  if (!tipoEl || !oreEl || !dataEl || !noteEl || !pianEl || !rowPian || !btnSave) return;

  tipoEl.value = r.tipo;
  oreEl.value = (Number.isFinite(Number(r.ore)) ? String(Number(r.ore)) : '');
  dataEl.value = r.data;
  noteEl.value = r.note || '';
  pianEl.checked = !!(r.pianificato || r.soloPianificato);

  const syncRow = () => {
    const t = tipoEl.value;
    const can = (t === 'ferie' || t === 'ferie_az' || t === 'rol' || t === 'conto');
    rowPian.style.display = can ? 'flex' : 'none';
    // auto ore
    if (t === 'malattia' || t === 'ferie_az') oreEl.value = '8';
    if (t === 'avis') oreEl.value = '0';
  };
  tipoEl.onchange = syncRow;
  syncRow();

  btnSave.onclick = () => {
    const tipo = tipoEl.value;
    const data = dataEl.value;
    const note = noteEl.value || '';
    const pian = !!pianEl.checked;

    let ore = parseFloat(String(oreEl.value || '').replace(',', '.'));
    if (!data) return alert('Data mancante');
    if (!tipo) return alert('Tipo mancante');

    // Validazione ore: AVIS può essere 0, gli altri > 0
    if (tipo !== 'avis') {
      if (!Number.isFinite(ore) || ore <= 0) return alert('Inserisci un numero di ore > 0');
    } else {
      if (!Number.isFinite(ore) || ore < 0) return alert('Inserisci un numero di ore valido (>= 0)');
      if (!Number.isFinite(ore)) ore = 0;
    }

    const canHavePian = (tipo === 'ferie' || tipo === 'ferie_az' || tipo === 'rol' || tipo === 'conto');
    const pianificato = canHavePian ? pian : false;

    const idx = mov.findIndex(x => x.id === __editingId);
    if (idx < 0) return alert('Record non trovato');

    mov[idx] = { ...mov[idx], tipo, data, ore, note, pianificato };
    delete mov[idx].soloPianificato; // cleanup vecchi

    setMovimenti(mov);
    location.reload();
  };

  toggleEditModal(true);
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
  if (inData) inData.value = todayLocalISO();

  // hide pian row if tipo not supports
  const tipoEl = document.getElementById('in-tipo');
  if (tipoEl) gestisciAutoOre();
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
