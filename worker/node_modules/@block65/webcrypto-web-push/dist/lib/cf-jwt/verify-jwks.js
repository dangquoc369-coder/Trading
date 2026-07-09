import { assertArray, assertObject, assertString, assertStringKeyInObject, } from './assert.js';
import { decode } from './decode.js';
import { PermissionError } from './errors.js';
import { algorithms } from './jwt-algorithms.js';
import { verify } from './verify.js';
export async function verifyJwks(token, jwksUri) {
    if (typeof token !== 'string') {
        throw new Error('token argument must be a string');
    }
    const { header } = decode(token);
    const jwks = await fetch(jwksUri).then((res) => res.json());
    assertObject(jwks);
    assertArray(jwks.keys);
    const key = jwks.keys.find((k) => {
        assertObject(k);
        return k.kid === header.kid;
    });
    if (!key) {
        throw new PermissionError('No usable key found for verification').debug({
            header,
            jwks,
            jwksUri,
        });
    }
    assertObject(key);
    assertStringKeyInObject(key, 'alg');
    assertString(key.alg);
    assertStringKeyInObject(key, 'kty');
    assertString(key.kty);
    const algorithm = algorithms[key.alg];
    try {
        const keyData = await crypto.subtle.importKey('jwk', key, algorithm, false, ['verify']);
        return await verify(token, keyData);
    }
    catch (err) {
        console.trace('Error importing key', err, key);
        throw err;
    }
}
