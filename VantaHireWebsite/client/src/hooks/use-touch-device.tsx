import * as React from "react";

export function useIsTouchDevice() {
  const [isTouchDevice, setIsTouchDevice] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouchDevice(coarsePointerQuery.matches);

    update();
    coarsePointerQuery.addEventListener("change", update);

    return () => coarsePointerQuery.removeEventListener("change", update);
  }, []);

  return isTouchDevice;
}
