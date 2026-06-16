// Returns true when the viewport is at or below `breakpoint` (default 768px).
// Uses a matchMedia listener so it updates as the window crosses the breakpoint.
// SSR-safe: guards `window` and defaults to false when it isn't available.
import { useEffect, useState } from "react";

export default function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return isMobile;
}
