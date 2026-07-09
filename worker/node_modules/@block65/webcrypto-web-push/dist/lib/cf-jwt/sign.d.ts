import { type JwtAlgorithm } from './jwt-algorithms.js';
import type { JwtPayload } from './jwt.js';
export declare function sign(payload: JwtPayload, key: CryptoKey, options: {
    algorithm: JwtAlgorithm;
    kid?: string;
}): Promise<string>;
