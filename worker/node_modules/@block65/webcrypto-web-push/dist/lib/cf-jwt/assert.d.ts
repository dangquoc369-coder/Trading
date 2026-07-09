export declare function assertString<T extends string>(value: unknown): asserts value is T;
export declare function assertArray(value: unknown): asserts value is Array<unknown>;
export declare function assertObject(value: unknown): asserts value is Record<string, unknown>;
export declare function assertTruthy<T>(value: T): asserts value is Exclude<T, false | null | ''>;
export declare function assertKeyInObject<T extends string>(obj: {
    [key: string]: unknown;
}, keyName: T): asserts obj is {
    [key in T]: unknown;
};
export declare function assertStringKeyInObject<T extends string>(obj: {
    [key: string]: unknown;
}, keyName: T): asserts obj is {
    [key in T]: string;
};
