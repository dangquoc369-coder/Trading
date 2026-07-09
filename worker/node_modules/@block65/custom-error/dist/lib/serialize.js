import { serializeError as serialize } from 'serialize-error';
import { CustomError } from './custom-error.js';
function flattenPreviousErrors(err, accum = []) {
    if (err instanceof Error) {
        if ('cause' in err && err.cause) {
            return flattenPreviousErrors(err.cause, [...accum, err]);
        }
        return [...accum, err];
    }
    return accum;
}
export function serializeError(err) {
    if (CustomError.isCustomError(err)) {
        const previousErrors = 'cause' in err && err.cause
            ? flattenPreviousErrors(err.cause)
            : undefined;
        return {
            ...serialize(err),
            message: err.message,
            name: err.name,
            status: err.status,
            ...(previousErrors && { cause: previousErrors.map(serializeError) }),
            ...('debug' in err && { debug: err.debug() }),
        };
    }
    if (err instanceof Error) {
        const { name, message, stack, cause, code, ...debug } = serialize(err);
        return {
            message: message || 'Error',
            name: name || 'Error',
            code,
            stack,
            ...(!!cause && { cause: [serializeError(cause)] }),
            ...(debug && { debug }),
        };
    }
    // Not an error object, maybe primitive or null, undefined
    return {
        name: 'Error',
        message: String(err),
        stack: Error().stack,
        debug: {
            typeofErr: typeof err,
            err,
        },
    };
}
