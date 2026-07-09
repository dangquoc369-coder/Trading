export declare function hkdf(salt: ArrayBuffer, ikm: ArrayBuffer): Promise<{
    extract: (info: ArrayBuffer, len: number) => Promise<ArrayBuffer>;
}>;
