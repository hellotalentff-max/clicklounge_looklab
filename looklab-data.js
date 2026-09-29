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

var LOOKLAB_URL = 'https://script.google.com/macros/s/AKfycbwRIZPUmK-xm0fFsL1bnn9KAUQ9r57uDG_OXPQi7WyP5VZ0jlWaOq72pmVzUoiAesDEiA/exec';

var LL_CACHE_KEY = 'cls_ll_cache';
var LL_TTL_MS    = 10 * 60 * 1000;   // a price edit shows up within 10 minutes
var LL_TIMEOUT   = 3500;             // after this, stop waiting and use what we have

// ── the fallback: what the Look Lab said on 2026-09-27 ─────────
var LL_BUILTIN = {
  sessions: [
    { id: 'Standard', emoji: '📸', name: 'Standard', price: 1200, dur: 30, dress: 'add-on',
      sub: 'A quick portrait session',
      shootMins: 10, shootWording: 'photographer session', backgrounds: 1, digital: true,
      extraLines: ['Bring your own outfit or rent Premium Dress'] },
    { id: 'Signature', emoji: '✨', name: 'Signature', price: 3000, dur: 60, dress: 'add-on',
      sub: 'For clients who want photographer guidance',
      shootMins: 20, shootWording: 'photographer session', lights: 2, outfits: 1, edits: 3,
      makeup: 'Basic hair & makeup',
      extraLines: ['Optional: Use of available outfits'] },
    { id: 'Prestige', emoji: '👑', name: 'Prestige', price: 5000, dur: 90, dress: 'included',
      sub: 'The full portrait experience',
      shootMins: 45, shootWording: 'guided shoot', unlimited: true, lights: 2,
      outfits: 2, outfitUpTo: true, edits: 5, makeup: 'Glam Make up look', p8x24: true,
      prints: ['8×24 portrait included'],
      extraLines: ['FREE use of 1 Premium Dress', 'Optional: Use of available outfits'] }
  ],
  moods: [
    { id: 'styleshots', emoji: '✨', name: 'Styleshots', sub: 'Modern / Clean / Confident',
      price: 0, mins: 0,
      setDesign: ['Photographer-guided posing', 'Contemporary lighting',
                  'Personalized portrait direction', 'Standard lighting'] },
    { id: 'coatcode', emoji: '🖤', name: 'The Coat Code', sub: 'Luxury / Bold / Fashion',
      price: 800, mins: 10, minsBySession: 'Standard: 0',
      shootMins: 10, shootWording: 'shoot for Signature and Prestige Session', edits: 2,
      setDesign: ['Prestige fur coat', 'Dark editorial lighting', 'High-fashion posing',
                  'Foil styling'] },
    { id: 'angelic', emoji: '🪽', name: 'Angelic Muse', sub: 'Ethereal / Feminine / Dreamy',
      price: 800, mins: 10, minsBySession: 'Standard: 0',
      shootMins: 10, shootWording: 'shoot for Signature and Prestige Session', edits: 2,
      setDesign: ['Angel wings', 'Celestial lighting', 'Cloud or Foil Styling'] }
  ],
  double: { id: 'double', emoji: '💫', name: 'Twofold', sub: 'Coat Code × Angelic Muse',
    price: 1800, mins: 30, shootMins: 10, shootWording: 'time', edits: 2,
    pmini: true, p8x24: true,
    prints: ['Mini Keepsake included', '8×24in printed portrait'],
    setDesign: ['Two completely different looks', 'Fur coat AND angel wings'] },
  keepsakes: [
    { id: 'digital', emoji: '💻', name: 'Digital', price: 0, notWith: 'Twofold',
      digital: true, digitalWording: 'All edited photos\nDigital copies' },
    { id: 'mini', emoji: '🖼️', name: 'Mini Keepsake', price: 100, notWith: 'Twofold',
      pmini: true, prints: ['4 pcs 2×3in prints', '2 pcs 3×4in prints'] },
    { id: 'wall', emoji: '🎥', name: 'Prestige Wall', price: 1000, prestigePrice: 0,
      freeWith: 'Twofold', onlyWith: 'Twofold', pmini: true, p8x24: true, edits: 2,
      prints: ['Mini Keepsake included', '8×24in printed portrait'] },
    { id: 'acrylic', emoji: '💎', name: 'Prestige Acrylic', price: 1500, prestigePrice: 1000,
      pmini: true, p8x24: true, edits: 3, frameWording: 'in Acrylic Frame with Gold Studs',
      prints: ['Mini Keepsake included', '8×24in portrait in Acrylic Frame with Gold Studs'] }
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
llRenderBullets(LL_BUILTIN);
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

// ── 👗 the Premium Dress ───────────────────────────────────────
// Each part says what it does about the gown, in its "Premium Dress" cell:
//   included — comes with this part, free
//   add-on   — offered, at the House of Roan rate
//   no       — don't offer a gown with this part at all
// A mood saying "no" wins, because a mood can be one a gown makes no sense
// with. Otherwise the session decides, and the default is to offer it.
function dressRule(sessionId, moodId) {
  var m = llMood(moodId), s = llFind(SESSIONS, sessionId);
  if (m && m.dress === 'no') return 'no';
  if (s && s.dress) return s.dress;
  if (m && m.dress) return m.dress;
  return 'add-on';
}
function gownIncluded(sessionId, moodId) { return dressRule(sessionId, moodId) === 'included'; }
function gownOffered(sessionId, moodId)  { return dressRule(sessionId, moodId) !== 'no'; }

// How many extra minutes does this mood add to THIS session?
//
// A look's "+10 mins" is time added to a guided shoot, and a fixed-length
// session like Standard doesn't get it. Rather than an on/off rule, the
// mood's "Minutes By Session" cell holds a number per session:
//
//     Standard: 0; Signature: 10; Prestige: 15
//     Standard, Signature: 0                    (one value, several sessions)
//
// Anything not named falls back to the mood's own Minutes. Returns null when
// this session isn't named at all, which leaves today's behaviour exactly as
// it was — the bullets decide, and nothing here interferes.
function moodMinutesOverride(sessionId, moodId) {
  var m = llMood(moodId);
  if (!m || !m.minsBySession) return null;
  var s = llFind(SESSIONS, sessionId);
  var names = [String(sessionId || '').toLowerCase()];
  if (s && s.name) names.push(String(s.name).toLowerCase());

  var parts = String(m.minsBySession).split(/[;\n]/);
  for (var i = 0; i < parts.length; i++) {
    var bit = parts[i].trim();
    if (!bit) continue;
    var at = bit.lastIndexOf(':');
    if (at === -1) continue;
    var who = bit.slice(0, at).split(',').map(function (x) { return x.trim().toLowerCase(); });
    var num = parseFloat(bit.slice(at + 1).replace(/[^0-9.\-]/g, ''));
    if (isNaN(num)) continue;
    for (var j = 0; j < who.length; j++) {
      if (who[j] && names.indexOf(who[j]) !== -1) return num;
    }
  }
  return null;
}

// The minutes actually in force, whichever way they were set.
function moodMinutes(sessionId, moodId) {
  var o = moodMinutesOverride(sessionId, moodId);
  if (o !== null) return o;
  var m = llMood(moodId);
  return (m && m.mins) || 0;
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
  if (m) mins += moodMinutes(sessionId, moodId);
  Object.keys(picked || {}).forEach(function (k) { if (picked[k]) mins += extraMins(k); });
  return mins;
}

// ══════════════════════════════════════════════════════════════
//  INCLUSIONS AS FIELDS, NOT PROSE
//  ------------------------------------------------------------
//  Every part used to carry its inclusions as a list of typed-out bullets,
//  and the client summary worked out the totals by reading them. That put a
//  trap in the sheet: "3 edited photos" counted, "3 edited pics" didn't, and
//  nothing on screen said which you had written.
//
//  Now each thing a client gets is its own field — shoot minutes, light
//  styles, outfit changes, edited photos, digital copies, the makeup look,
//  the set design. The card bullets are GENERATED from those fields, and the
//  summary adds up the fields directly. There is nothing left to phrase
//  correctly, and the card and the summary cannot disagree because neither
//  reads the other.
//
//  A part with no fields filled in still works exactly as before, by reading
//  its bullets — so a sheet that hasn't been migrated behaves as it always
//  did rather than emptying the page.
// ══════════════════════════════════════════════════════════════

function llNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}
function llYes(v) {
  var s = String(v == null ? '' : v).trim().toLowerCase();
  return v === true || s === 'yes' || s === 'true' || s === '✓' || s === 'y';
}
function llLines(v) {
  return String(v == null ? '' : v).split(/[;\n]/)
    .map(function (x) { return x.trim(); }).filter(Boolean);
}

// Does this part describe itself in fields, or only in bullets?
// Only the CLIENT-facing columns count. Edited Photos, Mini Keepsake Set and
// 8x24 Portrait are job columns that were on the tab long before any of this
// and are filled on nearly every row — treating them as "described in fields"
// would quietly discard the bullets of a part nobody had got to yet.
function llHasFields(p) {
  if (!p) return false;
  return !!(p.shootMins || p.lights || p.outfits || p.backgrounds ||
            p.unlimited || p.digital || p.makeup ||
            (p.setDesign && p.setDesign.length) || (p.prints && p.prints.length) ||
            (p.extraLines && p.extraLines.length) || (p.digitalWording && p.digitalWording.length));
}

function llPlural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

// ── the card bullets ──────────────────────────────────────────
// The order is fixed per kind, and it is the order the cards are already in,
// so switching a part over to fields does not reshuffle what a client reads.
function partBullets(p, kind) {
  if (!p) return [];
  if (!llHasFields(p)) return (p.bullets || []).slice();   // not migrated — as before

  var out = [];
  var shoot = p.shootMins ? (kind === 'session'
      ? p.shootMins + '-minute ' + (p.shootWording || 'photographer session')
      : '+' + p.shootMins + ' mins ' + (p.shootWording || 'shoot')) : '';
  var lights  = p.lights  ? llPlural(p.lights, 'light style', 'light styles') : '';
  var outfits = p.outfits ? (p.outfitUpTo ? 'up to ' : '') +
                            llPlural(p.outfits, 'outfit change', 'outfit change') : '';
  var edits   = p.edits ? (kind === 'session'
      ? llPlural(p.edits, 'edited photo*', 'edited photos*')
      : '+' + llPlural(p.edits, 'edited photo', 'edited photos')) : '';
  var digital = p.digital ? (llLines(p.digitalWording).length
      ? llLines(p.digitalWording) : ['Digital copies']) : [];
  var setD = p.setDesign || [], extra = p.extraLines || [], prints = p.prints || [];

  function push(x) { if (x) { if (x.join) x.forEach(function (y) { out.push(y); }); else out.push(x); } }

  if (kind === 'session') {
    push(shoot);
    if (p.backgrounds) push(llPlural(p.backgrounds, 'background', 'backgrounds'));
    if (p.unlimited) push('Unlimited shots');
    push(lights); push(outfits); push(setD); push(extra);
    push(edits); push(p.makeup); push(digital); push(prints);
  } else if (kind === 'keepsake') {
    push(extra); push(digital); push(prints); push(edits); push(setD);
  } else {                                    // mood
    push(setD); push(shoot);
    if (p.unlimited) push('Unlimited shots');
    push(lights); push(outfits); push(extra); push(prints);
    push(edits); push(p.makeup); push(digital);
  }
  return out;
}

// Fill in .bullets for every part, so the tiles render from one place and a
// part that has fields and a part that hasn't look identical to the pages.
function llRenderBullets(d) {
  (d.sessions  || []).forEach(function (p) { p.bullets = partBullets(p, 'session'); });
  (d.moods     || []).forEach(function (p) { p.bullets = partBullets(p, 'mood'); });
  if (d.double) d.double.bullets = partBullets(d.double, 'mood');
  (d.keepsakes || []).forEach(function (p) { p.bullets = partBullets(p, 'keepsake'); });
  return d;
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
      // A part must say SOMETHING about what the client gets — either the
      // fields, or the older bullets. Neither means a blank card, which is
      // worse than falling back to the built-in list.
      if (needBullets && !llHasFields(e) && (!e.bullets || !e.bullets.length)) return false;
    }
    return true;
  }
  if (!ok(d.sessions, true) || !ok(d.moods, true) || !ok(d.keepsakes, true)) return false;
  if (d.double && !ok([d.double], true)) return false;
  return true;
}

