import { useEffect, useState } from "react";
import { Toaster } from "sonner";

/** Sonner toaster that follows the `dark` class on <html> (set by the theme toggle). */
export function ThemedToaster() {
  const read = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = useState<"dark" | "light">(read);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  return <Toaster position="bottom-right" theme={theme} richColors closeButton />;
}
