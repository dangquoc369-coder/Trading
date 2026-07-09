import { base64UrlToObject, decodeBase64Url } from './base64.js';
import { ValidationError } from './errors.js';
export function decode(token) {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
        throw new ValidationError('token must consist of 3 parts').addDetail({
            reason: 'token-format',
            metadata: {
                parts: tokenParts.length,
            },
        });
    }
    const [headerEncoded, payloadEncoded, signatureEncoded] = tokenParts;
    return {
        header: base64UrlToObject(headerEncoded),
        payload: base64UrlToObject(payloadEncoded),
        signature: decodeBase64Url(signatureEncoded),
        signedData: new TextEncoder().encode(`${headerEncoded}.${payloadEncoded}`),
    };
}
