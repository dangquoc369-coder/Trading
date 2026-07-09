/// <reference types="node" resolution-mode="require"/>
/// <reference lib="webworker" />
export declare const crypto: {
    getRandomValues: <T extends Uint8Array>(array: T) => T;
    subtle: import("crypto").webcrypto.SubtleCrypto;
};
export declare const CryptoKey: import("crypto").webcrypto.CryptoKeyConstructor | {
    new (): CryptoKey;
    prototype: CryptoKey;
};
