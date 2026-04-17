import { withWorkflow } from "workflow/next"

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@workspace/ui"],
}

export default withWorkflow(nextConfig)
