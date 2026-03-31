import { z } from "zod"

export const serializedFileSchema = z.object({
  name: z.string(),
  type: z.string(),
  size: z.number(),
  lastModified: z.number(),
  base64: z.string(),
})

export const deserializeFiles = async (
  serializedFiles: z.infer<typeof serializedFileSchema>[],
) => {
  return await Promise.all(
    serializedFiles.map((data) => {
      const file = Buffer.from(data.base64, "base64")
      const blob = new Blob([file], { type: data.type })
      const newFile = new File([blob], data.name, {
        type: data.type,
        lastModified: data.lastModified,
      })
      return newFile
    }),
  )
}

export const createDraftData = z.object({
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string(),
  message: z.string(),
  attachments: z.array(serializedFileSchema).optional(),
  id: z.string().nullable(),
  threadId: z.string().nullable(),
  fromEmail: z.string().nullable(),
})

export type CreateDraftData = z.infer<typeof createDraftData>

export const mailCategorySchema = z.object({
  id: z
    .string()
    .regex(
      /^[a-zA-Z0-9\-_ ]+$/,
      "Category ID must contain only alphanumeric characters, hyphens, underscores, and spaces",
    ),
  name: z.string(),
  searchValue: z.string(),
  order: z.number().int(),
  icon: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
})

export type MailCategory = z.infer<typeof mailCategorySchema>

export const defaultMailCategories: MailCategory[] = [
  {
    id: "Important",
    name: "Important",
    searchValue: "IMPORTANT",
    order: 0,
    icon: "Lightning",
    isDefault: false,
  },
  {
    id: "All Mail",
    name: "All Mail",
    searchValue: "",
    order: 1,
    icon: "Mail",
    isDefault: true,
  },
  {
    id: "Unread",
    name: "Unread",
    searchValue: "UNREAD",
    order: 5,
    icon: "ScanEye",
    isDefault: false,
  },
]

const categoriesSchema = z.array(mailCategorySchema).superRefine((cats, ctx) => {
  const orders = cats.map((c) => c.order)
  if (new Set(orders).size !== orders.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Each mail category must have a unique order number",
    })
  }

  const defaultCount = cats.filter((c) => c.isDefault).length
  if (defaultCount !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Exactly one mail category must be set as default",
    })
  }
})

export const userSettingsSchema = z.object({
  language: z.string(),
  timezone: z.string(),
  dynamicContent: z.boolean().optional(),
  externalImages: z.boolean(),
  customPrompt: z.string().default(""),
  isOnboarded: z.boolean().optional(),
  trustedSenders: z.string().array().optional(),
  colorTheme: z.enum(["light", "dark", "system"]).default("system"),
  categories: categoriesSchema.optional(),
  defaultEmailAlias: z.string().optional(),
  undoSendEnabled: z.boolean().default(false),
  imageCompression: z.enum(["low", "medium", "original"]).default("medium"),
  autoRead: z.boolean().default(true),
  animations: z.boolean().default(false),
})

export type UserSettings = z.infer<typeof userSettingsSchema>

export const createEventSchema = z.object({
  calendarId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  recurrence: z.array(z.string()).optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z.enum(["required", "optional"]).optional(),
      }),
    )
    .optional(),
  availability: z.enum(["busy", "free"]).optional(),
  visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
  color: z.string().optional(),
  conferenceLink: z.string().optional(),
})

export type CreateEventData = z.infer<typeof createEventSchema>

export const updateEventSchema = z.object({
  eventId: z.string().min(1),
  calendarId: z.string().min(1),
  scope: z.enum(["single", "all", "thisAndFollowing"]).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  allDay: z.boolean().optional(),
  location: z.string().optional(),
  recurrence: z.array(z.string()).optional(),
  attendees: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().optional(),
        role: z.enum(["required", "optional"]).optional(),
      }),
    )
    .optional(),
  availability: z.enum(["busy", "free"]).optional(),
  visibility: z.enum(["default", "public", "private", "confidential"]).optional(),
  color: z.string().optional(),
})

export type UpdateEventData = z.infer<typeof updateEventSchema>

export const deleteEventSchema = z.object({
  eventId: z.string().min(1),
  calendarId: z.string().min(1),
  scope: z.enum(["single", "all", "thisAndFollowing"]).optional(),
  sendNotifications: z.boolean().optional(),
})

export type DeleteEventData = z.infer<typeof deleteEventSchema>

export const defaultUserSettings: UserSettings = {
  language: "en",
  timezone: "UTC",
  dynamicContent: false,
  externalImages: true,
  customPrompt: "",
  trustedSenders: [],
  isOnboarded: false,
  colorTheme: "system",
  autoRead: true,
  defaultEmailAlias: "",
  categories: defaultMailCategories,
  undoSendEnabled: false,
  imageCompression: "medium",
  animations: false,
}
