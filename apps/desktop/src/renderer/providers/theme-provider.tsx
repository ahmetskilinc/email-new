import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

type Theme = "light" | "dark" | "system"

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  resolvedTheme: "light" | "dark"
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  resolvedTheme: "light",
})

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) ?? "system"
  })
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme") as Theme
    return saved === "system" || !saved ? getSystemTheme() : saved
  })

  useEffect(() => {
    localStorage.setItem("theme", theme)
    const resolved = theme === "system" ? getSystemTheme() : theme
    setResolvedTheme(resolved)

    const root = document.documentElement
    root.classList.remove("light", "dark")
    root.classList.add(resolved)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => {
      if (theme === "system") {
        const resolved = getSystemTheme()
        setResolvedTheme(resolved)
        const root = document.documentElement
        root.classList.remove("light", "dark")
        root.classList.add(resolved)
      }
    }
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
