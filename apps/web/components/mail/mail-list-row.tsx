"use client"

import * as React from "react"
import { BimiAvatar } from "@/components/bimi-avatar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { HugeiconsIcon } from "@hugeicons/react"
import { FavouriteIcon as StarSolidIcon } from "@hugeicons-pro/core-solid-rounded"
import {
  FavouriteIcon as StarOutlineIcon,
  Attachment01Icon,
} from "@hugeicons-pro/core-stroke-rounded"
import { cn } from "@workspace/ui/lib/utils"

export interface MailListRowProps {
  layout?: "split" | "centered"
  title: string
  subtitle: string
  snippet?: string
  date?: string
  unread?: boolean
  starred?: boolean
  selected?: boolean
  checked?: boolean
  anyChecked?: boolean
  hasAttachments?: boolean
  avatarEmail?: string
  avatarName?: string
  loading?: boolean
  onClick?: () => void
  onCheckChange?: (checked: boolean) => void
  onStarToggle?: () => void
}

function MailListRowInner({
  layout = "split",
  title,
  subtitle,
  snippet,
  date,
  unread,
  starred,
  selected,
  checked,
  anyChecked,
  hasAttachments,
  avatarEmail,
  avatarName,
  loading,
  onClick,
  onCheckChange,
  onStarToggle,
}: MailListRowProps) {
  const isCentered = layout === "centered"
  if (loading) {
    return (
      <div className="border-b select-none md:my-1 md:border-none">
        <div className="group relative mx-1 flex cursor-pointer flex-col items-start py-2 text-left text-sm hover:bg-accent hover:opacity-100">
          <div className="flex w-full items-center justify-between gap-4 px-4">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex w-full flex-col gap-1 group-hover:opacity-100">
              <Skeleton className="h-[19.99px] w-32" />
              <Skeleton className="h-[19.99px] w-48" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("relative border-b select-none md:mt-1 md:border-none")}>
      {unread && (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-2 z-10 size-2 -translate-y-1/2 rounded-full bg-primary"
        />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-selected={selected ?? false}
        aria-label={`${unread ? "Unread, " : ""}${title}: ${subtitle}`}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            onClick?.()
          }
        }}
        className={cn(
          "group relative mx-1 flex cursor-pointer flex-col items-start rounded-lg py-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50",
          selected && "bg-accent/50"
        )}
      >
        <div className="relative flex w-full items-center justify-between gap-4 px-4">
          <div className="relative flex size-8 shrink-0 items-center justify-center">
            {/* Checkbox — visible on hover/focus, or always when any selection active */}
            <div
              className={cn(
                "absolute inset-0 z-10 flex items-center justify-center transition-opacity",
                checked || anyChecked
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onCheckChange?.(!checked)}
                aria-label={`Select ${title}`}
              />
            </div>
            {/* Avatar — hidden on hover/focus, or always hidden when any selection active */}
            <div
              className={cn(
                "transition-opacity",
                checked || anyChecked
                  ? "opacity-0"
                  : "group-hover:opacity-0 group-focus-within:opacity-0"
              )}
            >
              <BimiAvatar
                email={avatarEmail}
                name={avatarName || avatarEmail}
              />
            </div>
          </div>

          <div className="w-full min-w-0">
            <div className="flex w-full flex-row items-center justify-between">
              <div
                className={cn(
                  "flex flex-row items-center gap-1",
                  isCentered && "shrink-0"
                )}
              >
                <span
                  className={cn(
                    "flex items-baseline gap-1 text-sm",
                    unread
                      ? "font-semibold text-foreground"
                      : "font-normal text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "line-clamp-1 truncate overflow-hidden",
                      isCentered ? "w-48" : "max-w-47.5"
                    )}
                  >
                    {title}
                  </span>
                </span>
              </div>
              {isCentered && (
                <p className="mx-3 min-w-0 flex-1 truncate text-sm">
                  <span
                    className={cn(
                      "text-foreground",
                      unread ? "font-medium" : "font-normal"
                    )}
                  >
                    {subtitle}
                  </span>
                  {snippet && (
                    <span className="text-muted-foreground">
                      {" — "}
                      {snippet}
                    </span>
                  )}
                </p>
              )}
              <div className="flex shrink-0 items-center gap-1.5">
                {hasAttachments && (
                  <HugeiconsIcon
                    icon={Attachment01Icon}
                    aria-label="Has attachments"
                    className="size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <button
                  type="button"
                  aria-label={starred ? "Unstar" : "Star"}
                  onClick={(e) => {
                    e.stopPropagation()
                    onStarToggle?.()
                  }}
                  className={cn(
                    "shrink-0 transition-colors",
                    starred
                      ? "text-amber-400 hover:text-amber-500"
                      : "text-transparent group-hover:text-muted-foreground/40 group-focus-within:text-muted-foreground/40 hover:text-muted-foreground"
                  )}
                >
                  <HugeiconsIcon
                    icon={starred ? StarSolidIcon : StarOutlineIcon}
                    className="size-3.5"
                  />
                </button>
                {date && (
                  <p
                    className={cn(
                      "text-xs font-normal text-nowrap text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                      (selected || unread) && "opacity-100"
                    )}
                  >
                    {date}
                  </p>
                )}
              </div>
            </div>
            {!isCentered && (
              <>
                <p
                  className={cn(
                    "mt-0.5 line-clamp-1 w-[95%] min-w-0 truncate overflow-hidden text-sm text-foreground",
                    unread ? "font-medium" : "font-normal"
                  )}
                >
                  {subtitle}
                </p>
                {snippet && (
                  <p className="line-clamp-1 w-[95%] min-w-0 truncate overflow-hidden text-sm text-muted-foreground">
                    {snippet}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export const MailListRow = React.memo(MailListRowInner)
