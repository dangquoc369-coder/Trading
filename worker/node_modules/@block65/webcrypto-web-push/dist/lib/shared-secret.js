import { crypto } from './isomorphic-crypto.js';
export function deriveSharedSecret(publicKey, privateKey) {
    return crypto.subtle.deriveBits({
        name: 'ECDH',
        // namedCurve: 'P-256',
        public: publicKey,
    }, privateKey, 256);
}
