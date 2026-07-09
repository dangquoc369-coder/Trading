/* eslint-disable max-classes-per-file */
import { CustomError, Status } from '@block65/custom-error';
export class PermissionError extends CustomError {
    code = Status.PERMISSION_DENIED;
}
export class ValidationError extends CustomError {
    code = Status.PERMISSION_DENIED;
}
