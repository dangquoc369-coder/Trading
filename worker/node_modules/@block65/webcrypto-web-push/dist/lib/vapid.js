import { sign, decodeBase64Url, encodeBase64Url } from './cf-jwt/main.js';
import { crypto } from './isomorphic-crypto.js';
import { invariant } from './utils.js';
export async function vapidHeaders(subscription, vapid) {
    invariant(vapid.subject, 'Vapid subject is empty');
    invariant(vapid.privateKey, 'Vapid private key is empty');
    invariant(vapid.publicKey, 'Vapid public key is empty');
    const vapidPublicKeyBytes = decodeBase64Url(vapid.publicKey);
    const publicKey = await crypto.subtle.importKey('jwk', {
        kty: 'EC',
        crv: 'P-256',
        x: encodeBase64Url(vapidPublicKeyBytes.slice(1, 33)),
        y: encodeBase64Url(vapidPublicKeyBytes.slice(33, 65)),
        d: vapid.privateKey,
    }, {
        name: 'ECDSA',
        namedCurve: 'P-256',
    }, false, ['sign']);
    const jwt = await sign({
        aud: new URL(subscription.endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: vapid.subject,
    }, publicKey, {
        algorithm: 'ES256',
    });
    return {
        headers: {
            authorization: `WebPush ${jwt}`,
            'crypto-key': `p256ecdsa=${vapid.publicKey}`,
        },
        // publicJwk,
    };
}
