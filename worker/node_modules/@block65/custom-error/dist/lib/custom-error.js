export var Status;
(function (Status) {
    Status[Status["OK"] = 0] = "OK";
    Status[Status["CANCELLED"] = 1] = "CANCELLED";
    Status[Status["UNKNOWN"] = 2] = "UNKNOWN";
    Status[Status["INVALID_ARGUMENT"] = 3] = "INVALID_ARGUMENT";
    Status[Status["DEADLINE_EXCEEDED"] = 4] = "DEADLINE_EXCEEDED";
    Status[Status["NOT_FOUND"] = 5] = "NOT_FOUND";
    Status[Status["ALREADY_EXISTS"] = 6] = "ALREADY_EXISTS";
    Status[Status["PERMISSION_DENIED"] = 7] = "PERMISSION_DENIED";
    Status[Status["RESOURCE_EXHAUSTED"] = 8] = "RESOURCE_EXHAUSTED";
    Status[Status["FAILED_PRECONDITION"] = 9] = "FAILED_PRECONDITION";
    Status[Status["ABORTED"] = 10] = "ABORTED";
    Status[Status["OUT_OF_RANGE"] = 11] = "OUT_OF_RANGE";
    Status[Status["UNIMPLEMENTED"] = 12] = "UNIMPLEMENTED";
    Status[Status["INTERNAL"] = 13] = "INTERNAL";
    Status[Status["UNAVAILABLE"] = 14] = "UNAVAILABLE";
    Status[Status["DATA_LOSS"] = 15] = "DATA_LOSS";
    Status[Status["UNAUTHENTICATED"] = 16] = "UNAUTHENTICATED";
})(Status || (Status = {}));
const CUSTOM_ERROR_SYM = Symbol.for('CustomError');
const defaultHttpMapping = new Map([
    [Status.OK, 200],
    [Status.INVALID_ARGUMENT, 400],
    [Status.FAILED_PRECONDITION, 400],
    [Status.OUT_OF_RANGE, 400],
    [Status.UNAUTHENTICATED, 401],
    [Status.PERMISSION_DENIED, 403],
    [Status.NOT_FOUND, 404],
    [Status.ABORTED, 409],
    [Status.ALREADY_EXISTS, 409],
    [Status.RESOURCE_EXHAUSTED, 403],
    [Status.CANCELLED, 499],
    [Status.DATA_LOSS, 500],
    [Status.UNKNOWN, 500],
    [Status.INTERNAL, 500],
    [Status.UNIMPLEMENTED, 501],
    // [Code.LOCAL_OUTAGE,  502],
    [Status.UNAVAILABLE, 503],
    [Status.DEADLINE_EXCEEDED, 504],
]);
function withNullProto(obj) {
    return Object.assign(Object.create(null), obj);
}
export class CustomError extends Error {
    /**
     * The previous error that occurred, useful if "wrapping" an error to hide
     * sensitive details
     * @type {Error | CustomError | unknown}
     */
    cause;
    /**
     * Further error details suitable for end user consumption
     * @type {ErrorDetail[]}
     */
    details;
    /**
     * Status code suitable to coarsely determine the reason for error
     * @type {Status}
     */
    code = Status.UNKNOWN;
    /**
     * Contains arbitrary debug data for developer troubleshooting
     * @type {DebugData}
     * @private
     */
    debugData;
    /**
     *
     * @param {string} message Developer facing message, in English.
     * @param {Error | CustomError | unknown} cause
     */
    constructor(message, cause) {
        super(message, { cause });
        this.cause = cause;
        // FF doesnt have captureStackTrace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
        Object.setPrototypeOf(this, new.target.prototype);
    }
    static isCustomError(value) {
        return !!value && typeof value === 'object' && CUSTOM_ERROR_SYM in value;
    }
    debug(data) {
        if (arguments.length > 0) {
            this.debugData = withNullProto({
                ...this.debugData,
                ...data,
            });
            return this;
        }
        return this.debugData;
    }
    /**
     * Human readable representation of the error code
     * @return {keyof typeof Status}
     */
    get status() {
        return Status[this.code];
    }
    /**
     * Adds further error details suitable for end user consumption
     * @param {ErrorDetail} details
     * @return {this}
     */
    addDetail(...details) {
        this.details = (this.details || []).concat(details);
        return this;
    }
    /**
     * A "safe" serialised version of the error designed for end user consumption
     * @return {CustomErrorSerialized}
     */
    serialize() {
        const localised = this.details?.find((detail) => 'locale' in detail);
        return withNullProto({
            message: this.message,
            ...(localised?.message && {
                message: localised.message,
            }),
            code: this.code,
            status: this.status,
            ...(this.details && { details: this.details }),
        });
    }
    /**
     * JSON representation of the error object.
     *
     * Use {serialize} instead if you need to send this error over the wire
     *
     * @return {object}
     */
    toJSON() {
        const debug = this.debug();
        return withNullProto({
            name: this.name,
            message: this.message,
            code: this.code,
            status: this.status,
            ...(this.details && { details: this.details }),
            ...(this.cause instanceof Error && {
                cause: 'toJSON' in this.cause && typeof this.cause.toJSON === 'function'
                    ? this.cause.toJSON()
                    : {
                        message: this.cause.message,
                        name: 'Error',
                    },
            }),
            ...(this.stack && { stack: this.stack }),
            ...(debug && { debug }),
        });
    }
    /**
     * "Hydrates" a previously serialised error object
     * @param {CustomErrorSerialized} params
     * @return {CustomError}
     */
    static fromJSON(params) {
        const { code = Status.UNKNOWN, message, details = [] } = params;
        const err = new CustomError(message || (Status[params.code] || params.code || 'Error').toString()).debug({ params });
        err.code = code;
        if (details) {
            err.addDetail(...details);
        }
        return err;
    }
    /**
     * An automatically determined HTTP status code
     * @return {number}
     */
    static suggestHttpResponseCode(err) {
        const code = CustomError.isCustomError(err) ? err.code : Status.UNKNOWN;
        return defaultHttpMapping.get(code) || 500;
    }
}
// Mark all instances of 'CustomError'
Object.defineProperty(CustomError.prototype, CUSTOM_ERROR_SYM, {
    value: true,
    enumerable: false,
    writable: false,
});
// allow enumeration of status getter
Object.defineProperty(CustomError.prototype, 'status', {
    enumerable: true,
});
