export type JwtAlgorithm = 'ES256' | 'ES384' | 'ES512' | 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
interface Algorithm {
    name: string;
}
type NamedCurve = string;
interface EcKeyImportParams extends Algorithm {
    namedCurve: NamedCurve;
}
type AlgorithmIdentifier = Algorithm | string;
type HashAlgorithmIdentifier = AlgorithmIdentifier;
interface RsaHashedImportParams extends Algorithm {
    hash: HashAlgorithmIdentifier;
}
interface HmacImportParams extends Algorithm {
    hash: HashAlgorithmIdentifier;
    length?: number;
}
export declare const algorithms: Record<JwtAlgorithm, RsaHashedImportParams | EcKeyImportParams | HmacImportParams>;
export {};
