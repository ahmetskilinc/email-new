import { Suspense } from "react"
import { ComposeContent } from "./compose-content"

export const dynamic = "force-dynamic"

export default function ComposePage() {
  return (
    <Suspense>
      <ComposeContent />
    </Suspense>
  )
}
