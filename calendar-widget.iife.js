/*! CalendarWidget v6 — Input + portal popover (Bubble-safe)
    Requires React 18 UMD + ReactDOM UMD (globals).
    Exposes window.CalendarWidget: { mount, unmount, setDate, getDate, open, close }
*/
(function () {
  if (!window.React || !window.ReactDOM) {
    console.error("[CalendarWidget] React and ReactDOM must be loaded first.");
    return;
  }

  const { useMemo, useState, useEffect, useRef } = React;
  const { createRoot, createPortal } = ReactDOM;

  // ---------------- utils ----------------
  const clampMid = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
  const toISO = d => {
    if (!d) return null;
    const x = clampMid(d);
    return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
  };
  // Parse "YYYY-MM-DD" as a LOCAL date (prevents UTC -> previous day)
  function fromISODateLocal(iso) {
    if (typeof iso === "string") {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]); // local midnight
    }
    const d = new Date(iso);
    if (isNaN(d)) return d;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()); // local midnight
  }

  const addMonths = (date, delta) => { const d=new Date(date); d.setMonth(d.getMonth()+delta); return d; };
  const daysInMonth = (y,m) => new Date(y,m+1,0).getDate();
  const firstWeekday = (y,m) => new Date(y,m,1).getDay(); // Sun=0
  const sameDay = (a,b) => a && b && a.getTime() === b.getTime();

  /** Display formatter (safe). Tokens: yyyy, MMM, MM, dd, d  */
  function formatDisplay(date, pattern = "MMM d, yyyy", locale = "en-US") {
    if (!date) return "";
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const MMM = new Intl.DateTimeFormat(locale, { month: "short" }).format(date); // e.g., "Oct"
    return pattern
      .replace(/yyyy/g, String(y))
      .replace(/MMM/g, MMM)
      .replace(/MM/g, String(m).padStart(2, "0"))
      .replace(/dd/g, String(d).padStart(2, "0"))
      .replace(/(?<!d)d/g, String(d)); // single d (no leading zero)
  }

  // ---------------- Popover (portal to body) ----------------
  function Popover({ anchorEl, open, onClose, width=360, zIndex=999999 }) {
    const paneRef = useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    function compute() {
      if (!anchorEl) return;
      const rect = anchorEl.getBoundingClientRect();
      const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const paneH = paneRef.current ? paneRef.current.offsetHeight : 360;
      let left = Math.min(Math.max(12, rect.left), vw - width - 12);
      let top = rect.bottom + 8;
      if (top + paneH > vh - 12 && rect.top - paneH - 8 >= 12) {
        top = rect.top - paneH - 8; // flip above
      }
      setPos({ top, left });
    }

    useEffect(()=>{
      if (!open) return;
      compute();
      const onScroll = () => compute();
      const onResize = () => compute();
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);
      return ()=> {
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize);
        if (window.visualViewport) window.visualViewport.removeEventListener("resize", onResize);
      };
    }, [open, anchorEl]);

    useEffect(()=>{
      if (!open) return;
      function onDown(e){
        const pane = paneRef.current;
        if (!pane) return;
        if (pane.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
        onClose && onClose();
      }
      function onKey(e){ if (e.key === "Escape") onClose && onClose(); }
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      return ()=> {
        document.removeEventListener("mousedown", onDown);
        document.removeEventListener("keydown", onKey);
      };
    }, [open, anchorEl, onClose]);

    if (!open) return null;

    const pane = React.createElement("div", {
      ref: paneRef,
      style: {
        position: "fixed",
        top: `${pos.top}px`,
        left: `${pos.left}px`,
        width: `${width}px`,
        background: "#fff",
        borderRadius: "18px",
        boxShadow: "0 18px 40px rgba(0,0,0,.12)",
        border: "1px solid rgba(0,0,0,.06)",
        zIndex,
        overflow: "hidden"
      },
      role: "dialog",
      "aria-modal": "true"
    }, arguments[0].children);

    return createPortal(pane, document.body);
  }

  // ---------------- Calendar Grid ----------------
  function CalendarGrid({ viewRef, selected, onSelect, locale, today }) {
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

    const styles = {
      headRow: {
        display:"grid", gridTemplateColumns:"repeat(7,1fr)",
        padding:"10px 16px", color:"#6b7280", fontSize:12
      },
      headCell: { textAlign:"center", fontWeight:500 },
      grid: {
        display:"grid", gridTemplateColumns:"repeat(7,1fr)",
        gap: 8, padding: "12px 16px 16px"
      },
      dayBtn: {
        height: 40, border: "1px solid #e5e7eb", borderRadius: 12,
        background: "#f8fafc", color:"#111827", fontSize:14,
        display:"flex", alignItems:"center", justifyContent:"center",
        cursor:"pointer", transition:"box-shadow .2s, transform .02s"
      },
      dayToday: { outline:"2px solid #2563eb", outlineOffset:"-2px", background:"#f0f7ff" },
      daySel: {
        background: "linear-gradient(180deg, #5a7cfb 0%, #4f56ee 100%)",
        color:"#fff", border:"1px solid transparent",
        boxShadow:"0 8px 18px rgba(79,86,238,.35)"
      }
    };

    return (
      React.createElement(React.Fragment,null,
        React.createElement("div",{style:styles.headRow},
          weekDayLabels.map((w,i)=> React.createElement("div",{key:i,style:styles.headCell}, w))
        ),
        React.createElement("div",{style:styles.grid},
          grid.map((cell,i)=>{
            if(!cell) return React.createElement("div",{key:i});
            const isSel = selected && sameDay(cell, selected);
            const isToday = sameDay(cell, today);
            const base = {...styles.dayBtn};
            if (isSel) Object.assign(base, styles.daySel);
            else if (isToday) Object.assign(base, styles.dayToday);
            return React.createElement("button",{
              key:i,
              style:base,
              onClick:()=> onSelect(clampMid(cell)),
              "aria-pressed": !!isSel,
              "aria-label": `Select ${cell.toDateString()}`
            }, cell.getDate());
          })
        )
      )
    );
  }

  // ---------------- Main View (input + popover) ----------------
  function CalendarWidgetView({ initialDate, locale="en-US", onChange, inputFormat="MMM d, yyyy" }) {
    const today = useMemo(()=> clampMid(new Date()), []);
    const initial = useMemo(()=>{
      if (!initialDate) return null;               // <— empty by default
      const d = fromISODateLocal(initialDate);
      return isNaN(d) ? null : clampMid(d);
    }, [initialDate]);

    const [selected, setSelected] = useState(initial); // can be null
    const [viewRef, setViewRef] = useState(() => {
      const base = initial || today;
      return new Date(base.getFullYear(), base.getMonth(), 1);
    });
    const [open, setOpen] = useState(false);
    const inputRef = useRef(null);

    // If external initialDate changes
    useEffect(()=>{
      if (initial) {
        setSelected(initial);
        setViewRef(new Date(initial.getFullYear(), initial.getMonth(), 1));
      } else {
        setSelected(null);
        const base = today;
        setViewRef(new Date(base.getFullYear(), base.getMonth(), 1));
      }
    }, [initial, today]);

    const monthLabel = useMemo(()=> new Intl.DateTimeFormat(locale,{month:"long",year:"numeric"}).format(viewRef), [viewRef, locale]);

    const styles = {
      root:{ fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,Arial", position:"relative", display:"inline-block" },
      inputWrap:{
        display:"flex", alignItems:"center", gap:8, padding:"10px 12px",
        borderRadius: 12, border:"1px solid #e5e7eb", background:"#fff",
        minWidth: 280, boxShadow:"0 1px 2px rgba(0,0,0,.04)", cursor:"pointer"
      },
      input:{
        flex:1, border:"none", outline:"none", fontSize:14, background:"transparent",
        color:"#111827"
      },
      icon:{ width:18, height:18, opacity:.6 },
      header:{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        padding:"14px 16px",
        background:"linear-gradient(180deg, #eef3ff 0%, #e9f0ff 100%)",
        borderBottom:"1px solid #e7ebff"
      },
      navBtn:{
        width:36, height:36, borderRadius:10, border:"1px solid #dbe1ff",
        background:"#fff", cursor:"pointer", fontSize:18, lineHeight:"34px",
        boxShadow:"0 1px 2px rgba(0,0,0,.04)"
      },
      monthLabel:{ fontWeight:700, fontSize:18, color:"#111827" },
      footerWrap:{ padding:"0 16px 16px" },
      todayBtn:{
        width:"100%", height:44, borderRadius:14,
        background:"linear-gradient(180deg, #5a7cfb 0%, #4f56ee 100%)",
        color:"#fff", border:"none", fontSize:16, fontWeight:600,
        cursor:"pointer", boxShadow:"0 10px 24px rgba(79,86,238,.35)"
      }
    };

    function selectDay(d){
      setSelected(d);
      onChange && onChange(toISO(d), d);
      setOpen(false);
      setTimeout(()=> inputRef.current?.focus(), 0);
    }

    return (
      React.createElement("div",{style:styles.root},
        React.createElement("div",{style:styles.inputWrap, onClick:()=> setOpen(o=>!o)},
          React.createElement("input",{
            ref: inputRef, type:"text", readOnly:true,
            value: selected ? formatDisplay(selected, inputFormat, locale) : "",
            placeholder: "Select a date",
            style:styles.input,
            "aria-haspopup":"dialog", "aria-expanded": open ? "true" : "false"
          }),
          React.createElement("svg",{viewBox:"0 0 24 24", style:styles.icon, "aria-hidden":"true"},
            React.createElement("path",{fill:"currentColor", d:"M7 2a1 1 0 0 0-1 1v1H5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3h-1V3a1 1 0 1 0-2 0v1H8V3a1 1 0 0 0-1-1Zm12 7H5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9Z"})
          )
        ),

        React.createElement(Popover,{
          anchorEl: inputRef.current,
          open,
          onClose: ()=> setOpen(false),
          width: 360
        },
          React.createElement("div", null,
            React.createElement("div",{style:styles.header},
              React.createElement("button",{style:styles.navBtn, "aria-label":"Previous month", onClick:()=> setViewRef(v=>addMonths(v,-1))},"‹"),
              React.createElement("div",{style:styles.monthLabel}, monthLabel),
              React.createElement("button",{style:styles.navBtn, "aria-label":"Next month", onClick:()=> setViewRef(v=>addMonths(v, 1))},"›"),
            ),
            React.createElement(CalendarGrid,{viewRef, selected, onSelect:selectDay, locale, today}),
            React.createElement("div",{style:styles.footerWrap},
              React.createElement("button",{style:styles.todayBtn, onClick:()=> selectDay(today)}, "Today")
            )
          )
        )
      )
    );
  }

  // ---------------- Mount API ----------------
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
    host.className = "calendar-widget-host";
    el.appendChild(host);
    const root = createRoot(host);

    function emit(dateISO, dateObj) {
      el.dispatchEvent(new CustomEvent("calendar:change", { bubbles:true, detail:{ dateISO, date:dateObj }}));
    }

    let ctrl = { openSetter:null, setIso:null };

    function Wrapper(){
      // Keep ISO in wrapper; view gets it via props
      const [iso, setIso] = useState(
        opts.initialDate ? toISO(fromISODateLocal(opts.initialDate)) : null
      );
      useEffect(()=>{ ctrl.setIso = (v)=> setIso(v || null); },[]);
      return React.createElement(function Inner(){
        const [open, setOpen] = useState(false);
        useEffect(()=>{ ctrl.openSetter = (v)=> setOpen(!!v); },[]);

        return React.createElement(CalendarWidgetView, {
          initialDate: iso || undefined, // undefined => empty input
          locale: opts.locale || "en-US",
          inputFormat: opts.inputFormat || "MMM d, yyyy",
          onChange: (dIso, dObj)=> { setIso(dIso); emit(dIso, dObj); }
        });
      });
    }

    root.render(React.createElement(Wrapper));

    _mounts.set(el, {
      root,
      host,
      lastISO: opts.initialDate ? toISO(fromISODateLocal(opts.initialDate)) : null,
      controls: {
        open: (o=true)=> ctrl.openSetter && ctrl.openSetter(o),
        close: ()=> ctrl.openSetter && ctrl.openSetter(false),
        setDateISO: (iso)=> ctrl.setIso && ctrl.setIso(iso || null),
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
    slot.lastISO = dateISO || null;
    el.dispatchEvent(new CustomEvent("calendar:change",{bubbles:true,detail:{dateISO: dateISO || null}}));
  }

  function getDate(target){
    const el = _resolve(target);
    const slot = _mounts.get(el);
    return slot ? (slot.lastISO || null) : null;
  }

  function open(target){ const el=_resolve(target); const s=_mounts.get(el); s?.controls.open(true); }
  function close(target){ const el=_resolve(target); const s=_mounts.get(el); s?.controls.close(); }

  window.CalendarWidget = { mount, unmount, setDate, getDate, open, close };
})();
