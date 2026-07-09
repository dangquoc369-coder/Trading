import type { JwtPayload, JwtHeader } from './jwt.js';
export declare function verify<P extends JwtPayload, H extends JwtHeader = JwtHeader>(token: string, key: CryptoKey): Promise<{
    header: H;
    payload: P;
}>;
