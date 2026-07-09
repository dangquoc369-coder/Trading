import type { Jsonifiable, RequireAtLeastOne } from 'type-fest';
export type PushMessage<T extends Jsonifiable = Jsonifiable> = {
    data: T;
    options?: RequireAtLeastOne<{
        ttl?: number;
        topic?: string;
        urgency?: 'low' | 'normal' | 'high';
    }>;
};
export type PushSubscription = {
    endpoint: string;
    /** DOMHighResTimeStamp */
    expirationTime: number | null;
    keys: {
        auth: string;
        p256dh: string;
    };
};
