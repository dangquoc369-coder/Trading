/**
 * indicator.js
 * Chỉ chứa các hàm TÍNH TOÁN thuần (không đụng vào chart/DOM).
 */

const IndicatorModule = (function () {
  function calcEMA(values, period) {
    const k = 2 / (period + 1);
    const result = new Array(values.length).fill(null);
    let emaPrev;

    for (let i = 0; i < values.length; i++) {
      const value = values[i];
      if (value === null || value === undefined) continue;

      if (emaPrev === undefined) {
        if (i + 1 < period) continue;
        const seed = values.slice(i + 1 - period, i + 1);
        if (seed.some((v) => v === null || v === undefined)) continue;
        emaPrev = seed.reduce((a, b) => a + b, 0) / period;
        result[i] = emaPrev;
        continue;
      }

      emaPrev = value * k + emaPrev * (1 - k);
      result[i] = emaPrev;
    }
    return result;
  }

  function calcWMA(values, period) {
    const result = new Array(values.length).fill(null);
    const denom = (period * (period + 1)) / 2;

    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      let weight = 1;
      let ok = true;
      for (let j = i - period + 1; j <= i; j++) {
        if (values[j] === null || values[j] === undefined) {
          ok = false;
          break;
        }
        sum += values[j] * weight;
        weight++;
      }
      result[i] = ok ? sum / denom : null;
    }
    return result;
  }

  function calcRSI(candles, period = 14) {
    const closes = candles.map((c) => c.close);
    const rsi = new Array(closes.length).fill(null);
    if (closes.length <= period) return rsi;

    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gainSum += diff;
      else lossSum -= diff;
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    }
    return rsi;
  }

  function calcATR(candles, period = 14) {
    const n = candles.length;
    const atr = new Array(n).fill(null);
    if (n <= period) return atr;

    const tr = new Array(n).fill(null);
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        tr[i] = candles[i].high - candles[i].low;
        continue;
      }
      const highLow = candles[i].high - candles[i].low;
      const highClosePrev = Math.abs(candles[i].high - candles[i - 1].close);
      const lowClosePrev = Math.abs(candles[i].low - candles[i - 1].close);
      tr[i] = Math.max(highLow, highClosePrev, lowClosePrev);
    }

    let sum = 0;
    for (let i = 1; i <= period; i++) sum += tr[i];
    let atrPrev = sum / period;
    atr[period] = atrPrev;

    for (let i = period + 1; i < n; i++) {
      atrPrev = (atrPrev * (period - 1) + tr[i]) / period;
      atr[i] = atrPrev;
    }
    return atr;
  }

  function toSeriesData(candles, values) {
    return candles
      .map((c, i) => ({ time: c.time, value: values[i] }))
      .filter((d) => d.value !== null && d.value !== undefined);
  }

  return { calcEMA, calcWMA, calcRSI, calcATR, toSeriesData };
})();
