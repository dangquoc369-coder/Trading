import type { JwtPayload, JwtHeader } from './jwt.js';
export declare function verifyJwks<P extends JwtPayload, H extends JwtHeader = JwtHeader>(token: string, jwksUri: URL): Promise<{
    header: JwtHeader;
    payload: P;
}>;
