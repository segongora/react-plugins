/*! CalendarWidget v3 – input + popover via body portal (fixed positioning)
   Exposes window.CalendarWidget: { mount, unmount, getDate, setDate, open, close }
   Requires React 18 UMD + ReactDOM UMD loaded first.
*/
(function () {
  if (!window.React || !window.ReactDOM) {
    console.error("[CalendarWidget] React and ReactDOM must be loaded first.");
    return;
  }

  const { useMemo, useState, useEffect, useRef } = React;
  const { createRoot, createPortal } = ReactDOM;

  // ---------- utils ----------
  function clampMid(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
  function toISO(d){ const x=clampMid(d); const y=x.getFullYear(); const m=String(x.getMonth()+1).padStart(2,"0"); const da=String(x.getDate()).padStart(2,"0"); return `${y}-${m}-${da}`; }
  function addMonths(date, delta){ const d=new Date(date); d.setMonth(d.getMonth()+delta); return d; }
  function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
  function firstWeekday(y,m){ return new Date(y,m,1).getDay(); }
  const sameDay=(a,b)=> a&&b&&a.getTime()===b.getTime();

  // ---------- Calendar grid ----------
  function CalendarGrid({ viewRef, selected, onSelect, locale, theme, today }) {
    const themeVars = {
      dayFg: theme?.dayFg || "#111827",
      dayMutedFg: theme?.dayMutedFg || "#9ca3af",
      selectedBg: theme?.selectedBg || "#111827",
      todayRing: theme?.todayRing || "#111827",
      hoverBg: theme?.hoverBg || "#f3f4f6",
    };
    const styles = {
      gridHead:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"6px 8px",color:themeVars.dayMutedFg,fontSize:11,textTransform:"uppercase",letterSpacing:.4},
      gridBody:{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,padding:"4px 8px 10px"},
      empty:{height:36},
      dayBtn:{border:"none",background:"transparent",cursor:"pointer",height:36,borderRadius:10,fontSize:13,color:themeVars.dayFg,position:"relative"},
      dayInner:{width:28,height:28,lineHeight:"28px",borderRadius:999,display:"inline-block"},
      dot:{position:"absolute",width:6,height:6,borderRadius:999,background:themeVars.selectedBg,bottom:6,left:"50%",transform:"translateX(-50%)"},
      todayRing:{outline:`2px solid ${themeVars.todayRing}`,outlineOffset:"-2px"},
    };
    const weekDayLabels = useMemo(()=>{
      const base=new Date(2020,5,7); // Sunday
      return Array.from({length:7},(_,i)=> new Intl.DateTimeFormat(locale,{weekday:"short"}).format(new Date(base.getFullYear(),base.getMonth(),base.getDate()+i)));
    },[locale]);

    const grid = useMemo(()=>{
      const y=viewRef.getFullYear(), m=viewRef.getMonth();
      const first=firstWeekday(y,m), dim=daysInMonth(y,m);
      const cells=[];
      for(let i=0;i<first;i++) cells.push(null);
      for(let d=1; d<=dim; d++) cells.push(new Date(y,m,d));
      while(cells.length<42) cells.push(null);
      return cells;
    },[viewRef]);

    function withHover(base){ return {
      ...base,
      onMouseEnter:(e)=> e.currentTarget.style.background = themeVars.hoverBg,
      onMouseLeave:(e)=> e.currentTarget.style.background = "transparent",
    };}

    return (
      React.createElement(React.Fragment,null,
        React.createElement("div",{style:styles.gridHead},
          weekDayLabels.map((w,i)=> React.createElement("div",{key:i,style:{textAlign:"center"}},w))
        ),
        React.createElement("div",{style:styles.gridBody},
          grid.map((cell,i)=>{
            if(!cell) return React.createElement("div",{key:i,style:styles.empty});
            const isSel = sameDay(cell, selected);
            const isToday = sameDay(cell, today);
            const btn = {...styles.dayBtn};
            if (isToday) Object.assign(btn, styles.todayRing);
            return React.createElement("button",{
              key:i,
              ...withHover(btn),
              onClick:()=> onSelect(clampMid(cell)),
              "aria-pressed":isSel,
              "aria-label":`Select ${cell.toDateString()}`
            },
              React.createElement("span",{style:styles.dayInner}, cell.getDate()),
              isSel && React.createElement("span",{style:styles.dot})
            );
          })
        )
      )
    );
  }

  // ---------- Popover via body portal ----------
  function Popover({ anchorEl, open, onClose, children, width=280, zIndex=999999, border="1px solid #e5e7eb", radius="12px", shadow="0 10px 30px rgba(0,0,0,.08)" }) {
    const paneRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0, placement: "bottom" });

    function compute() {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const paneH = paneRef.current ? paneRef.current.offsetHeight : 320; // estimate first frame
      let left = Math.min(Math.max(8, rect.left), vw - width - 8);
      let top = rect.bottom + 8;
      let placement = "bottom";
      if (top + paneH > vh - 8 && rect.top - 8 - paneH >= 8) {
        top = rect.top - paneH - 8; // flip above if not enough space
        placement = "top";
      }
      setPos({ top, left, placement });
    }

    // Recompute on open, scroll, resize, and visual viewport changes
    useEffect(()=>{
      if (!open) return;
      compute();
      const onScroll = () => compute();
      const onResize = () => compute();
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
      const obs = new MutationObserver(() => compute());
      obs.observe(document.body, { attributes: true, childList: false, subtree: false });
      return () => {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize);
        if (window.visualViewport) window.visualViewport.removeEventListener("resize", onResize);
        obs.disconnect();
      };
    }, [open, anchorEl]);

    // close on outside click / Esc
    useEffect(()=>{
      if (!open) return;
      function onDocDown(e){
        const pane = paneRef.current;
        if (!pane) return;
        if (pane.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
        onClose && onClose();
      }
      function onKey(e){ if(e.key==="Escape") onClose && onClose(); }
      document.addEventListener("mousedown", onDocDown);
      document.addEventListener("keydown", onKey);
      return ()=>{ document.removeEventListener("mousedown", onDocDown); document.removeEventListener("keydown", onKey); };
    }, [open, anchorEl, onClose]);

    if (!open) return null;

    const pane = React.createElement(
      "div",
      {
        ref: paneRef,
        style: {
          position: "fixed",
          top: `${pos.top}px`,
          left: `${pos.left}px`,
          width: `${width}px`,
          background: "#fff",
          border,
          borderRadius: radius,
          boxShadow: shadow,
          zIndex,
          overflow: "hidden"
        },
        role: "dialog",
        "aria-modal": "true"
      },
      children
    );

    return createPortal(pane, document.body);
  }

  // ---------- Full widget (input + portal popover) ----------
  function CalendarWidgetView({ initialDate, locale="en-US", onChange, theme, inputFormat="yyyy-MM-dd" }) {
    const themeVars = {
      fontFamily: theme?.fontFamily || "system-ui,-apple-system,Segoe UI,Roboto,Arial",
      radius: theme?.radius || "12px",
      border: theme?.border || "1px solid #e5e7eb",
      headerBg: theme?.headerBg || "#fff",
      headerFg: theme?.headerFg || "#111827",
      navHover: theme?.navHover || "#f3f4f6",
      paneShadow: theme?.paneShadow || "0 10px 30px rgba(0,0,0,.08)",
      zIndex: theme?.zIndex ?? 999999,
      inputBorder: theme?.inputBorder || "1px solid #d1d5db",
      inputRadius: theme?.inputRadius || "10px",
      inputPadding: theme?.inputPadding || "8px 10px",
    };

    const today = useMemo(()=> clampMid(new Date()), []);
    const initial = useMemo(()=>{
      const d = initialDate ? clampMid(new Date(initialDate)) : today;
      return isNaN(d) ? today : d;
    }, [initialDate, today]);

    const [selected, setSelected] = useState(initial);
    const [viewRef, setViewRef] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
    const [open, setOpen] = useState(false);
    const inputRef = useRef(null);

    useEffect(()=>{ setSelected(initial); setViewRef(new Date(initial.getFullYear(), initial.getMonth(), 1)); },[initialDate]);

    const monthLabel = useMemo(()=> new Intl.DateTimeFormat(locale,{month:"long",year:"numeric"}).format(viewRef), [viewRef, locale]);

    function formatDisplay(date){
      const yyyy=date.getFullYear(); const mm=String(date.getMonth()+1).padStart(2,"0"); const dd=String(date.getDate()).padStart(2,"0");
      return (inputFormat||"yyyy-MM-dd").replace(/yyyy/g,String(yyyy)).replace(/MM/g,mm).replace(/dd/g,dd);
    }

    function withHover(base, bg) {
      return { ...base,
        onMouseEnter:(e)=> e.currentTarget.style.background = bg ?? themeVars.navHover,
        onMouseLeave:(e)=> e.currentTarget.style.background = "transparent" };
    }

    function selectDay(d){
      setSelected(d);
      onChange && onChange(toISO(d), d);
      setOpen(false);
      setTimeout(()=> inputRef.current?.focus(), 0);
    }

    const styles = {
      root:{ fontFamily: themeVars.fontFamily, position:"relative", display:"inline-block" },
      input:{ border: themeVars.inputBorder, borderRadius: themeVars.inputRadius, padding: themeVars.inputPadding, minWidth: 180, lineHeight:"20px", fontSize:14, cursor:"pointer", background:"#fff" },
      header:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:themeVars.headerBg, color:themeVars.headerFg, borderBottom:"1px solid #e5e7eb" },
      navBtn:{ border:"none", background:"transparent", cursor:"pointer", width:32, height:32, borderRadius:8, fontSize:18, lineHeight:"32px", textAlign:"center" },
      label:{ fontWeight:600, fontSize:14 },
    };

    const paneContent = React.createElement(
      React.Fragment,
      null,
      React.createElement("div",{style:styles.header},
        React.createElement("button",{...withHover(styles.navBtn), "aria-label":"Previous month", onClick:()=> setViewRef(v=>addMonths(v,-1))},"‹"),
        React.createElement("div",{style:styles.label}, monthLabel),
        React.createElement("button",{...withHover(styles.navBtn), "aria-label":"Next month", onClick:()=> setViewRef(v=>addMonths(v, 1))},"›"),
      ),
      React.createElement(CalendarGrid,{viewRef, selected, onSelect:selectDay, locale, theme, today})
    );

    return (
      React.createElement("div",{style:styles.root},
        React.createElement("input",{
          ref: inputRef,
          type:"text",
          readOnly:true,
          value: formatDisplay(selected),
          onClick: ()=> setOpen(o=>!o),
          "aria-haspopup":"dialog",
          "aria-expanded": open ? "true" : "false",
          style: styles.input
        }),
        React.createElement(Popover, {
          anchorEl: inputRef.current,
          open,
          onClose: ()=> setOpen(false),
          width: 280,
          zIndex: themeVars.zIndex,
          border: themeVars.border,
          radius: themeVars.radius,
          shadow: themeVars.paneShadow
        }, paneContent)
      )
    );
  }

  // ---------- Mount API (same as before) ----------
  const _mounts = new Map(); // el -> { root, host, lastISO, controls }

  function _resolve(target){
    if (typeof target === "string") {
      const el = document.querySelector(target);
      if (!el) throw new Error(`[CalendarWidget] Target not found: ${target}`);
      return el;
    }
    return target;
  }

  function mount(target, opts = {}) {
    const el = _resolve(target);
    if (_mounts.has(el)) return;

    const host = document.createElement("div");
    host.className = "calendar-input-widget-host";
    el.appendChild(host);
    const root = createRoot(host);

    function emit(dateISO, dateObj) {
      el.dispatchEvent(new CustomEvent("calendar:change", { bubbles:true, detail:{ dateISO, date:dateObj }}));
    }

    let controlsRef = { openSetter:null, setExternalDate:null };

    // patched wrapper to capture internal setters
    function Wrapper(){
      const [iso, setIso] = useState(opts.initialDate ? toISO(new Date(opts.initialDate)) : null);
      const viewRef = useRef({ setOpen:null, setDate:null });

      // expose setters after first render
      useEffect(()=>{
        controlsRef.openSetter = (o)=> viewRef.current.setOpen && viewRef.current.setOpen(o);
        controlsRef.setExternalDate = (v)=> { setIso(v); viewRef.current.setDate && viewRef.current.setDate(v); };
      },[]);

      // inner with capture
      return React.createElement(function Inner(){
        const [open, _setOpen] = useState(false);
        const [selectedIso, _setSelectedIso] = useState(iso || toISO(new Date()));
        const onChange = (dIso, dObj) => { _setSelectedIso(dIso); emit(dIso, dObj); };

        // hand setters up
        useEffect(()=>{
          viewRef.current.setOpen = _setOpen;
          viewRef.current.setDate = (v)=> { _setSelectedIso(v); };
        },[]);

        return React.createElement(CalendarWidgetView, {
          initialDate: selectedIso,
          locale: opts.locale || "en-US",
          inputFormat: opts.inputFormat || "yyyy-MM-dd",
          theme: opts.theme,
          onChange
        });
      });
    }

    root.render(React.createElement(Wrapper));

    _mounts.set(el, {
      root,
      host,
      lastISO: opts.initialDate ? toISO(new Date(opts.initialDate)) : null,
      controls: {
        open: (o=true)=> controlsRef.openSetter && controlsRef.openSetter(o),
        close: ()=> controlsRef.openSetter && controlsRef.openSetter(false),
        setDateISO: (iso)=> controlsRef.setExternalDate && controlsRef.setExternalDate(iso),
      }
    });
  }

  function unmount(target){
    const el = _resolve(target);
    const slot = _mounts.get(el);
    if (!slot) return;
    slot.root.unmount();
    if (slot.host?.parentNode) slot.host.parentNode.removeChild(slot.host);
    _mounts.delete(el);
  }

  function setDate(target, dateISO){
    const el = _resolve(target);
    const slot = _mounts.get(el);
    if (!slot) throw new Error("[CalendarWidget] Not mounted.");
    slot.controls.setDateISO(dateISO);
    slot.lastISO = dateISO;
    el.dispatchEvent(new CustomEvent("calendar:change",{bubbles:true,detail:{dateISO}}));
  }

  function getDate(target){
    const el = _resolve(target);
    const slot = _mounts.get(el);
    return slot ? slot.lastISO : null;
  }

  function open(target){ const el=_resolve(target); const s=_mounts.get(el); s?.controls.open(true); }
  function close(target){ const el=_resolve(target); const s=_mounts.get(el); s?.controls.close(); }

  window.CalendarWidget = { mount, unmount, getDate, setDate, open, close };
})();
