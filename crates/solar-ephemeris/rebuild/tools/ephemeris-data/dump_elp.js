// Capture ELP-MPP02 coeffs from the ephem.js data file, run the one-time init
// (folding fundamental arguments into CMPB/FMPB/CPER/FPER), and dump them to JSON.
// init logic is a faithful copy of ephem.js's elpmpp.js elpmpp_init().
const fs = require("fs"), vm = require("vm");

// --- stubs so the data file loads; capture coeffs via STATE ---
global.GMJY = { ear: 1, moon: 1 };
let captured = null;
global.STATE = function (theoryFn, name, GM, coeffs) {
  if (name === "jpl") captured = { GM, coeffs };
  return null;
};
vm.runInThisContext(fs.readFileSync(process.argv[2] || "elpmpp02_normal.js", "utf8"));
if (!captured) throw new Error("did not capture ELP-MPP02 coeffs");
const coeffs = captured.coeffs;

// --- constants (from elpmpp.js) ---
const cpi = 3.141592653589793, rad = 648000 / cpi;
const am = 0.074801329, alpha = 0.002571881, dtasm = (2 * alpha) / (3 * am), xa = (2 * alpha) / 3;
const Dprec = -0.29965;
const bp = [
  [+0.311079095, -0.103837907], [-0.4482398e-2, +0.6682870e-3],
  [-0.110248500e-2, -0.129807200e-2], [+0.1056062e-2, -0.1780280e-3],
  [+0.50928e-4, -0.37342e-4],
];
function DMS(ideg, imin, sec) { return (ideg + imin / 60 + sec / 3600) * (cpi / 180); }

