type DebugData = Record<string, unknown>;
export declare enum Status {
    OK = 0,
    CANCELLED = 1,
    UNKNOWN = 2,
    INVALID_ARGUMENT = 3,
    DEADLINE_EXCEEDED = 4,
    NOT_FOUND = 5,
    ALREADY_EXISTS = 6,
    PERMISSION_DENIED = 7,
    RESOURCE_EXHAUSTED = 8,
    FAILED_PRECONDITION = 9,
    ABORTED = 10,
    OUT_OF_RANGE = 11,
    UNIMPLEMENTED = 12,
    INTERNAL = 13,
    UNAVAILABLE = 14,
    DATA_LOSS = 15,
    UNAUTHENTICATED = 16
}
export interface ErrorInfo {
    reason: string;
    metadata: Record<string, string>;
}
export interface RetryInfo {
    delay: number;
}
export interface BadRequest {
    violations: {
        field: string;
        description: string;
    }[];
}
export interface LocalisedMessage {
    locale: 'en';
    message: string;
}
export interface Help {
    url: string;
    description: string;
}
export interface QuotaFailure {
    violations: {
        /**
         * subject of which quota check failed ie: `account:1234567`
         */
        subject: string;
        /**
         * description of quota failure
         */
        description: string;
    }[];
}
export type ErrorDetail = ErrorInfo | RetryInfo | QuotaFailure | BadRequest | LocalisedMessage | Help;
export interface CustomErrorSerialized {
    code: Status;
    status: keyof typeof Status;
    message?: string;
    details?: ErrorDetail[];
}
export declare class CustomError extends Error {
    /**
     * The previous error that occurred, useful if "wrapping" an error to hide
     * sensitive details
     * @type {Error | CustomError | unknown}
     */
    readonly cause?: Error | CustomError | unknown;
    /**
     * Further error details suitable for end user consumption
     * @type {ErrorDetail[]}
     */
    details?: ErrorDetail[];
    /**
     * Status code suitable to coarsely determine the reason for error
     * @type {Status}
     */
    code: Status;
    /**
     * Contains arbitrary debug data for developer troubleshooting
     * @type {DebugData}
     * @private
     */
    private debugData?;
    /**
     *
     * @param {string} message Developer facing message, in English.
     * @param {Error | CustomError | unknown} cause
     */
    constructor(message: string, cause?: Error | CustomError | unknown);
    static isCustomError(value: unknown): value is CustomError;
    /**
     * Add arbitrary debug data to the error object for developer troubleshooting
     * @return {DebugData | undefined}
     */
    debug(): DebugData | undefined;
    debug(data: DebugData | undefined): this;
    /**
     * Human readable representation of the error code
     * @return {keyof typeof Status}
     */
    get status(): keyof typeof Status;
    /**
     * Adds further error details suitable for end user consumption
     * @param {ErrorDetail} details
     * @return {this}
     */
    addDetail(...details: ErrorDetail[]): this;
    /**
     * A "safe" serialised version of the error designed for end user consumption
     * @return {CustomErrorSerialized}
     */
    serialize(): CustomErrorSerialized;
    /**
     * JSON representation of the error object.
     *
     * Use {serialize} instead if you need to send this error over the wire
     *
     * @return {object}
     */
    toJSON(): Omit<CustomError, 'addDetail' | 'serialize' | 'debug' | 'toJSON'> & {
        debug?: DebugData;
    };
    /**
     * "Hydrates" a previously serialised error object
     * @param {CustomErrorSerialized} params
     * @return {CustomError}
     */
    static fromJSON(params: CustomErrorSerialized): CustomError;
    /**
     * An automatically determined HTTP status code
     * @return {number}
     */
    static suggestHttpResponseCode(err: Error | CustomError | unknown): number;
}
export {};
