// ══════════════════════════════════════════════════════════════
//  THE LOOK LAB — the package itself
//  ------------------------------------------------------------
//  Sessions, moods, keepsakes, add-ons, their prices, and the logic that
//  turns a build into a list of what the client gets.
//
//  Shared by BOTH pages — the builder (index.html) and the summary a client
//  is sent (look.html). Deliberately one file: a second copy of a price is a
//  price that will eventually disagree with itself, and a client reading one
//  number while the studio quotes another is the worst version of that.
//
//  WHERE THE NUMBERS COME FROM
//  ---------------------------
//  Normally: the "Look Lab Parts" tab of the tracker sheet, fetched through
//  the Apps Script. One row per piece — the same row that says what the job
//  owes — so adding a mood is one row and nothing here needs editing.
//
//  If that is slow, down, or the tab hasn't been set up, the pages use the
//  built-in tables below, which are what the Look Lab said on 2026-09-27.
//  So the worst case is the Look Lab behaving exactly as it did before the
//  sheet existed. Never a blank page, never half a price list.
//
//  To change a price: edit the sheet. To change what happens when the sheet
//  can't be reached: edit LL_BUILTIN below.
// ══════════════════════════════════════════════════════════════

var LOOKLAB_URL = 'https://script.google.com/macros/s/AKfycbx_Y5nH34Rq16JJ2AxBDr30ttmDFuic61OqoC0u3Wq0zogHEhfoV6qE7uiNagI43flVgw/exec';

var LL_CACHE_KEY = 'cls_ll_cache';
var LL_TTL_MS    = 10 * 60 * 1000;   // a price edit shows up within 10 minutes
var LL_TIMEOUT   = 3500;             // after this, stop waiting and use what we have

// ── the fallback: what the Look Lab said on 2026-09-27 ─────────
var LL_BUILTIN = {
  sessions: [
    { id: 'Standard', emoji: '📸', name: 'Standard', price: 1200, dur: 30, sub: 'A quick portrait session', bullets: ['10-minute photographer session', '1 background', 'Digital copies', 'Bring your own outfit or rent Premium Dress'] },
    { id: 'Signature', emoji: '✨', name: 'Signature', price: 3000, dur: 60, sub: 'For clients who want photographer guidance', bullets: ['20-minute photographer session', '2 light styles', '1 outfit change', 'Optional: Use of available outfits', '3 edited photos*', 'Basic hair & makeup'] },
    { id: 'Prestige', emoji: '👑', name: 'Prestige', price: 5000, dur: 90, sub: 'The full portrait experience', bullets: ['45-minute guided shoot', 'Unlimited shots', '2 light styles', 'up to 2 outfit change', 'FREE use of 1 Premium Dress', 'Optional: Use of available outfits', '5 edited photos*', 'Glam Make up look', '8×24 portrait included'] }
  ],
  moods: [
    { id: 'styleshots', emoji: '✨', name: 'Styleshots', sub: 'Modern / Clean / Confident', price: 0, mins: 0, bullets: ['Photographer-guided posing', 'Contemporary lighting', 'Personalized portrait direction', 'Standard lighting'] },
    { id: 'coatcode', emoji: '🖤', name: 'The Coat Code', sub: 'Luxury / Bold / Fashion', price: 800, mins: 10, bullets: ['Prestige fur coat', 'Dark editorial lighting', 'High-fashion posing', 'Foil styling', '+10 mins shoot', '+2 edited photo'] },
    { id: 'angelic', emoji: '🪽', name: 'Angelic Muse', sub: 'Ethereal / Feminine / Dreamy', price: 800, mins: 10, bullets: ['Angel wings', 'Celestial lighting', 'Cloud or Foil Styling', '+10 mins shoot', '+2 edited photo'] }
  ],
  double: { id: 'double', emoji: '💫', name: 'Twofold', sub: 'Coat Code × Angelic Muse', price: 1800, mins: 30, bullets: ['Two completely different looks', 'Fur coat AND angel wings', '+10 mins time', 'Mini Keepsake included', '8×24in printed portrait', '+2 edited photos'] },
  keepsakes: [
    { id: 'digital', emoji: '💻', name: 'Digital', price: 0, notWith: 'Twofold', bullets: ['All edited photos', 'Digital copies'] },
    { id: 'mini', emoji: '🖼️', name: 'Mini Keepsake', price: 100, notWith: 'Twofold', bullets: ['4 pcs 2×3in prints', '2 pcs 3×4in prints'] },
    { id: 'wall', emoji: '🎥', name: 'Prestige Wall', price: 1000, prestigePrice: 0, freeWith: 'Twofold', onlyWith: 'Twofold', bullets: ['Mini Keepsake included', '8×24in printed portrait', '+2 edited photos'] },
    { id: 'acrylic', emoji: '💎', name: 'Prestige Acrylic', price: 1500, prestigePrice: 1000, bullets: ['Mini Keepsake included', '8×24in portrait in Acrylic Frame with Gold Studs', '+3 edited photos'] }
  ],
  extras: [
    { key: 'outfit', name: 'Additional Outfit Change', price: 300, mins: 0 },
    { key: 'photos', name: '+3 Edited Photos', price: 500, mins: 0 },
    { key: 'rush', name: 'Rush 24-Hour Delivery', price: 500, mins: 0 },
    { key: 'time', name: '+15 Mins Time', price: 700, mins: 15 },
    { key: 'framed5r', name: '5R Framed Photo', price: 800, mins: 0 },
    { key: 'framed8r', name: '8R Framed Photo', price: 1000, mins: 0 }
  ]
};