function elpmpp_init(coeffs, icor) {
  let k = icor; if (k != 1) k = 0;
  let Dw1_0, Dw2_0, Dw3_0, Deart_0, Dperi, Dw1_1, Dgam, De, Deart_1, Dep, Dw2_1, Dw3_1, Dw1_2;
  if (k == 0) {
    Dw1_0 = -0.10525; Dw2_0 = 0.16826; Dw3_0 = -0.10760; Deart_0 = -0.04012; Dperi = -0.04854;
    Dw1_1 = -0.32311; Dgam = 0.00069; De = 0.00005; Deart_1 = 0.01442; Dep = 0.00226;
    Dw2_1 = 0.08017; Dw3_1 = -0.04317; Dw1_2 = -0.03794;
  } else {
    Dw1_0 = -0.07008; Dw2_0 = 0.20794; Dw3_0 = -0.07215; Deart_0 = -0.00033; Dperi = -0.00749;
    Dw1_1 = -0.35106; Dgam = 0.00085; De = -0.00006; Deart_1 = 0.00732; Dep = 0.00224;
    Dw2_1 = 0.08017; Dw3_1 = -0.04317; Dw1_2 = -0.03743;
  }
  const w = [
    [DMS(218, 18, 59.95571 + Dw1_0), (1732559343.73604 + Dw1_1) / rad, (-6.8084 + Dw1_2) / rad, 0.66040e-2 / rad, -0.31690e-4 / rad],
    [DMS(83, 21, 11.67475 + Dw2_0), (14643420.3171 + Dw2_1) / rad, (-38.2631) / rad, -0.45047e-1 / rad, 0.21301e-3 / rad],
    [DMS(125, 2, 40.39816 + Dw3_0), (-6967919.5383 + Dw3_1) / rad, (6.3590) / rad, 0.76250e-2 / rad, -0.35860e-4 / rad],
  ];
  const eart = [DMS(100, 27, 59.13885 + Deart_0), (129597742.29300 + Deart_1) / rad, -0.020200 / rad, 0.90000e-5 / rad, 0.15000e-6 / rad];
  const peri = [DMS(102, 56, 14.45766 + Dperi), 1161.24342 / rad, 0.529265 / rad, -0.11814e-3 / rad, 0.11379e-4 / rad];
  if (icor == 1) {
    w[0][3] += -0.00018865 / rad; w[0][4] += -0.00001024 / rad;
    w[1][2] += +0.00470602 / rad; w[1][3] += -0.00025213 / rad;
    w[2][2] += -0.00261070 / rad; w[2][3] += -0.00010712 / rad;
  }
  const x2 = w[1][1] / w[0][1], x3 = w[2][1] / w[0][1];
  const y2 = am * bp[0][0] + xa * bp[4][0], y3 = am * bp[0][1] + xa * bp[4][1];
  const d21 = x2 - y2, d22 = w[0][1] * bp[1][0], d23 = w[0][1] * bp[2][0], d24 = w[0][1] * bp[3][0], d25 = y2 / am;
  const d31 = x3 - y3, d32 = w[0][1] * bp[1][1], d33 = w[0][1] * bp[2][1], d34 = w[0][1] * bp[3][1], d35 = y3 / am;
  const Cw2_1 = d21 * Dw1_1 + d25 * Deart_1 + d22 * Dgam + d23 * De + d24 * Dep;
  const Cw3_1 = d31 * Dw1_1 + d35 * Deart_1 + d32 * Dgam + d33 * De + d34 * Dep;
  w[1][1] += Cw2_1 / rad; w[2][1] += Cw3_1 / rad;

  const del = [[], [], [], []];
  for (let i = 0; i < 5; i++) {
    del[0][i] = w[0][i] - eart[i];
    del[1][i] = w[0][i] - w[2][i];
    del[2][i] = w[0][i] - w[1][i];
    del[3][i] = eart[i] - peri[i];
  }
  del[0][0] += cpi;

  const p = [[], [], [], [], [], [], [], []];
  p[0][0] = DMS(252, 15, 3.216919); p[1][0] = DMS(181, 58, 44.758419); p[2][0] = DMS(100, 27, 59.138850);
  p[3][0] = DMS(355, 26, 3.642778); p[4][0] = DMS(34, 21, 5.379392); p[5][0] = DMS(50, 4, 38.902495);
  p[6][0] = DMS(314, 3, 4.354234); p[7][0] = DMS(304, 20, 56.808371);
  p[0][1] = 538101628.66888 / rad; p[1][1] = 210664136.45777 / rad; p[2][1] = 129597742.29300 / rad;
  p[3][1] = 68905077.65936 / rad; p[4][1] = 10925660.57335 / rad; p[5][1] = 4399609.33632 / rad;
  p[6][1] = 1542482.57845 / rad; p[7][1] = 786547.89700 / rad;
  for (let i = 0; i < 8; i++) for (let j = 2; j < 5; j++) p[i][j] = 0;

  const zeta = [w[0][0], w[0][1] + (5029.0966 + Dprec) / rad, w[0][2], w[0][3], w[0][4]];
  const delnu = (+0.55604 + Dw1_1) / rad / w[0][1];
  const dele = (+0.01789 + De) / rad;
  const delg = (-0.08066 + Dgam) / rad;
  const delnp = (-0.06424 + Deart_1) / rad / w[0][1];
  const delep = (-0.12879 + Dep) / rad;

  const CMPB = [], FMPB = [];
  for (let iv = 0; iv < 3; iv++) {
    const cmpb = [], fmpb = [];
    for (let it = 0; it < coeffs[iv].length; it++) {
      for (let n = 0; n < coeffs[iv][it].length; n++) {
        const ilu = [coeffs[iv][it][n][0] || 0, coeffs[iv][it][n][1] || 0, coeffs[iv][it][n][2] || 0, coeffs[iv][it][n][3] || 0];
        let a = coeffs[iv][it][n][4] || 0;
        const b = [coeffs[iv][it][n][5] || 0, coeffs[iv][it][n][6] || 0, coeffs[iv][it][n][7] || 0, coeffs[iv][it][n][8] || 0, coeffs[iv][it][n][9] || 0];
        const tgv = b[0] + dtasm * b[4];
        if (iv == 2) a = a - 2 * a * delnu / 3;
        cmpb[n] = a + tgv * (delnp - am * delnu) + b[1] * delg + b[2] * dele + b[3] * delep;
        fmpb[n] = [iv == 2 ? cpi / 2 : 0, 0, 0, 0, 0];
        for (let kk = 0; kk < 5; kk++) for (let ii = 0; ii < 4; ii++) fmpb[n][kk] += ilu[ii] * del[ii][kk];
      }
    }
    CMPB.push(cmpb); FMPB.push(fmpb);
  }

  const CPER = [], FPER = [];
  for (let iv = 3; iv < 6; iv++) {
    const cpers = [], fpers = [];
    for (let it = 0; it < coeffs[iv].length; it++) {
      const cper = [], fper = [];
      for (let n = 0; n < coeffs[iv][it].length; n++) {
        const s = coeffs[iv][it][n][1] || 0, c = coeffs[iv][it][n][2] || 0;
        const ifi = [];
        for (let z = 0; z < 16; z++) ifi[z] = coeffs[iv][it][n][3 + z] || 0;
        cper[n] = Math.sqrt(c * c + s * s);
        let pha = Math.atan2(c, s); if (pha < 0) pha += cpi * 2;
        fper[n] = [];
        for (let kk = 0; kk < 5; kk++) {
          fper[n][kk] = kk == 0 ? pha : 0;
          for (let ii = 0; ii < 4; ii++) fper[n][kk] += ifi[ii] * del[ii][kk];
          for (let ii = 4; ii < 12; ii++) fper[n][kk] += ifi[ii] * p[ii - 4][kk];
          fper[n][kk] += ifi[12] * zeta[kk];
        }
      }
      cpers.push(cper); fpers.push(fper);
    }
    CPER.push(cpers); FPER.push(fpers);
  }
  return { CMPB, FMPB, CPER, FPER, w0: w[0] };
}

const corr = elpmpp_init(coeffs, 1);
fs.writeFileSync("elpmpp02_init.json", JSON.stringify(corr));
const counts = corr.CMPB.map((a) => a.length);
const pcounts = corr.CPER.map((g) => g.map((a) => a.length));
console.log("main-problem term counts (lon,lat,dist):", counts);
console.log("perturbation term counts:", JSON.stringify(pcounts));
console.log("wrote elpmpp02_init.json", (fs.statSync("elpmpp02_init.json").size / 1024).toFixed(0), "KB");
