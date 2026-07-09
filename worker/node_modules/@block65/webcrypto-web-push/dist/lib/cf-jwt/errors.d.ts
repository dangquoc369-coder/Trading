import { CustomError, Status } from '@block65/custom-error';
export declare class PermissionError extends CustomError {
    code: Status;
}
export declare class ValidationError extends CustomError {
    code: Status;
}
