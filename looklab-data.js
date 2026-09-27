// ══════════════════════════════════════════════════════════════
//  THE LOOK LAB — the package itself
//  ------------------------------------------------------------
//  Sessions, moods, keepsakes, add-ons, their prices, and the logic that
//  turns a build into a list of what the client gets.
//
//  This is shared by BOTH pages — the builder (index.html) and the summary
//  a client is sent (look.html). Deliberately one file: a second copy of a
//  price is a price that will eventually disagree with itself, and a client
//  reading one number while the studio quotes another is the worst version
//  of that. Edit a price here and both pages change together.
// ══════════════════════════════════════════════════════════════
var SESSIONS = [
  { id: 'Standard', emoji: '📸', name: 'Standard', price: 1200, dur: 30, sub: 'A quick portrait session', bullets: ['10-minute photographer session', '1 background', 'Digital copies', 'Bring your own outfit or rent Premium Dress'] },
  { id: 'Signature', emoji: '✨', name: 'Signature', price: 3000, dur: 60, sub: 'For clients who want photographer guidance', bullets: ['20-minute photographer session', '2 light styles', '1 outfit change', 'Optional: Use of available outfits', '3 edited photos*', 'Basic hair & makeup'] },
  { id: 'Prestige', emoji: '👑', name: 'Prestige', price: 5000, dur: 90, sub: 'The full portrait experience', bullets: ['45-minute guided shoot', 'Unlimited shots', '2 light styles', 'up to 2 outfit change', 'FREE use of 1 Premium Dress', 'Optional: Use of available outfits', '5 edited photos*', 'Glam Make up look', '8×24 portrait included'] }
];

var MOODS = [
  { id: 'styleshots', emoji: '✨', name: 'Styleshots', sub: 'Modern / Clean / Confident', price: 0, bullets: ['Photographer-guided posing', 'Contemporary lighting', 'Personalized portrait direction', 'Standard lighting'] },
  { id: 'coatcode', emoji: '🖤', name: 'The Coat Code', sub: 'Luxury / Bold / Fashion', price: 800, bullets: ['Prestige fur coat', 'Dark editorial lighting', 'High-fashion posing', 'Foil styling', '+10 mins shoot', '+2 edited photo'] },
  { id: 'angelic', emoji: '🪽', name: 'Angelic Muse', sub: 'Ethereal / Feminine / Dreamy', price: 800, bullets: ['Angel wings', 'Celestial lighting', 'Cloud or Foil Styling', '+10 mins shoot', '+2 edited photo'] }
];

var DOUBLE = { id: 'double', name: 'Twofold', sub: 'Coat Code × Angelic Muse', price: 1800, bullets: ['Two completely different looks', 'Fur coat AND angel wings', '+10 mins time', 'Mini Keepsake included', '8×24in printed portrait', '+2 edited photos'] };

var KEEPSAKES = [
  { id: 'digital', emoji: '💻', name: 'Digital', bullets: ['All edited photos', 'Digital copies'] },
  { id: 'mini', emoji: '🖼️', name: 'Mini Keepsake', bullets: ['4 pcs 2×3in prints', '2 pcs 3×4in prints'] },
  { id: 'wall', emoji: '🎥', name: 'Prestige Wall', bullets: ['Mini Keepsake included', '8×24in printed portrait', '+2 edited photos'] },
  { id: 'acrylic', emoji: '💎', name: 'Prestige Acrylic', bullets: ['Mini Keepsake included', '8×24in portrait in Acrylic Frame with Gold Studs', '+3 edited photos'] }
];

var EXTRAS = [
  { key: 'outfit', name: 'Additional Outfit Change', price: 300 },
  { key: 'photos', name: '+3 Edited Photos', price: 500 },
  { key: 'rush', name: 'Rush 24-Hour Delivery', price: 500 },
  { key: 'time', name: '+15 Mins Time', price: 700 },
  { key: 'framed5r', name: '5R Framed Photo', price: 800 },
  { key: 'framed8r', name: '8R Framed Photo', price: 1000 }
];

function fmt(n) {
  var sign = n < 0 ? '-' : '';
  return sign + '₱' + Math.abs(n).toLocaleString('en-PH');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function keepsakePrice(session, keepsake, mood) {
  if (keepsake === 'digital') return 0;
  if (keepsake === 'mini') return 100;
  if (keepsake === 'wall') return mood === 'double' || session === 'Prestige' ? 0 : 1000;
  if (keepsake === 'acrylic') return session === 'Prestige' ? 1000 : 1500;
  return 0;
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
//  means the card and the summary can never disagree.
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

