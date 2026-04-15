import { useCallback, useMemo, useState } from "react"

const useSearchLabels = () => {
  const [data, setData] = useState<string | null>(null)

  const labels = useMemo(() => {
    return data?.split(",").map((label) => label.trim()) ?? []
  }, [data])

  const setLabels = useCallback(
    (labels: string[]) => {
      if (labels.length === 0) {
        setData(null)
        return
      }
      setData(labels.join(","))
    },
    [setData],
  )

  return { labels, setLabels }
}

export default useSearchLabels
