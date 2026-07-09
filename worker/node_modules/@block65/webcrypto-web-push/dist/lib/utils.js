export function flattenUint8Array(arrays) {
    const flatNumberArray = arrays.reduce((accum, arr) => {
        accum.push(...arr);
        return accum;
    }, []);
    return new Uint8Array(flatNumberArray);
}
export function be16(val) {
    // present an 8bit value as a Big Endian 16bit value
    // eslint-disable-next-line no-bitwise
    return ((val & 0xff) << 8) | ((val >> 8) & 0xff);
}
export function arrayChunk(arr, chunkSize) {
    const chunks = [];
    const arrayLength = arr.length;
    let i = 0;
    while (i < arrayLength) {
        chunks.push(arr.slice(i, (i += chunkSize)));
    }
    return chunks;
}
export function generateNonce(base, index) {
    /* generate a 96-bit IV for use in GCM, 48-bits of which are populated */
    const nonce = base.slice(0, 12);
    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < 6; ++i) {
        // eslint-disable-next-line no-bitwise
        nonce[nonce.length - 1 - i] ^= (index / 256 ** i) & 0xff;
    }
    return nonce;
}
export function encodeLength(int) {
    return new Uint8Array([0, int]);
}
export function invariant(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}
