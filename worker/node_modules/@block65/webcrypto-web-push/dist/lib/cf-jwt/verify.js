import { decode } from './decode.js';
import { algorithms } from './jwt-algorithms.js';
export async function verify(token, key) {
    if (typeof token !== 'string') {
        throw new Error('token argument must be a string');
    }
    if (!(key instanceof CryptoKey)) {
        throw new Error('key argument must be a CryptoKey');
    }
    const { header, payload, signature, signedData } = decode(token);
    if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
        throw new Error('NOT_YET_VALID');
    }
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) {
        throw new Error('EXPIRED');
    }
    const verified = await crypto.subtle.verify(algorithms[header.alg], key, signature, signedData);
    if (!verified) {
        throw new Error('Token did not verify');
    }
    return { header, payload };
}