function applyLookLab(d) {
  llRenderBullets(d);
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
  // An explicit per-session figure for this mood's extra minutes, or null to
  // let its bullets speak for themselves as they always have. Worked out by
  // moodMinutesOverride() and passed in, so the summary and the calendar slot
  // are answering the same question — a client reading "20-minute" while the
  // diary blocks 10 is the failure this exists to prevent.
  var moodOver = (opts.moodMinutes === undefined || opts.moodMinutes === null)
                   ? null : Number(opts.moodMinutes);

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
  function count(b, isSession, skipMins) {
    var t = String(b || '');
    var m, got = false;

    m = t.match(/(\d+)\s*-?\s*(minute|mins?\b)(.*)$/i);
    if (m) {
      // skipMins swallows the bullet rather than passing it through: a
      // "+10 mins shoot" line shown to a client who is not getting ten extra
      // minutes is worse than no line at all.
      if (!skipMins) {
        n.mins += parseInt(m[1], 10);
        if (isSession) {
          var tail = String(m[3] || '').trim();
          if (tail) minsPhrase = 'minute ' + tail;
        }
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

  // Everything a part contributes that isn't its shoot time: the counted
  // numbers, the flags, and the prose lines, which go wherever the caller
  // says (a session's own notes, a mood's styling, a keepsake's take-home).
  function takeFields(p, prose) {
    n.edits   += p.edits   || 0;
    n.outfits += p.outfits || 0;
    if (p.outfitUpTo) upTo.outfits = true;
    if (p.lights) n.styles = Math.max(n.styles, p.lights);
    if (p.unlimited) has.unlimited = true;
    if (p.digital)   has.digital   = true;
    if (p.pmini)     has.mini      = true;
    if (p.p8x24)     has.p8x24     = true;
    if (p.frameWording && !frame8x24) frame8x24 = p.frameWording;
    (p.setDesign  || []).forEach(function (b) { once(prose, b); });
    (p.extraLines || []).forEach(function (b) { once(prose, b); });
  }

  // ── the session ──
  // A part that describes itself in fields is read from them. One that only
  // has bullets is parsed exactly as before, so a sheet part-way through
  // being filled in behaves, part by part, the way it always did.
  if (session && llHasFields(session)) {
    takeFields(session, sessionExtra);
    if (session.shootMins) {
      n.mins += session.shootMins;
      minsPhrase = 'minute ' + (session.shootWording || 'photographer session');
    }
    if (session.backgrounds) sessionExtra.unshift(llPlural(session.backgrounds, 'background', 'backgrounds'));
    if (session.makeup) hmu = session.makeup;
  } else if (session) {
    (session.bullets || []).forEach(function (b) {
      if (count(b, true)) return;
      if (/hair|makeup|make up|glam/i.test(b)) { hmu = b; return; }
      once(sessionExtra, b);
    });
  }

  // ── the mood ──
  if (mood && llHasFields(mood)) {
    takeFields(mood, look);
    // An explicit per-session figure replaces the mood's own, including when
    // it is zero — which is how "this look does not lengthen a Standard
    // shoot" ends up as a summary that simply doesn't mention extra time.
    var add = moodOver !== null ? moodOver : (mood.shootMins || 0);
    if (add > 0) n.mins += add;
    if (mood.makeup && !hmu) hmu = mood.makeup;
  } else if (mood) {
    (mood.bullets || []).forEach(function (b) {
      if (count(b, false, moodOver !== null)) return;
      once(look, b);
    });
    if (moodOver !== null && moodOver > 0) n.mins += moodOver;
  }

  // ── the keepsake ──
  if (keepsake && llHasFields(keepsake)) {
    takeFields(keepsake, takeHome);
  } else if (keepsake) {
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
  partBullets: partBullets, llRenderBullets: llRenderBullets, llHasFields: llHasFields,
  moodMinutes: moodMinutes, moodMinutesOverride: moodMinutesOverride,
  dressRule: dressRule, gownIncluded: gownIncluded, gownOffered: gownOffered,
  buildInclusions: buildInclusions, keepsakePrice: keepsakePrice,
  keepsakeOptions: keepsakeOptions, slotMinutes: slotMinutes,
  extraPrice: extraPrice, extraMins: extraMins, llValid: llValid,
  applyLookLab: applyLookLab, LL_BUILTIN: LL_BUILTIN, fmt: fmt, esc: esc
};
