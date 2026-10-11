// Disegno della mascotte: unica fonte per pagina, loader e icone.
// Dopo ogni modifica: `node tools/build-icons.mjs` rigenera tutto.
export const INK = "#3b2a4a";

const eye = (cx) =>
  `<ellipse cx="${cx}" cy="222" rx="30" ry="36" fill="${INK}"/>` +
  `<ellipse cx="${cx}" cy="240" rx="20" ry="14" fill="#8f6bd9" opacity=".75"/>` +
  `<ellipse cx="${cx - 9}" cy="207" rx="12" ry="14" fill="#fff"/>` +
  `<circle cx="${cx + 11}" cy="236" r="5.5" fill="#fff"/>`;

export const face = () =>
  `<ellipse cx="196" cy="146" rx="46" ry="15" fill="#fff" opacity=".55" transform="rotate(-18 196 146)"/>` +
  eye(198) + eye(314) +
  `<ellipse cx="156" cy="266" rx="19" ry="10" fill="#ff7fa3" opacity=".8"/>` +
  `<ellipse cx="356" cy="266" rx="19" ry="10" fill="#ff7fa3" opacity=".8"/>` +
  `<path d="M240 258q8 11 16 0q8 11 16 0" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`;

// icon: base più stretta e niente scintilla, per stare nel ritaglio tondo di Android.
// hand: manina che si allunga verso l'archivio (solo nel loader).
export function mascot({ icon = false, hand = false } = {}) {
  const [bx, bw] = icon ? [116, 280] : [84, 344];
  const spark = icon ? "" :
    `<path class="p-spark" d="M424 84l7 17l17 7l-17 7l-7 17l-7 -17l-17 -7l17 -7z" fill="#fff6a8" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  const paw = hand ? `<circle class="p-hand" cx="112" cy="250" r="24" fill="#ffb3c7" stroke="${INK}" stroke-width="10"/>` : "";
  return `<g stroke="${INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">` +
    `<rect x="100" y="150" width="36" height="250" rx="18" fill="#cdb8ff"/><rect x="376" y="150" width="36" height="250" rx="18" fill="#cdb8ff"/>` +
    `<g class="p-sheets"><rect x="176" y="330" width="160" height="70" rx="12" fill="#fff"/><path d="M198 353h116M198 375h116" fill="none" stroke="#f0b6c8" stroke-width="7"/></g>` +
    `<rect x="${bx}" y="392" width="${bw}" height="50" rx="25" fill="#a48cf0"/></g>` +
    `<g class="p-head"><rect x="128" y="112" width="256" height="206" rx="88" fill="#ffb3c7" stroke="${INK}" stroke-width="10"/>${face()}</g>${paw}${spark}`;
}

export const pageSvg = () =>
  `<svg viewBox="70 62 400 390" xmlns="http://www.w3.org/2000/svg">${mascot()}</svg>`;

// Scena del loader: la mascotte prende i fogli da uno schedario.
export function loaderSvg() {
  const sheet = (cls) =>
    `<g class="fly ${cls}"><rect x="86" y="74" width="46" height="58" rx="6" fill="#fff" stroke="${INK}" stroke-width="5"/><path d="M96 92h26M96 106h26M96 120h16" stroke="#f0b6c8" stroke-width="4" stroke-linecap="round"/></g>`;
  const drawer = (y) =>
    `<rect x="42" y="${y}" width="136" height="52" rx="8" fill="#e3d6ff"/><rect x="92" y="${y + 18}" width="36" height="14" rx="7" fill="#fff"/>`;
  return `<svg viewBox="0 0 520 300" xmlns="http://www.w3.org/2000/svg">` +
    `<g stroke="${INK}" stroke-width="6" stroke-linejoin="round">` +
    `<rect x="30" y="96" width="160" height="184" rx="14" fill="#cdb8ff"/>${drawer(156)}${drawer(216)}` +
    `<g class="drawer"><path d="M48 70h124l10 22H38z" fill="#fff"/><path d="M60 70v-8h34v8M104 70v-12h34v12" fill="#fff6a8"/>` +
    `<rect x="26" y="92" width="168" height="54" rx="10" fill="#e3d6ff"/><rect x="92" y="112" width="36" height="14" rx="7" fill="#fff"/></g></g>` +
    `<g transform="translate(250 50) scale(.52)">${mascot({ hand: true })}</g>` +
    sheet("f1") + sheet("f2") + sheet("f3") + `</svg>`;
}

export const iconSvg = (scale, rounded = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rounded ? 104 : 0}" fill="#ffd23f"/>` +
  `<g transform="translate(256 256) scale(${scale}) translate(-256 -277)">${mascot({ icon: true })}</g></svg>`;
