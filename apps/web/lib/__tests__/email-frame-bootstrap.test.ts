import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"

import {
  EMAIL_FRAME_BOOTSTRAP,
  EMAIL_FRAME_BOOTSTRAP_HASH,
} from "../email-frame-bootstrap"

describe("email frame bootstrap", () => {
  test("the published hash matches the script that actually ships", () => {
    const digest = createHash("sha256")
      .update(EMAIL_FRAME_BOOTSTRAP, "utf8")
      .digest("base64")

    // If this fails, the bootstrap was edited without recomputing the hash. The
    // frame's CSP and the app CSP in proxy.ts both pin that hash, so shipping
    // the mismatch would silently stop the script from running.
    expect(EMAIL_FRAME_BOOTSTRAP_HASH).toBe(`sha256-${digest}`)
  })
})