// ── what's in force right now ──────────────────────────────────
// Starts as the built-ins so a page that renders before the fetch finishes
// still shows a complete, correct Look Lab rather than nothing.
var SESSIONS  = LL_BUILTIN.sessions;
var MOODS     = LL_BUILTIN.moods;
var DOUBLE    = LL_BUILTIN.double;
var KEEPSAKES = LL_BUILTIN.keepsakes;
var EXTRAS    = LL_BUILTIN.extras;
var LL_SOURCE = 'builtin';

// ══════════════════════════════════════════════════════════════
//  PRICING
// ══════════════════════════════════════════════════════════════

function fmt(n) {
  var sign = n < 0 ? '-' : '';
  return sign + '₱' + Math.abs(n).toLocaleString('en-PH');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function llFind(list, id) {
  for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
  return null;
}

function llMood(id) { return id === 'double' ? DOUBLE : llFind(MOODS, id); }

// Does a "Free With" / "Only With" / "Not With" cell name this mood?
// The sheet is written by a person, so match the mood's display name OR its
// id, either case: "Twofold", "twofold" and "double" all mean the same tile.
function llNames(rule, moodId) {
  if (!rule) return false;
  var m = llMood(moodId);
  var want = String(rule).trim().toLowerCase();
  if (!want) return false;
  if (want === String(moodId || '').toLowerCase()) return true;
  return !!m && want === String(m.name || '').toLowerCase();
}

function keepsakePrice(sessionId, keepsakeId, moodId) {
  var k = llFind(KEEPSAKES, keepsakeId);
  if (!k) return 0;
  if (llNames(k.freeWith, moodId)) return 0;
  if (String(sessionId || '').toLowerCase() === 'prestige' &&
      k.prestigePrice !== undefined && k.prestigePrice !== null) return k.prestigePrice;
  return k.price || 0;
}

// Which keepsakes to offer for a given mood. Twofold already includes the
// Mini Keepsake and the 8×24, so offering them again would be selling the
// client something they have.
function keepsakeOptions(moodId) {
  return KEEPSAKES.filter(function (k) {
    if (k.onlyWith) return llNames(k.onlyWith, moodId);
    if (k.notWith && llNames(k.notWith, moodId)) return false;
    return true;
  });
}

function extraPrice(key) { var x = llFind2(EXTRAS, key); return x ? (x.price || 0) : 0; }
function extraMins(key)  { var x = llFind2(EXTRAS, key); return x ? (x.mins  || 0) : 0; }
function llFind2(list, key) {
  for (var i = 0; i < (list || []).length; i++) if (list[i].key === key) return list[i];
  return null;
}

// Total minutes to block on the calendar for a build.
function slotMinutes(sessionId, moodId, picked) {
  var s = llFind(SESSIONS, sessionId), m = llMood(moodId);
  var mins = (s && s.dur) || 60;
  if (m) mins += m.mins || 0;
  Object.keys(picked || {}).forEach(function (k) { if (picked[k]) mins += extraMins(k); });
  return mins;
}

// ══════════════════════════════════════════════════════════════
//  LOADING THE SHEET
// ══════════════════════════════════════════════════════════════

// Only accept a payload that is complete. A half-read sheet must not become
// a half-priced quote, so anything doubtful leaves the built-ins in place.
function llValid(d) {
  if (!d || d.source !== 'sheet') return false;
  function ok(list, needBullets) {
    if (!list || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || !e.id || !e.name) return false;
      if (typeof e.price !== 'number' || isNaN(e.price)) return false;
      if (needBullets && (!e.bullets || !e.bullets.length)) return false;
    }
    return true;
  }
  if (!ok(d.sessions, true) || !ok(d.moods, true) || !ok(d.keepsakes, true)) return false;
  if (d.double && !ok([d.double], true)) return false;
  return true;
}

