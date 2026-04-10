"use client"

import { BimiAvatar } from "@/components/bimi-avatar"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { HugeiconsIcon } from "@hugeicons/react"
import { FavouriteIcon as StarSolidIcon } from "@hugeicons-pro/core-solid-rounded"
import { cn } from "@workspace/ui/lib/utils"

export interface MailListRowProps {
  title: string
  subtitle: string
  date?: string
  unread?: boolean
  starred?: boolean
  selected?: boolean
  checked?: boolean
  anyChecked?: boolean
  avatarEmail?: string
  avatarName?: string
  loading?: boolean
  onClick?: () => void
  onCheckChange?: (checked: boolean) => void
}

export function MailListRow({
  title,
  subtitle,
  date,
  unread,
  starred,
  selected,
  checked,
  anyChecked,
  avatarEmail,
  avatarName,
  loading,
  onClick,
  onCheckChange,
}: MailListRowProps) {
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
    <div
      className={cn("border-b select-none md:mt-1 md:border-none")}
      onClick={onClick}
    >
      {unread && (
        <span className="absolute top-1/2 left-2 z-10 size-2 -translate-y-1/2 rounded-full bg-[#006FFE]" />
      )}
      <div
        className={cn(
          "group relative mx-1 flex cursor-pointer flex-col items-start rounded-lg py-2 text-left text-sm hover:bg-accent hover:opacity-100",
          selected && "bg-accent/50 opacity-100"
        )}
      >
        <div
          className={cn(
            "relative flex w-full items-center justify-between gap-4 px-4",
            !unread && "opacity-60"
          )}
        >
          <div className="relative flex size-8 shrink-0 items-center justify-center">
            {/* Checkbox — visible on hover, or always when any selection active */}
            <div
              className={cn(
                "absolute inset-0 z-10 flex items-center justify-center transition-opacity",
                checked || anyChecked
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onCheckChange?.(!checked)}
              />
            </div>
            {/* Avatar — hidden on hover, or always hidden when any selection active */}
            <div
              className={cn(
                "transition-opacity",
                checked || anyChecked
                  ? "opacity-0"
                  : "group-hover:opacity-0",
              )}
            >
              <BimiAvatar email={avatarEmail} name={avatarName || avatarEmail} />
            </div>
          </div>

          <div className="w-full">
            <div className="flex w-full flex-row items-center justify-between">
              <div className="flex flex-row items-center gap-1">
                <span
                  className={cn(
                    "flex items-baseline gap-1 text-sm group-hover:opacity-100",
                    unread ? "font-bold" : "font-medium"
                  )}
                >
                  <span className="line-clamp-1 max-w-47.5 truncate overflow-hidden">
                    {title}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {starred && (
                  <HugeiconsIcon
                    icon={StarSolidIcon}
                    className="size-3 shrink-0 text-amber-400"
                  />
                )}
                {date && (
                  <p
                    className={cn(
                      "text-xs font-normal text-nowrap text-muted-foreground opacity-70 transition-opacity group-hover:opacity-100 dark:text-[#8C8C8C]",
                      selected && "opacity-100"
                    )}
                  >
                    {date}
                  </p>
                )}
              </div>
            </div>
            <p className="mt-1 line-clamp-1 w-[95%] min-w-0 overflow-hidden text-sm text-[#8C8C8C]">
              {subtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
