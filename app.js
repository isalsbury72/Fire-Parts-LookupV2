/* Fire Parts Lookup v5.3.10
   - Quote and build case saved/restored from localStorage
   - CSV metadata (source, last loaded) tracked for diagnostics
   - Settings/Diagnostics tab + Copy debug info
   - Optional home + battery calculator page support
*/

const APP_VERSION = '5.3.10';
const FEEDBACK_EMAIL = 'FPLFeedback@salsbury.com.au'; // TODO: set to your real feedback address
// Bump this whenever you upload a new Parts.csv to GitHub
const CSV_VERSION = '20251122';

const state = {
  rows: [],
  selected: null,
  quote: [],
  buildcase: {
    notesCustomer: '',
    notesEstimator: '',
    routineVisit: null,
    accomNights: '',
    labourHoursNormal: '',
    numTechsNormal: '',
    travelHoursNormal: '',
    labourHoursAfter: '',
    numTechsAfter: '',
    travelHoursAfter: ''
  },
  csvMeta: {
    source: 'None loaded',
    loadedAt: null
  },
  battery: {
    Tq: 24 // quiescent standby time in hours (24 or 72 via buttons)
  }
};

const ACCESS_CODE = 'FP2025';

const LS_KEYS = {
  CSV: 'parts_csv',
  CSV_META: 'csv_meta_v1',
  QUOTE: 'quote_data_v1',
  BUILDCASE: 'buildcase_state_v1',
  ACCESS: 'hasAccess',
  HAYMANS_STORES: 'haymans_stores_v1'
};

function toast(msg, ok = false) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '10px 14px',
    borderRadius: '8px',
    background: '#fff',
    border: `1px solid ${ok ? '#10b981' : '#f59e0b'}`,
    boxShadow: '0 1px 6px rgba(0,0,0,0.15)',
    zIndex: '9999',
    fontSize: '14px'
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function fmtPrice(n) {
  return '$' + (n || 0).toFixed(2);
}

function supplierKey(name) {
  if (!name) return 'UNKNOWN';
  const noYear = name.replace(/\b20\d{2}\b/g, '');
  const match = noYear.match(/[A-Za-z]+/);
  const firstToken = match ? match[0] : 'UNKNOWN';
  return firstToken.toUpperCase();
}

function displaySupplierName(name) {
  if (!name) return 'SUPPLIER';
  const key = supplierKey(name);
  return key.charAt(0) + key.slice(1).toLowerCase();
}

function fmtPriceNum(raw) {
  return parseFloat((raw || '').toString().replace(/[^0-9.]/g, '')) || 0;
}

function formatLastLoaded(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-AU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function getHaymansStores() {
  try {
    const raw = localStorage.getItem(LS_KEYS.HAYMANS_STORES);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(s => (s || '').toString().trim())
      .filter(s => s.length > 0);
  } catch {
    return [];
  }
}

function saveHaymansStores(stores) {
  try {
    const unique = [];
    const seen = new Set();
    stores.forEach(s => {
      const key = s.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(s);
      }
    });
    localStorage.setItem(LS_KEYS.HAYMANS_STORES, JSON.stringify(unique));
  } catch {}
}

/* CSV parsing and metadata */

function updateCsvMeta(sourceLabel) {
  if (!sourceLabel) return;
  const meta = {
    source: sourceLabel,
    loadedAt: new Date().toISOString()
  };
  state.csvMeta = meta;
  try {
    localStorage.setItem(LS_KEYS.CSV_META, JSON.stringify(meta));
  } catch {}
}

function parseCSV(txt, sourceLabel) {
  const res = Papa.parse(txt, { header: true, skipEmptyLines: true });
  state.rows = res.data.map(r => ({
    SUPPLIER: r.SUPPLIER || '',
    TYPE: r.TYPE || '',
    DESCRIPTION: r.DESCRIPTION || '',
    PARTNUMBER: r.PARTNUMBER || '',
    PRICE: fmtPriceNum(r.PRICE),
    NOTES: r.NOTES || ''
  }));
  if (sourceLabel) updateCsvMeta(sourceLabel);
  renderParts();
  renderDiagnostics();
}

/* localStorage helpers for quote/buildcase */

function saveQuote() {
  try {
    localStorage.setItem(LS_KEYS.QUOTE, JSON.stringify(state.quote));
  } catch {}
}
function saveBuildcase() {
  try {
    localStorage.setItem(LS_KEYS.BUILDCASE, JSON.stringify(state.buildcase));
  } catch {}
}

function loadSavedState() {
  // CSV metadata
  try {
    const m = localStorage.getItem(LS_KEYS.CSV_META);
    if (m) {
      const parsed = JSON.parse(m);
      if (parsed && typeof parsed === 'object') {
        state.csvMeta = {
          source: parsed.source || 'Unknown',
          loadedAt: parsed.loadedAt || null
        };
      }
    }
  } catch {}

  // Quote
  try {
    const q = localStorage.getItem(LS_KEYS.QUOTE);
    if (q) {
      const parsed = JSON.parse(q);
      if (Array.isArray(parsed)) {
        state.quote = parsed.map(i => ({
          SUPPLIER: i.SUPPLIER || '',
          DESCRIPTION: i.DESCRIPTION || '',
          PARTNUMBER: i.PARTNUMBER || '',
          PRICE: typeof i.PRICE === 'number' ? i.PRICE : fmtPriceNum(i.PRICE),
          qty: i.qty && i.qty > 0 ? i.qty : 1
        }));
      }
    }
  } catch {}

  // Buildcase
  try {
    const b = localStorage.getItem(LS_KEYS.BUILDCASE);
    if (b) {
      const parsed = JSON.parse(b);
      if (parsed && typeof parsed === 'object') {
        state.buildcase = Object.assign({}, state.buildcase, parsed);
      }
    }
  } catch {}
}

/* DOM refs */

