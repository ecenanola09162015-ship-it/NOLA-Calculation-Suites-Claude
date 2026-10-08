/** Classical Kirchhoff plate Ritz analysis. Unit load, D=1, short span=1. */
type Polynomial = number[];
const add = (a: Polynomial, b: Polynomial, scale = 1) =>
  Array.from(
    { length: Math.max(a.length, b.length) },
    (_, i) => (a[i] ?? 0) + scale * (b[i] ?? 0),
  );
const multiply = (a: Polynomial, b: Polynomial) => {
  const c = Array(a.length + b.length - 1).fill(0);
  a.forEach((v, i) => b.forEach((w, j) => (c[i + j] += v * w)));
  return c;
};
const derivative = (p: Polynomial) => p.slice(1).map((v, i) => v * (i + 1));
const value = (p: Polynomial, t: number) =>
  p.reduceRight((a, v) => a * t + v, 0);
function bases(left: boolean, right: boolean, order: number) {
  let boundary = [0, 1];
  if (left) boundary = multiply(boundary, [0, 1]);
  boundary = multiply(boundary, [1, -1]);
  if (right) boundary = multiply(boundary, [1, -1]);
  const legendre: Polynomial[] = [[1], [-1, 2]];
  for (let n = 2; n < order; n++)
    legendre.push(
      add(
        multiply(legendre[n - 1], [-1, 2]).map((v) => (v * (2 * n - 1)) / n),
        legendre[n - 2],
        -(n - 1) / n,
      ),
    );
  return legendre.slice(0, order).map((p) => {
    const a = multiply(boundary, p);
    const b = derivative(a),
      c = derivative(b);
    return [a, b, c, derivative(c)];
  });
}
function quadrature(n = 18) {
  const points: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5)),
      dp = 0;
    for (let k = 0; k < 30; k++) {
      let p0 = 1,
        p1 = x;
      for (let j = 2; j <= n; j++) {
        const p = ((2 * j - 1) * x * p1 - (j - 1) * p0) / j;
        p0 = p1;
        p1 = p;
      }
      dp = (n * (x * p1 - p0)) / (x * x - 1);
      const next = x - p1 / dp;
      if (Math.abs(next - x) < 1e-14) {
        x = next;
        break;
      }
      x = next;
    }
    points.push([(x + 1) / 2, 1 / ((1 - x * x) * dp * dp)]);
  }
  return points;
}
function solve(matrix: number[][], rhs: number[]) {
  const n = rhs.length,
    scale = matrix.map((r, i) => Math.sqrt(r[i]));
  const a = matrix.map((r, i) => r.map((v, j) => v / scale[i] / scale[j]));
  const l = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = 0; j <= i; j++) {
      let v = a[i][j];
      for (let k = 0; k < j; k++) v -= l[i][k] * l[j][k];
      if (i === j) {
        if (v <= 1e-12)
          throw new Error(
            "Plate solver did not converge. Review geometry and supports.",
          );
        l[i][j] = Math.sqrt(v);
      } else l[i][j] = v / l[j][j];
    }
  const y = rhs.map((v, i) => v / scale[i]);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) y[i] -= l[i][j] * y[j];
    y[i] /= l[i][i];
  }
  const z = [...y];
  for (let i = n - 1; i >= 0; i--) {
    for (let j = i + 1; j < n; j++) z[i] -= l[j][i] * z[j];
    z[i] /= l[i][i];
  }
  return z.map((v, i) => v / scale[i]);
}
export interface PlateSolution {
  shortPositive: number;
  longPositive: number;
  westNegative: number;
  eastNegative: number;
  southNegative: number;
  northNegative: number;
  beta: number;
  at: (
    x: number,
    y: number,
  ) => { w: number; mx: number; my: number; qx: number; qy: number };
}
const cache = new Map<string, PlateSolution>();
export function solveSlabPlate(
  ratio: number,
  supports: { west: boolean; east: boolean; south: boolean; north: boolean },
  nu: number,
  order = 8,
): PlateSolution {
  const key = JSON.stringify([ratio, supports, nu, order]);
  const previous = cache.get(key);
  if (previous) return previous;
  const xb = bases(supports.west, supports.east, order),
    yb = bases(supports.south, supports.north, order),
    q = quadrature();
  function integrals(b: Polynomial[][], length: number) {
    return Array.from({ length: 3 }, (_, u) =>
      Array.from({ length: 3 }, (_, v) =>
        b.map((a) =>
          b.map((c) =>
            q.reduce(
              (sum, [t, w]) =>
                sum +
                w * value(a[u], t) * value(c[v], t) * length ** (1 - u - v),
              0,
            ),
          ),
        ),
      ),
    );
  }
  const x = integrals(xb, 1),
    y = integrals(yb, ratio),
    n = order * order;
  const loadX = xb.map((b) =>
    q.reduce((s, [t, w]) => s + w * value(b[0], t), 0),
  );
  const loadY = yb.map((b) =>
    q.reduce((s, [t, w]) => s + w * value(b[0], t) * ratio, 0),
  );
  const matrix = Array.from({ length: n }, (_, a) =>
    Array.from({ length: n }, (_, b) => {
      const i = Math.floor(a / order),
        j = a % order,
        k = Math.floor(b / order),
        l = b % order;
      return (
        x[2][2][i][k] * y[0][0][j][l] +
        x[0][0][i][k] * y[2][2][j][l] +
        nu * (x[2][0][i][k] * y[0][2][j][l] + x[0][2][i][k] * y[2][0][j][l]) +
        2 * (1 - nu) * x[1][1][i][k] * y[1][1][j][l]
      );
    }),
  );
  const coefficients = solve(
    matrix,
    Array.from(
      { length: n },
      (_, a) => loadX[Math.floor(a / order)] * loadY[a % order],
    ),
  );
  const at = (xx: number, yy: number) => {
    const xvalues = xb.map((b) => b.map((p) => value(p, xx))),
      yvalues = yb.map((b) =>
        b.map((p, d) => value(p, yy / ratio) / ratio ** d),
      );
    let w = 0,
      dxx = 0,
      dyy = 0,
      dxxx = 0,
      dxyy = 0,
      dxxy = 0,
      dyyy = 0;
    for (let i = 0; i < order; i++)
      for (let j = 0; j < order; j++) {
        const c = coefficients[i * order + j],
          a = xvalues[i],
          b = yvalues[j];
        w += c * a[0] * b[0];
        dxx += c * a[2] * b[0];
        dyy += c * a[0] * b[2];
        dxxx += c * a[3] * b[0];
        dxyy += c * a[1] * b[2];
        dxxy += c * a[2] * b[1];
        dyyy += c * a[0] * b[3];
      }
    return {
      w,
      mx: -(dxx + nu * dyy),
      my: -(dyy + nu * dxx),
      qx: -(dxxx + dxyy),
      qy: -(dxxy + dyyy),
    };
  };
  let shortPositive = 0,
    longPositive = 0,
    westNegative = 0,
    eastNegative = 0,
    southNegative = 0,
    northNegative = 0,
    beta = 0;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const p = at(i / 40, (ratio * j) / 40);
      shortPositive = Math.max(shortPositive, p.mx);
      longPositive = Math.max(longPositive, p.my);
      beta = Math.max(beta, p.w);
      if (i === 0 && supports.west)
        westNegative = Math.max(westNegative, -p.mx);
      if (i === 40 && supports.east)
        eastNegative = Math.max(eastNegative, -p.mx);
      if (j === 0 && supports.south)
        southNegative = Math.max(southNegative, -p.my);
      if (j === 40 && supports.north)
        northNegative = Math.max(northNegative, -p.my);
    }
  const result = {
    shortPositive,
    longPositive,
    westNegative,
    eastNegative,
    southNegative,
    northNegative,
    beta,
    at,
  };
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
