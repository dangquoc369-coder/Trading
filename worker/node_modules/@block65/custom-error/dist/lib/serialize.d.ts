import { CustomError } from './custom-error.js';
export interface SerializedError {
    name: string;
    message: string;
    statusCode?: number;
    stack?: string;
    cause?: SerializedError[] | unknown;
    [key: string]: unknown;
}
export declare function serializeError(err: unknown | Error | CustomError): SerializedError;