const els = {
  // Home
  homePage: document.getElementById('homePage'),
  btnHomeParts: document.getElementById('btnHomeParts'),
  btnHomeBattery: document.getElementById('btnHomeBattery'),

  // Feedback page
  feedbackPage: document.getElementById('feedbackPage'),
  feedbackSubject: document.getElementById('feedbackSubject'),
  feedbackText: document.getElementById('feedbackText'),
  feedbackCancel: document.getElementById('feedbackCancel'),
  feedbackClear: document.getElementById('feedbackClear'),
  feedbackSend: document.getElementById('feedbackSend'),
  goHomeFromFeedback: document.getElementById('goHomeFromFeedback'),

  // Battery
  batteryPage: document.getElementById('batteryPage'),
  battIq: document.getElementById('battIq'),
  battIa: document.getElementById('battIa'),
  battTqDisplay: document.getElementById('battTqDisplay'),
  battTaDisplay: document.getElementById('battTaDisplay'),
  battBtnTq24: document.getElementById('battBtnTq24'),
  battBtnTq72: document.getElementById('battBtnTq72'),
  battCap20: document.getElementById('battCap20'),
  battAgeCap: document.getElementById('battAgeCap'),
  battRequired: document.getElementById('battRequired'),

  // Parts
  q: document.getElementById('q'),
  csv: document.getElementById('csv'),
  tbl: document.getElementById('tbl')?.querySelector('tbody'),
  count: document.getElementById('count'),
  copyArea: document.getElementById('copyArea'),
  copyPartLine: document.getElementById('copyPartLine'),
  partsPage: document.getElementById('partsPage'),

  // Quote + build case pages
  quotePage: document.getElementById('quotePage'),
  settingsPage: document.getElementById('settingsPage'),
  buildcase1Page: document.getElementById('buildcase1Page'),
  buildcase2Page: document.getElementById('buildcase2Page'),
  buildcase3Page: document.getElementById('buildcase3Page'),

  tabParts: document.getElementById('tabParts'),
  tabQuote: document.getElementById('tabQuote'),
  tabSettings: document.getElementById('tabSettings'),

  addToQuote: document.getElementById('addToQuote'),
  copyQuote: document.getElementById('copyQuote'),
  copyQuoteRaw: document.getElementById('copyQuoteRaw'),
  copyQuoteEmail: document.getElementById('copyQuoteEmail'),
   emailPoRequest: document.getElementById('emailPoRequest'),
  btnClearQuote: document.getElementById('btnClearQuote'),
  btnBuildCase: document.getElementById('btnBuildCase'),
  jobNumber: document.getElementById('jobNumber'),
  deliveryAddress: document.getElementById('deliveryAddress'),
  quoteTableBody: document.querySelector('#quoteTable tbody'),
  quoteSummary: document.getElementById('quoteSummary'),
  
  manualToggle: document.getElementById('manualToggle'),
  manualSection: document.getElementById('manualSection'),
  manualSupplier: document.getElementById('manualSupplier'),
  manualDescription: document.getElementById('manualDescription'),
  manualPart: document.getElementById('manualPart'),
  manualPrice: document.getElementById('manualPrice'),
  manualQty: document.getElementById('manualQty'),
  manualAddBtn: document.getElementById('manualAddBtn'),

  btnBackToQuote: document.getElementById('btnBackToQuote'),
  btnToBuild2: document.getElementById('btnToBuild2'),
  btnBackToBuild1: document.getElementById('btnBackToBuild1'),
  btnToBuild3: document.getElementById('btnToBuild3'),
  btnBackToBuild2: document.getElementById('btnBackToBuild2'),
  btnBackToQuoteFrom3: document.getElementById('btnBackToQuoteFrom3'),
  btnBackToQuoteFrom2: document.getElementById('btnBackToQuoteFrom2'),

  notesCustomer: document.getElementById('notesCustomer'),
  notesEstimator: document.getElementById('notesEstimator'),
  bc1ItemsCount: document.getElementById('bc1ItemsCount'),
  notesCustomer3: document.getElementById('notesCustomer3'),
  notesEstimator3: document.getElementById('notesEstimator3'),
  bc3ItemsCount: document.getElementById('bc3ItemsCount'),

  routineYes: document.getElementById('routineYes'),
  routineNo: document.getElementById('routineNo'),
  accomNights: document.getElementById('accomNights'),
  labourHoursNormal: document.getElementById('labourHoursNormal'),
  numTechsNormal: document.getElementById('numTechsNormal'),
  travelHoursNormal: document.getElementById('travelHoursNormal'),
  labourHoursAfter: document.getElementById('labourHoursAfter'),
  numTechsAfter: document.getElementById('numTechsAfter'),
  travelHoursAfter: document.getElementById('travelHoursAfter'),

  btnCopyNC3: document.getElementById('btnCopyNC3'),
  btnCopyNE3: document.getElementById('btnCopyNE3'),

  // Home navigation buttons
  goHomeFromParts:    document.getElementById('goHomeFromParts'),
  goHomeFromQuote:    document.getElementById('goHomeFromQuote'),
  goHomeFromBattery:  document.getElementById('goHomeFromBattery'),
  goHomeFromSettings: document.getElementById('goHomeFromSettings'),

  // Settings CSV buttons
  loadLocalCsvSettings: document.getElementById('loadLocalCsvSettings'),
  loadSharedSettings:   document.getElementById('loadSharedSettings'),
  clearDataSettings:    document.getElementById('clearDataSettings'),

     // Haymans store dialog
  haymansDialog: document.getElementById('haymansDialog'),
  haymansStoreInput: document.getElementById('haymansStoreInput'),
  haymansStoreList: document.getElementById('haymansStoreList'),
  haymansStoreOk: document.getElementById('haymansStoreOk'),
  haymansStoreCancel: document.getElementById('haymansStoreCancel'),

  // Diagnostics
  diagCsvSource: document.getElementById('diagCsvSource'),
  diagLastLoaded: document.getElementById('diagLastLoaded'),
  diagPartsRows: document.getElementById('diagPartsRows'),
  diagQuoteItems: document.getElementById('diagQuoteItems'),
  diagRoutine: document.getElementById('diagRoutine'),
  diagSwStatus: document.getElementById('diagSwStatus'),
  btnDiagClearAll: document.getElementById('btnDiagClearAll'),
  btnDiagCopy: document.getElementById('btnDiagCopy')
};

/* ---------- Parts page ---------- */

