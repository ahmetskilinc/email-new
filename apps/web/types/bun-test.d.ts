/**
 * Minimal ambient types for Bun's built-in test runner.
 *
 * Declared locally rather than pulling in @types/bun so that adding tests does
 * not require a dependency change — the lockfile is the gate that catches
 * package.json drift, and this keeps the two in agreement.
 */
declare module "bun:test" {
  interface TestFn {
    (name: string, fn: () => void | Promise<void>): void
    each(cases: readonly unknown[]): (
      name: string,
      // Cases are either a scalar or a tuple spread across parameters, so the
      // callback arity varies per call site.
      fn: (...args: any[]) => void | Promise<void>
    ) => void
    skip(name: string, fn: () => void | Promise<void>): void
    only(name: string, fn: () => void | Promise<void>): void
    todo(name: string, fn?: () => void | Promise<void>): void
  }

  export const test: TestFn
  export const it: TestFn

  export function describe(name: string, fn: () => void): void
  export function beforeAll(fn: () => void | Promise<void>): void
  export function afterAll(fn: () => void | Promise<void>): void
  export function beforeEach(fn: () => void | Promise<void>): void
  export function afterEach(fn: () => void | Promise<void>): void

  interface Matchers {
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toThrow(expected?: unknown): void
    toContain(expected: unknown): void
    toMatch(expected: string | RegExp): void
    toBeLessThanOrEqual(expected: number): void
    toBeGreaterThanOrEqual(expected: number): void
    toBeDefined(): void
    toBeUndefined(): void
    toBeNull(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toBeInstanceOf(expected: unknown): void
    toHaveLength(expected: number): void
  }

  interface AsyncMatchers {
    toThrow(expected?: unknown): Promise<void>
    toBe(expected: unknown): Promise<void>
    toBeDefined(): Promise<void>
    toBeInstanceOf(expected: unknown): Promise<void>
  }

  interface Expectation extends Matchers {
    not: Matchers
    resolves: AsyncMatchers
    rejects: AsyncMatchers
  }

  interface ExpectFn {
    (actual: unknown): Expectation
    /** Asymmetric matcher: the array contains at least these members. */
    arrayContaining(expected: readonly unknown[]): unknown
    /** Asymmetric matcher: the object contains at least these properties. */
    objectContaining(expected: Record<string, unknown>): unknown
    any(constructor: unknown): unknown
  }

  export const expect: ExpectFn
}
