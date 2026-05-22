import { createContext, useContext, useState, useCallback, useRef } from 'react'

interface HighlightContextValue {
  highlightDates: Set<string>
  addHighlight: (dates: string[]) => void
}

const HighlightContext = createContext<HighlightContextValue>({
  highlightDates: new Set(),
  addHighlight: () => {},
})

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [highlightDates, setHighlightDates] = useState<Set<string>>(new Set())
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const addHighlight = useCallback((dates: string[]) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setHighlightDates(new Set(dates))
    timerRef.current = setTimeout(() => setHighlightDates(new Set()), 2000)
  }, [])

  return (
    <HighlightContext.Provider value={{ highlightDates, addHighlight }}>
      {children}
    </HighlightContext.Provider>
  )
}

export function useHighlight() {
  return useContext(HighlightContext)
}
