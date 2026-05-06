// Modelos de Machine Learning implementados en JavaScript puro
// 1) Regresión Lineal Multivariable (supervisado)  → predecir frecuencia, ventas
// 2) Regresión Logística (supervisado)             → predecir re-suscripción
// 3) K-means Clustering (no supervisado)           → segmentación de clientes

// ---------- Helpers de matrices/estadística ----------
const mean = arr => arr.reduce((s, v) => s + v, 0) / arr.length;
const std  = arr => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length) || 1;
};

function standardize(X) {
  const cols = X[0].length;
  const mu = [], sigma = [];
  for (let j = 0; j < cols; j++) {
    const col = X.map(row => row[j]);
    mu.push(mean(col));
    sigma.push(std(col));
  }
  const Xn = X.map(row => row.map((v, j) => (v - mu[j]) / sigma[j]));
  return { Xn, mu, sigma };
}

function applyStandardize(x, mu, sigma) {
  return x.map((v, j) => (v - mu[j]) / sigma[j]);
}

const sigmoid = z => 1 / (1 + Math.exp(-Math.max(-50, Math.min(50, z))));

function predictLinear(theta, x) {
  let z = theta[0];
  for (let i = 0; i < x.length; i++) z += theta[i + 1] * x[i];
  return z;
}

// ---------- Regresión Lineal por Gradiente Descendente ----------
function trainLinearRegression(X, y, opts = {}) {
  const { Xn, mu, sigma } = standardize(X);
  const m = Xn.length, n = Xn[0].length;
  let theta = new Array(n + 1).fill(0);
  const alpha = opts.alpha || 0.05;
  const iters = opts.iters || 2000;
  const history = [];

  for (let it = 0; it < iters; it++) {
    const grad = new Array(n + 1).fill(0);
    let cost = 0;
    for (let i = 0; i < m; i++) {
      const h = predictLinear(theta, Xn[i]);
      const err = h - y[i];
      cost += err * err;
      grad[0] += err;
      for (let j = 0; j < n; j++) grad[j + 1] += err * Xn[i][j];
    }
    cost /= (2 * m);
    if (it % 200 === 0) history.push({ it, cost: +cost.toFixed(4) });
    for (let k = 0; k < grad.length; k++) theta[k] -= alpha * (grad[k] / m);
  }

  // Métricas
  const yPred = Xn.map(x => predictLinear(theta, x));
  const yMean = mean(y);
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < m; i++) { ssRes += (y[i] - yPred[i]) ** 2; ssTot += (y[i] - yMean) ** 2; }
  const r2 = 1 - ssRes / ssTot;
  const rmse = Math.sqrt(ssRes / m);

  return {
    theta, mu, sigma, r2: +r2.toFixed(4), rmse: +rmse.toFixed(3),
    history,
    predict: (x) => predictLinear(theta, applyStandardize(x, mu, sigma))
  };
}

// ---------- Regresión Logística por Gradiente Descendente ----------
function trainLogisticRegression(X, y, opts = {}) {
  const { Xn, mu, sigma } = standardize(X);
  const m = Xn.length, n = Xn[0].length;
  let theta = new Array(n + 1).fill(0);
  const alpha = opts.alpha || 0.1;
  const iters = opts.iters || 3000;
  const history = [];

  for (let it = 0; it < iters; it++) {
    const grad = new Array(n + 1).fill(0);
    let cost = 0;
    for (let i = 0; i < m; i++) {
      const h = sigmoid(predictLinear(theta, Xn[i]));
      const err = h - y[i];
      cost += -(y[i] * Math.log(h + 1e-9) + (1 - y[i]) * Math.log(1 - h + 1e-9));
      grad[0] += err;
      for (let j = 0; j < n; j++) grad[j + 1] += err * Xn[i][j];
    }
    cost /= m;
    if (it % 300 === 0) history.push({ it, cost: +cost.toFixed(4) });
    for (let k = 0; k < grad.length; k++) theta[k] -= alpha * (grad[k] / m);
  }

  // Métricas en train (matriz de confusión + accuracy)
  let tp = 0, tn = 0, fp = 0, fn = 0;
  for (let i = 0; i < m; i++) {
    const p = sigmoid(predictLinear(theta, Xn[i])) >= 0.5 ? 1 : 0;
    if (p === 1 && y[i] === 1) tp++;
    else if (p === 0 && y[i] === 0) tn++;
    else if (p === 1 && y[i] === 0) fp++;
    else fn++;
  }
  const accuracy = +((tp + tn) / m).toFixed(4);
  const precision = +(tp / (tp + fp || 1)).toFixed(4);
  const recall = +(tp / (tp + fn || 1)).toFixed(4);
  const f1 = +((2 * precision * recall) / (precision + recall || 1)).toFixed(4);

  return {
    theta, mu, sigma,
    accuracy, precision, recall, f1,
    confusion: { tp, tn, fp, fn },
    history,
    predictProb: (x) => sigmoid(predictLinear(theta, applyStandardize(x, mu, sigma))),
    predict: (x) => sigmoid(predictLinear(theta, applyStandardize(x, mu, sigma))) >= 0.5 ? 1 : 0
  };
}

// ---------- K-means ----------
function kmeans(X, k, opts = {}) {
  const { Xn, mu, sigma } = standardize(X);
  const m = Xn.length, n = Xn[0].length;
  const maxIter = opts.maxIter || 100;
  // Inicialización: K-means++ simplificado
  const centroides = [Xn[Math.floor(Math.random() * m)].slice()];
  while (centroides.length < k) {
    const distancias = Xn.map(p => Math.min(...centroides.map(c => dist2(p, c))));
    const total = distancias.reduce((s, d) => s + d, 0);
    let r = Math.random() * total, idx = 0;
    while (r > 0 && idx < m - 1) { r -= distancias[idx]; idx++; }
    centroides.push(Xn[idx].slice());
  }

  let asignaciones = new Array(m).fill(0);
  for (let it = 0; it < maxIter; it++) {
    let cambios = 0;
    for (let i = 0; i < m; i++) {
      let bestJ = 0, bestD = Infinity;
      for (let j = 0; j < k; j++) {
        const d = dist2(Xn[i], centroides[j]);
        if (d < bestD) { bestD = d; bestJ = j; }
      }
      if (asignaciones[i] !== bestJ) cambios++;
      asignaciones[i] = bestJ;
    }
    // Recomputar centroides
    const nuevos = Array.from({ length: k }, () => new Array(n).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < m; i++) {
      counts[asignaciones[i]]++;
      for (let j = 0; j < n; j++) nuevos[asignaciones[i]][j] += Xn[i][j];
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] === 0) continue;
      for (let d = 0; d < n; d++) nuevos[j][d] /= counts[j];
    }
    for (let j = 0; j < k; j++) centroides[j] = nuevos[j];
    if (cambios === 0) break;
  }

  // Inertia (suma de distancias al centroide)
  let inertia = 0;
  for (let i = 0; i < m; i++) inertia += Math.sqrt(dist2(Xn[i], centroides[asignaciones[i]]));

  // Centroides desnormalizados
  const centroidesReal = centroides.map(c => c.map((v, j) => v * sigma[j] + mu[j]));

  return {
    asignaciones, centroides, centroidesReal, inertia: +inertia.toFixed(2),
    k, mu, sigma
  };
}

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return s;
}

module.exports = { trainLinearRegression, trainLogisticRegression, kmeans };
