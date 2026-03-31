import { z } from "zod"

const serializedFileSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  lastModified: z.number(),
  base64: z.string(),
})

export const serializeFiles = async (files: File[]) => {
  return await Promise.all(
    files.map(async (file) => {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => {
          const base64String = reader.result as string
          resolve(base64String.split(",")[1]!)
        }
        reader.readAsDataURL(file)
      })

      return {
        name: file.name,
        type: file.type,
        size: file.size,
        lastModified: file.lastModified,
        base64,
      }
    }),
  )
}
