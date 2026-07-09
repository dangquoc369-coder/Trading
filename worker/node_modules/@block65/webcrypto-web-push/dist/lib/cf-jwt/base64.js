import { decode as decodeBase64, encode as encodeBase64, } from 'base64-arraybuffer';
export { decodeBase64, encodeBase64 };
export function decodeBase64Url(str) {
    return decodeBase64(str.replace(/-/g, '+').replace(/_/g, '/'));
}
export function encodeBase64Url(arr) {
    return encodeBase64(arr)
        .replace(/\//g, '_')
        .replace(/\+/g, '-')
        .replace(/=+$/, '');
}
export function base64UrlToObject(str) {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(str)));
}
export function objectToBase64Url(obj) {
    return encodeBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
}