function applyLookLab(d) {
  SESSIONS  = d.sessions;
  MOODS     = d.moods;
  DOUBLE    = d.double || LL_BUILTIN.double;
  KEEPSAKES = d.keepsakes;
  EXTRAS    = (d.extras && d.extras.length) ? d.extras : LL_BUILTIN.extras;
  LL_SOURCE = 'sheet';
}

function llCacheRead() {
  try {
    var raw = localStorage.getItem(LL_CACHE_KEY);
    if (!raw) return null;
    var c = JSON.parse(raw);
    return (c && c.d && typeof c.t === 'number') ? c : null;
  } catch (e) { return null; }
}
function llCacheWrite(d) {
  try { localStorage.setItem(LL_CACHE_KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
}
function llCacheClear() {
  try { localStorage.removeItem(LL_CACHE_KEY); } catch (e) {}
}

/**
 * Get the Look Lab, then call back.
 *
 * Calls back exactly once, and never later than LL_TIMEOUT, whatever the
 * network does. By the time it fires, SESSIONS / MOODS / DOUBLE / KEEPSAKES
 * / EXTRAS hold the best data available and LL_SOURCE says where it came
 * from: 'sheet', 'cache' or 'builtin'.
 *
 * Add ?fresh=1 to the page URL to skip the cache.
 */
function loadLookLab(cb) {
  var done = false;
  function finish(src) {
    if (done) return;
    done = true;
    // applyLookLab() marks the tables as 'sheet' because that is where the
    // numbers came from; here we record how we GOT them, which is the thing
    // worth knowing when something looks stale.
    LL_SOURCE = src;
    try { cb && cb(src); } catch (e) {}
  }

  var force = /[?&]fresh=1\b/.test(location.search);
  var cached = llCacheRead();

  // Fresh enough — use it and don't touch the network at all.
  if (cached && !force && (Date.now() - cached.t) < LL_TTL_MS && llValid(cached.d)) {
    applyLookLab(cached.d);
    return finish('cache');
  }

  if (!LOOKLAB_URL || typeof document === 'undefined') {
    if (cached && llValid(cached.d)) { applyLookLab(cached.d); return finish('cache'); }
    return finish('builtin');
  }

  var tag = null;
  var timer = setTimeout(function () {
    // Took too long. A stale price from the sheet still beats a built-in one.
    // Drop the pending <script> as well: it is no longer wanted, and while it
    // hangs there the page's load event can't fire.
    try { if (tag && tag.parentNode) tag.parentNode.removeChild(tag); } catch (e) {}
    if (cached && llValid(cached.d)) { applyLookLab(cached.d); finish('cache'); }
    else finish('builtin');
  }, LL_TIMEOUT);

  var cbName = '__ll' + Date.now() + Math.floor(Math.random() * 1000);
  window[cbName] = function (d) {
    clearTimeout(timer);
    if (llValid(d)) { applyLookLab(d); llCacheWrite(d); finish('sheet'); }
    else {
      // The script answered and said the sheet isn't usable. It knows better
      // than a cache written before the columns were emptied — drop it.
      llCacheClear();
      finish('builtin');
    }
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
  };

  var s = document.createElement('script');
  try {
    s.src = LOOKLAB_URL + '?d=' +
      encodeURIComponent(btoa(JSON.stringify({ action: 'getLookLab' }))) +
      '&callback=' + cbName;
  } catch (e) { clearTimeout(timer); return finish('builtin'); }
  s.onerror = function () {
    clearTimeout(timer);
    if (cached && llValid(cached.d)) { applyLookLab(cached.d); finish('cache'); }
    else finish('builtin');
  };
  tag = s;
  document.head.appendChild(s);
}

// ══════════════════════════════════════════════════════════════
//  WHAT THE CLIENT ACTUALLY GETS
//  ------------------------------------------------------------
//  A build is three choices plus extras, and several of them stack:
//  Signature gives 3 edited photos, The Coat Code adds 2, Prestige
//  Acrylic adds 3. Nobody should be asked to add that up — least of all
//  a client deciding whether to book. This turns a build into one
//  grouped list where the stacking things are already summed.
//
//  It reads the SAME bullets the cards show, rather than carrying its own
//  copy of the numbers. That is deliberate: a second copy would drift the
//  first time a bullet was edited, and the summary would keep quoting the
//  old number with nothing on screen to reveal it. Parsing the bullets
//  means the card and the summary can never disagree — and now that the
//  bullets come from the sheet, neither can the sheet and the page.
//
//  Anything the parser does not recognise is passed through as its own
//  line. So the failure mode is a line appearing twice — visible, and
//  fixable — never a line going missing.
// ══════════════════════════════════════════════════════════════

function buildInclusions(opts) {
  var session  = opts.session  || null;   // a SESSIONS entry
  var mood     = opts.mood     || null;   // a MOODS entry or DOUBLE
  var keepsake = opts.keepsake || null;   // a KEEPSAKES entry
  var extras   = opts.extras   || {};     // { outfit:true, photos:true, … }
  var extraDefs= opts.extraDefs|| [];     // the EXTRAS table
  var gown     = opts.gown     || '';     // a gown name, if one was picked
  var gownFree = !!opts.gownFree;

  // ── what we are counting ──
  var n = { mins: 0, edits: 0, outfits: 0, styles: 0 };
  var upTo = { outfits: false };
  var has = { mini: false, p8x24: false, unlimited: false, digital: false };
  var frame8x24 = '';                     // e.g. "in an Acrylic Frame with Gold Studs"
  // The session names its own length in its own words — "45-minute guided
  // shoot", "20-minute photographer session". Keep that phrasing and only
  // swap the number, so a merged total doesn't flatten "guided shoot" into
  // something blander than what is being sold.
  var minsPhrase = 'minute photographer session';
  var look = [];                          // the mood's styling
  var hmu = '';
  var sessionExtra = [];                  // session lines that aren't counted
  var takeHome = [];                      // keepsake lines that aren't counted
  var addOns = [];

  var seen = {};
  function once(list, text) {
    var k = String(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    if (!k || seen[k]) return;
    seen[k] = 1;
    list.push(text);
  }

  // ── the parser ────────────────────────────────────────────────
  // Returns true when a bullet was understood as a number we sum, in
  // which case it is not passed through as its own line.
  function count(b, isSession) {
    var t = String(b || '');
    var m, got = false;

    m = t.match(/(\d+)\s*-?\s*(minute|mins?\b)(.*)$/i);
    if (m) {
      n.mins += parseInt(m[1], 10);
      if (isSession) {
        var tail = String(m[3] || '').trim();
        if (tail) minsPhrase = 'minute ' + tail;
      }
      got = true;
    }

    m = t.match(/(\d+)\s*edited\s*photo/i);
    if (m) { n.edits += parseInt(m[1], 10); got = true; }

    m = t.match(/(?:(up\s*to)\s*)?(\d+)\s*outfit\s*change/i);
    if (m) { n.outfits += parseInt(m[2], 10); if (m[1]) upTo.outfits = true; got = true; }

    m = t.match(/(\d+)\s*light\s*styles?/i);
    // Light styles are a setup, not a quantity that doubles — take the most
    // any one choice offers rather than adding them together.
    if (m) { n.styles = Math.max(n.styles, parseInt(m[1], 10)); got = true; }

    if (/unlimited\s+shots/i.test(t)) { has.unlimited = true; got = true; }
    if (/mini\s*keepsake/i.test(t))   { has.mini = true; got = true; }
    if (/all\s+edited\s+photos|digital\s+cop/i.test(t)) { has.digital = true; got = true; }

    if (/8\s*[×x]\s*24/i.test(t)) {
      has.p8x24 = true; got = true;
      var f = t.match(/\b(in\s+(?:an?\s+)?[^,]*frame[^,]*)/i);
      if (f && !frame8x24) frame8x24 = f[1].trim();
    }
    return got;
  }

  // ── the session ──
  if (session) {
    (session.bullets || []).forEach(function (b) {
      if (count(b, true)) return;
      if (/hair|makeup|make up|glam/i.test(b)) { hmu = b; return; }
      once(sessionExtra, b);
    });
  }

  // ── the mood ──
  if (mood) {
    (mood.bullets || []).forEach(function (b) {
      if (count(b)) return;
      once(look, b);
    });
  }

  // ── the keepsake ──
  if (keepsake) {
    (keepsake.bullets || []).forEach(function (b) {
      if (count(b)) return;
      once(takeHome, b);
    });
  }

  // ── the add-ons ──
  extraDefs.forEach(function (x) {
    if (!extras[x.key]) return;
    if (x.key === 'outfit') { n.outfits += 1; return; }
    if (/(\d+)\s*edited/i.test(x.name)) { n.edits += parseInt(RegExp.$1, 10); return; }
    if (/(\d+)\s*mins/i.test(x.name))   { n.mins  += parseInt(RegExp.$1, 10); return; }
    once(addOns, x.name);
  });

  // ══ assemble, in the order a person would explain it ══
  var groups = [];
  function group(title, items) {
    items = items.filter(Boolean);
    if (items.length) groups.push({ title: title, items: items });
  }

  // A named gown gets its own group, so the session's generic "FREE use of 1
  // Premium Dress" line would say the same thing twice.
  if (gown) sessionExtra = sessionExtra.filter(function (b) { return !/premium dress/i.test(b); });

  var shoot = [];
  if (n.mins)    shoot.push(n.mins + '-' + minsPhrase);
  if (has.unlimited) shoot.push('Unlimited shots');
  if (n.styles)  shoot.push(n.styles + ' light style' + (n.styles === 1 ? '' : 's'));
  if (n.outfits) shoot.push((upTo.outfits ? 'Up to ' : '') + n.outfits +
                            ' outfit change' + (n.outfits === 1 ? '' : 's'));
  sessionExtra.forEach(function (b) { shoot.push(b); });
  group('Your session', shoot);

  group('Your look', look);
  group('Hair & makeup', [hmu]);

  var home = [];
  if (n.edits)   home.push(n.edits + ' professionally edited photo' + (n.edits === 1 ? '' : 's'));
  if (has.digital) home.push('All your digital copies');
  if (has.mini)  home.push('Mini Keepsake set — 4 pcs 2×3in + 2 pcs 3×4in prints');
  if (has.p8x24) home.push('8×24in printed portrait' + (frame8x24 ? ' ' + frame8x24 : ''));
  takeHome.forEach(function (b) { home.push(b); });
  group('What you take home', home);

  if (gown) group('Your gown', [gown + (gownFree ? ' — included' : '') + ' (House of Roan)']);
  group('Added on', addOns);

  return { groups: groups, counts: n, flags: has, frame: frame8x24 };
}

// What the tables hold right now. Only used by the tests, which must ask
// rather than keep their own reference — a test holding the old array would
// still pass after applyLookLab() swapped it, which is the one thing these
// tests exist to catch.
function llNow() {
  return { sessions: SESSIONS, moods: MOODS, double: DOUBLE,
           keepsakes: KEEPSAKES, extras: EXTRAS, source: LL_SOURCE };
}

if (typeof module !== 'undefined') module.exports = {
  llNow: llNow, llMood: llMood, llFind: llFind,
  buildInclusions: buildInclusions, keepsakePrice: keepsakePrice,
  keepsakeOptions: keepsakeOptions, slotMinutes: slotMinutes,
  extraPrice: extraPrice, extraMins: extraMins, llValid: llValid,
  applyLookLab: applyLookLab, LL_BUILTIN: LL_BUILTIN, fmt: fmt, esc: esc
};
