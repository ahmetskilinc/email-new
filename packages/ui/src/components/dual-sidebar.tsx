"use client"

import * as React from "react"

import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { HugeiconsIcon } from "@hugeicons/react"
import { SidebarLeftIcon } from "@hugeicons/core-free-icons"

import {
  SidebarContext,
  type SidebarContextProps,
} from "@workspace/ui/components/sidebar"

// Re-export all presentational sub-components that don't need dual-sidebar awareness
export {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarSeparator,
} from "@workspace/ui/components/sidebar"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"
const SIDEBAR_RIGHT_KEYBOARD_SHORTCUT = "n"

type DualSidebarState = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  toggleSidebar: () => void
}

type DualSidebarContextProps = {
  left: DualSidebarState
  right: DualSidebarState
  isMobile: boolean
}

const DualSidebarContext = React.createContext<DualSidebarContextProps | null>(
  null
)
const DualSidebarInnerContext = React.createContext<"left" | "right" | null>(
  null
)

function useDualSidebar() {
  const context = React.useContext(DualSidebarContext)
  const side = React.useContext(DualSidebarInnerContext)

  if (!context) {
    throw new Error("useDualSidebar must be used within a DualSidebarProvider.")
  }

  const currentSide = side || "left"

  return {
    ...context[currentSide],
    isMobile: context.isMobile,
    side: currentSide,
  }
}

function useDualSidebarWithSide(side: "left" | "right") {
  const context = React.useContext(DualSidebarContext)

  if (!context) {
    throw new Error(
      "useDualSidebarWithSide must be used within a DualSidebarProvider."
    )
  }

  return {
    ...context[side],
    isMobile: context.isMobile,
    side,
  }
}

function DualSidebarProvider({
  defaultOpenLeft = true,
  defaultOpenRight = true,
  openLeft: openLeftProp,
  openRight: openRightProp,
  onOpenChangeLeft: setOpenLeftProp,
  onOpenChangeRight: setOpenRightProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  defaultOpenLeft?: boolean
  defaultOpenRight?: boolean
  openLeft?: boolean
  openRight?: boolean
  onOpenChangeLeft?: (open: boolean) => void
  onOpenChangeRight?: (open: boolean) => void
}) {
  const isMobile = useIsMobile()

  const [openMobileLeft, setOpenMobileLeft] = React.useState(false)
  const [_openLeft, _setOpenLeft] = React.useState(defaultOpenLeft)
  const openLeft = openLeftProp ?? _openLeft

  const [openMobileRight, setOpenMobileRight] = React.useState(false)
  const [_openRight, _setOpenRight] = React.useState(defaultOpenRight)
  const openRight = openRightProp ?? _openRight

  const setOpenLeft = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(openLeft) : value
      if (setOpenLeftProp) {
        setOpenLeftProp(openState)
      } else {
        _setOpenLeft(openState)
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}_left=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenLeftProp, openLeft]
  )

  const setOpenRight = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(openRight) : value
      if (setOpenRightProp) {
        setOpenRightProp(openState)
      } else {
        _setOpenRight(openState)
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}_right=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenRightProp, openRight]
  )

  const toggleSidebarLeft = React.useCallback(() => {
    return isMobile
      ? setOpenMobileLeft((open) => !open)
      : setOpenLeft((open) => !open)
  }, [isMobile, setOpenLeft])

  const toggleSidebarRight = React.useCallback(() => {
    return isMobile
      ? setOpenMobileRight((open) => !open)
      : setOpenRight((open) => !open)
  }, [isMobile, setOpenRight])

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key === SIDEBAR_KEYBOARD_SHORTCUT) {
          event.preventDefault()
          toggleSidebarLeft()
        } else if (event.key === SIDEBAR_RIGHT_KEYBOARD_SHORTCUT) {
          event.preventDefault()
          toggleSidebarRight()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebarLeft, toggleSidebarRight])

  const leftState: DualSidebarState = React.useMemo(
    () => ({
      state: openLeft ? "expanded" : "collapsed",
      open: openLeft,
      setOpen: setOpenLeft,
      openMobile: openMobileLeft,
      setOpenMobile: setOpenMobileLeft,
      toggleSidebar: toggleSidebarLeft,
    }),
    [openLeft, openMobileLeft, setOpenLeft, toggleSidebarLeft]
  )

  const rightState: DualSidebarState = React.useMemo(
    () => ({
      state: openRight ? "expanded" : "collapsed",
      open: openRight,
      setOpen: setOpenRight,
      openMobile: openMobileRight,
      setOpenMobile: setOpenMobileRight,
      toggleSidebar: toggleSidebarRight,
    }),
    [openRight, openMobileRight, setOpenRight, toggleSidebarRight]
  )

  const contextValue = React.useMemo<DualSidebarContextProps>(
    () => ({
      left: leftState,
      right: rightState,
      isMobile,
    }),
    [leftState, rightState, isMobile]
  )

  return (
    <DualSidebarContext.Provider value={contextValue}>
      <div
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </DualSidebarContext.Provider>
  )
}

function DualSidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}) {
  const context = React.useContext(DualSidebarContext)

  if (!context) {
    throw new Error("DualSidebar must be used within a DualSidebarProvider.")
  }

  const sideState = context[side]
  const { state, openMobile, setOpenMobile } = sideState
  const { isMobile } = context

  // Bridge to the original SidebarContext so sub-components like
  // SidebarMenuButton (which internally call useSidebar()) work correctly.
  const sidebarContextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state: sideState.state,
      open: sideState.open,
      setOpen: sideState.setOpen,
      openMobile: sideState.openMobile,
      setOpenMobile: sideState.setOpenMobile,
      isMobile,
      toggleSidebar: sideState.toggleSidebar,
    }),
    [sideState, isMobile]
  )

  if (collapsible === "none") {
    return (
      <SidebarContext.Provider value={sidebarContextValue}>
        <DualSidebarInnerContext.Provider value={side}>
          <div
            data-slot="sidebar"
            data-side={side}
            className={cn(
              "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
              className
            )}
            {...props}
          >
            {children}
          </div>
        </DualSidebarInnerContext.Provider>
      </SidebarContext.Provider>
    )
  }

  if (isMobile) {
    return (
      <SidebarContext.Provider value={sidebarContextValue}>
        <DualSidebarInnerContext.Provider value={side}>
          <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
            <SheetContent
              dir={dir}
              data-sidebar="sidebar"
              data-slot="sidebar"
              data-mobile="true"
              className="w-(--sidebar-width) bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden"
              style={
                {
                  "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
                } as React.CSSProperties
              }
              side={side}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Sidebar</SheetTitle>
                <SheetDescription>Displays the mobile sidebar.</SheetDescription>
              </SheetHeader>
              <div className="flex h-full w-full flex-col">{children}</div>
            </SheetContent>
          </Sheet>
        </DualSidebarInnerContext.Provider>
      </SidebarContext.Provider>
    )
  }

  return (
    <SidebarContext.Provider value={sidebarContextValue}>
      <DualSidebarInnerContext.Provider value={side}>
        <div
          className="group peer hidden text-sidebar-foreground md:block"
          data-state={state}
          data-collapsible={state === "collapsed" ? collapsible : ""}
          data-variant={variant}
          data-side={side}
          data-slot="sidebar"
        >
          {/* This is what handles the sidebar gap on desktop */}
          <div
            data-slot="sidebar-gap"
            className={cn(
              "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
              "group-data-[collapsible=offcanvas]:w-0",
              "group-data-[side=right]:rotate-180",
              variant === "floating" || variant === "inset"
                ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
                : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
            )}
          />
          <div
            data-slot="sidebar-container"
            className={cn(
              "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
              side === "left"
                ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
                : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
              variant === "floating" || variant === "inset"
                ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
                : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
              className
            )}
            {...props}
          >
            <div
              data-sidebar="sidebar"
              data-slot="sidebar-inner"
              className="flex size-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:shadow-sm group-data-[variant=floating]:ring-1 group-data-[variant=floating]:ring-sidebar-border"
            >
              {children}
            </div>
          </div>
        </div>
      </DualSidebarInnerContext.Provider>
    </SidebarContext.Provider>
  )
}

function DualSidebarTrigger({
  className,
  onClick,
  side,
  ...props
}: React.ComponentProps<typeof Button> & { side?: "left" | "right" }) {
  const contextSide = React.useContext(DualSidebarInnerContext)
  const targetSide = side || contextSide || "left"
  const { toggleSidebar } = useDualSidebarWithSide(targetSide)

  return (
    <Button
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      data-side={targetSide}
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <HugeiconsIcon
        icon={SidebarLeftIcon}
        strokeWidth={2}
        className={cn({
          "rotate-180": targetSide === "right",
        })}
      />
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
}

function DualSidebarRail({
  className,
  ...props
}: React.ComponentProps<"button">) {
  const { toggleSidebar } = useDualSidebar()

  return (
    <button
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:start-1/2 after:w-[2px] hover:after:bg-sidebar-border sm:flex ltr:-translate-x-1/2 rtl:-translate-x-1/2",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )
}

function DualSidebarInset({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return (
    <main
      data-slot="sidebar-inset"
      className={cn(
        "relative flex w-full flex-1 flex-col bg-background md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )
}

export {
  DualSidebar,
  DualSidebarInset,
  DualSidebarProvider,
  DualSidebarRail,
  DualSidebarTrigger,
  useDualSidebar,
  useDualSidebarWithSide,
}
