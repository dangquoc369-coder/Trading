/**
 * dq-tracker-push / src/index.js
 *
 * Backend MIỄN PHÍ (Cloudflare Workers + KV) để bắn thông báo cảnh báo giá
 * NGAY CẢ KHI app/trình duyệt trên máy bạn đã tắt hẳn - vì phần "kiểm tra
 * giá + quyết định báo hay không" giờ chạy trên server (Cron Trigger), không
 * còn phụ thuộc vào việc tab có đang mở hay không như AlertsModule cũ.
 *
 * 3 endpoint HTTP:
 *   GET  /api/vapid-public-key  -> trả VAPID public key cho client dùng khi
 *                                  subscribe PushManager.
 *   POST /api/subscribe         -> lưu Push Subscription của 1 thiết bị.
 *   POST /api/alerts            -> đồng bộ toàn bộ danh sách cảnh báo giá
 *                                  hiện tại của 1 thiết bị (ghi đè).
 *
 * 1 cron handler (scheduled), cấu hình chạy MỖI PHÚT trong wrangler.toml:
 *   - Gom toàn bộ symbol đang cần theo dõi từ MỌI thiết bị (loại trùng).
 *   - Gọi 1 lần API Bybit để lấy giá hiện tại của TOÀN BỘ symbol spot, rồi
 *     lọc ra những symbol đang cần (Bybit v5 không hỗ trợ lọc nhiều symbol
 *     trong 1 request nên lấy hết 1 lần là cách tiết kiệm subrequest nhất).
 *     Lưu ý: đổi từ Binance sang Bybit vì Cloudflare Workers chạy trên IP
 *     bị Binance chặn theo vùng (lỗi 451 "restricted location") - Bybit
 *     không chặn và dùng chung định dạng ký hiệu (vd: BTCUSDT) nên không
 *     cần đổi gì ở phía client/app.
 *   - Với mỗi cảnh báo CHƯA triggered: so "phía" hiện tại (trên/dưới mức
 *     cảnh báo) với "phía" đã lưu lần trước - đổi phía = vừa "vượt qua" mức
 *     cảnh báo -> gửi Web Push + đánh dấu triggered (giống hệt logic
 *     checkPrice() trong alerts.js gốc, chỉ khác là chạy trên server).
 *   - Lần đầu tiên thấy 1 cảnh báo (chưa có "side" lưu trước đó) chỉ ghi
 *     nhận baseline, KHÔNG báo ngay - tránh báo nhầm ngay khi vừa tạo cảnh
 *     báo lúc giá đã ở phía đó từ trước.
 *
 * LƯU Ý VỀ GIỚI HẠN FREE TIER CỦA WORKERS KV:
 *   - Free tier: ~100.000 lượt đọc/ngày, ~1.000 lượt ghi/ngày.
 *   - Thiết kế ở đây CHỈ ĐỌC mỗi lần cron chạy (1440 lần/ngày nếu mỗi phút),
 *     và CHỈ GHI khi có thay đổi thật (alert vừa được tạo lần đầu hoặc vừa
 *     triggered) - không ghi mỗi tick - nên gần như không thể chạm giới hạn
 *     ghi ở quy mô dùng cá nhân.
 */

import { buildPushPayload } from '@block65/webcrypto-web-push';

const ALERTS_KEY = 'alerts_v1'; // { [deviceId]: [{id, symbol, price, side, triggered}] }
const SUBS_KEY = 'subs_v1'; // { [deviceId]: PushSubscriptionJSON }

function withCors(resp) {
  resp.headers.set('Access-Control-Allow-Origin', '*');
  resp.headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return resp;
}

