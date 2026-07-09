import type { JwtHeader, JwtPayload } from './jwt.js';
export declare function decode(token: string): {
    header: JwtHeader;
    payload: JwtPayload;
    signature: ArrayBuffer;
    signedData: Uint8Array;
};