function renderParts() {
  const q = els.q ? els.q.value.trim().toLowerCase() : '';
  const body = els.tbl;
  if (!body) return;

  body.innerHTML = '';

  let rows = [];
  if (q) {
    rows = state.rows.filter(r =>
      Object.values(r).join(' ').toLowerCase().includes(q)
    );
  } else {
    // No query: show nothing, clear selection & yellow pill
    state.selected = null;
    updateAddToQuoteState();
    if (els.copyArea) els.copyArea.textContent = '';
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.SUPPLIER}</td>
      <td>${r.TYPE}</td>
      <td>${r.DESCRIPTION}</td>
      <td><span class="badge">${r.PARTNUMBER}</span></td>
      <td>${fmtPrice(r.PRICE)}</td>
      <td class="notes">${r.NOTES}</td>`;
    tr.addEventListener('click', () => {
      state.selected = r;
      if (els.copyArea) {
        // Same format style as Notes to estimator, but no qty
        els.copyArea.textContent =
          `${r.DESCRIPTION} — ${r.PARTNUMBER} — ${fmtPrice(r.PRICE)} each (${r.SUPPLIER} price)`;
      }
      updateAddToQuoteState();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    body.appendChild(tr);
  });

  if (els.count) els.count.textContent = rows.length.toString();

  renderDiagnostics();
}

if (els.q) els.q.addEventListener('input', renderParts);

function updateAddToQuoteState() {
  const b = els.addToQuote;
  if (!b) return;
  if (state.selected) {
    b.disabled = false;
    Object.assign(b.style, {
      opacity: '1',
      cursor: 'pointer',
      borderColor: '#22c55e',
      background: '#ecfdf5',
      color: '#166534'
    });
  } else {
    b.disabled = true;
    Object.assign(b.style, {
      opacity: '0.5',
      cursor: 'not-allowed',
      borderColor: '#d1d5db',
      background: '#f3f4f6',
      color: '#9ca3af'
    });
  }
}

/* ---------- Quote ---------- */

function renderQuote() {
  const body = els.quoteTableBody;
  const sum = els.quoteSummary;
  if (!body || !sum) return;
  body.innerHTML = '';
  let total = 0;

  state.quote.forEach((i, idx) => {
    const qty = i.qty || 1;
    const lineTotal = i.PRICE * qty;
    total += lineTotal;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="number" min="1" value="${qty}" style="width:60px"></td>
      <td>${i.SUPPLIER}</td>
      <td>${i.DESCRIPTION}</td>
      <td>${i.PARTNUMBER}</td>
      <td>${fmtPrice(lineTotal)}</td>
      <td><button data-i="${idx}" style="border:none;background:#fee2e2;color:#b91c1c;border-radius:6px;padding:2px 6px;cursor:pointer;">✖</button></td>`;
    tr.querySelector('input').addEventListener('change', e => {
      i.qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      saveQuote();
      renderQuote();
    });
    tr.querySelector('button').addEventListener('click', e => {
      const idx2 = parseInt(e.target.dataset.i, 10);
      if (confirm('Remove this item?')) {
        state.quote.splice(idx2, 1);
        saveQuote();
        renderQuote();
      }
    });
    body.appendChild(tr);
  });

  sum.textContent = 'Total: ' + fmtPrice(total);

  if (els.btnClearQuote) {
    if (state.quote.length) {
      els.btnClearQuote.disabled = false;
      els.btnClearQuote.style.opacity = '1';
      els.btnClearQuote.style.cursor = 'pointer';
    } else {
      els.btnClearQuote.disabled = true;
      els.btnClearQuote.style.opacity = '0.6';
      els.btnClearQuote.style.cursor = 'not-allowed';
    }
  }
  renderDiagnostics();
}

/* ---------- Startup CSV + state ---------- */

const cachedCsv = localStorage.getItem(LS_KEYS.CSV);
loadSavedState();

if (cachedCsv) {
  try {
    parseCSV(cachedCsv);
  } catch {}
}

/* ---------- Loaders (CSV & shared file) ---------- */

