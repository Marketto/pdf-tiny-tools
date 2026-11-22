// Prove della logica pura (R-APP-22), senza browser: node --test tests/
// I moduli dell'app sono script classici per il browser: qui si eseguono in un contesto finto con il minimo indispensabile.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
function carica(...files) {
  const w = { location: { href: "https://example.org/pdf-tiny-tools/", search: "" }, navigator: {}, addEventListener() {}, APP: { t: (k) => k, nf: String } };
  w.window = w; w.self = w;
  const ctx = vm.createContext(w);
  for (const f of ["config.js", ...files]) vm.runInContext(readFileSync(root + f, "utf8"), ctx, { filename: f });
  return w;
}
// gli oggetti nati nel contesto finto hanno prototipi diversi: si confrontano come JSON
const json = (x) => JSON.parse(JSON.stringify(x));
const vicino = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

const { Scansione: SC } = carica("scansione.js");
const { Compila: CP } = carica("compila.js");
const { Modifica: MD } = carica("modifica.js");

test("Scansione: l'omografia porta i quattro angoli dove deve", () => {
  const dst = [[10, 20], [410, 5], [430, 600], [0, 580]], src = [[0, 0], [400, 0], [400, 600], [0, 600]];
  const H = SC.homography(dst, src);
  dst.forEach((p, i) => { const q = SC.applyH(H, p[0], p[1]); vicino(q[0], src[i][0], 1e-6); vicino(q[1], src[i][1], 1e-6); });
});

test("Scansione: area, ordine e punto dentro un quadrilatero", () => {
  const Q = [[0, 0], [100, 0], [100, 50], [0, 50]];
  assert.equal(SC.quadArea(Q), 5000);
  const ord = json(SC.quadOrder([[100, 50], [0, 0], [0, 50], [100, 0]]));
  assert.deepEqual(ord[0], [0, 0], "si parte dall'angolo in alto a sinistra");
  assert.equal(SC.quadArea(ord), 5000);
  assert.ok(SC.inQuad(Q, [50, 25]));
  assert.ok(!SC.inQuad(Q, [150, 25]));
});

test("Scansione: retta tra punti con uno fuori posto e incrocio di due rette", () => {
  const P = []; for (let x = 0; x <= 100; x += 10) P.push([x, 2 * x + 1]);
  P.push([50, 115]); // punto fuori dalla retta: va scartato
  const l = SC.lineFit(P);
  assert.equal(l.n, 11);
  vicino(l.dy / l.dx, 2, 1e-6);
  const v = { x: 30, y: 0, dx: 0, dy: 1 }, c = SC.lineCross(l, v);
  vicino(c[0], 30, 1e-6); vicino(c[1], 61, 1e-6);
  assert.equal(SC.lineCross(l, { x: 0, y: 5, dx: l.dx, dy: l.dy }), null, "rette parallele: nessun incrocio");
});

test("Compila: una riga orizzontale scura diventa una riga da compilare", () => {
  const W = 400, H = 120, g = new Uint8Array(W * H).fill(255);
  for (let y = 60; y < 62; y++) for (let x = 40; x < 360; x++) g[y * W + x] = 20;
  const mm = 200 / 25.4, bw = CP._binarize(g, W, H);
  const m = CP._findMarks(bw, W, H, mm);
  assert.equal(m.segs.length, 1);
  vicino(m.segs[0].y, 60.5, 1.5);
  assert.ok(m.segs[0].x0 <= 42 && m.segs[0].x1 >= 357);
});

test("Compila: un foglio bianco non ha segni", () => {
  const W = 200, H = 200, g = new Uint8Array(W * H).fill(250);
  const m = CP._findMarks(CP._binarize(g, W, H), W, H, 200 / 25.4);
  assert.equal(m.segs.length + m.boxes.length + m.combs.length, 0);
});

test("Modifica: il contenuto di una pagina si divide in operatori con i loro argomenti", () => {
  const ops = json(MD._tokenize("BT /F1 12 Tf 72 700 Td (Ciao \\(mondo\\)) Tj [(A) -120 (B)] TJ ET"));
  assert.deepEqual(ops.map((o) => o.op), ["BT", "Tf", "Td", "Tj", "TJ", "ET"]);
  assert.deepEqual(ops[1].args.map((a) => a.raw), ["/F1", "12"]);
  assert.equal(ops[2].args[1].v, 700);
});

test("Modifica: immagine incorporata (BI … ID … EI) saltata per intero, anche se rovinata", () => {
  const ops = json(MD._tokenize("q BI /W 2 /H 1 /BPC 8 /CS /G ID ÿ\u0000 EI Q"));
  assert.deepEqual(ops.map((o) => o.op), ["q", "BI", "Q"]);
  // senza ID (flusso troncato) la lettura deve finire, non girare all'infinito
  const rotto = json(MD._tokenize("q BI /W 2 /H 1 EI q"));
  assert.ok(rotto.length <= 3 && rotto[1].op === "BI");
});
