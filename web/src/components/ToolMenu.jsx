// ToolMenu — brand dropdown for the takeoff toolbar (and tab overflow).
// STACK-style state+switcher: the trigger face can show the currently armed
// tool while the panel switches it. Square corners, paper/ink/cobalt tokens.
//
// Beyond plain action items it also serves the two-deck toolbar's chips:
// `faceStyle`/`menuStyle` restyle the trigger and panel (scale chip, account
// chip), items may be `{ section }`, `"divider"`, `{ note }` (muted footnote),
// `{ custom }` (arbitrary row, e.g. the fill-sensitivity slider — interacting
// inside it never closes the menu), and `{ checked, stayOpen }` checkable
// items that flip in place (render menu). An item may carry `onHover(bool)` to
// preview its effect while pointed at (the scale menu's plan-says item shows
// the calibrated guide bar on the sheet behind the open menu).
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../brand/icons.jsx";

const MENU_W = 232;

export default function ToolMenu({ face, active = false, accent = "cobalt", title = "", items, onOpenChange, faceStyle, menuStyle, disabled = false, flyout = null, showChevron = true }) {
  const [open, setOpen] = useState(false);
  const [menuAt, setMenuAt] = useState(null); // fixed viewport anchor — escapes toolbar/rail overflow clipping
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onViewportMove = (event) => {
      // Scrolling a long Scale/Sheets menu is interaction WITH the portal,
      // not movement of its anchor. Toolbar/page scrolling still closes it.
      if (event.type === "scroll" && menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onViewportMove);
    window.addEventListener("scroll", onViewportMove, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onViewportMove);
      window.removeEventListener("scroll", onViewportMove, true);
    };
  }, [open]);

  // Notify strictly in open/close PAIRS: fire true only when opening, and repay
  // it in the cleanup — which also runs if the menu unmounts while open (e.g.
  // sign-out unmounts the account menu mid-click). Calling onOpenChange(open)
  // unconditionally would fire a stray `false` on every closed-menu mount and
  // never fire the closing `false` on unmount, leaking menuDepthRef either way.
  useEffect(() => {
    if (!open) return;
    onOpenChange?.(true);
    return () => onOpenChange?.(false);
  }, [open, onOpenChange]);

  const accentColor = accent === "danger" ? "var(--c-danger)" : "var(--cobalt)";
  const menuW = (menuStyle && parseInt(menuStyle.minWidth, 10)) || MENU_W;
  const toggle = () => {
    if (disabled) return;
    if (!open && rootRef.current) {
      const r = rootRef.current.getBoundingClientRect();
      const estimatedHeight = Math.min(items.length, 8) * 40 + 12;
      if (flyout === "right") {
        const left = Math.min(r.right + 6, window.innerWidth - menuW - 8);
        setMenuAt({ left: Math.max(8, left), top: Math.max(8, Math.min(r.top, window.innerHeight - estimatedHeight - 8)) });
      } else {
        const left = r.left + menuW > window.innerWidth - 8 ? r.right - menuW : r.left;
        setMenuAt({ left: Math.max(8, Math.min(left, window.innerWidth - menuW - 8)), top: r.bottom + 4 });
      }
    }
    setOpen((v) => !v);
  };

  const availableHeight = menuAt ? Math.max(120, window.innerHeight - menuAt.top - 8) : 120;
  const requestedMaxHeight = menuStyle?.maxHeight;
  const effectiveMaxHeight = requestedMaxHeight
    ? `min(${requestedMaxHeight}, ${availableHeight}px)`
    : availableHeight;

  const menu = open && menuAt ? (
    <div ref={menuRef} style={{
      position: "fixed", left: menuAt.left, top: menuAt.top,
      zIndex: 1000,
      minWidth: MENU_W, background: "var(--paper-bright)", border: "1px solid var(--ink)",
      boxShadow: "var(--shadow-2)", padding: "4px 0",
      ...menuStyle,
      maxHeight: effectiveMaxHeight,
      overflowY: menuStyle?.overflowY || "auto",
    }}>
      {items.map((it, i) => {
        if (it === "divider") return <div key={i} style={{ height: 1, background: "var(--ink-faint)", margin: "4px 0" }} />;
        if (it.section) return (
          <div key={i} style={{ padding: "6px 12px 3px", fontFamily: "var(--f-mono)", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-muted)" }}>{it.section}</div>
        );
        if (it.note) return (
          <div key={i} style={{ padding: "6px 12px 8px", fontSize: 11, color: "var(--ink-muted)", lineHeight: 1.4 }}>{it.note}</div>
        );
        if (it.custom) return <div key={it.id || i}>{it.custom}</div>;
        const dis = !!it.disabled;
        const checkable = "checked" in it;
        const fg = it.danger ? "var(--c-danger)" : "var(--ink)";
        return (
          <button key={it.id || i} type="button" disabled={dis} title={it.title || ""}
            onClick={() => { if (!dis) { if (!it.stayOpen) setOpen(false); it.onSelect?.(); } }}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 12px",
              border: "none", textAlign: "left", cursor: dis ? "default" : "pointer",
              background: it.active ? "var(--paper-cream)" : "transparent",
              borderLeft: it.active ? "2px solid var(--cobalt)" : "2px solid transparent",
              opacity: dis ? 0.38 : 1, color: fg,
            }}
            onMouseEnter={(e) => { if (!dis && !it.active) e.currentTarget.style.background = "var(--paper-shadow)"; if (!dis) it.onHover?.(true); }}
            onMouseLeave={(e) => { e.currentTarget.style.background = it.active ? "var(--paper-cream)" : "transparent"; if (!dis) it.onHover?.(false); }}>
            {checkable && <span style={{ display: "inline-flex", width: 15, justifyContent: "center", color: "var(--c-positive)", visibility: it.checked ? "visible" : "hidden" }}><Icon name="check" size={14} /></span>}
            {it.icon && <span style={{ display: "inline-flex", width: 17, justifyContent: "center", color: it.tint || fg }}><Icon name={it.icon} size={16} /></span>}
            <span style={{ flex: 1, fontFamily: "var(--f-body)", fontSize: 13, fontWeight: it.active ? 600 : 400 }}>{it.label}</span>
            {it.shortcut && <span style={{ fontFamily: "var(--f-mono)", fontSize: 10, color: "var(--ink-muted)" }}>{it.shortcut}</span>}
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <span ref={rootRef} style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" onClick={toggle} title={title} disabled={disabled}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, padding: "6px 10px", cursor: disabled ? "default" : "pointer",
          border: `1px solid ${active ? accentColor : "var(--ink-faint)"}`,
          background: active ? accentColor : (open ? "var(--paper-shadow)" : "transparent"),
          color: active ? "var(--paper-bright)" : "var(--ink)",
          opacity: disabled ? 0.38 : 1,
          fontFamily: "var(--f-body)", fontSize: 12.5, fontWeight: 600, lineHeight: 1,
          ...faceStyle,
        }}>
        {face}
        {showChevron && <span style={{ display: "inline-flex", opacity: 0.7 }}><Icon name="chevronDown" size={11} /></span>}
      </button>
      {menu && createPortal(menu, document.body)}
    </span>
  );
}
