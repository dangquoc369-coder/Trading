import { encodeLength } from './utils.js';
export function createInfo(clientPublic, serverPublic, type) {
    return new Uint8Array([
        ...new TextEncoder().encode(`Content-Encoding: ${type}\0`),
        ...new TextEncoder().encode('P-256\0'),
        ...encodeLength(clientPublic.byteLength),
        ...clientPublic,
        ...encodeLength(serverPublic.byteLength),
        ...serverPublic,
    ]);
}
export function createInfo2(type) {
    return new Uint8Array([
        ...new TextEncoder().encode(`Content-Encoding: ${type}\0`),
        // ...new TextEncoder().encode('P-256\0'),
        // ...encodeInt(clientPublic.byteLength),
        // ...clientPublic,
        // ...encodeInt(serverPublic.byteLength),
        // ...serverPublic,
    ]);
}
