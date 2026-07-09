import type { PushSubscription } from './types.js';
export interface EncryptedNotification {
    ciphertext: Uint8Array;
    salt: Uint8Array;
    localPublicKeyBytes: Uint8Array;
}
export declare function encryptNotification(subscription: PushSubscription, plaintext: Uint8Array): Promise<EncryptedNotification>;