async function readJSON(kv, key, fallback) {
  const raw = await kv.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

async function writeJSON(kv, key, value) {
  await kv.put(key, JSON.stringify(value));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === '/api/vapid-public-key' && request.method === 'GET') {
      return withCors(Response.json({ publicKey: env.VAPID_PUBLIC_KEY }));
    }

    if (url.pathname === '/api/subscribe' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return withCors(new Response('JSON không hợp lệ', { status: 400 }));
      }
      const { deviceId, subscription } = body || {};
      if (!deviceId || !subscription || !subscription.endpoint) {
        return withCors(new Response('Thiếu deviceId hoặc subscription', { status: 400 }));
      }

      const subs = await readJSON(env.TRACKER_KV, SUBS_KEY, {});
      subs[deviceId] = subscription;
      await writeJSON(env.TRACKER_KV, SUBS_KEY, subs);
      return withCors(Response.json({ ok: true }));
    }

    if (url.pathname === '/api/alerts' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (err) {
        return withCors(new Response('JSON không hợp lệ', { status: 400 }));
      }
      const { deviceId, alerts } = body || {};
      if (!deviceId || !Array.isArray(alerts)) {
        return withCors(new Response('Payload không hợp lệ', { status: 400 }));
      }

      const allAlerts = await readJSON(env.TRACKER_KV, ALERTS_KEY, {});
      const existing = allAlerts[deviceId] || [];

      // Giữ lại 'side'/'triggered' đã tính của các cảnh báo còn tồn tại (so
      // theo id) - chỉ alert THỰC SỰ MỚI mới có side=null (chưa có baseline).
      const merged = alerts
        .filter((a) => a && a.id && a.symbol && typeof a.price === 'number')
        .map((a) => {
          const prev = existing.find((e) => e.id === a.id);
          return {
            id: a.id,
            symbol: a.symbol,
            price: a.price,
            side: prev ? prev.side : null,
            triggered: prev ? !!prev.triggered : false,
          };
        });

      if (merged.length > 0) {
        allAlerts[deviceId] = merged;
      } else {
        delete allAlerts[deviceId];
      }
      await writeJSON(env.TRACKER_KV, ALERTS_KEY, allAlerts);
      return withCors(Response.json({ ok: true, count: merged.length }));
    }

    return withCors(new Response('Not found', { status: 404 }));
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(checkAlertsAndNotify(env));
  },
};

async function checkAlertsAndNotify(env) {
  const allAlerts = await readJSON(env.TRACKER_KV, ALERTS_KEY, {});
  const subs = await readJSON(env.TRACKER_KV, SUBS_KEY, {});

  console.log(
    `[cron] devices=${Object.keys(allAlerts).length} subs=${Object.keys(subs).length}`
  );

  const symbolSet = new Set();
  Object.values(allAlerts).forEach((list) => {
    (list || []).forEach((a) => {
      if (!a.triggered) symbolSet.add(a.symbol);
    });
  });
  if (symbolSet.size === 0) {
    console.log('[cron] không có cảnh báo nào đang chờ - bỏ qua.');
    return;
  }

  const prices = await fetchCoinGeckoPrices(env, [...symbolSet]);
  if (!prices) {
    console.log('[cron] lỗi lấy giá từ CoinGecko.');
    return;
  }
  console.log('[cron] giá hiện tại:', JSON.stringify(prices));

  let alertsChanged = false;
  let subsChanged = false;

  for (const deviceId of Object.keys(allAlerts)) {
    const list = allAlerts[deviceId] || [];
    const subscription = subs[deviceId];

    for (const alert of list) {
      if (alert.triggered) continue;
      const price = prices[alert.symbol];
      if (price === undefined || Number.isNaN(price)) continue;

      const side = price >= alert.price ? 'above' : 'below';

      if (alert.side === null || alert.side === undefined) {
        // Lần đầu thấy cảnh báo này kể từ khi đồng bộ - chỉ lưu baseline.
        console.log(
          `[cron] baseline mới cho ${deviceId}/${alert.symbol}@${alert.price}: giá hiện tại ${price} (${side})`
        );
        alert.side = side;
        alertsChanged = true;
        continue;
      }

      if (alert.side !== side) {
        console.log(
          `[cron] KÍCH HOẠT ${deviceId}/${alert.symbol}@${alert.price}: ${alert.side} -> ${side}, giá=${price}, có subscription=${!!subscription}`
        );
        alert.side = side;
        alert.triggered = true;
        alertsChanged = true;

        if (subscription) {
          const stillValid = await sendPush(env, subscription, {
            title: '🔔 Cảnh báo giá',
            body: `${alert.symbol} đã chạm mức ${price}`,
          });
          console.log(`[cron] gửi push cho ${deviceId} - subscription còn hợp lệ: ${stillValid}`);
          if (!stillValid) {
            delete subs[deviceId];
            subsChanged = true;
          }
        }
      }
    }
  }

  if (alertsChanged) await writeJSON(env.TRACKER_KV, ALERTS_KEY, allAlerts);
  if (subsChanged) await writeJSON(env.TRACKER_KV, SUBS_KEY, subs);
}

