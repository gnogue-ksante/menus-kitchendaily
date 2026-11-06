/* Moteur commun « Menus KitchenDaily » : utilisé tel quel par la page (navigateur) et par Apps Script (Core.gs). */
function MenuCore() {
  var PROGRAMS = [
    { id: 'nut', group: 'KY Minceur', short: 'Nutri+', label: 'Minceur Nutri+', plan: 'p_nut', gam: 'g_nut' },
    { id: 'act', group: 'KY Minceur', short: 'Activ+', label: 'Minceur Activ+', plan: 'p_act', gam: 'g_act' },
    { id: 'ess', group: 'KY Minceur', short: 'Essentiel', label: 'Minceur Essentiel', plan: 'p_ess', gam: 'g_ess' },
    { id: 'con', group: 'KY Minceur', short: 'Consolidation', label: 'Minceur Consolidation', plan: 'p_con', gam: 'g_con' },
    { id: 'ky', group: 'KY Quotidien', short: 'KY Quotidien', label: 'KY Quotidien', plan: 'p_ky', gam: 'g_ky' }
  ];

  var ALLERGENS = [
    { id: 'gluten', label: 'gluten', syn: ['gluten', 'ble', 'froment', 'orge', 'seigle', 'avoine', 'epeautre'] },
    { id: 'lait', label: 'lait', syn: ['lait', 'lactose', 'laitier', 'produit laitier', 'creme', 'fromage', 'beurre'] },
    { id: 'oeuf', label: 'œuf', syn: ['oeuf', 'oeufs', 'oeuv'] },
    { id: 'soja', label: 'soja', syn: ['soja', 'soya'] },
    { id: 'celeri', label: 'céleri', syn: ['celeri'] },
    { id: 'moutarde', label: 'moutarde', syn: ['moutarde'] },
    { id: 'sulfites', label: 'sulfites', syn: ['sulfite', 'anhydride sulfureux'] },
    { id: 'coque', label: 'fruits à coque', syn: ['fruit a coque', 'fruits a coque', 'fruit a coques', 'fruits a coques', 'coque', 'noix', 'amande', 'noisette', 'pignon', 'cajou', 'pistache'] },
    { id: 'sesame', label: 'sésame', syn: ['sesame'] },
    { id: 'poisson', label: 'poisson', syn: ['poisson'] },
    { id: 'crustaces', label: 'crustacés', syn: ['crustace'] },
    { id: 'mollusques', label: 'mollusques', syn: ['mollusque'] },
    { id: 'arachide', label: 'arachide', syn: ['arachide', 'cacahuete'] },
    { id: 'lupin', label: 'lupin', syn: ['lupin'] },
    { id: 'porc', label: 'porc', syn: ['porc'] }
  ];
  // Mots reconnus mais qui ne sont pas des allergènes (préférences)
  var KNOWN_OTHER = ['viande', 'volaille', 'boeuf', 'veau', 'agneau', 'canard', 'dinde', 'poulet', 'coriandre'];

  var DEFAULT_SETTINGS = {
    criteria: { protplus: 30, leger: 350, keto: 15, lowcarb: 30, lowsalt: 2 },
    minimums: { total: 15, veggie: 3, protplus: 0, leger: 0, lowcarb: 0, keto: 0, lowsalt: 0,
                sans_gluten: 4, sans_lait: 4 },
    showQcBadges: false,
    horizon: 12
  };

  function nk(s) {
    return String(s == null ? '' : s).replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
      .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  }
  function singular(w) { return w.split(' ').map(function (x) { return x.length > 3 ? x.replace(/[sx]$/, '') : x; }).join(' '); }
  function num(v) {
    if (v === '' || v == null) return null;
    if (typeof v === 'number') return v;
    var n = parseFloat(String(v).replace(',', '.').replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }
  function round(v, d) { if (v == null) return null; var p = Math.pow(10, d || 0); return Math.round(v * p) / p; }
  function isActif(v) { return nk(v) === 'actif'; }
  function isPresent(v) { return nk(v) === 'present'; }
  function isValide(v) { return /^valide$/.test(nk(v)); }

  var SYN = {};
  ALLERGENS.forEach(function (a) { a.syn.forEach(function (s) { SYN[singular(nk(s))] = a.id; }); });

  function parseAllergens(txt) {
    var raw = nk(txt);
    var res = { set: {}, unknown: [], empty: raw === '' };
    if (res.empty) return res;
    raw.replace(/[()]/g, ',').split(/[,;.\/+]|\bet\b/).forEach(function (t) {
      t = t.trim(); if (!t) return;
      var s = singular(t);
      if (SYN[s]) { res.set[SYN[s]] = true; return; }
      if (KNOWN_OTHER.indexOf(s) >= 0) { res.set['_' + s] = true; return; }
      res.unknown.push(t);
    });
    return res;
  }

  function parseDates(label) {
    var m = String(label).match(/(\d{1,2})\/(\d{1,2})\/(\d{4}).*?(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return { start: new Date(+m[3], +m[2] - 1, +m[1]), end: new Date(+m[6], +m[5] - 1, +m[4]) };
  }
  function dd(d) { return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2); }
  function menuNum(v) {
    var s = nk(v);
    if (/^menu\s*0/.test(s) || /permanent/.test(s)) return 0;
    var m = s.match(/^menu\s*(\d+)/);
    return m ? +m[1] : null; // Surplus et autres : pas dans les menus
  }

  // Libellés saisis différemment (« Pommes de terre » / « Pomme de terre », espaces…) : regroupés
  function canonFacet(values) {
    var groups = {};
    values.forEach(function (v) {
      var s = String(v || '').trim(); if (!s) return;
      var k = singular(nk(s));
      groups[k] = groups[k] || {};
      groups[k][s] = (groups[k][s] || 0) + 1;
    });
    var map = {}, variants = [];
    Object.keys(groups).forEach(function (k) {
      var forms = Object.keys(groups[k]).sort(function (a, b) { return groups[k][b] - groups[k][a]; });
      map[k] = forms[0];
      if (forms.length > 1) variants.push(forms);
    });
    return { label: function (v) { var s = String(v || '').trim(); return s ? map[singular(nk(s))] : ''; }, variants: variants };
  }

  function build(raw, userSettings) {
    var S = mergeSettings(userSettings);
    var issues = [];
    function issue(type, code, nom, detail, where) { issues.push({ type: type, code: code || '', nom: nom || '', detail: detail, where: where }); }

    // ---- Semaines
    var seen = {}, weeks = [], dupCal = 0;
    (raw.calendar || []).forEach(function (r) {
      var d = parseDates(r[2]); var m = menuNum(r[1]);
      if (!d || m == null) return;
      var key = 'S' + r[0] + '-' + d.start.getFullYear();
      if (seen[key]) { dupCal++; if (seen[key].menu !== m) issue('Calendrier', '', '', 'S' + r[0] + ' : deux menus différents (Menu ' + seen[key].menu + ' et Menu ' + m + ')', 'Plan de menu › Schéma Appro'); return; }
      var w = { key: key, num: +r[0], year: d.start.getFullYear(), menu: m, start: d.start, end: d.end,
                label: 'S' + r[0] + ' · ' + dd(d.start) + ' → ' + dd(d.end) + ' · Menu ' + m };
      seen[key] = w; weeks.push(w);
    });
    weeks.sort(function (a, b) { return a.start - b.start; });
    if (dupCal) issue('Calendrier', '', '', 'Le calendrier est saisi 2 fois (' + dupCal + ' lignes en double). Sans effet sur l’app, mais à nettoyer pour éviter des écarts.', 'Plan de menu › Schéma Appro');

    // ---- Gamme
    var gam = {}, gamCount = {};
    (raw.gamme || []).forEach(function (g) { gamCount[g.sku] = (gamCount[g.sku] || 0) + 1; if (!gam[g.sku]) gam[g.sku] = g; });
    Object.keys(gamCount).forEach(function (k) { if (gamCount[k] > 1) issue('Doublon', k, gam[k].nom, 'Code présent ' + gamCount[k] + ' fois dans la gamme', 'GAMME PRODUITS › KD_KY_DB'); });

    // ---- Plats
    var planRows = raw.plan || [];
    var fProt = canonFacet(planRows.map(function (p) { return p.prot; }));
    var fGarn = canonFacet(planRows.map(function (p) { return p.garn; }));
    var fClasse = canonFacet(planRows.map(function (p) { return p.classe; }));
    var fSpec = canonFacet((raw.gamme || []).map(function (g) { return g.spec; }));
    var fSous = canonFacet(planRows.map(function (p) { return p.souscat; }));

    var dishes = [], codeSeen = {}, nameSeen = {};
    planRows.forEach(function (p) {
      var m = menuNum(p.menu);
      if (m == null) return;
      var code = String(p.code || '').trim();
      if (!code) { issue('Code manquant', p.ancien, p.nom, 'Plat en ' + p.menu + ' sans « Nouveau code » : impossible à relier à la gamme, non affiché', 'Plan de menu › GAMME SAISON 1 AH'); return; }
      if (codeSeen[code]) { issue('Doublon', code, p.nom, 'Code présent plusieurs fois dans le plan (' + codeSeen[code] + ' et ' + p.menu + ')', 'Plan de menu › GAMME SAISON 1 AH'); return; }
      codeSeen[code] = p.menu;
      var g = gam[code] || null;
      var allergTxt = p.allerg || (g ? g.allerg : '');
      var al = parseAllergens(allergTxt);
      var d = {
        code: code, nom: p.nom || (g && g.nom) || code, menu: m, permanent: m === 0,
        classe: fClasse.label(p.classe), statut: p.statut, progres: String(p.progres || '').trim(),
        validated: isValide(p.progres), saison: p.saison,
        souscat: fSous.label(p.souscat), prot: fProt.label(p.prot), garn: fGarn.label(p.garn),
        spec: g ? fSpec.label(g.spec) : '', piment: !!String(p.piment || '').trim(),
        desc: g ? (g.desc_pop || g.desc_menu || '') : '', descMenu: g ? g.desc_menu : '',
        ingr: p.ingr || (g ? g.ingr : ''),
        poids: num(p.poids), kcal: num(p.kcal), mg: num(p.mg), ags: num(p.ags), glu: num(p.glu),
        suc: num(p.suc), fib: num(p.fib), pro: num(p.pro), sel: num(p.sel),
        allergTxt: allergTxt, allergens: al.set, allergKnown: !al.empty,
        programs: {}, planPrograms: {}, qc: []
      };
      if (d.kcal == null && g) d.kcal = num(g.kcal);
      if (d.pro == null && g) d.pro = num(g.pro);
      if (d.glu == null && g) d.glu = num(g.glu);
      if (d.sel == null && g) d.sel = num(g.sel);
      d.isVeggie = nk(d.souscat) === 'vegetarien';
      d.hasPorc = !!al.set.porc || nk(d.prot) === 'porc';
      var where = 'Plan de menu › GAMME SAISON 1 AH';

      PROGRAMS.forEach(function (pg) {
        var inPlan = isPresent(p[pg.plan]);
        var inGam = g ? isActif(g[pg.gam]) : inPlan;
        d.planPrograms[pg.id] = inPlan; d.programs[pg.id] = inGam;
        if (g && inPlan !== inGam) {
          var t = pg.label + ' : plan « ' + (p[pg.plan] || 'vide') + ' » / gamme « ' + (g[pg.gam] || 'vide') + ' » (l’app suit la gamme)';
          d.qc.push(t); issue('Présent vs INACTIF', code, d.nom, t, 'Plan › col. ' + PROGRAMS_COL[pg.id] + ' / GAMME › ' + GAMME_COL[pg.id]);
        }
      });

      if (!g) { d.qc.push('absent de la gamme'); issue('Absent de la gamme', code, d.nom, 'Code introuvable dans KD_KY_DB', 'GAMME PRODUITS › KD_KY_DB'); }
      if (al.empty) { d.qc.push('allergènes non renseignés'); issue('Allergènes vides', code, d.nom, 'Préférences alimentaires vides : le plat n’est compté dans aucun filtre « Sans … »', where + ' › Préférences alimentaires'); }
      if (al.unknown.length) issue('Allergène non reconnu', code, d.nom, 'Mot(s) non reconnu(s) : « ' + al.unknown.join(' », « ') + ' » (texte : ' + allergTxt + ')', where + ' › Préférences alimentaires');
      if (g && p.allerg && g.allerg && !sameAllerg(p.allerg, g.allerg)) issue('Allergènes différents', code, d.nom, 'Plan : « ' + p.allerg + ' » / Gamme : « ' + g.allerg + ' »', 'Les 2 fichiers › Préférences alimentaires');
      if (g && g.nom && nk(g.nom) !== nk(p.nom)) issue('Nom différent', code, d.nom, 'Plan : « ' + p.nom + ' » / Gamme : « ' + g.nom + ' »', 'Les 2 fichiers › Nom PRODUIT');
      if (g && num(g.kcal) != null && num(p.kcal) != null && Math.abs(num(g.kcal) - num(p.kcal)) > Math.max(5, 0.02 * num(p.kcal)))
        issue('Kcal différentes', code, d.nom, 'Plan : ' + round(num(p.kcal)) + ' kcal / Gamme : ' + round(num(g.kcal)) + ' kcal', 'Les 2 fichiers › ENERGIE KCAL / plat');
      if (!d.validated) { d.qc.push('avancement : ' + (d.progres || 'vide')); issue('Pas validé', code, d.nom, 'En ' + p.menu + ' avec Progrès = « ' + (d.progres || 'vide') + ' »', where + ' › Progrès'); }
      if (nk(p.statut) !== 'valide') issue('Statut', code, d.nom, 'Statut = « ' + (p.statut || 'vide') + ' »', where + ' › Statut');
      ['kcal', 'pro', 'glu', 'sel'].forEach(function (k) { if (d[k] == null) issue('Nutrition manquante', code, d.nom, 'Valeur « ' + k + ' / plat » vide : le plat n’entre pas dans les filtres nutritionnels', where); });
      if (nk(d.classe) === 'vegetarien' && !d.isVeggie) issue('Végétarien incohérent', code, d.nom, 'Classe Végétarien mais sous-catégorie « ' + d.souscat + ' »', where + ' › Sous catégorie');
      if (d.isVeggie && (al.set.poisson || al.set.crustaces || al.set._viande || al.set._volaille || al.set.porc)) issue('Végétarien incohérent', code, d.nom, 'Sous-catégorie Végétarien mais allergènes : ' + allergTxt, where + ' › Préférences alimentaires');
      if (!d.prot) issue('Champ vide', code, d.nom, 'Type de protéine vide', where + ' › TYPE DE PROTEINE');
      if (!d.garn) issue('Champ vide', code, d.nom, 'Garniture vide', where + ' › GARNITURE');
      if (g && !d.spec) issue('Champ vide', code, d.nom, 'Spécialité vide', 'GAMME PRODUITS › SPECIALITE');
      var nn = nk(d.nom);
      if (nameSeen[nn]) issue('Doublon de nom', code, d.nom, 'Même nom que ' + nameSeen[nn], where + ' › Nom PRODUIT'); else nameSeen[nn] = code;
      dishes.push(d);
    });
    // Plats permanents ou de menu présents dans aucun programme
    dishes.forEach(function (d) { if (!PROGRAMS.some(function (pg) { return d.programs[pg.id]; })) issue('Aucun programme', d.code, d.nom, 'Plat en menu mais INACTIF dans les 5 programmes', 'GAMME PRODUITS › KD_KY_DB'); });

    [['Type de protéine', fProt], ['Garniture', fGarn], ['Classe', fClasse], ['Spécialité', fSpec], ['Sous-catégorie', fSous]].forEach(function (x) {
      x[1].variants.forEach(function (v) { issue('Libellé saisi différemment', '', '', x[0] + ' : « ' + v.join(' » / « ') + ' » (regroupés dans l’app)', 'Colonne ' + x[0]); });
    });
    // Classes proches (ex. « Riche en protéines & fibres » vs « … & source de fibres »)
    var classes = uniq(dishes.map(function (d) { return d.classe; }));
    classes.forEach(function (a) { classes.forEach(function (b) { if (a < b && nk(b).indexOf(nk(a).split('&')[0].trim()) === 0 && nk(a).split('&')[0] === nk(b).split('&')[0]) issue('Libellé saisi différemment', '', '', 'Classe : « ' + a + ' » / « ' + b + ' » (2 valeurs pour sans doute la même classe)', 'Plan de menu › Classe'); }); });

    var model = {
      settings: S, programs: PROGRAMS, allergens: ALLERGENS, weeks: weeks, dishes: dishes, issues: issues,
      meta: raw.meta || {}, filters: buildFilters(S),
      facets: {
        prot: { label: 'Protéine', values: uniq(dishes.map(function (d) { return d.prot; })) },
        garn: { label: 'Garniture', values: uniq(dishes.map(function (d) { return d.garn; })) },
        spec: { label: 'Spécialité', values: uniq(dishes.map(function (d) { return d.spec; })) },
        classe: { label: 'Classe', values: uniq(dishes.map(function (d) { return d.classe; })) }
      }
    };
    model.currentWeekIndex = function (today) {
      today = today || new Date(); today = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      for (var i = 0; i < weeks.length; i++) if (weeks[i].start <= today && today <= weeks[i].end) return i;
      for (i = 0; i < weeks.length; i++) if (weeks[i].start > today) return i;
      return weeks.length - 1;
    };
    model.weekDishes = function (wi, progId) {
      var w = weeks[wi]; if (!w) return [];
      return dishes.filter(function (d) { return (d.menu === 0 || d.menu === w.menu) && d.programs[progId]; })
        .sort(function (a, b) { return (a.permanent - b.permanent) || a.nom.localeCompare(b.nom, 'fr'); });
    };
    model.filterById = function (id) { for (var i = 0; i < model.filters.length; i++) if (model.filters[i].id === id) return model.filters[i]; return null; };
    model.count = function (list, filterId) {
      if (filterId === 'total') return list.length;
      var f = model.filterById(filterId); return f ? list.filter(f.test).length : 0;
    };
    model.alerts = function (wi, progId) {
      var list = model.weekDishes(wi, progId), out = [];
      Object.keys(S.minimums).forEach(function (fid) {
        var min = +S.minimums[fid] || 0; if (!min) return;
        var n = model.count(list, fid);
        if (n < min) out.push({ week: weeks[wi], program: progLabel(progId), filterId: fid, label: filterLabel(model, fid), count: n, min: min });
      });
      return out;
    };
    model.alertsRange = function (fromIdx, n) {
      var out = [];
      for (var i = fromIdx; i < Math.min(weeks.length, fromIdx + n); i++)
        PROGRAMS.forEach(function (pg) { out = out.concat(model.alerts(i, pg.id)); });
      return out;
    };
    model.filterLabel = function (fid) { return filterLabel(model, fid); };
    return model;
  }

  var PROGRAMS_COL = { ess: 'Prgm KD ESSENTIEL', nut: 'Prgm KD NUTRI+', act: 'Prgm KD ACTIV +', con: 'Prgm KD CONSOLIDATION', ky: 'Prgm KY EQUILIBRE' };
  var GAMME_COL = { ess: 'GAMME KD ESSENTIEL', nut: 'GAMME KD NUTRI +', act: 'GAMME KD ACTIV +', con: 'GAMME KD CONSOLIDATION', ky: 'GAMME KY QUOTIDIEN' };

  function progLabel(id) { for (var i = 0; i < PROGRAMS.length; i++) if (PROGRAMS[i].id === id) return PROGRAMS[i].label; return id; }
  function filterLabel(model, fid) { if (fid === 'total') return 'plats au total'; var f = model.filterById(fid); return f ? f.label.toLowerCase() : fid; }
  function uniq(a) { var o = {}; a.forEach(function (x) { if (x) o[x] = 1; }); return Object.keys(o).sort(function (x, y) { return x.localeCompare(y, 'fr'); }); }
  function sameAllerg(a, b) {
    var x = parseAllergens(a).set, y = parseAllergens(b).set;
    function k(o) { return Object.keys(o).filter(function (z) { return z.charAt(0) !== '_'; }).sort().join(); }
    var kx = k(x), ky = k(y);
    return kx === ky;
  }

  function buildFilters(S) {
    var c = S.criteria;
    var f = [
      { id: 'veggie', group: 'regime', label: 'Végétarien', hint: 'Sans viande ni poisson', test: function (d) { return d.isVeggie; } },
      { id: 'protplus', group: 'regime', label: 'Protéine+', hint: '> ' + c.protplus + ' g de protéines / plat', test: function (d) { return d.pro != null && d.pro > c.protplus; } },
      { id: 'leger', group: 'regime', label: 'Repas léger', hint: '< ' + c.leger + ' kcal / plat', test: function (d) { return d.kcal != null && d.kcal < c.leger; } },
      { id: 'lowcarb', group: 'regime', label: 'Faible en glucides', hint: '< ' + c.lowcarb + ' g de glucides / plat', test: function (d) { return d.glu != null && d.glu < c.lowcarb; } },
      { id: 'keto', group: 'regime', label: 'Keto', hint: '< ' + c.keto + ' g de glucides / plat', test: function (d) { return d.glu != null && d.glu < c.keto; } },
      { id: 'lowsalt', group: 'regime', label: 'Low salt', hint: '< ' + c.lowsalt + ' g de sel / plat', test: function (d) { return d.sel != null && d.sel < c.lowsalt; } }
    ];
    // Filtres « Sans … » : mêmes 22 filtres que sur le site (KY Minceur et KY Quotidien)
    function al(id) { return function (d) { return d.allergKnown && !d.allergens[id]; }; }
    function txt(d) { return nk(d.prot + ' ' + d.nom); }
    var SEAFOOD = /crevette|st jacques|saint jacques|moule|calamar|encornet|poulpe|homard|langoustine|gambas/;
    var SPICY = /piment|chili|harissa|sriracha|jalapeno|espelette/;
    var site = [
      { id: 'sans_boeuf', label: 'Sans boeuf', hint: 'Type de protéine différent de Bœuf', test: function (d) { return nk(d.prot) !== 'boeuf' && !d.allergens._boeuf; } },
      { id: 'sans_arachide', label: 'Sans cacahuètes', hint: 'Allergènes renseignés et sans arachide', test: al('arachide') },
      { id: 'sans_celeri', label: 'Sans céleri', hint: 'Allergènes renseignés et sans céleri', test: al('celeri') },
      { id: 'sans_coriandre', label: 'Sans coriandre', hint: 'Coriandre absente de la liste d\u2019ingrédients (à confirmer par la R&D)', test: function (d) { return !!d.ingr && !/coriandre/.test(nk(d.ingr)) && !d.allergens._coriandre; } },
      { id: 'sans_crustaces', label: 'Sans crustacés', hint: 'Allergènes renseignés et sans crustacés', test: function (d) { return d.allergKnown && !d.allergens.crustaces && !/crevette|homard|langoustine|gambas/.test(txt(d)); } },
      { id: 'sans_epices', label: 'Sans épicés', hint: 'Pas encore disponible : aucune colonne « épicé » dans les fichiers R&D', unavailable: true, test: function () { return false; } },
      { id: 'sans_coque', label: 'Sans fruits à coques', hint: 'Allergènes renseignés et sans fruits à coque', test: al('coque') },
      { id: 'sans_fruitsdemer', label: 'Sans fruits de mer', hint: 'Sans crustacés ni mollusques', test: function (d) { return d.allergKnown && !d.allergens.crustaces && !d.allergens.mollusques && !SEAFOOD.test(txt(d)); } },
      { id: 'sans_gluten', label: 'Sans gluten', hint: 'Allergènes renseignés et sans gluten', test: al('gluten') },
      { id: 'sans_lait', label: 'Sans lait', hint: 'Allergènes renseignés et sans lait', test: al('lait') },
      { id: 'sans_mollusques', label: 'Sans mollusque', hint: 'Allergènes renseignés et sans mollusques', test: function (d) { return d.allergKnown && !d.allergens.mollusques && !/st jacques|saint jacques|moule|calamar|encornet|poulpe/.test(txt(d)); } },
      { id: 'sans_moutarde', label: 'Sans moutarde', hint: 'Allergènes renseignés et sans moutarde', test: al('moutarde') },
      { id: 'sans_oeuf', label: 'Sans oeuf', hint: 'Allergènes renseignés et sans œuf', test: al('oeuf') },
      { id: 'sans_piment', label: 'Sans piment', hint: 'D\u2019après le picto piment et le nom du plat (à confirmer par la R&D)', test: function (d) { return !d.piment && !SPICY.test(nk(d.nom)) && !/pimente/.test(nk(d.nom)); } },
      { id: 'sans_poisson', label: 'Sans poisson', hint: 'Allergènes renseignés, sans poisson et hors sous-catégorie Poisson', test: function (d) { return d.allergKnown && !d.allergens.poisson && nk(d.souscat) !== 'poisson'; } },
      { id: 'sans_porc', label: 'Sans porc', hint: 'Allergènes renseignés, sans porc et protéine différente de Porc', test: function (d) { return d.allergKnown && !d.hasPorc; } },
      { id: 'sans_sesame', label: 'Sans sésame', hint: 'Allergènes renseignés et sans sésame', test: al('sesame') },
      { id: 'sans_soja', label: 'Sans soja', hint: 'Allergènes renseignés et sans soja', test: al('soja') },
      { id: 'sans_sulfites', label: 'Sans sulfites', hint: 'Allergènes renseignés et sans sulfites', test: al('sulfites') },
      { id: 'sans_vegetarien', label: 'Sans végétarien', hint: 'Exclut les plats de la sous-catégorie Végétarien', test: function (d) { return !d.isVeggie; } },
      { id: 'sans_viande', label: 'Sans viande', hint: 'Exclut la sous-catégorie Viande (bœuf, porc…)', test: function (d) { return nk(d.souscat) !== 'viande' && ['boeuf', 'porc', 'veau', 'agneau'].indexOf(nk(d.prot)) < 0; } },
      { id: 'sans_volaille', label: 'Sans volaille', hint: 'Exclut la sous-catégorie Volaille (poulet, dinde, canard)', test: function (d) { return nk(d.souscat) !== 'volaille' && ['poulet', 'dinde', 'canard'].indexOf(nk(d.prot)) < 0; } }
    ];
    site.forEach(function (x) { x.group = 'sans'; f.push(x); });
    return f;
  }

  function mergeSettings(u) {
    var S = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    if (u && typeof u === 'object') {
      ['criteria', 'minimums'].forEach(function (k) { if (u[k]) Object.keys(u[k]).forEach(function (x) { var v = parseFloat(u[k][x]); if (!isNaN(v)) S[k][x] = v; }); });
      if (u.showQcBadges != null) S.showQcBadges = !!u.showQcBadges;
      if (u.horizon) S.horizon = Math.max(4, Math.min(26, +u.horizon || 12));
    }
    return S;
  }

  return { build: build, DEFAULT_SETTINGS: DEFAULT_SETTINGS, PROGRAMS: PROGRAMS, ALLERGENS: ALLERGENS, parseAllergens: parseAllergens, nk: nk };
}
