export function assertString(value) {
    if (typeof value !== 'string') {
        throw new Error('value must be a string');
    }
}
export function assertArray(value) {
    if (!Array.isArray(value)) {
        throw new Error('value must be an array');
    }
}
export function assertObject(value) {
    if (typeof value !== 'object' || value === null) {
        throw new Error('value must be an object');
    }
}
export function assertTruthy(value) {
    if (!value) {
        throw new Error('value must be truthy');
    }
}
export function assertKeyInObject(obj, keyName) {
    if (!(keyName in obj)) {
        throw new Error(`obj must have a ${keyName} property`);
    }
}
export function assertStringKeyInObject(obj, keyName) {
    assertKeyInObject(obj, keyName);
    assertString(obj[keyName]);
}
