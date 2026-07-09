import { decode as decodeBase64, encode as encodeBase64 } from 'base64-arraybuffer';
export { decodeBase64, encodeBase64 };
export declare function decodeBase64Url(str: string): ArrayBuffer;
export declare function encodeBase64Url(arr: ArrayBuffer): string;
export declare function base64UrlToObject<T extends Record<string, unknown>>(str: string): T;
export declare function objectToBase64Url<T extends Record<string, unknown>>(obj: T): string;
