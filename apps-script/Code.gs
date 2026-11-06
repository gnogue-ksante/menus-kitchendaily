/**
 * Menus KitchenDaily – API Apps Script de l'app web (page hébergée sur GitHub Pages)
 * Lit en direct « Plan de menu KD KY Ultra frais » (.xlsx, converti à la volée) et « GAMME PRODUITS KD KY DB ».
 * Fichiers du projet : Code.gs (ce fichier), Core.gs (moteur commun, identique à celui de la page).
 * Service avancé requis : Drive API (v3), identifiant « Drive ».
 *
 * Fonctions à lancer à la main :
 *  - installer()      : crée le déclencheur quotidien (~8h) des alertes par mail.
 *  - desinstaller()   : supprime ce déclencheur.
 *  - verifierAlertes(): lance la vérification tout de suite (test).
 *  - viderCache()     : force une relecture des Sheets.
 */

var CONFIG = {
  PLAN_ID: '1vW5kV6jLNPUF98yi6TPLidUY1T2OWTr6',  // « Plan de menu KD KY Ultra frais » (.xlsx ou Google Sheet, les deux marchent)
  GAMME_ID: '15wy8S76OhgC6PV-WZVH1DhEDBk1f9VTtU95FGAz5SYU', // « GAMME PRODUITS KD KY DB »
  SHEET_CALENDAR: 'Schéma Appro',
  SHEET_PLAN: 'GAMME SAISON 1 AH',
  SHEET_GAMME: 'KD_KY_DB',
  APP_URL: 'https://gnogue-ksante.github.io/menus-kitchendaily/',
  CONFIG_SHEET_ID: '',          // optionnel : ID d'un Sheet où créer l'onglet CONFIG_APP (sinon : propriétés du script)
  CONFIG_TAB: 'CONFIG_APP',
  ALERT_EMAILS: 'gnogue@ksante.fr', // destinataires du mail d'alerte (séparés par des virgules)
  ALERT_WEEKS: 6,
  CACHE_SECONDS: 600,
  TIMEZONE: 'Europe/Paris'
};

// Colonnes lues par NOM d'en-tête (insensible aux accents, majuscules et espaces)
var PLAN_FIELDS = {
  code: 'Nouveau code', ancien: 'Ancien SKU', nom: 'Nom PRODUIT', classe: 'Classe',
  statut: 'Statut', progres: 'Progrès', saison: 'Saison Recette', souscat: 'Sous catégorie',
  p_ess: 'Prgm KD ESSENTIEL', p_nut: 'Prgm KD NUTRI+', p_act: 'Prgm KD ACTIV +',
  p_con: 'Prgm KD CONSOLIDATION', p_ky: 'Prgm KY EQUILIBRE', menu: 'Numéro de menu UF',
  allerg: 'Préférences alimentaires', prot: 'TYPE DE PROTEINE', garn: 'GARNITURE',
  piment: 'Picto piment', ingr: 'Ingrédients', poids: 'POIDS NET PORTION (en g)',
  kcal: 'ENERGIE KCAL / plat', mg: 'MG / Plat (en g)', ags: 'Acide Gras Saturés / Plat (en g)',
  glu: 'Glucides / Plat (en g)', suc: 'Sucres / Plat (en g)', fib: 'Fibres / Plat (en g)',
  pro: 'Protéines / Plat (en g)', sel: 'Sel / Plat (en g)', kcal100: 'ENERGIE KCAL / 100g'
};
var GAMME_FIELDS = {
  sku: 'SKU', nom: 'Nom PRODUIT', desc_pop: 'Description pop in', desc_menu: 'Description menu (brève)',
  g_ess: 'GAMME KD ESSENTIEL', g_nut: 'GAMME KD NUTRI +', g_act: 'GAMME KD ACTIV +',
  g_con: 'GAMME KD CONSOLIDATION', g_ky: 'GAMME KY QUOTIDIEN', allerg: 'Préférences alimentaires',
  prot: 'TYPE DE PROTEINE', garn: 'GARNITURE', spec: 'SPECIALITE', ingr: 'Ingrédients',
  kcal: 'ENERGIE KCAL / plat', pro: 'Protéines / Plat (en g)', glu: 'Glucides / Plat (en g)',
  sel: 'Sel / Plat (en g)'
};

