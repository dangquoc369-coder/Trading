import type { PushMessage, PushSubscription } from './types.js';
import { type VapidKeys } from './vapid.js';
export declare function buildPushPayload(message: PushMessage, subscription: PushSubscription, vapid: VapidKeys): Promise<{
    headers: {
        'content-encoding': string;
        'content-length': string;
        'content-type': string;
        topic?: string | undefined;
        urgency?: "low" | "normal" | "high" | undefined;
        'crypto-key': string;
        encryption: string;
        ttl: string;
        authorization: string;
    };
    method: string;
    body: Uint8Array;
}>;
