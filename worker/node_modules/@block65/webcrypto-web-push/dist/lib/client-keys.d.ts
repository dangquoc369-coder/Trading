/// <reference types="node" resolution-mode="require"/>
import type { PushSubscription } from './types.js';
export declare function deriveClientKeys(sub: PushSubscription): Promise<{
    publicBytes: Uint8Array;
    publicKey: import("crypto").webcrypto.CryptoKey;
    authSecretBytes: ArrayBuffer;
}>;