/* ========================= API (appelée par la page GitHub) ========================= */

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action !== 'data') return json_({ ok: true, app: 'Menus KitchenDaily', info: 'API de l\u2019app ' + CONFIG.APP_URL });
  if (!codeOk_(p.key)) return json_({ ok: false, error: 'code' });
  try {
    if (p.refresh) viderCache();
    return json_({ ok: true, data: getRaw_(), settings: getSettings_() });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'requête illisible' }); }
  if (!codeOk_(body.key)) return json_({ ok: false, error: 'code' });
  if (body.action === 'settings') { saveSettings(JSON.stringify(body.settings || {})); return json_({ ok: true }); }
  return json_({ ok: false, error: 'action inconnue' });
}

// Code d'accès : propriété du script « ACCESS_CODE » (Paramètres du projet > Propriétés du script), jamais dans le code
function codeOk_(k) {
  var code = PropertiesService.getScriptProperties().getProperty('ACCESS_CODE');
  return !!code && String(k || '') === code;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Test depuis l'éditeur : vérifie la lecture des 2 fichiers
function testerLecture() {
  viderCache();
  var raw = readRaw_();
  var M = MenuCore().build(raw, getSettings_());
  Logger.log('Semaines : %s · plats : %s · lignes gamme : %s · incohérences : %s · en-têtes manquantes : %s',
    M.weeks.length, M.dishes.length, raw.gamme.length, M.issues.length, raw.meta.missingHeaders.join(', ') || 'aucune');
}

function saveSettings(json) {
  var s = JSON.parse(json);
  if (CONFIG.CONFIG_SHEET_ID) {
    var ss = SpreadsheetApp.openById(CONFIG.CONFIG_SHEET_ID);
    var sh = ss.getSheetByName(CONFIG.CONFIG_TAB) || ss.insertSheet(CONFIG.CONFIG_TAB);
    var rows = [['Clé', 'Valeur']];
    Object.keys(s.minimums || {}).forEach(function (k) { rows.push(['min.' + k, s.minimums[k]]); });
    Object.keys(s.criteria || {}).forEach(function (k) { rows.push(['crit.' + k, s.criteria[k]]); });
    rows.push(['showQcBadges', s.showQcBadges ? 'oui' : 'non'], ['horizon', s.horizon || 12]);
    sh.clearContents(); sh.getRange(1, 1, rows.length, 2).setValues(rows);
  } else {
    PropertiesService.getScriptProperties().setProperty('SETTINGS', JSON.stringify(s));
  }
  return true;
}

function getSettings_() {
  if (CONFIG.CONFIG_SHEET_ID) {
    var sh = SpreadsheetApp.openById(CONFIG.CONFIG_SHEET_ID).getSheetByName(CONFIG.CONFIG_TAB);
    if (!sh) return null;
    var s = { minimums: {}, criteria: {} };
    sh.getDataRange().getValues().slice(1).forEach(function (r) {
      var k = String(r[0]);
      if (k.indexOf('min.') === 0) s.minimums[k.slice(4)] = r[1];
      else if (k.indexOf('crit.') === 0) s.criteria[k.slice(5)] = r[1];
      else if (k === 'showQcBadges') s.showQcBadges = String(r[1]).toLowerCase() === 'oui';
      else if (k === 'horizon') s.horizon = r[1];
    });
    return s;
  }
  var p = PropertiesService.getScriptProperties().getProperty('SETTINGS');
  return p ? JSON.parse(p) : null;
}

/* ========================= Lecture des Sheets (avec cache ~10 min) ========================= */

function getRaw_() {
  var cached = cacheGet_('RAW');
  if (cached) return JSON.parse(cached);
  var raw = readRaw_();
  cachePut_('RAW', JSON.stringify(raw));
  return raw;
}

// Ouvre un Google Sheet, ou convertit un .xlsx en Google Sheet temporaire (mis à la corbeille après lecture)
function openSpreadsheet_(id, temps) {
  var file = DriveApp.getFileById(id);
  if (file.getMimeType() === MimeType.GOOGLE_SHEETS) return SpreadsheetApp.openById(id);
  var copy = Drive.Files.copy({ name: 'TEMP lecture app menus – ne pas modifier', mimeType: MimeType.GOOGLE_SHEETS, parents: [DriveApp.getRootFolder().getId()] },
    id, { supportsAllDrives: true });
  temps.push(copy.id);
  return SpreadsheetApp.openById(copy.id);
}

function readRaw_() {
  var temps = [];
  try { return readRawFrom_(openSpreadsheet_(CONFIG.PLAN_ID, temps), openSpreadsheet_(CONFIG.GAMME_ID, temps)); }
  finally { temps.forEach(function (t) { try { DriveApp.getFileById(t).setTrashed(true); } catch (e) {} }); }
}

function readRawFrom_(plan, gammeSs) {
  var cal = [];
  plan.getSheetByName(CONFIG.SHEET_CALENDAR).getDataRange().getValues().forEach(function (r) {
    var a = r[0], b = r[1], c = r[2];
    if (typeof a === 'number' && typeof b === 'string' && /^menu/i.test(b.trim()) && c) cal.push([Math.round(a), b.trim(), String(c).trim()]);
  });
  var p = pick_(plan.getSheetByName(CONFIG.SHEET_PLAN), PLAN_FIELDS);
  var planRows = p.rows.filter(function (o) { return o.menu !== ''; });
  var codes = {}; planRows.forEach(function (o) { if (o.code) codes[o.code] = 1; });
  var g = pick_(gammeSs.getSheetByName(CONFIG.SHEET_GAMME), GAMME_FIELDS);
  var gamRows = g.rows.filter(function (o) { return codes[o.sku]; });
  return {
    calendar: cal, plan: planRows, gamme: gamRows,
    meta: { source: 'Fichiers R&D (Drive)', generatedAt: Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'dd/MM/yyyy HH:mm'), missingHeaders: p.missing.concat(g.missing) }
  };
}