async function loadSharedFromRepo() {
  if (!ensureAccess()) return;
  try {
    const res = await fetch(`Parts.csv?v=${CSV_VERSION}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    localStorage.setItem(LS_KEYS.CSV, text);
    parseCSV(text, 'GitHub Parts.csv');
    toast('Loaded shared CSV from repo.', true);
  } catch (err) {
    console.error(err);
    toast('Error loading shared CSV from repo', false);
  }
}

if (els.csv) {
  els.csv.addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      localStorage.setItem(LS_KEYS.CSV, r.result);
      parseCSV(r.result, 'Local CSV file');
      toast('Loaded local CSV', true);
    };
    r.readAsText(f);
  });
}

function ensureAccess() {
  const ok = localStorage.getItem(LS_KEYS.ACCESS);
  if (ok === 'yes') return true;
  const code = prompt('Enter access code:');
  if (code === ACCESS_CODE) {
    localStorage.setItem(LS_KEYS.ACCESS, 'yes');
    toast('Access granted.', true);
    return true;
  }
  toast('Access denied.', false);
  return false;
}

function clearAllData() {
  localStorage.removeItem(LS_KEYS.CSV);
  localStorage.removeItem(LS_KEYS.CSV_META);
  localStorage.removeItem(LS_KEYS.QUOTE);
  localStorage.removeItem(LS_KEYS.BUILDCASE);
  localStorage.removeItem(LS_KEYS.ACCESS);

  state.rows = [];
  state.quote = [];
  state.selected = null;
  state.buildcase = {
    notesCustomer: '',
    notesEstimator: '',
    routineVisit: null,
    accomNights: '',
    labourHoursNormal: '',
    numTechsNormal: '',
    travelHoursNormal: '',
    labourHoursAfter: '',
    numTechsAfter: '',
    travelHoursAfter: ''
  };
  state.csvMeta = {
    source: 'None loaded',
    loadedAt: null
  };

  // 🔹 Also clear any SW caches starting with "fpl-"
  if ('caches' in window) {
    caches.keys().then(keys => {
      keys.forEach(k => {
        if (k.startsWith('fpl-')) {
          caches.delete(k);
        }
      });
    });
  }

  renderParts();
  renderQuote();
  updateAddToQuoteState();
  renderDiagnostics();
  toast('All app data cleared.', true);
}

/* Settings: CSV buttons */

if (els.loadSharedSettings) {
  els.loadSharedSettings.addEventListener('click', loadSharedFromRepo);
}

if (els.loadLocalCsvSettings) {
  els.loadLocalCsvSettings.addEventListener('click', () => {
    if (els.csv) els.csv.click();
  });
}

if (els.clearDataSettings) {
  els.clearDataSettings.addEventListener('click', clearAllData);
}

// Keep original diag clear button wired too (if present)
if (els.btnDiagClearAll) {
  els.btnDiagClearAll.addEventListener('click', clearAllData);
}

/* ---------- Manual item ---------- */

function setManualBtnEnabled(enabled) {
  const b = els.manualAddBtn;
  if (!b) return;
  b.disabled = !enabled;
  if (enabled) {
    b.style.borderColor = '#22c55e';
    b.style.background = '#ecfdf5';
    b.style.color = '#166534';
    b.style.opacity = '1';
    b.style.cursor = 'pointer';
  } else {
    b.style.borderColor = '#d1d5db';
    b.style.background = '#f3f4f6';
    b.style.color = '#9ca3af';
    b.style.opacity = '0.6';
    b.style.cursor = 'not-allowed';
  }
}

function manualInputsValid() {
  // Only require a non-empty description
  const desc = (els.manualDescription?.value || '').trim();
  return !!desc;
}

['manualSupplier','manualDescription','manualPart','manualPrice','manualQty'].forEach(id => {
  const input = els[id];
  if (input) input.addEventListener('input', () => setManualBtnEnabled(manualInputsValid()));
});

if (els.manualToggle) {
  els.manualToggle.addEventListener('change', e => {
    const on = e.target.checked;
    if (on) {
      if (els.manualSection) els.manualSection.style.display = 'block';
      setManualBtnEnabled(manualInputsValid());
    } else {
      if (els.manualSupplier) els.manualSupplier.value = '';
      if (els.manualDescription) els.manualDescription.value = '';
      if (els.manualPart) els.manualPart.value = '';
      if (els.manualPrice) els.manualPrice.value = '';
      if (els.manualQty) els.manualQty.value = '1';
      setManualBtnEnabled(false);
      if (els.manualSection) els.manualSection.style.display = 'none';
    }
  });
  if (els.manualToggle.checked) {
    if (els.manualSection) els.manualSection.style.display = 'block';
    setManualBtnEnabled(manualInputsValid());
  } else {
    if (els.manualSection) els.manualSection.style.display = 'none';
    setManualBtnEnabled(false);
  }
}

/* ---------- Copy helpers ---------- */

function copyText(txt, msg) {
  const toCopy = (txt || '').toString();
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(toCopy)
      .then(() => toast(msg, true))
      .catch(() => fallbackCopy(toCopy, msg));
  } else {
    fallbackCopy(toCopy, msg);
  }
}
function fallbackCopy(txt, msg) {
  const ta = document.createElement('textarea');
  ta.value = txt;
  ta.style.position = 'fixed';
  ta.style.top = '-2000px';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch {}
  document.body.removeChild(ta);
  toast(msg, true);
}

/* ---------- Actions ---------- */

if (els.addToQuote) els.addToQuote.addEventListener('click', () => {
  if (!state.selected) return;
  state.quote.push({
    SUPPLIER: state.selected.SUPPLIER,
    DESCRIPTION: state.selected.DESCRIPTION,
    PARTNUMBER: state.selected.PARTNUMBER,
    PRICE: state.selected.PRICE,
    qty: 1
  });
  saveQuote();
  renderQuote();
  showQuotePage();
});

if (els.copyPartLine) els.copyPartLine.addEventListener('click', () => {
  const text = (els.copyArea?.textContent || '').trim();
  if (!text) {
    toast('No part selected.', false);
    return;
  }
  copyText(text, 'Line copied.');
});

/* Copy quote with total */
if (els.copyQuote) els.copyQuote.addEventListener('click', () => {
  if (!state.quote.length) return toast('No items to copy.', false);
  let total = 0;
  const lines = state.quote.map(i => {
    const qty = i.qty || 1;
    total += i.PRICE * qty;
    return `${qty} x ${i.DESCRIPTION} — ${i.PARTNUMBER} — ${fmtPrice(i.PRICE)} each (${i.SUPPLIER} price)`;
  });
  lines.push('', 'Total: ' + fmtPrice(total));
  copyText(lines.join('\n'), 'Quote copied.');
});

/* Copy items only */
if (els.copyQuoteRaw) els.copyQuoteRaw.addEventListener('click', () => {
  if (!state.quote.length) return toast('No items to copy.', false);
  const lines = state.quote.map(i => {
    const qty = i.qty || 1;
    return `${qty} x ${i.DESCRIPTION} — ${i.PARTNUMBER} — ${fmtPrice(i.PRICE)} each (${i.SUPPLIER} price)`;
  });
  copyText(lines.join('\n'), 'Items copied.');
});


/* Copy for Email PO - grouped by supplier */
if (els.copyQuoteEmail) els.copyQuoteEmail.addEventListener('click', () => {
  if (!state.quote.length) return toast('No items to copy.', false);
  const job = els.jobNumber?.value.trim() || '';
  const delivery = els.deliveryAddress?.value.trim() || '';

  const groups = new Map();
  state.quote.forEach(item => {
    const key = supplierKey(item.SUPPLIER);
    if (!groups.has(key)) {
      groups.set(key, { display: displaySupplierName(item.SUPPLIER), items: [] });
    }
    groups.get(key).items.push(item);
  });

  const lines = [];
  groups.forEach(({ display, items }) => {
    const supName = display || 'Supplier';
    lines.push(
      job
        ? `Please forward a PO to ${supName} for job ${job}`
        : `Please forward a PO to ${supName} for this job`
    );
    lines.push('');
    items.forEach(i => {
      const qty = i.qty || 1;
      lines.push(`${qty} x ${i.DESCRIPTION} — ${i.PARTNUMBER} — ${fmtPrice(i.PRICE)} each`);
    });
    if (delivery) {
      lines.push('');
      lines.push(delivery);
    }
    lines.push('');
  });

  copyText(lines.join('\n').trimEnd(), 'Email PO copied.');
});

async function chooseHaymansStore() { 
  return new Promise(resolve => {
    const dlg   = els.haymansDialog;
    const input = els.haymansStoreInput;
    const list  = els.haymansStoreList;
    const btnOk = els.haymansStoreOk;
    const btnCancel = els.haymansStoreCancel;

    if (!dlg || !input || !list || !btnOk || !btnCancel) {
      // Fallback – if dialog not in DOM, just use prompt
      const fallback = prompt('Which Haymans store should the PO be sent to?');
      resolve((fallback || '').trim() || null);
      return;
    }

    // Load previously used stores
    const stores = getHaymansStores();

    // Rebuild datalist options
    list.innerHTML = '';
    stores.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      list.appendChild(opt);
    });

    // Pre-fill with last used store (if any)
    input.value = stores[stores.length - 1] || '';

    // Show dialog
    dlg.style.display = 'flex';

    // Make sure keyboard focus goes into the input
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);

    function cleanup(result) {
      dlg.style.display = 'none';
      btnOk.onclick = null;
      btnCancel.onclick = null;
      input.onkeydown = null;
      resolve(result);
    }

    btnOk.onclick = () => {
      const val = (input.value || '').trim();
      if (!val) {
        toast('Haymans store not set.', false);
        return;
      }
      cleanup(val);
    };

    btnCancel.onclick = () => {
      cleanup(null);
    };

    // Allow Esc to cancel, Enter to accept
    input.onkeydown = (ev) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cleanup(null);
      } else if (ev.key === 'Enter') {
        ev.preventDefault();
        btnOk.click();
      }
    };
  });
}

/* Email PO Request – opens mail client with subject + body */
if (els.emailPoRequest) {
  els.emailPoRequest.addEventListener('click', async (e) => {
    e.preventDefault();

    if (!state.quote.length) {
      toast('No items in quote.', false);
      return;
    }

    const job = (els.jobNumber?.value || '').trim();
    const delivery = (els.deliveryAddress?.value || '').trim();

    // Supplier: use first item’s supplier, strip years (e.g. 2025)
    const firstSupRaw = (state.quote[0].SUPPLIER || '').toString();
    let supplierClean = firstSupRaw.replace(/\b20\d{2}\b/g, '').trim();
    if (!supplierClean) supplierClean = 'Supplier';

    let haymansSuffix = '';

    // If supplier is Haymans, use the dialog (with autocomplete)
    if (supplierClean.toUpperCase().startsWith('HAYMANS')) {
      let store = await chooseHaymansStore();
      if (!store) {
        toast('Haymans store not set. Email not created.', false);
        return;
      }

      store = store.trim();
      if (!store) {
        toast('Haymans store not set. Email not created.', false);
        return;
      }

      haymansSuffix = ' ' + store;

      // Save back to localStorage if new
      let stores = getHaymansStores();
      const exists = stores.some(s => s.toLowerCase() === store.toLowerCase());
      if (!exists) {
        stores.push(store);
        saveHaymansStores(stores);
      }
    }

    // Append Haymans suffix (or stay as-is for non-Haymans)
    supplierClean += haymansSuffix;

    const subject = job
      ? `PO for job ${job}`
      : 'PO request';

    // Parts details from Step 1 "Notes to estimator"
    let partsBlock = (els.notesEstimator?.value || '').trim();
    if (!partsBlock) {
      // Fallback: rebuild from current quote
      partsBlock = buildItemsOnlyLines().join('\n');
    }

    const lines = [];

    if (job) {
      lines.push(`Please forward a PO to ${supplierClean} for job ${job}`);
    } else {
      lines.push(`Please forward a PO to ${supplierClean} for this job`);
    }

    lines.push('');

    if (partsBlock) {
      lines.push(partsBlock);
      lines.push('');
    }

    if (delivery) {
      lines.push(delivery);
      lines.push('');
    }

    const body = lines.join('\n');

    const mailtoUrl =
      'mailto:?' +
      'subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(body);

    window.location.href = mailtoUrl;
  });
}

/* Build case helpers */

function buildItemsOnlyLines() {
  return state.quote.map(i => {
    const qty = i.qty || 1;
    return `${qty} x ${i.DESCRIPTION} — ${i.PARTNUMBER} — ${fmtPrice(i.PRICE)} each (${i.SUPPLIER} price)`;
  });
}

function toNum(x, d = 0) {
  const n = parseFloat((x ?? '').toString());
  return Number.isNaN(n) ? d : n;
}

function buildLabourSummary() {
  const nh = toNum(state.buildcase.labourHoursNormal, 0);
  const nm = Math.max(0, parseInt(state.buildcase.numTechsNormal || '0', 10) || 0);
  const nth = toNum(state.buildcase.travelHoursNormal, 0);

  const ah = toNum(state.buildcase.labourHoursAfter, 0);
  const am = Math.max(0, parseInt(state.buildcase.numTechsAfter || '0', 10) || 0);
  const ath = toNum(state.buildcase.travelHoursAfter, 0);

  const nights = Math.max(0, parseInt(state.buildcase.accomNights || '0', 10) || 0);

  const linesMain = [];
  const linesAfter = [];
  let total = 0;

  if (nh > 0 && nm > 0) {
    linesMain.push(`${nh} ${nh === 1 ? 'hour' : 'hours'} ${nm} ${nm === 1 ? 'man' : 'men'} NT`);
    total += nh * nm;
  }
  if (ah > 0 && am > 0) {
    linesMain.push(`${ah} ${ah === 1 ? 'hour' : 'hours'} ${am} ${am === 1 ? 'man' : 'men'} AH`);
    total += ah * am;
  }
  if (nth > 0 && nm > 0) {
    linesMain.push(`${nth} ${nth === 1 ? 'hour' : 'hours'} ${nm} ${nm === 1 ? 'man' : 'men'} NT Travel`);
    total += nth * nm;
  }
  if (ath > 0 && am > 0) {
    linesMain.push(`${ath} ${ath === 1 ? 'hour' : 'hours'} ${am} ${am === 1 ? 'man' : 'men'} AH Travel`);
    total += ath * am;
  }

  if (nights > 0) {
    linesAfter.push(`${nights} x Overnight accommodation`);
  }

  if (state.buildcase.routineVisit === 'yes') {
    linesAfter.push('Can be completed on routine visit');
  } else if (state.buildcase.routineVisit === 'no') {
    linesAfter.push('Not intended to be completed on routine visit');
  }

  const out = [];
  out.push(...linesMain);

  if (total > 0) {
    out.push(`Total labour: ${total} hours`);
  }
  if (linesAfter.length) {
    out.push(...linesAfter);
  }

  return out.join('\n');
}

function buildCaseStep1Fill() {
  const lines = buildItemsOnlyLines();
  const itemsTxt = lines.join('\n');

  if (els.notesEstimator) {
    els.notesEstimator.value = itemsTxt;
  }

  state.buildcase.notesEstimator = itemsTxt;

  if (els.bc1ItemsCount) {
    els.bc1ItemsCount.textContent = `Items: ${state.quote.length}`;
  }
}

/* ---------- Page switching ---------- */

function hideAllPages() {
  if (els.homePage)       els.homePage.style.display = 'none';
  if (els.batteryPage)    els.batteryPage.style.display = 'none';
  if (els.partsPage)      els.partsPage.style.display = 'none';
  if (els.quotePage)      els.quotePage.style.display = 'none';
  if (els.settingsPage)   els.settingsPage.style.display = 'none';
  if (els.buildcase1Page) els.buildcase1Page.style.display = 'none';
  if (els.buildcase2Page) els.buildcase2Page.style.display = 'none';
  if (els.buildcase3Page) els.buildcase3Page.style.display = 'none';
  if (els.feedbackPage)   els.feedbackPage.style.display = 'none';
}

function showHomePage() {
  hideAllPages();
  if (els.homePage) els.homePage.style.display = 'block';
  renderDiagnostics();
}

function showBatteryPage() {
  hideAllPages();
  if (els.batteryPage) els.batteryPage.style.display = 'block';
  recalcBattery();
  renderDiagnostics();
}

function showFeedbackPage() {
  hideAllPages();
  if (els.feedbackPage) els.feedbackPage.style.display = 'block';
  renderDiagnostics();
}

function showPartsPage() {
  hideAllPages();
  if (els.partsPage) els.partsPage.style.display = 'block';
  renderParts();
  renderDiagnostics();
}

function showQuotePage() {
  hideAllPages();
  if (els.quotePage) els.quotePage.style.display = 'block';
  renderQuote();
  renderDiagnostics();
}

function showSettingsPage() {
  hideAllPages();
  if (els.settingsPage) els.settingsPage.style.display = 'block';
  renderDiagnostics();
}

function showBuild1() {
  hideAllPages();
  if (els.buildcase1Page) els.buildcase1Page.style.display = 'block';

  if (els.notesCustomer) {
    els.notesCustomer.value = state.buildcase.notesCustomer || '';
  }

  buildCaseStep1Fill();

  renderDiagnostics();
}

function showBuild2() {
  hideAllPages();
  if (els.buildcase2Page) els.buildcase2Page.style.display = 'block';

  if (state.buildcase.routineVisit === 'yes') {
    if (els.routineYes) els.routineYes.checked = true;
    if (els.routineNo)  els.routineNo.checked  = false;
  } else if (state.buildcase.routineVisit === 'no') {
    if (els.routineNo)  els.routineNo.checked  = true;
    if (els.routineYes) els.routineYes.checked = false;
  } else {
    if (els.routineYes) els.routineYes.checked = false;
    if (els.routineNo)  els.routineNo.checked  = false;
  }

  if (els.accomNights)       els.accomNights.value       = state.buildcase.accomNights       || '';
  if (els.labourHoursNormal) els.labourHoursNormal.value = state.buildcase.labourHoursNormal || '';
  if (els.numTechsNormal)    els.numTechsNormal.value    = state.buildcase.numTechsNormal    || '';
  if (els.travelHoursNormal) els.travelHoursNormal.value = state.buildcase.travelHoursNormal || '';
  if (els.labourHoursAfter)  els.labourHoursAfter.value  = state.buildcase.labourHoursAfter  || '';
  if (els.numTechsAfter)     els.numTechsAfter.value     = state.buildcase.numTechsAfter     || '';
  if (els.travelHoursAfter)  els.travelHoursAfter.value  = state.buildcase.travelHoursAfter  || '';

  renderDiagnostics();
}

function showBuild3() {
  hideAllPages();
  if (els.buildcase3Page) els.buildcase3Page.style.display = 'block';

  const base   = buildItemsOnlyLines().join('\n');
  const labour = buildLabourSummary();

  if (els.notesEstimator3) {
    els.notesEstimator3.value = labour ? `${base}\n\n${labour}` : base;
  }

  if (els.notesCustomer3)  els.notesCustomer3.value  = state.buildcase.notesCustomer || '';
  if (els.bc3ItemsCount)   els.bc3ItemsCount.textContent = `Items: ${state.quote.length}`;

  renderDiagnostics();
}

// Simple global nav helper so HTML buttons can call these directly
window.appNav = {
  home:     showHomePage,
  parts:    showPartsPage,
  quote:    showQuotePage,
  battery:  showBatteryPage,
  settings: showSettingsPage,
  feedback: showFeedbackPage,
};

/* Tab click handlers */

if (els.tabParts) els.tabParts.addEventListener('click', showPartsPage);
if (els.tabQuote) els.tabQuote.addEventListener('click', showQuotePage);
if (els.tabSettings) els.tabSettings.addEventListener('click', showSettingsPage);

// Home page tiles
if (els.btnHomeParts)    els.btnHomeParts.addEventListener('click', showPartsPage);
if (els.btnHomeBattery)  els.btnHomeBattery.addEventListener('click', showBatteryPage);

// Back-to-Home buttons
if (els.goHomeFromParts)    els.goHomeFromParts.addEventListener('click', showHomePage);
if (els.goHomeFromQuote)    els.goHomeFromQuote.addEventListener('click', showHomePage);
if (els.goHomeFromBattery)  els.goHomeFromBattery.addEventListener('click', showHomePage);
if (els.goHomeFromSettings) els.goHomeFromSettings.addEventListener('click', showHomePage);

// Feedback page buttons
if (els.goHomeFromFeedback) {
  els.goHomeFromFeedback.addEventListener('click', showHomePage);
}

if (els.feedbackCancel) {
  els.feedbackCancel.addEventListener('click', showHomePage);
}

if (els.feedbackClear) {
  els.feedbackClear.addEventListener('click', () => {
    if (els.feedbackSubject) els.feedbackSubject.value = '';
    if (els.feedbackText)    els.feedbackText.value = '';
  });
}

// Send opens an email with subject + body
if (els.feedbackSend) {
  els.feedbackSend.addEventListener('click', () => {
    const subject = (els.feedbackSubject?.value || '').trim();
    const txt     = (els.feedbackText?.value || '').trim();

    if (!subject) {
      toast('Enter a subject for your feedback.', false);
      return;
    }
    if (!txt) {
      toast('Enter some feedback details before sending.', false);
      return;
    }

    // Build body with a little context
    const lines = [
      txt,
      '',
      '---',
      `App version: ${APP_VERSION}`,
      `CSV source: ${state.csvMeta.source || 'None'}`,
      `Parts rows loaded: ${state.rows.length}`,
    ];
    const body = encodeURIComponent(lines.join('\n'));
    const subj = encodeURIComponent(subject);

    const mailto = `mailto:${FEEDBACK_EMAIL}?subject=${subj}&body=${body}`;
    window.location.href = mailto;

    toast('Opening email with your feedback…', true);
  });
}

/* Build case navigation */

if (els.btnBuildCase)           els.btnBuildCase.addEventListener('click', showBuild1);
if (els.btnBackToQuote)         els.btnBackToQuote.addEventListener('click', showQuotePage);
if (els.btnBackToQuoteFrom3)    els.btnBackToQuoteFrom3.addEventListener('click', showQuotePage);
if (els.btnBackToQuoteFrom2)    els.btnBackToQuoteFrom2.addEventListener('click', showQuotePage);
if (els.btnBackToBuild1)        els.btnBackToBuild1.addEventListener('click', showBuild1);
if (els.btnBackToBuild2)        els.btnBackToBuild2.addEventListener('click', showBuild2);

if (els.btnToBuild2) els.btnToBuild2.addEventListener('click', () => {
  state.buildcase.notesCustomer = (els.notesCustomer?.value || '').trim();
  state.buildcase.notesEstimator = (els.notesEstimator?.value || '').trim();
  saveBuildcase();
  showBuild2();
});
if (els.btnToBuild3) els.btnToBuild3.addEventListener('click', () => {
  if (els.routineYes?.checked) state.buildcase.routineVisit = 'yes';
  else if (els.routineNo?.checked) state.buildcase.routineVisit = 'no';
  else state.buildcase.routineVisit = null;

  state.buildcase.accomNights = (els.accomNights?.value || '').trim();
  state.buildcase.labourHoursNormal = (els.labourHoursNormal?.value || '').trim();
  state.buildcase.numTechsNormal = (els.numTechsNormal?.value || '').trim();
  state.buildcase.travelHoursNormal = (els.travelHoursNormal?.value || '').trim();
  state.buildcase.labourHoursAfter = (els.labourHoursAfter?.value || '').trim();
  state.buildcase.numTechsAfter = (els.numTechsAfter?.value || '').trim();
  state.buildcase.travelHoursAfter = (els.travelHoursAfter?.value || '').trim();
  saveBuildcase();
  showBuild3();
});

/* Step 3 copy */

if (els.btnCopyNC3) els.btnCopyNC3.addEventListener('click', () => {
  copyText((els.notesCustomer3?.value || '').trim(), 'Copied customer notes.');
});
if (els.btnCopyNE3) els.btnCopyNE3.addEventListener('click', () => {
  copyText((els.notesEstimator3?.value || '').trim(), 'Copied estimator notes.');
});

/* Clear quote */

if (els.btnClearQuote) els.btnClearQuote.addEventListener('click', () => {
  if (!state.quote.length) return;
  if (confirm('Clear all items?')) {
    state.quote = [];
    saveQuote();
    renderQuote();

    state.buildcase.routineVisit       = null;
    state.buildcase.accomNights        = '';
    state.buildcase.labourHoursNormal  = '';
    state.buildcase.numTechsNormal     = '';
    state.buildcase.travelHoursNormal  = '';
    state.buildcase.labourHoursAfter   = '';
    state.buildcase.numTechsAfter      = '';
    state.buildcase.travelHoursAfter   = '';
    saveBuildcase();

    if (els.routineYes)       els.routineYes.checked = false;
    if (els.routineNo)        els.routineNo.checked = false;
    if (els.accomNights)      els.accomNights.value = '';
    if (els.labourHoursNormal) els.labourHoursNormal.value = '';
    if (els.numTechsNormal)   els.numTechsNormal.value = '';
    if (els.travelHoursNormal) els.travelHoursNormal.value = '';
    if (els.labourHoursAfter) els.labourHoursAfter.value = '';
    if (els.numTechsAfter)    els.numTechsAfter.value = '';
    if (els.travelHoursAfter) els.travelHoursAfter.value = '';

    renderDiagnostics();
    toast('Quote cleared.', true);
    showPartsPage();
  }
});

/* Manual add button */

if (els.manualAddBtn) els.manualAddBtn.addEventListener('click', () => {
  const desc = (els.manualDescription?.value || '').trim();
  if (!desc) {
    toast('Enter a description for the manual item.', false);
    return;
  }

  const sup = (els.manualSupplier?.value || '').trim();
  const pn = (els.manualPart?.value || '').trim();
  const priceEach = parseFloat((els.manualPrice?.value || '').toString().replace(/[^0-9.]/g, '')) || 0;
  const qty = Math.max(1, parseInt(els.manualQty?.value, 10) || 1);

  state.quote.push({
    SUPPLIER: sup,
    DESCRIPTION: desc,
    PARTNUMBER: pn,
    PRICE: priceEach,
    qty
  });
  saveQuote();
  renderQuote();

  if (els.manualSupplier) els.manualSupplier.value = '';
  if (els.manualDescription) els.manualDescription.value = '';
  if (els.manualPart) els.manualPart.value = '';
  if (els.manualPrice) els.manualPrice.value = '';
  if (els.manualQty) els.manualQty.value = '1';
  setManualBtnEnabled(false);
  toast('Manual item added.', true);
});

/* ---------- Battery calculator ---------- */

function recalcBattery() {
  if (!els.battCap20 || !els.battTqDisplay || !els.battTaDisplay) return;

  const Iq = parseFloat(els.battIq?.value || '') || 0;
  const Ia = parseFloat(els.battIa?.value || '') || 0;

  const Tq = state.battery.Tq || 24; // hours
  const Ta = 0.5; // hours, fixed
  const Fc = 2;   // capacity derating factor for alarm term
  const L = 1;    // compensation factor (currently 1)

  const cap20 = L * ((Iq * Tq) + Fc * (Ia * Ta));

  const ageMult = 1.25;
  const ageCap = cap20 * ageMult;

  const fmt2 = n => n.toFixed(2);

  els.battTqDisplay.textContent = fmt2(Tq) + ' Hr';
  els.battTaDisplay.textContent = fmt2(Ta) + ' Hr';

  if (els.battCap20) els.battCap20.textContent = fmt2(cap20) + ' Ah';
  if (els.battAgeCap) els.battAgeCap.textContent = fmt2(ageCap) + ' Ah';
  if (els.battRequired) els.battRequired.textContent = fmt2(ageCap) + ' Ah';
}

function initBattery() {
  if (!els.batteryPage) return;

  state.battery.Tq = 24;

  if (els.battBtnTq24) {
    els.battBtnTq24.addEventListener('click', () => {
      state.battery.Tq = 24;
      els.battBtnTq24.classList.add('active');
      if (els.battBtnTq72) els.battBtnTq72.classList.remove('active');
      recalcBattery();
    });
  }
  if (els.battBtnTq72) {
    els.battBtnTq72.addEventListener('click', () => {
      state.battery.Tq = 72;
      els.battBtnTq72.classList.add('active');
      if (els.battBtnTq24) els.battBtnTq24.classList.remove('active');
      recalcBattery();
    });
  }

  if (els.battIq) els.battIq.addEventListener('input', recalcBattery);
  if (els.battIa) els.battIa.addEventListener('input', recalcBattery);

  recalcBattery();
}

// Toggle routine visit radios: click again to turn off
if (els.routineYes) {
  els.routineYes.addEventListener('click', () => {
    if (state.buildcase.routineVisit === 'yes') {
      state.buildcase.routineVisit = null;
      els.routineYes.checked = false;
    } else {
      state.buildcase.routineVisit = 'yes';
      els.routineYes.checked = true;
      if (els.routineNo) els.routineNo.checked = false;
    }
    saveBuildcase();
  });
}

if (els.routineNo) {
  els.routineNo.addEventListener('click', () => {
    if (state.buildcase.routineVisit === 'no') {
      state.buildcase.routineVisit = null;
      els.routineNo.checked = false;
    } else {
      state.buildcase.routineVisit = 'no';
      els.routineNo.checked = true;
      if (els.routineYes) els.routineYes.checked = false;
    }
    saveBuildcase();
  });
}

/* ---------- Diagnostics + debug export ---------- */

function renderDiagnostics() {
  if (els.diagCsvSource) {
    els.diagCsvSource.textContent = state.csvMeta.source || 'None loaded';
  }
  if (els.diagLastLoaded) {
    els.diagLastLoaded.textContent = formatLastLoaded(state.csvMeta.loadedAt);
  }
  if (els.diagPartsRows) {
    els.diagPartsRows.textContent = state.rows.length.toString();
  }
  if (els.diagQuoteItems) {
    els.diagQuoteItems.textContent = state.quote.length.toString();
  }
  if (els.diagRoutine) {
    let txt = 'Not set';
    if (state.buildcase.routineVisit === 'yes') txt = 'Yes';
    else if (state.buildcase.routineVisit === 'no') txt = 'No';
    els.diagRoutine.textContent = txt;
  }
  if (els.diagSwStatus) {
    if (!('serviceWorker' in navigator)) {
      els.diagSwStatus.textContent = 'Not supported';
    } else if (navigator.serviceWorker.controller) {
      els.diagSwStatus.textContent = 'Active';
    } else {
      els.diagSwStatus.textContent = 'Registered / waiting';
    }
  }
}

function buildDebugInfo() {
  const swStatus = !('serviceWorker' in navigator)
    ? 'not-supported'
    : (navigator.serviceWorker.controller ? 'active' : 'registered/waiting');

  const info = {
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
    csvMeta: state.csvMeta,
    rowsCount: state.rows.length,
    firstFewRows: state.rows.slice(0, 3),
    quoteItems: state.quote.length,
    quoteSuppliers: [...new Set(state.quote.map(q => q.SUPPLIER))],
    buildcase: state.buildcase,
    routineVisit: state.buildcase.routineVisit,
    serviceWorker: swStatus,
    userAgent: navigator.userAgent
  };
  return JSON.stringify(info, null, 2);
}

if (els.btnDiagCopy) {
  els.btnDiagCopy.addEventListener('click', () => {
    const txt = buildDebugInfo();
    copyText(txt, 'Debug info copied.');
  });
}

/* ---------- Start ---------- */

/* ---------- Start ---------- */

function start() {
  // Hide tab bar if present
  if (els.tabParts) els.tabParts.style.display = 'none';
  if (els.tabQuote) els.tabQuote.style.display = 'none';
  if (els.tabSettings) els.tabSettings.style.display = 'none';

  renderParts();
  renderQuote();
  updateAddToQuoteState();
  initBattery();

  if (els.homePage) {
    showHomePage();
  } else {
    showPartsPage();
  }
}

// Ensure DOM is ready before we run anything
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
