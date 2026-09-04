import React, { useLayoutEffect, useRef } from "react";

// Use the available width, not a fixed number of tabs. Keep the active tab in
// view on a laptop without growing the toolbar or scrolling the plan itself.
export default function SheetTabViewport({ activeKey, children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const rail = ref.current;
    const reveal = () => {
      const tab = [...rail.children].find(node => node.dataset.sheetTab === activeKey);
      if (!tab) return;
      const outer = rail.getBoundingClientRect(), inner = tab.getBoundingClientRect();
      if (inner.left < outer.left) rail.scrollLeft -= outer.left - inner.left;
      else if (inner.right > outer.right) rail.scrollLeft += inner.right - outer.right;
    };
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [activeKey, children]);
  return <div ref={ref} data-testid="sheet-tabs-scroll" style={{ display: "flex", alignItems: "center", gap: "var(--sp-1)", flex: "1 1 0", minWidth: 0, overflowX: "auto", scrollbarWidth: "thin" }}>{children}</div>;
}
