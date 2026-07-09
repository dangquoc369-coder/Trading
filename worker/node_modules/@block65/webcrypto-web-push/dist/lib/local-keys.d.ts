/// <reference types="node" resolution-mode="require"/>
export declare function generateLocalKeys(): Promise<{
    publicKey: import("crypto").webcrypto.CryptoKey;
    privateKey: import("crypto").webcrypto.CryptoKey;
    publicJwk: import("crypto").webcrypto.JsonWebKey;
    privateJwk: import("crypto").webcrypto.JsonWebKey;
}>;