function normHeader_(h) {
  return String(h == null ? '' : h).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+]/g, '');
}

function clean_(v) {
  if (v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, CONFIG.TIMEZONE, 'dd/MM/yyyy');
  if (typeof v === 'string') return v.trim();
  return v;
}

function pick_(sheet, fields) {
  var values = sheet.getDataRange().getValues();
  var hdr = values[0].map(normHeader_);
  var idx = {}, missing = [];
  Object.keys(fields).forEach(function (k) {
    var i = hdr.indexOf(normHeader_(fields[k]));
    if (i >= 0) idx[k] = i; else missing.push(fields[k]);
  });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = {}, any = false;
    Object.keys(idx).forEach(function (k) { var v = clean_(values[r][idx[k]]); o[k] = v; if (v !== '') any = true; });
    if (any) rows.push(o);
  }
  return { rows: rows, missing: missing };
}

// CacheService limite chaque valeur à 100 Ko : découpage en morceaux
function cachePut_(key, str) {
  var cache = CacheService.getScriptCache(), size = 40000, parts = {}, n = Math.ceil(str.length / size);
  for (var i = 0; i < n; i++) parts[key + '_' + i] = str.substr(i * size, size);
  parts[key + '_n'] = String(n);
  cache.putAll(parts, CONFIG.CACHE_SECONDS);
}
function cacheGet_(key) {
  var cache = CacheService.getScriptCache(), n = cache.get(key + '_n');
  if (!n) return null;
  var keys = []; for (var i = 0; i < +n; i++) keys.push(key + '_' + i);
  var got = cache.getAll(keys), out = '';
  for (i = 0; i < keys.length; i++) { if (got[keys[i]] == null) return null; out += got[keys[i]]; }
  return out;
}
function viderCache() {
  var cache = CacheService.getScriptCache(), n = +(cache.get('RAW_n') || 0), keys = ['RAW_n'];
  for (var i = 0; i < Math.max(n, 30); i++) keys.push('RAW_' + i);
  cache.removeAll(keys);
}

/* ========================= Alertes par mail ========================= */

function verifierAlertes() {
  viderCache();
  var M = MenuCore().build(getRaw_(), getSettings_());
  var from = M.currentWeekIndex(new Date());
  var alerts = M.alertsRange(from, CONFIG.ALERT_WEEKS);
  if (!alerts.length) return 0;
  var url = CONFIG.APP_URL;
  var lines = alerts.map(function (a) { return '<li>⚠ <b>S' + a.week.num + ' – ' + a.program + '</b> : seulement ' + a.count + ' ' + a.label + ' (seuil ' + a.min + ')</li>'; });
  var html = '<p>Hello,</p><p>' + alerts.length + ' alerte(s) sur les ' + CONFIG.ALERT_WEEKS + ' prochaines semaines :</p><ul>' + lines.join('') + '</ul>' +
    (url ? '<p><a href="' + url + '">Ouvrir l’app des menus</a></p>' : '');
  MailApp.sendEmail({ to: CONFIG.ALERT_EMAILS, subject: 'Menus KitchenDaily – ' + alerts.length + ' alerte(s) sur les ' + CONFIG.ALERT_WEEKS + ' prochaines semaines', htmlBody: html });
  return alerts.length;
}

function installer() {
  desinstaller();
  ScriptApp.newTrigger('verifierAlertes').timeBased().everyDays(1).atHour(8).inTimezone(CONFIG.TIMEZONE).create();
}
function desinstaller() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'verifierAlertes'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
