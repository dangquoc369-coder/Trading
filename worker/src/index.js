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
 *   - Gọi 1 lần API Binance (batched) để lấy giá hiện tại của các symbol đó.
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

  const symbolSet = new Set();
  Object.values(allAlerts).forEach((list) => {
    (list || []).forEach((a) => {
      if (!a.triggered) symbolSet.add(a.symbol);
    });
  });
  if (symbolSet.size === 0) return;

  const prices = await fetchBinancePrices([...symbolSet]);
  if (!prices) return;

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
        alert.side = side;
        alertsChanged = true;
        continue;
      }

      if (alert.side !== side) {
        alert.side = side;
        alert.triggered = true;
        alertsChanged = true;

        if (subscription) {
          const stillValid = await sendPush(env, subscription, {
            title: '🔔 Cảnh báo giá',
            body: `${alert.symbol} đã chạm mức ${price}`,
          });
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

/** Lấy giá hiện tại của nhiều symbol trong 1 lần gọi API (đỡ tốn subrequest). */
async function fetchBinancePrices(symbols) {
  const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
  const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbols=${symbolsParam}`);
  if (!res.ok) return null;
  const data = await res.json();
  const map = {};
  data.forEach((t) => {
    map[t.symbol] = parseFloat(t.price);
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
