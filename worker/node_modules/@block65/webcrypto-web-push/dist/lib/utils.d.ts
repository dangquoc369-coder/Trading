export declare function flattenUint8Array(arrays: Uint8Array[]): Uint8Array;
export declare function be16(val: number): number;
export declare function arrayChunk(arr: Uint8Array, chunkSize: number): Uint8Array[];
export declare function generateNonce(base: Uint8Array, index: number): Uint8Array;
export declare function encodeLength(int: number): Uint8Array;
export declare function invariant<T>(condition: T | undefined | null | '' | 0 | false, message: string): asserts condition;