/**
 * Bảng ánh xạ base symbol (dạng sàn, vd "BTC") -> CoinGecko coin id (vd
 * "bitcoin"). CoinGecko không nhận thẳng symbol sàn vì 1 symbol có thể
 * trùng giữa nhiều coin khác nhau - phải quy về đúng 1 "id" duy nhất.
 * Danh sách dưới đây phủ các coin phổ biến nhất; nếu bạn theo dõi 1 symbol
 * không có trong bảng, cron sẽ log cảnh báo "không map được coingecko id"
 * cho symbol đó - báo lại để mình bổ sung thêm.
 */
const SYMBOL_TO_COINGECKO_ID = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', ADA: 'cardano', DOGE: 'dogecoin', TON: 'the-open-network',
  TRX: 'tron', DOT: 'polkadot', MATIC: 'matic-network', POL: 'polygon-ecosystem-token',
  LINK: 'chainlink', LTC: 'litecoin', BCH: 'bitcoin-cash', AVAX: 'avalanche-2',
  ATOM: 'cosmos', UNI: 'uniswap', NEAR: 'near', APT: 'aptos', ARB: 'arbitrum',
  OP: 'optimism', SUI: 'sui', SEI: 'sei-network', INJ: 'injective-protocol',
  FIL: 'filecoin', ETC: 'ethereum-classic', XLM: 'stellar', ICP: 'internet-computer',
  HBAR: 'hedera-hashgraph', VET: 'vechain', ALGO: 'algorand', AAVE: 'aave',
  MKR: 'maker', SAND: 'the-sandbox', MANA: 'decentraland', AXS: 'axie-infinity',
  FTM: 'fantom', RUNE: 'thorchain', GRT: 'the-graph', EGLD: 'multiversx',
  THETA: 'theta-token', XTZ: 'tezos', EOS: 'eos', KAS: 'kaspa',
  PEPE: 'pepe', SHIB: 'shiba-inu', WIF: 'dogwifcoin', BONK: 'bonk',
  FLOKI: 'floki', USDT: 'tether', USDC: 'usd-coin', DAI: 'dai',
};

// Danh sách quote asset thường gặp, xếp dài -> ngắn để tách đúng base/quote
// từ 1 symbol dạng dính liền như "BTCUSDT" (không có dấu phân cách).
const QUOTE_ASSETS = [
  'FDUSD', 'USDT', 'USDC', 'TUSD', 'BUSD', 'DAI',
  'USD', 'EUR', 'GBP', 'TRY', 'BRL',
  'BTC', 'ETH', 'BNB',
];

function splitSymbol(symbol) {
  for (const quote of QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return { base: symbol.slice(0, -quote.length), quote };
    }
  }
  return null;
}

// CoinGecko KHÔNG nhận USDT/USDC/... làm vs_currency (chỉ hỗ trợ usd, eur,
// và vài crypto như btc/eth/bnb) - coi các stablecoin này tương đương USD.
const STABLECOIN_AS_USD = new Set(['USDT', 'USDC', 'BUSD', 'TUSD', 'FDUSD', 'DAI']);

function vsCurrencyFor(quote) {
  return STABLECOIN_AS_USD.has(quote) ? 'usd' : quote.toLowerCase();
}

