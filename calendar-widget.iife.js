/*! CalendarWidget v2 – Single-file IIFE with input + popover
    Exposes window.CalendarWidget: { mount, unmount, getDate, setDate, open, close }
    Requires window.React and window.ReactDOM (UMD) to be loaded first.
*/
(function () {
  if (!window.React || !window.ReactDOM) {
    console.error("[CalendarWidget] React and ReactDOM must be loaded first.");
    return;
  }

  const { useMemo, useState, useEffect, useRef } = React;
  const { createRoot } = ReactDOM;

  // ---------- utils ----------
  function clampMid(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function toISO(d){ const x=clampMid(d); const y=x.getFullYear(); const m=String(x.getMonth()+1).padStart(2,"0"); const da=String(x.getDate()).padStart(2,"0"); return `${y}-${m}-${da}`; }
  function addMonths(date, delta){ const d=new Date(date); d.setMonth(d.getMonth()+delta); return d; }
  function daysInMonth(y,m){ return new Date(y,m+1,0).getDate(); }
  function firstWeekday(y,m){ return new Date(y,m,1).getDay(); }
  const sameDay=(a,b)=> a&&b&&a.getTime()===b.getTime();

  // ---------- Calendar only ----------
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

  // ---------- Full widget (input + popover) ----------
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
    const wrapRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(()=>{ setSelected(initial); setViewRef(new Date(initial.getFullYear(), initial.getMonth(), 1)); },[initialDate]);

    const monthLabel = useMemo(()=> new Intl.DateTimeFormat(locale,{month:"long",year:"numeric"}).format(viewRef), [viewRef, locale]);

    // close on outside click / Esc
    useEffect(()=>{
      function onDocClick(e){
        if (!wrapRef.current) return;
        if (!wrapRef.current.contains(e.target)) setOpen(false);
      }
      function onKey(e){ if(e.key==="Escape") setOpen(false); }
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
      return ()=>{ document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
    },[]);

    function formatDisplay(date){
      // ultra-light formatter: supports "yyyy-MM-dd" or "dd/MM/yyyy"
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth()+1).padStart(2,"0");
      const dd = String(date.getDate()).padStart(2,"0");
      return inputFormat
        .replace(/yyyy/g, String(yyyy))
        .replace(/MM/g, mm)
        .replace(/dd/g, dd);
    }

    function selectDay(d){
      setSelected(d);
      onChange && onChange(toISO(d), d);
      setOpen(false);
      // return focus to input for accessibility
      setTimeout(()=> inputRef.current?.focus(), 0);
    }

    function withHover(base, bg) {
      return {
        ...base,
        onMouseEnter:(e)=> e.currentTarget.style.background = bg ?? themeVars.navHover,
        onMouseLeave:(e)=> e.currentTarget.style.background = "transparent",
      };
    }

    const styles = {
      root:{ fontFamily: themeVars.fontFamily, position:"relative", display:"inline-block" },
      input:{
        border: themeVars.inputBorder,
        borderRadius: themeVars.inputRadius,
        padding: themeVars.inputPadding,
        minWidth: 180,
        lineHeight: "20px",
        fontSize: 14,
        cursor: "pointer",
        background:"#fff",
      },
      pane:{
        position:"absolute",
        top:"calc(100% + 8px)",
        left:0,
        width:280,
        background:"#fff",
        border: themeVars.border,
        borderRadius: themeVars.radius,
        boxShadow: themeVars.paneShadow,
        zIndex: themeVars.zIndex,
        overflow:"hidden"
      },
      header:{
        display:"flex",alignItems:"center",justifyContent:"space-between",
        padding:"10px 12px",background:themeVars.headerBg,color:themeVars.headerFg,
        borderBottom:"1px solid #e5e7eb"
      },
      navBtn:{border:"none",background:"transparent",cursor:"pointer",width:32,height:32,borderRadius:8,fontSize:18,lineHeight:"32px",textAlign:"center"},
      label:{fontWeight:600,fontSize:14},
    };

    return (
      React.createElement("div",{ref:wrapRef,style:styles.root},
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
        open && React.createElement("div",{ role:"dialog", style:styles.pane},
          React.createElement("div",{style:styles.header},
            React.createElement("button",{...withHover(styles.navBtn), "aria-label":"Previous month", onClick:()=> setViewRef(v=>addMonths(v,-1))},"‹"),
            React.createElement("div",{style:styles.label}, monthLabel),
            React.createElement("button",{...withHover(styles.navBtn), "aria-label":"Next month", onClick:()=> setViewRef(v=>addMonths(v, 1))},"›"),
          ),
          React.createElement(CalendarGrid,{
            viewRef, selected, onSelect: selectDay, locale, theme, today
          })
        )
      )
    );
  }

  // ---------- Mount API ----------
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

    let openRef = { setOpen: null, setExternalDate: null };

    const onChange = (iso, d) => {
      const slot = _mounts.get(el);
      if (slot) slot.lastISO = iso;
      emit(iso, d);
    };

    // Wrap to capture setter refs
    function Wrapper(){
      const [dateISO, setDateISO] = useState(opts.initialDate ? toISO(new Date(opts.initialDate)) : null);
      const [externalBump, setExternalBump] = useState(0);
      const refObj = useRef({openSetter:null, dateSetter:null});

      useEffect(()=>{ openRef.setOpen = (o)=> refObj.current.openSetter?.(o); openRef.setExternalDate = (iso)=>{ setDateISO(iso); setExternalBump(x=>x+1); }; },[]);

      return React.createElement(CalendarWidgetView, {
        initialDate: dateISO || undefined,
        locale: opts.locale || "en-US",
        inputFormat: opts.inputFormat || "yyyy-MM-dd",
        theme: opts.theme,
        onChange,
        // Capture internal setState from child via props trick
        // We piggy-back by passing a function as theme.__internal to receive setters
        theme: { ...(opts.theme||{}), __internal: (o)=> { refObj.current.openSetter = o.openSetter; refObj.current.dateSetter = o.dateSetter; } }
      });
    }

    // Monkey-patch CalendarWidgetView to share setters (minimal intrusiveness)
    const _orig = CalendarWidgetView;
    CalendarWidgetView = function Patched(props){
      const [open, _setOpen] = useState(false);
      const [selected, setSelected] = useState(props.initialDate ? clampMid(new Date(props.initialDate)) : clampMid(new Date()));
      const [viewRef, setViewRef] = useState(new Date(selected.getFullYear(), selected.getMonth(), 1));
      const today = clampMid(new Date());
      const inputRef = useRef(null);
      const wrapRef = useRef(null);

      // wire into outer wrapper
      useEffect(()=>{
        if (props.theme && typeof props.theme.__internal === "function") {
          props.theme.__internal({ openSetter:_setOpen, dateSetter:(iso)=>{
            const d = clampMid(new Date(iso));
            setSelected(d);
            setViewRef(new Date(d.getFullYear(), d.getMonth(), 1));
          }});
        }
      },[]);

      // rebuild original behaviors with shared internals
      useEffect(()=>{ if(props.initialDate){ const d=clampMid(new Date(props.initialDate)); setSelected(d); setViewRef(new Date(d.getFullYear(), d.getMonth(), 1)); }},[props.initialDate]);

      function formatDisplay(date){
        const yyyy=date.getFullYear(); const mm=String(date.getMonth()+1).padStart(2,"0"); const dd=String(date.getDate()).padStart(2,"0");
        return (props.inputFormat||"yyyy-MM-dd").replace(/yyyy/g,String(yyyy)).replace(/MM/g,mm).replace(/dd/g,dd);
      }
      function withHover(base, bg){ return {...base, onMouseEnter:(e)=> e.currentTarget.style.background = bg || (props.theme?.navHover || "#f3f4f6"), onMouseLeave:(e)=> e.currentTarget.style.background="transparent"}; }
      function selectDay(d){ setSelected(d); props.onChange && props.onChange(toISO(d), d); _setOpen(false); setTimeout(()=> inputRef.current?.focus(),0); }

      // close on outside/Esc
      useEffect(()=>{
        function onDocClick(e){ if(!wrapRef.current) return; if(!wrapRef.current.contains(e.target)) _setOpen(false); }
        function onKey(e){ if(e.key==="Escape") _setOpen(false); }
        document.addEventListener("mousedown", onDocClick);
        document.addEventListener("keydown", onKey);
        return ()=>{ document.removeEventListener("mousedown", onDocClick); document.removeEventListener("keydown", onKey); };
      },[]);

      const monthLabel = new Intl.DateTimeFormat(props.locale||"en-US",{month:"long",year:"numeric"}).format(viewRef);

      const themeVars = {
        fontFamily: props.theme?.fontFamily || "system-ui,-apple-system,Segoe UI,Roboto,Arial",
        radius: props.theme?.radius || "12px",
        border: props.theme?.border || "1px solid #e5e7eb",
        headerBg: props.theme?.headerBg || "#fff",
        headerFg: props.theme?.headerFg || "#111827",
        navHover: props.theme?.navHover || "#f3f4f6",
        paneShadow: props.theme?.paneShadow || "0 10px 30px rgba(0,0,0,.08)",
        zIndex: props.theme?.zIndex ?? 999999,
        inputBorder: props.theme?.inputBorder || "1px solid #d1d5db",
        inputRadius: props.theme?.inputRadius || "10px",
        inputPadding: props.theme?.inputPadding || "8px 10px",
      };

      const styles = {
        root:{ fontFamily: themeVars.fontFamily, position:"relative", display:"inline-block" },
        input:{ border: themeVars.inputBorder, borderRadius: themeVars.inputRadius, padding: themeVars.inputPadding, minWidth: 180, lineHeight:"20px", fontSize:14, cursor:"pointer", background:"#fff" },
        pane:{ position:"absolute", top:"calc(100% + 8px)", left:0, width:280, background:"#fff", border: themeVars.border, borderRadius: themeVars.radius, boxShadow: themeVars.paneShadow, zIndex: themeVars.zIndex, overflow:"hidden" },
        header:{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 12px", background:themeVars.headerBg, color:themeVars.headerFg, borderBottom:"1px solid #e5e7eb" },
        navBtn:{ border:"none", background:"transparent", cursor:"pointer", width:32, height:32, borderRadius:8, fontSize:18, lineHeight:"32px", textAlign:"center" },
        label:{ fontWeight:600, fontSize:14 },
      };

      return React.createElement("div",{ref:wrapRef,style:styles.root},
        React.createElement("input",{ ref:inputRef, type:"text", readOnly:true, value:formatDisplay(selected), onClick:()=> _setOpen(o=>!o), "aria-haspopup":"dialog", "aria-expanded":open?"true":"false", style:styles.input }),
        open && React.createElement("div",{role:"dialog",style:styles.pane},
          React.createElement("div",{style:styles.header},
            React.createElement("button",{...withHover(styles.navBtn), "aria-label":"Previous month", onClick:()=> setViewRef(v=>addMonths(v,-1))},"‹"),
            React.createElement("div",{style:styles.label}, monthLabel),
            React.createElement("button",{...withHover(styles.navBtn), "aria-label":"Next month", onClick:()=> setViewRef(v=>addMonths(v, 1))},"›"),
          ),
          React.createElement(CalendarGrid,{viewRef, selected, onSelect:selectDay, locale:props.locale||"en-US", theme:props.theme, today})
        )
      );
    };

    root.render(React.createElement(Wrapper));
    _mounts.set(el, {
      root,
      host,
      lastISO: opts.initialDate ? toISO(new Date(opts.initialDate)) : null,
      controls: {
        open: (o=true)=> openRef.setOpen?.(o),
        close: ()=> openRef.setOpen?.(false),
        setDateISO: (iso)=> openRef.setExternalDate?.(iso),
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