/**
 * Lấy giá hiện tại của các symbol cần theo dõi, dùng CoinGecko Public API
 * (keyless, miễn phí, không cần đăng ký) thay vì sàn giao dịch hay
 * CryptoCompare (CryptoCompare đã đóng cửa tier miễn phí không key từ
 * 21/5/2026). CoinGecko không phải sàn giao dịch nên không áp geo-block
 * theo IP datacenter như Binance/Bybit.
 *
 * CoinGecko dùng "coin id" (vd "bitcoin") thay vì symbol sàn (vd "BTC"),
 * nên cần tách symbol rồi tra qua SYMBOL_TO_COINGECKO_ID trước khi gọi -
 * phía client vẫn gửi/lưu symbol dạng "BTCUSDT" như cũ, không cần đổi gì.
 */
async function fetchCoinGeckoPrices(env, symbols) {
  const pairs = symbols
    .map((symbol) => ({ symbol, parsed: splitSymbol(symbol) }))
    .filter((p) => p.parsed !== null)
    .map((p) => ({ ...p, id: SYMBOL_TO_COINGECKO_ID[p.parsed.base] }));

  const unmapped = pairs.filter((p) => !p.id).map((p) => p.symbol);
  if (unmapped.length > 0) {
    console.log('[cron] không map được coingecko id cho symbol:', unmapped.join(', '));
  }

  const mapped = pairs.filter((p) => p.id);
  if (mapped.length === 0) {
    console.log('[cron] không có symbol nào map được sang CoinGecko id.');
    return {};
  }

  const ids = [...new Set(mapped.map((p) => p.id))];
  const vsCurrencies = [...new Set(mapped.map((p) => vsCurrencyFor(p.parsed.quote)))];
  const targetUrl =
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(','))}` +
    `&vs_currencies=${encodeURIComponent(vsCurrencies.join(','))}`;

  let res;
  try {
    res = await fetch(targetUrl, {
      headers: {
        // CoinGecko trả 403 nếu request không có User-Agent mô tả rõ ràng.
        'User-Agent': 'dq-tracker-push/1.0 (personal price alert worker)',
        Accept: 'application/json',
        // Có key riêng thì được quota 30 call/phút thay vì bị chia sẻ theo
        // IP datacenter (rất dễ bị 429 vì nhiều Worker khác dùng chung IP).
        // Nếu chưa set secret COINGECKO_API_KEY thì header này bị bỏ qua,
        // request vẫn chạy ở chế độ keyless như cũ.
        ...(env.COINGECKO_API_KEY ? { 'x-cg-demo-api-key': env.COINGECKO_API_KEY } : {}),
      },
    });
  } catch (err) {
    console.log('[cron] fetch CoinGecko ném lỗi (network):', err.message);
    return null;
  }
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '(không đọc được body)');
    console.log(`[cron] CoinGecko trả về lỗi HTTP ${res.status} ${res.statusText}: ${bodyText.slice(0, 300)}`);
    if (res.status === 429 && !env.COINGECKO_API_KEY) {
      console.log('[cron] gợi ý: set secret COINGECKO_API_KEY (free Demo key tại coingecko.com/en/api/pricing) để có quota riêng, tránh bị chia sẻ theo IP.');
    }
    return null;
  }
  const data = await res.json();

  const map = {};
  mapped.forEach(({ symbol, parsed, id }) => {
    const price = data[id] && data[id][vsCurrencyFor(parsed.quote)];
    if (typeof price === 'number') {
      map[symbol] = price;
    }
  });
  return map;
}

/**
 * Gửi 1 Web Push tới đúng subscription. Trả về false nếu subscription đã
 * hết hạn/không còn hợp lệ (404/410) - Worker sẽ tự xoá subscription đó.
 */
async function sendPush(env, subscription, { title, body }) {
  try {
    const vapid = {
      subject: env.VAPID_SUBJECT,
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    };
    const message = {
      data: JSON.stringify({ title, body }),
      options: { ttl: 60 },
    };
    const payload = await buildPushPayload(message, subscription, vapid);
    const res = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: payload.headers,
      body: payload.body,
    });
    return res.status !== 404 && res.status !== 410;
  } catch (err) {
    console.error('Lỗi khi gửi push:', err);
    return true; // lỗi tạm thời (mạng...) - không vội xoá subscription
  }
}