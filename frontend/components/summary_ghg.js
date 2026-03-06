let summary_ghg=new Vue({
  el:"#summary_ghg",
  data:{
    visible:false,

    see_emissions_disgregated:false,
    type_of_summary_table:"ghg",
    hide_zero_valued_variables:true,

    //folded sections
    unfolded_levels:['Water','Waste'],

    //current view selected
    current_view:"table",

    // --- SFD tab (UI only) ---
    sfd_image_dataurl:null,
    sfd_view_mode:"both",

    // SFD persistence / comparison
    sfd_assessment_key:"",
    _sfd_autoload_done_for_key:null,
    sfd_status_msg:"",
    sfd_compare_baseline:null,
    sfd_compare_future:null,

    // --- SFD Compare uploads (no impact on ECAM core) ---
    compare_baseline_json:null,
    compare_future_json:null,
    compare_baseline_json_text:"",
    compare_future_json_text:"",
    compare_baseline_meta:"",
    compare_future_meta:"",
    compare_baseline_sfd:null,
    compare_future_sfd:null,
    compare_rows:null,
    compare_b:null,
    compare_f:null,
    compare_error:"",
    compare_total_baseline:0,
    compare_total_future:0,
    compare_total_diff:0,
    compare_total_pct:null,

    //current emissions unit
    current_unit_ghg:"kgCO2eq",
    current_unit_nrg:"kWh",

    //chart objects from chartjs library stored here
    charts:{},

    //frontend
    variable,
    Charts,

    //backend
    Global,
    Structure,
    Languages,
    IPCC_categories,
    Formulas,
  },

  methods:{
    translate,
    format,
    go_to,
    get_sum_of_substages,

    //sorting function for emission sources order requested by elaine
    emission_sources_order(a,b){
      let codes=[
        //wwc
        "wwc_KPI_GHG_elec",
        "wwc_KPI_GHG_fuel",
        "wwc_KPI_GHG_col",
        "wwc_KPI_GHG_cso",

        //wwt
        "wwt_KPI_GHG_elec",
        "wwt_KPI_GHG_fuel",
        "wwt_KPI_GHG_dig_fuel",
        "wwt_KPI_GHG_tre",
        "wwt_KPI_GHG_slu",
        "wwt_KPI_GHG_biog",
        "wwt_KPI_GHG_disc",
        "wwt_KPI_GHG_reus_trck",

        //wwo
        "wwo_KPI_GHG_elec",
        "wwo_KPI_GHG_fuel",
        "wwo_KPI_GHG_dig_fuel",
        "wwo_KPI_GHG_containment",
        "wwo_KPI_GHG_tre",
        "wwo_KPI_GHG_sludge",
        "wwo_KPI_GHG_biog",
        "wwo_KPI_GHG_dis",
        "wwo_KPI_GHG_unt_opd",
      ];
      return codes.indexOf(a) - codes.indexOf(b);
    },

    get_summary_unit(){
      if(this.type_of_summary_table=='ghg'){
        return this.current_unit_ghg;
      }else{
        return this.current_unit_nrg;
      }
    },

    //emissions are in kg by default
    format_emission(number){
      let divisor = this.current_unit_ghg=='tCO2eq' ? 1000:1;
      let digits  = undefined;
      return format(number,digits,divisor);
    },

    format_energy(number){
      let divisor = this.current_unit_nrg=='MWh' ? 1000:1;
      let digits  = undefined;
      return format(number,digits,divisor);
    },

    show_summaries_menu(){
      summaries_menu.visible=true;
    },

    //fold/unfold a level in the summary table
    toggle_folded_level(level){
      let index = this.unfolded_levels.indexOf(level);
      if(index==-1){
        this.unfolded_levels.push(level);
      }else{
        this.unfolded_levels.splice(index,1);
      }
    },

    // ---------------------------
    // SFD tab (UI only)
    // ---------------------------

    
    // key used to store/retrieve SFD assets per assessment (municipality/scenario)
    get_sfd_storage_key(){
      // priority: user-provided key
      let k = (this.sfd_assessment_key||"").trim();

      // try derive from ECAM globals (best effort, no core-model changes)
      if(!k){
        try{
          const G = this.Global || (typeof window!=="undefined" ? window.Global : null);
          // attempt common metadata fields
          const candidates = [
            G && (G.assessment_name || G.AssessmentName || G.name || G.Name),
            G && G.country,
            G && G.city,
            G && G.municipality,
          ].filter(Boolean);

          if(candidates.length){
            k = String(candidates[0]).trim();
          }
        }catch(e){}
      }

      // last resort
      if(!k) k = "default";
      return k.replace(/\s+/g," ").slice(0,120);
    },

    set_sfd_key_from_global_if_empty(){
      if((this.sfd_assessment_key||"").trim()) return;
      try{
        const G = this.Global || (typeof window!=="undefined" ? window.Global : null);
        const name = G && (G.assessment_name || G.AssessmentName || G.name || G.Name);
        if(name) this.sfd_assessment_key = String(name).trim();
      }catch(e){}
    },

    sfd_ls_key(type){
      const k = this.get_sfd_storage_key();
      return `ecam_sfd_${type}::${k}`;
    },

    sfd_set_status(msg){
      this.sfd_status_msg = msg || "";
      if(msg){
        setTimeout(()=>{ try{ this.sfd_status_msg=""; }catch(e){} }, 3500);
      }
    },

    save_sfd_for_current_key(){
      try{
        const img = this.sfd_image_dataurl;
        if(!img){
          alert("Upload an SFD graphic first.");
          return;
        }
        localStorage.setItem(this.sfd_ls_key("image"), img);
        localStorage.setItem("ecam_sfd_last_key", this.get_sfd_storage_key());
        this.sfd_set_status("SFD saved for this assessment.");
      }catch(e){
        console.warn(e);
        alert("Could not save SFD (storage may be full).");
      }
    },

    load_sfd_for_current_key(){
      try{
        const img = localStorage.getItem(this.sfd_ls_key("image"));
        if(img){
          this.sfd_image_dataurl = img;
          this.$nextTick(()=>this.draw_sfd_charts());
          this.sfd_set_status("SFD loaded.");
        }else{
          this.sfd_set_status("No saved SFD found for this key.");
        }
      }catch(e){
        console.warn(e);
        alert("Could not load SFD.");
      }
    },

    auto_load_sfd_if_available(){
      // run once per key, mainly after a JSON import refreshes window.Global
      const k = this.get_sfd_storage_key();
      if(this._sfd_autoload_done_for_key === k) return;
      this._sfd_autoload_done_for_key = k;

      // if user previously used a key, restore it when empty
      try{
        const last = localStorage.getItem("ecam_sfd_last_key");
        if(!(this.sfd_assessment_key||"").trim() && last){
          this.sfd_assessment_key = last;
        }
      }catch(e){}

      // load SFD image & snapshots if they exist
      this.load_sfd_for_current_key();
      this.load_sfd_snapshots_for_current_key();
    },

    snapshot_sfd_state(){
      const e = this.get_sfd_emissions();
      const unit = this.current_unit_ghg;
      const now = new Date().toISOString();
      return {
        key: this.get_sfd_storage_key(),
        ts: now,
        unit,
        offsite: e.offsite,
        onsite: e.onsite,
        total: (e.offsite.total||0) + (e.onsite.total||0),
      };
    },

    save_snapshot_baseline(){
      try{
        const snap = this.snapshot_sfd_state();
        localStorage.setItem(this.sfd_ls_key("baseline"), JSON.stringify(snap));
        this.sfd_compare_baseline = snap;
        this.sfd_set_status("Baseline saved.");
      }catch(e){
        console.warn(e);
        alert("Could not save baseline snapshot.");
      }
    },

    save_snapshot_future(){
      try{
        const snap = this.snapshot_sfd_state();
        localStorage.setItem(this.sfd_ls_key("future"), JSON.stringify(snap));
        this.sfd_compare_future = snap;
        this.sfd_set_status("Future (2040) saved.");
      }catch(e){
        console.warn(e);
        alert("Could not save future snapshot.");
      }
    },

    load_sfd_snapshots_for_current_key(){
      try{
        const b = localStorage.getItem(this.sfd_ls_key("baseline"));
        const f = localStorage.getItem(this.sfd_ls_key("future"));
        this.sfd_compare_baseline = b ? JSON.parse(b) : null;
        this.sfd_compare_future   = f ? JSON.parse(f) : null;
      }catch(e){
        console.warn(e);
        this.sfd_compare_baseline = null;
        this.sfd_compare_future = null;
      }
    },

    clear_sfd_snapshots_for_current_key(){
      try{
        localStorage.removeItem(this.sfd_ls_key("baseline"));
        localStorage.removeItem(this.sfd_ls_key("future"));
      }catch(e){}
      this.sfd_compare_baseline = null;
      this.sfd_compare_future = null;
      this.sfd_set_status("Comparison cleared.");
    },

    compare_delta(a,b){
      const da = Number(a||0), db = Number(b||0);
      const diff = db - da;
      const pct = da!==0 ? (100*diff/da) : null;
      return {diff, pct};
    },

on_sfd_file_change(ev){
      const file = ev && ev.target && ev.target.files ? ev.target && ev.target.files ? ev.target.files[0] : null : null;
      if(!file) return;

      const ok = /image\/(png|jpeg)/i.test(file.type);
      if(!ok){
        alert("Please upload a PNG or JPG image.");
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this.sfd_image_dataurl = reader.result;
        this.$nextTick(()=>this.draw_sfd_charts());
      };
      reader.readAsDataURL(file);
    },

    clear_sfd_image(){
      this.sfd_image_dataurl=null;
      const a=document.getElementById("chart_sfd_offsite");
      const b=document.getElementById("chart_sfd_onsite");
      if(a) a.innerHTML="";
      if(b) b.innerHTML="";
    },

    // Export SFD + results (UI only) as single JPG (EXACTLY as shown on screen)
    // We capture the DOM of #sfd_export_area so the JPG matches ECAM layout (numbers, alignment, fonts).

    ensure_html2canvas(){
      return new Promise((resolve,reject)=>{
        try{
          if(typeof window !== "undefined" && window.html2canvas){
            resolve(); return;
          }
          // avoid double-loading
          if(document.getElementById("html2canvas_loader")){
            const t0 = Date.now();
            const wait = setInterval(()=>{
              if(window.html2canvas){
                clearInterval(wait); resolve();
              }else if(Date.now()-t0>8000){
                clearInterval(wait); reject(new Error("html2canvas load timeout"));
              }
            }, 100);
            return;
          }
          const s = document.createElement("script");
          s.id = "html2canvas_loader";
          s.async = true;
          s.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
          s.onload = ()=>resolve();
          s.onerror = ()=>reject(new Error("Failed to load html2canvas"));
          document.head.appendChild(s);
        }catch(e){ reject(e); }
      });
    },

    async download_sfd_jpg(){
      try{
        if(!this.sfd_image_dataurl){
          alert("Please upload an SFD image first.");
          return;
        }

        await this.ensure_html2canvas();

        const el = document.getElementById("sfd_export_area");
        if(!el){
          alert("Export area not found.");
          return;
        }

        // Capture exactly what is rendered
        const canvas = await window.html2canvas(el, {
          backgroundColor: "#ffffff",
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          scrollX: 0,
          scrollY: -window.scrollY,
          windowWidth: document.documentElement.clientWidth,
          windowHeight: document.documentElement.clientHeight,
        });

        canvas.toBlob((blob)=>{
          if(!blob){
            alert("Export failed.");
            return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "ecam_sfd_export.jpg";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(()=>URL.revokeObjectURL(url), 1500);
        }, "image/jpeg", 0.92);
      }catch(err){
        console.error(err);
        alert("Could not export JPG.");
      }
    }
,


compare_baseline_emissions(){
  const b = this.compare_b;
  if(!b) return null;
  return {
    offsite:{
      Collection: Number(b.offsite_collection||0),
      Transport:  Number(b.offsite_transport||0),
      Treatment:  Number(b.offsite_treatment||0),
      total:      Number(b.total_offsite||0),
    },
    onsite:{
      Containment: Number(b.onsite_containment||0),
      Emptying:    Number(b.onsite_emptying||0),
      Treatment:   Number(b.onsite_treatment||0),
      Discharge:   Number(b.onsite_discharge||0),
      total:       Number(b.total_onsite||0),
    }
  };
},

compare_future_emissions(){
  const f = this.compare_f;
  if(!f) return null;
  return {
    offsite:{
      Collection: Number(f.offsite_collection||0),
      Transport:  Number(f.offsite_transport||0),
      Treatment:  Number(f.offsite_treatment||0),
      total:      Number(f.total_offsite||0),
    },
    onsite:{
      Containment: Number(f.onsite_containment||0),
      Emptying:    Number(f.onsite_emptying||0),
      Treatment:   Number(f.onsite_treatment||0),
      Discharge:   Number(f.onsite_discharge||0),
      total:       Number(f.total_onsite||0),
    }
  };
},

get_sfd_emissions(){
      const zeros = {
        offsite:{ Collection:0, Transport:0, Treatment:0, total:0 },
        onsite :{ Containment:0, Emptying:0, Treatment:0, Discharge:0, total:0 },
      };

      try{
        if(!Global || !Global.Waste) return zeros;

        // OFFSITE SANITATION
        const off_collection = (Global.Waste.Collection||[]).map(s =>
          (s.wwc_KPI_GHG_col  ? s.wwc_KPI_GHG_col().total  : 0) +
          (s.wwc_KPI_GHG_cso  ? s.wwc_KPI_GHG_cso().total  : 0) +
          (s.wwc_KPI_GHG_elec ? s.wwc_KPI_GHG_elec().total : 0)
        ).sum();

        const off_transport = (Global.Waste.Collection||[]).map(s =>
          (s.wwc_KPI_GHG_fuel ? s.wwc_KPI_GHG_fuel().total : 0)
        ).sum();

        const off_treatment = (Global.Waste.Treatment||[]).map(s =>
          (s.wwt_KPI_GHG ? s.wwt_KPI_GHG().total : 0) +
          (s.wwt_KPI_GHG_elec ? s.wwt_KPI_GHG_elec().total : 0) +
          (s.wwt_KPI_GHG_fuel ? s.wwt_KPI_GHG_fuel().total : 0)
        ).sum();

        const off_total = off_collection + off_transport + off_treatment;

        // ONSITE SANITATION
        const on_containment = (Global.Waste.Onsite||[]).map(s =>
          (s.wwo_KPI_GHG_containment ? s.wwo_KPI_GHG_containment().total : 0)
        ).sum();

        const on_emptying = (Global.Waste.Onsite||[]).map(s =>
          (s.wwo_KPI_GHG_trck ? s.wwo_KPI_GHG_trck().total : 0) +
          (s.wwo_KPI_GHG_fuel ? s.wwo_KPI_GHG_fuel().total : 0)
        ).sum();

        const on_treatment = (Global.Waste.Onsite||[]).map(s =>
          (s.wwo_KPI_GHG_tre ? s.wwo_KPI_GHG_tre().total : 0) +
          (s.wwo_KPI_GHG_biog ? s.wwo_KPI_GHG_biog().total : 0) +
          (s.wwo_KPI_GHG_dig_fuel ? s.wwo_KPI_GHG_dig_fuel().total : 0)
        ).sum();

        const on_discharge = (Global.Waste.Onsite||[]).map(s =>
          (s.wwo_KPI_GHG_dis ? s.wwo_KPI_GHG_dis().total : 0) +
          (s.wwo_KPI_GHG_unt_opd ? s.wwo_KPI_GHG_unt_opd().total : 0)
        ).sum();

        const on_total = on_containment + on_emptying + on_treatment + on_discharge;

        return {
          offsite:{ Collection:off_collection, Transport:off_transport, Treatment:off_treatment, total:off_total },
          onsite :{ Containment:on_containment, Emptying:on_emptying, Treatment:on_treatment, Discharge:on_discharge, total:on_total },
        };
      }catch(e){
        console.warn("SFD emissions read failed:", e);
        return zeros;
      }
    },


// ----------
// SFD Compare (uploads + robust ECAM JSON read)
// ----------
on_compare_json_upload(which, ev){
  try{
    const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if(!file) return;

    const reader = new FileReader();
    reader.onload = (e)=>{
      try{
        const rawText = String(e.target.result || "");
        const obj = JSON.parse(rawText);
        if(which==='baseline'){
          this.compare_baseline_json = obj;
          this.compare_baseline_json_text = rawText;
          this.compare_baseline_meta = file.name;
        }else{
          this.compare_future_json = obj;
          this.compare_future_json_text = rawText;
          this.compare_future_meta = file.name;
        }
        this.compare_error = "";
      }catch(err){
        console.warn(err);
        this.compare_error = "Could not parse JSON file.";
      }
    };
    reader.readAsText(file);
  }catch(e){
    console.warn(e);
    this.compare_error = "Could not read JSON file.";
  }
},

on_compare_sfd_upload(which, ev){
  try{
    const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
    if(!file) return;
    const reader = new FileReader();
    reader.onload = (e)=>{
      if(which==='baseline') this.compare_baseline_sfd = e.target.result;
      else this.compare_future_sfd = e.target.result;
    };
    reader.readAsDataURL(file);
  }catch(e){ console.warn(e); }
},

clear_compare_uploads(){
  this.compare_baseline_json = null;
  this.compare_future_json = null;
  this.compare_baseline_json_text = "";
  this.compare_future_json_text = "";
  this.compare_baseline_meta = "";
  this.compare_future_meta = "";
  this.compare_baseline_sfd = null;
  this.compare_future_sfd = null;
  this.compare_rows = null;
  this.compare_b = null;
  this.compare_f = null;
  this.compare_error = "";
  this.compare_total_baseline = 0;
  this.compare_total_future = 0;
  this.compare_total_diff = 0;
  this.compare_total_pct = null;
  // clear pie chart containers
  try{
    const ids = [
      "chart_compare_baseline_offsite","chart_compare_baseline_onsite",
      "chart_compare_future_offsite","chart_compare_future_onsite"
    ];
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=""; });
  }catch(e){}
},

get_compare_rows_offsite(){
  return (this.compare_rows||[]).filter(r=>r.section==='offsite');
},
get_compare_rows_onsite(){
  return (this.compare_rows||[]).filter(r=>r.section==='onsite');
},

// Read the uploaded ECAM JSON using the same wastewater components used in the SFD tab.
// For exported ECAM JSON, KPI functions are not present, so we rebuild the same component groups from JSON fields.
extract_ecam_components_from_json(root, rawText){
  const normalize = (r)=> Array.isArray(r) ? (r[0] || {}) : (r || {});
  const data = normalize(root);
  const out = {
    offsite_collection:0,
    offsite_transport:0,
    offsite_treatment:0,
    onsite_containment:0,
    onsite_emptying:0,
    onsite_treatment:0,
    onsite_discharge:0,
    total_offsite:0,
    total_onsite:0,
    total:0,
  };

  const n = (v)=>{ const x = Number(v); return isFinite(x) ? x : 0; };
  const ch4ToCO2eq = (bodKg, ef)=> n(bodKg) * n(ef) * (16/12) * 25;
  const n2oToCO2eq = (tnKg, ef)=> n(tnKg) * n(ef) * (44/28) * 298;

  // Preferred path: exported ECAM assessment JSON structure.
  if(data && data.Waste){
    const W = data.Waste || {};
    const collections = Array.isArray(W.Collection) ? W.Collection : [];
    const treatments  = Array.isArray(W.Treatment)  ? W.Treatment  : [];
    const onsites     = Array.isArray(W.Onsite)     ? W.Onsite     : [];

    // OFFSITE SANITATION
    out.offsite_collection = collections.map(s => {
      // Same grouping as SFD tab: collection bucket. For uploaded JSON, the live KPI is best approximated by
      // untreated/CSo emissions plus any electrical emissions if ever included later.
      return (
        ch4ToCO2eq(s.wwc_bod, s.wwc_ch4_efac_cso) +
        n2oToCO2eq(s.wwc_tn,  s.wwc_n2o_efac_cso)
      );
    }).reduce((a,b)=>a+b,0);

    out.offsite_transport = collections.map(s => {
      // If there is transport fuel in JSON, it belongs here. Current uploaded file has zero.
      return 0;
    }).reduce((a,b)=>a+b,0);

    out.offsite_treatment = treatments.map(s => {
      return (
        ch4ToCO2eq(s.wwt_bod_infl, s.wwt_ch4_efac_tre) +
        n2oToCO2eq(s.wwt_tn_infl,  s.wwt_n2o_efac_tre) +
        ch4ToCO2eq(s.wwt_bod_effl, s.wwt_ch4_efac_dis) +
        n2oToCO2eq(s.wwt_tn_effl,  s.wwt_n2o_efac_dis)
      );
    }).reduce((a,b)=>a+b,0);

    // ONSITE SANITATION
    out.onsite_containment = onsites.map(s => {
      return ch4ToCO2eq(s.wwo_bod_cont, s.wwo_ch4_efac_con);
    }).reduce((a,b)=>a+b,0);

    out.onsite_emptying = onsites.map(s => {
      return 0;
    }).reduce((a,b)=>a+b,0);

    out.onsite_treatment = onsites.map(s => {
      return (
        ch4ToCO2eq(s.wwo_bod_infl, s.wwo_ch4_efac_tre) +
        n2oToCO2eq(s.wwo_tn_infl,  s.wwo_n2o_efac_tre)
      );
    }).reduce((a,b)=>a+b,0);

    out.onsite_discharge = onsites.map(s => {
      return (
        ch4ToCO2eq(s.wwo_bod_effl, s.wwo_ch4_efac_dis) +
        n2oToCO2eq(s.wwo_tn_effl,  s.wwo_n2o_efac_dis) +
        n2oToCO2eq(s.wwo_opd_tn,   s.wwo_n2o_efac_opd)
      );
    }).reduce((a,b)=>a+b,0);

    out.total_offsite = out.offsite_collection + out.offsite_transport + out.offsite_treatment;
    out.total_onsite  = out.onsite_containment + out.onsite_emptying + out.onsite_treatment + out.onsite_discharge;
    out.total         = out.total_offsite + out.total_onsite;
    return out;
  }

  // Fallback: generic flat search for alternative JSON shapes.
  const targets = {
    offsite_collection: ["offsite_collection","collection_offsite","offsite collection","collection (offsite)","collection"],
    offsite_transport : ["offsite_transport","transport_offsite","offsite transport","transport (offsite)","transport"],
    offsite_treatment : ["offsite_treatment","treatment_offsite","offsite treatment","treatment (offsite)","treatment"],
    onsite_containment: ["onsite_containment","containment_onsite","onsite containment","containment (onsite)","containment"],
    onsite_emptying   : ["onsite_emptying","emptying_onsite","onsite emptying","emptying (onsite)","emptying"],
    onsite_treatment  : ["onsite_treatment","treatment_onsite","onsite treatment","treatment (onsite)","treatment"],
    onsite_discharge  : ["onsite_discharge","discharge_onsite","onsite discharge","discharge (onsite)","discharge"],
  };
  const flat = [];
  const pushFlat = (k, v, path, label)=>{
    const num = (typeof v === "number") ? v : (typeof v === "string" ? Number(v) : NaN);
    if(!isFinite(num)) return;
    flat.push({k:String(k||""), label:String(label||""), path:String(path||""), v:num});
  };
  const walk = (node, path)=>{
    if(node===null || node===undefined) return;
    if(Array.isArray(node)){
      for(let i=0;i<node.length;i++) walk(node[i], path+"["+i+"]");
      return;
    }
    if(typeof node === "object"){
      const hasValue = Object.prototype.hasOwnProperty.call(node,"value");
      const hasLabel = Object.prototype.hasOwnProperty.call(node,"label") || Object.prototype.hasOwnProperty.call(node,"name") || Object.prototype.hasOwnProperty.call(node,"title");
      if(hasValue && hasLabel) pushFlat("label_value", node.value, path, (node.label || node.name || node.title || ""));
      for(const key in node){
        if(!Object.prototype.hasOwnProperty.call(node,key)) continue;
        const val = node[key];
        pushFlat(key, val, path+"."+key, "");
        walk(val, path+"."+key);
      }
    }
  };
  walk(root, "$");
  const score = (item, needOffsite, needOnsite, kw)=>{
    const s = (item.k+" "+item.label+" "+item.path).toLowerCase();
    let sc = 0;
    if(kw && s.includes(kw)) sc += 5;
    if(needOffsite && (s.includes("offsite") || s.includes("off-site"))) sc += 3;
    if(needOnsite  && (s.includes("onsite")  || s.includes("on-site"))) sc += 3;
    return sc;
  };
  const pick = (aliases, needOffsite, needOnsite)=>{
    let best = null, bestScore = -1;
    for(const a of aliases){
      const kw = String(a).toLowerCase();
      for(const item of flat){
        const sc = score(item, needOffsite, needOnsite, kw);
        if(sc > bestScore){ bestScore = sc; best = item; }
      }
    }
    if(best && bestScore >= 5) return best.v;
    for(const item of flat){
      const key = item.k.toLowerCase();
      for(const a of aliases){ if(key === String(a).toLowerCase()) return item.v; }
    }
    return 0;
  };
  out.offsite_collection = pick(targets.offsite_collection, true, false);
  out.offsite_transport  = pick(targets.offsite_transport,  true, false);
  out.offsite_treatment  = pick(targets.offsite_treatment,  true, false);
  out.onsite_containment = pick(targets.onsite_containment, false, true);
  out.onsite_emptying    = pick(targets.onsite_emptying,    false, true);
  out.onsite_treatment   = pick(targets.onsite_treatment,   false, true);
  out.onsite_discharge   = pick(targets.onsite_discharge,   false, true);
  out.total_offsite = out.offsite_collection + out.offsite_transport + out.offsite_treatment;
  out.total_onsite  = out.onsite_containment + out.onsite_emptying + out.onsite_treatment + out.onsite_discharge;
  out.total         = out.total_offsite + out.total_onsite;
  return out;
},

generate_compare_from_uploads(){
  try{
    this.compare_error = "";
    if(!this.compare_baseline_json || !this.compare_future_json){
      this.compare_error = "Please upload both Baseline and Future ECAM JSON files.";
      return;
    }

    const b = this.extract_ecam_components_from_json(this.compare_baseline_json, this.compare_baseline_json_text);
    const f = this.extract_ecam_components_from_json(this.compare_future_json, this.compare_future_json_text);

    this.compare_b = b;
    this.compare_f = f;

    const rows = [
      {section:"offsite", key:"collection", label:"Collection", baseline:b.offsite_collection, future:f.offsite_collection},
      {section:"offsite", key:"transport",  label:"Transport",  baseline:b.offsite_transport,  future:f.offsite_transport},
      {section:"offsite", key:"treatment",  label:"Treatment",  baseline:b.offsite_treatment,  future:f.offsite_treatment},
      {section:"offsite", key:"total_offsite", label:"Total offsite", baseline:b.total_offsite, future:f.total_offsite},

      {section:"onsite", key:"containment", label:"Containment", baseline:b.onsite_containment, future:f.onsite_containment},
      {section:"onsite", key:"emptying",    label:"Emptying",    baseline:b.onsite_emptying,    future:f.onsite_emptying},
      {section:"onsite", key:"treatment",   label:"Treatment",   baseline:b.onsite_treatment,   future:f.onsite_treatment},
      {section:"onsite", key:"discharge",   label:"Discharge",   baseline:b.onsite_discharge,   future:f.onsite_discharge},
      {section:"onsite", key:"total_onsite", label:"Total onsite", baseline:b.total_onsite, future:f.total_onsite},
    ];

    rows.forEach(r=>{
      r.diff = (r.future||0) - (r.baseline||0);
      r.pct = (r.baseline && r.baseline!==0) ? (100*r.diff/r.baseline) : null;
    });

    this.compare_rows = rows;

    this.compare_total_baseline = b.total;
    this.compare_total_future   = f.total;
    this.compare_total_diff     = f.total - b.total;
    this.compare_total_pct      = (b.total && b.total!==0) ? (100*this.compare_total_diff/b.total) : null;

    this.$nextTick(()=>{ try{ this.draw_compare_pies(b,f); }catch(e){ console.warn(e); } });

  }catch(e){
    console.warn(e);
    this.compare_error = "Could not generate comparison from the uploaded JSON files.";
  }
},


compare_bar_max(){
  return Math.max(
    Number(this.compare_total_baseline||0),
    Number(this.compare_total_future||0),
    1
  );
},

compare_bar_width(value){
  const max = this.compare_bar_max();
  const v = Number(value||0);
  return Math.max(0, Math.min(100, (v/max)*100));
},

compare_change_text(){
  const d = Number(this.compare_total_diff||0);
  const p = this.compare_total_pct;
  if(!this.compare_rows || !this.compare_rows.length) return "";
  if(d===0) return "No change";
  const dir = d < 0 ? "Reduction" : "Increase";
  const pct = (p===null || isNaN(p)) ? "" : " (" + format(Math.abs(p),1,1) + "%)";
  return dir + ": " + this.format_emission(Math.abs(d)) + " (" + this.current_unit_ghg + ")" + pct;
},

compare_change_color(){
  const d = Number(this.compare_total_diff||0);
  if(d < 0) return "#2e7d32";
  if(d > 0) return "#c62828";
  return "#666";
},

draw_simple_pie(elId, items){
  const el = document.getElementById(elId);
  if(!el) return;
  const data = (items||[]).map(d=>({label:String(d.label||''), value:Number(d.value||0)})).filter(d=>d.value>0);
  const total = data.reduce((s,d)=>s+d.value,0);
  if(!total){ el.innerHTML = "<div style='color:#888'>No data</div>"; return; }
  const W=180, H=180, R=70, CX=W/2, CY=H/2;
  let a0 = -Math.PI/2;
  const colors = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7'];
  let paths = '';
  data.forEach((d,i)=>{
    const a1 = a0 + (d.value/total)*Math.PI*2;
    const x0 = CX + R*Math.cos(a0), y0 = CY + R*Math.sin(a0);
    const x1 = CX + R*Math.cos(a1), y1 = CY + R*Math.sin(a1);
    const large = (a1-a0) > Math.PI ? 1 : 0;
    const color = colors[i % colors.length];
    const pct = Math.round((d.value/total)*100);
    const title = `${d.label}: ${pct}%`;
    paths += `<path d='M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1} Z' fill='${color}'>`+
             `<title>${title}</title></path>`;
    a0 = a1;
  });
  const svg = `<svg width='${W}' height='${H}' viewBox='0 0 ${W} ${H}' role='img' aria-label='Pie chart'>${paths}</svg>`;
  const legend = `<div style='font-size:12px;line-height:1.3;margin-top:6px;'>`+
    data.map((d,i)=>{
      const color = colors[i % colors.length];
      const pct = Math.round((d.value/total)*100);
      return `<div style='display:flex;align-items:center;gap:6px;margin:2px 0;'>`+
             `<span style='display:inline-block;width:10px;height:10px;background:${color};border-radius:2px;'></span>`+
             `<span>${d.label} (${pct}%)</span></div>`;
    }).join('') + `</div>`;
  el.innerHTML = `<div style='display:flex;flex-direction:column;align-items:center;'>${svg}${legend}</div>`;
},


draw_compare_pies(b,f){
  // IMPORTANT: use the exact same ECAM helper as the SFD tab, so format/colors/labels match.
  // If for any reason the helper is missing, we fail silently (do NOT break Results).
  try{
    const elIds = [
      "chart_compare_baseline_offsite","chart_compare_baseline_onsite",
      "chart_compare_future_offsite","chart_compare_future_onsite"
    ];
    elIds.forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=""; });

    if(typeof Charts==="undefined" || !Charts || typeof Charts.draw_pie_chart!=="function"){
      // no helper available -> do nothing (avoid breaking UI)
      return;
    }

    const pct = (v, tot) => (tot>0 ? (100*Number(v||0)/tot) : 0);

    const hideLegend = (id)=>{
      try{
        const el=document.getElementById(id);
        if(!el) return;
        const leg=el.querySelector("table.legend");
        if(leg) leg.style.display="none";
      }catch(e){}
    };

    const b_off_tot = Number(b.offsite_collection||0)+Number(b.offsite_transport||0)+Number(b.offsite_treatment||0);
    const b_on_tot  = Number(b.onsite_containment||0)+Number(b.onsite_emptying||0)+Number(b.onsite_treatment||0)+Number(b.onsite_discharge||0);

    const f_off_tot = Number(f.offsite_collection||0)+Number(f.offsite_transport||0)+Number(f.offsite_treatment||0);
    const f_on_tot  = Number(f.onsite_containment||0)+Number(f.onsite_emptying||0)+Number(f.onsite_treatment||0)+Number(f.onsite_discharge||0);
    hideLegend("chart_compare_baseline_offsite");
    hideLegend("chart_compare_baseline_onsite");
    hideLegend("chart_compare_future_offsite");
    hideLegend("chart_compare_future_onsite");

    // Offsite (Baseline)
    Charts.draw_pie_chart(
      "chart_compare_baseline_offsite",
      [
        {label:"Collection", value:pct(b.offsite_collection, b_off_tot)},
        {label:"Transport",  value:pct(b.offsite_transport , b_off_tot)},
        {label:"Treatment",  value:pct(b.offsite_treatment , b_off_tot)},
      ],
      ["#4f81bd", "#f79646", "#9bbb59"],
    );
    hideLegend("chart_compare_baseline_offsite");


    // Onsite (Baseline)
    Charts.draw_pie_chart(
      "chart_compare_baseline_onsite",
      [
        {label:"Containment", value:pct(b.onsite_containment, b_on_tot)},
        {label:"Emptying",    value:pct(b.onsite_emptying   , b_on_tot)},
        {label:"Treatment",   value:pct(b.onsite_treatment  , b_on_tot)},
        {label:"Discharge",   value:pct(b.onsite_discharge  , b_on_tot)},
      ],
      ["#4f81bd", "#f79646", "#9bbb59", "#c9c9c9"],
    );
    hideLegend("chart_compare_baseline_onsite");


    // Offsite (Future)
    Charts.draw_pie_chart(
      "chart_compare_future_offsite",
      [
        {label:"Collection", value:pct(f.offsite_collection, f_off_tot)},
        {label:"Transport",  value:pct(f.offsite_transport , f_off_tot)},
        {label:"Treatment",  value:pct(f.offsite_treatment , f_off_tot)},
      ],
      ["#4f81bd", "#f79646", "#9bbb59"],
    );
    hideLegend("chart_compare_future_offsite");


    // Onsite (Future)
    Charts.draw_pie_chart(
      "chart_compare_future_onsite",
      [
        {label:"Containment", value:pct(f.onsite_containment, f_on_tot)},
        {label:"Emptying",    value:pct(f.onsite_emptying   , f_on_tot)},
        {label:"Treatment",   value:pct(f.onsite_treatment  , f_on_tot)},
        {label:"Discharge",   value:pct(f.onsite_discharge  , f_on_tot)},
      ],
      ["#4f81bd", "#f79646", "#9bbb59", "#c9c9c9"],
    );
    hideLegend("chart_compare_future_onsite");

  }catch(e){
    // never break Results
    console.warn(e);
  }
},



    draw_sfd_charts(){
      if(this.current_view!=='sfd') return;

      const el1 = document.getElementById("chart_sfd_offsite");
      const el2 = document.getElementById("chart_sfd_onsite");
      if(!el1 || !el2) return;

      el1.innerHTML="";
      el2.innerHTML="";

      const e = this.get_sfd_emissions();
      const pct = (v, tot) => tot>0 ? (100*v/tot) : 0;

      Charts.draw_pie_chart(
        "chart_sfd_offsite",
        [
          {label:"Collection", value:pct(e.offsite.Collection, e.offsite.total)},
          {label:"Transport",  value:pct(e.offsite.Transport , e.offsite.total)},
          {label:"Treatment",  value:pct(e.offsite.Treatment , e.offsite.total)},
        ],
        ["#4f81bd", "#f79646", "#9bbb59"],
      );

      Charts.draw_pie_chart(
        "chart_sfd_onsite",
        [
          {label:"Containment", value:pct(e.onsite.Containment, e.onsite.total)},
          {label:"Emptying",    value:pct(e.onsite.Emptying   , e.onsite.total)},
          {label:"Treatment",   value:pct(e.onsite.Treatment  , e.onsite.total)},
          {label:"Discharge",   value:pct(e.onsite.Discharge  , e.onsite.total)},
        ],
        ["#4f81bd", "#f79646", "#9bbb59", "#c9c9c9"],
      );
    },


    //call chart drawing functions
    draw_all_charts(){
      //destroy all charts
      Object.values(this.charts).forEach(chart=>chart.destroy());

      //pie charts
        Charts.draw_pie_chart('chart_1',
          [
            {"label":"", "value":100*Global.Water.ws_KPI_GHG().total/Global.TotalGHG().total},
            {"label":"", "value":100*Global.Waste.ww_KPI_GHG().total/Global.TotalGHG().total},
          ],[
            "var(--color-level-Water)",
            "var(--color-level-Waste)",
          ]
        );

        Charts.draw_pie_chart('chart_2',
          Structure.filter(s=>s.sublevel).map(s=>{
            let label = "";
            let value = 100*Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_KPI_GHG']().total).sum()/Global.TotalGHG().total;
            return {label,value};
          }),
          Structure.filter(s=>s.sublevel).map(s=>s.color),
        );

        //d3js pie chart -- ghg by gas
        Charts.draw_pie_chart('chart_3',
          [
            {"label":"", "value":100*Global.TotalGHG().co2/Global.TotalGHG().total},
            {"label":"", "value":100*Global.TotalGHG().n2o/Global.TotalGHG().total},
            {"label":"", "value":100*Global.TotalGHG().ch4/Global.TotalGHG().total},
          ],
          [
            Charts.gas_colors.co2,
            Charts.gas_colors.n2o,
            Charts.gas_colors.ch4,
          ],
        );

        Charts.draw_pie_chart('chart_nrg_levels',
          [
            {"label":"", "value":100*Global.Water.ws_nrg_cons()/Global.TotalNRG()},
            {"label":"", "value":100*Global.Waste.ww_nrg_cons()/Global.TotalNRG()},
          ],
          [
            "var(--color-level-Water)",
            "var(--color-level-Waste)",
          ],
        );

        Charts.draw_pie_chart('chart_nrg_stages',
          Structure.filter(s=>s.sublevel).map(s=>{
            let total_nrg = Global.TotalNRG();
            let label = "";
            let value = 100*Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_nrg_cons']).sum()/total_nrg;
            return {label,value};
          }),
          Structure.filter(s=>s.sublevel).map(s=>s.color),
        );

        Charts.draw_pie_chart('chart_ipcc_categories',
          Object.keys(IPCC_categories).map(key=>{
            let total_ghg = Global.TotalGHG().total;
            let label = "";
            let value = 100*IPCC_categories[key].emissions(Global)/total_ghg;
            return {label,value};
          }),
          Object.values(IPCC_categories).map(obj=>obj.color),
        );

        Charts.draw_pie_chart('pie_chart_ws_serv_pop',
          [
            {label:translate('ws_serv_pop_descr'), value:    100*Global.Water.ws_serv_pop()/Global.Water.ws_resi_pop||0},
            {label:translate('ws_serv_pop_descr'), value:100-100*Global.Water.ws_serv_pop()/Global.Water.ws_resi_pop||0},
          ],
          colors=[
            "var(--color-level-Water)",
            "#eee",
          ],
        );

        Charts.draw_pie_chart('pie_chart_ww_serv_pop',
          [
            {label:translate('ww_serv_pop_descr'), value:    100*Global.Waste.ww_serv_pop()/Global.Waste.ww_resi_pop||0},
            {label:translate('ww_serv_pop_descr'), value:100-100*Global.Waste.ww_serv_pop()/Global.Waste.ww_resi_pop||0},
          ],
          colors=[
            "var(--color-level-Waste)",
            "#eee",
          ],
        );
      //--

      //Chart.js bar chart -- ghg by substage
      if(document.getElementById('bar_chart_ghg_substages')){
        this.charts.bar_chart_ghg_substages = new Chart('bar_chart_ghg_substages',{
          type:'bar',
          data:{
            labels: Structure.filter(s=>s.sublevel).map(s=>{
              return Global[s.level][s.sublevel].map(ss=>{
                return (s.prefix+" "+ss.name);
              });
            }).reduce((p,c)=>p.concat(c),[]),
            datasets:[
              ...['co2','ch4','n2o'].map(gas=>{
                return {
                  label:`${gas.toUpperCase()} (${this.current_unit_ghg})`,
                  data: Structure.filter(s=>s.sublevel).map(s=>{
                    return Global[s.level][s.sublevel].map(ss=>{
                      let divisor = this.current_unit_ghg=='tCO2eq'?1000:1;
                      return ss[s.prefix+'_KPI_GHG']()[gas]/divisor;
                    });
                  }).reduce((p,c)=>p.concat(c),[]),
                  backgroundColor:[Charts.gas_colors[gas]],
                  borderColor:[Charts.gas_colors[gas]],
                  borderWidth:1,
                };
              }),
            ],
          },
          options:{
            aspectRatio:4,
            scales:{
              x:{
                stacked:true,
              },
              y:{
                beginAtZero:true,
                borderWidth:2,
                stacked:true,
              },
            },
          },
        });
      }

      //Chart.js bar chart -- nrg by substage
      if(document.getElementById('bar_chart_nrg_substages')){
        this.charts.bar_chart_nrg_substages = new Chart('bar_chart_nrg_substages',{
          type:'bar',
          data:{
            labels: Structure.filter(s=>s.sublevel).map(s=>{
              return Global[s.level][s.sublevel].map(ss=>{
                return (s.prefix+" "+ss.name);
              });
            }).reduce((p,c)=>p.concat(c),[]),
            datasets:[
              {
                label:`Energy (${this.current_unit_nrg})`,
                data:Structure.filter(s=>s.sublevel).map(s=>{
                  return Global[s.level][s.sublevel].map(ss=>{
                    let divisor = this.current_unit_nrg=='MWh'?1000:1;
                    return ss[s.prefix+'_nrg_cons']/divisor;
                  });
                }).reduce((p,c)=>p.concat(c),[]),
                backgroundColor:["#ffbe54"],
                borderColor:["#ffbe54"],
                borderWidth:1,
              },
            ]
          },
          options:{
            aspectRatio:4,
            scales:{
              y:{
                beginAtZero:true,
                borderWidth:2,
              },
            },
          },
        });
      }
    },
  },

  watch:{
    current_view(newV){
      this.$nextTick(()=>{
        try{
          if(newV==='sfd') this.draw_sfd_charts();
          if(newV==='sfd_compare' && this.compare_b && this.compare_f) this.draw_compare_pies(this.compare_b, this.compare_f);
        }catch(e){}
      });
    },
    sfd_assessment_key(){
      try{
        // When key changes, load stored assets for that key
        this._sfd_autoload_done_for_key = null;
        this.auto_load_sfd_if_available();
      }catch(e){}
    }
  },

  template:`
    <div id=summary_ghg v-if="visible && Languages.ready">
      <div> {{show_summaries_menu()}} </div>

      <!--title-->
      <h1 style="padding-left:0">
        {{translate("Summary: GHG emissions and energy consumption")}}
      </h1>

      <!--select tables or charts-->
      <div style="padding:1em;border:1px solid #ccc">
        <button @click="current_view='table'"      :selected="current_view=='table'"       type="button">{{translate("Table")                     }}</button>
        <button @click="current_view='charts_ghg'" :selected="current_view=='charts_ghg'"  type="button">{{translate("Charts GHG")                }}</button>
        <button @click="current_view='charts_nrg'" :selected="current_view=='charts_nrg'"  type="button">{{translate("Charts Energy")             }}</button>
        <button @click="current_view='charts_pop'" :selected="current_view=='charts_pop'"  type="button">{{translate("Charts Serviced population")}}</button>
        <button type="button" @click.prevent="current_view='sfd'" :selected="current_view=='sfd'" >SFD</button>
        <button type=\"button\" @click.prevent=\"current_view='sfd_compare'\" :selected=\"current_view=='sfd_compare'\" >SFD Compare</button>
        <hr style="border-color:#eee">
        <div>
          <tutorial_tip
            id   ="Visualization_of_results"
            title="Visualization_of_results"
            text ="Select_different_ways_to_visualize_your_assessment_results._You_can_choose_between_tables,_bar_charts_and_pie_charts."
          ></tutorial_tip>
        </div>

        <div
          style="
            display:flex;
            align-items:center;
            justify-content:space-between;
          "
        >
          <table
            style="
              border:1px solid #eee;
            "
          >
            <tr v-if="current_view=='table'">
              <!--select summary table type-->
              <td><b>{{translate("Select summary table")}}</b></td>
              <td>
                <label>
                  <input type=radio v-model="type_of_summary_table" value="ghg">
                  {{translate("GHG")}}
                </label>
              </td>
              <td>
                <label>
                  <input type=radio v-model="type_of_summary_table" value="nrg">
                  {{translate("Energy")}}
                </label>
              </td>
            </tr>
            <tr v-if="['table','charts_ghg','charts_nrg'].indexOf(current_view)+1">
              <!--select units-->
              <td><b>{{translate("Select units")}}</b></td>
              <td v-if="current_view=='table'||current_view=='charts_ghg'">
                <select v-model="current_unit_ghg">
                  <option>kgCO2eq</option>
                  <option>tCO2eq</option>
                </select>
              </td>
              <td v-if="current_view=='table'||current_view=='charts_nrg'">
                <select v-model="current_unit_nrg">
                  <option>kWh</option>
                  <option>MWh</option>
                </select>
              </td>
            </tr>
          </table>

          <div v-if="current_view=='table' && type_of_summary_table=='ghg'">
            <!--select see other ghgs-->
            <b v-html="translate('Show emissions in CO2, CH4 and N2O').prettify()"></b></td>
            <span>
              <label>
                <input type=radio v-model="see_emissions_disgregated" :value="false">
                {{translate("no")}}
              </label>
            </span>
            <span>
              <label>
                <input type=radio v-model="see_emissions_disgregated" :value="true">
                {{translate("yes")}}
              </label>
            </span>
          </div>

          <div v-if="current_view=='table' && type_of_summary_table=='ghg'">
            <label>
              <input type=checkbox v-model="hide_zero_valued_variables">
              {{translate("Hide_zero_(0)_values_in_results")}}
            </label>
          </div>
        </div>
      </div>

      <!--content-->
      <div>
        <!--table container-->
        <div v-if="current_view=='table'">
          <!--summary table 2.0-->
          <div style="margin-top:20px"></div>

          <!--actual table-->
          <div>
            <!--header-->
            <div
              style="
                display:grid;
                grid-template-columns: 15% ${85*0.15}% ${85*0.85*0.15}% ${85*0.85*0.85*0.28}% ${85*0.85*0.85*0.18}% ${85*0.85*0.85*0.18}% ${85*0.85*0.85*0.18}% ${85*0.85*0.85*0.18}%;
                text-align:center;
              "
            >
              <div>{{translate("Total")}}  (<span class=unit v-html="get_summary_unit().prettify()"></span>)</div>
              <div>{{translate("System")}} (<span class=unit v-html="get_summary_unit().prettify()"></span>)</div>
              <div>{{translate("Stage")}}  (<span class=unit v-html="get_summary_unit().prettify()"></span>)</div>
              <div v-if="type_of_summary_table=='ghg'" style="text-align:left">
                {{translate("Emission source")}}
              </div>
              <div v-if="type_of_summary_table=='nrg'">
                {{translate("Substages")}}
                (<span class=unit v-html="current_unit_nrg.prettify()"></span>)
              </div>
              <div>
                <span v-if="type_of_summary_table=='ghg'">{{translate("Emission")}}</span>
                <span v-if="type_of_summary_table=='nrg'">{{translate("Energy consumption")}}</span>
                (<span class=unit v-html="get_summary_unit().prettify()"></span>)
              </div>

              <div v-if="type_of_summary_table=='ghg' && see_emissions_disgregated">${'CO2'.prettify()} (<span class=unit v-html="current_unit_ghg.prettify()"></span>)</div>
              <div v-if="type_of_summary_table=='ghg' && see_emissions_disgregated">${'CH4'.prettify()} (<span class=unit v-html="current_unit_ghg.prettify()"></span>)</div>
              <div v-if="type_of_summary_table=='ghg' && see_emissions_disgregated">${'N2O'.prettify()} (<span class=unit v-html="current_unit_ghg.prettify()"></span>)</div>
            </div>

            <!--body-->
            <div
              class=subdivision
              style="background:var(--color-level-generic)"
            >
              <div
                style="
                  color:white;
                  text-align:center;
                  font-size:large;
                "
              >
                <div v-if="type_of_summary_table=='ghg'">
                  <img src="frontend/img/viti/select_scenario/icon-co2-white.svg" style="width:80px">
                </div>
                <div v-if="type_of_summary_table=='nrg'">
                  <img src="frontend/img/viti/select_scenario/icon-energy-white.svg" style="width:80px">
                </div>

                <div>
                  <div v-if="type_of_summary_table=='ghg'">
                    {{translate('TotalGHG_descr')}}
                  </div>
                  <div v-if="type_of_summary_table=='nrg'">
                    {{translate("Total energy consumption")}}
                  </div>
                </div>

                <div v-if="type_of_summary_table=='ghg'">
                  <b>{{format_emission(Global.TotalGHG().total)}}</b>
                </div>
                <div v-if="type_of_summary_table=='nrg'">
                  <b>{{format_energy(Global.TotalNRG())}}</b>
                </div>
              </div>
              <div>
                <div
                  v-for="s in Structure.filter(s=>!s.sublevel)"
                  class=subdivision
                  :style="{background:s.color}"
                >
                  <div>
                    <div
                      style="
                        padding:0 0.5em;
                        text-align:center;
                        font-size:large;
                        color:white;
                      "
                    >
                      <div>
                        <img :src="'frontend/img/stages_menu-'+s.prefix+'.svg'" style="width:40px">
                      </div>
                      <div>
                        {{translate(s.level)}}
                      </div>
                      <div v-if="type_of_summary_table=='ghg'">
                        <b>{{format_emission(Global[s.level][s.prefix+'_KPI_GHG']().total)}}</b>
                      </div>
                      <div v-if="type_of_summary_table=='nrg'">
                        <b>{{format_energy(Global[s.level][s.prefix+'_nrg_cons']())}}</b>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div
                      v-for="ss in Structure.filter(ss=>ss.sublevel && ss.level==s.level)"
                      v-if="Global[ss.level][ss.sublevel].length"
                      class="subdivision"
                      :style="{
                        background:'var(--color-level-'+ss.level+'-secondary)',
                        color:'var(--color-level-'+ss.level+')',
                        fontSize:'larger',
                        borderBottom:'1px solid '+ss.color,
                      }"
                    >
                      <div style="padding:1em;text-align:center">
                        <div>
                          <img :src="'frontend/img/'+ss.icon" style="width:40px">
                        </div>
                        <div>
                          {{translate(ss.sublevel)}}
                        </div>
                        <div v-if="type_of_summary_table=='ghg'">
                          <b>{{format_emission(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_KPI_GHG']().total).sum())}}</b>
                        </div>
                        <div v-if="type_of_summary_table=='nrg'">
                          <b>{{format_energy(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_nrg_cons']).sum())}}</b>
                        </div>
                      </div>

                      <div v-if="type_of_summary_table=='ghg'">
                        <div
                          v-for="key in
                            Formulas.ids_per_formula(
                              Global[ss.level][ss.sublevel][0][ss.prefix+'_KPI_GHG']
                            ).sort(emission_sources_order)
                          "
                          style="
                            display:grid;
                            grid-template-columns:28% 18% 18% 18% 18%;
                            align-items:center;
                            padding:5px 0;
                          "
                          v-if="!hide_zero_valued_variables || Global[ss.level][ss.sublevel].map(ss=>ss[key]().total).sum()"
                        >
                          <div>
                            <span v-html="translate(key+'_descr').prettify()"></span>
                          </div>
                          <div
                            v-for="gas in ['total','co2','ch4','n2o']"
                            v-if="gas=='total' || see_emissions_disgregated"
                            :style="{
                              textAlign:'center',
                              fontWeight:gas=='total'?'bold':'',
                            }"
                          >
                            {{
                              format_emission(
                                Global[ss.level][ss.sublevel].map(ss=>ss[key]()[gas]).sum()
                              )
                            }}
                          </div>
                        </div>
                      </div>

                      <div v-if="type_of_summary_table=='nrg'">
                        <div
                          v-for="substage in Global[ss.level][ss.sublevel]"
                          style="
                            align-items:center;
                            padding:5px 0;
                            display:grid;
                            grid-template-columns:28% 18% 18% 18% 18%;
                            text-align:center;
                          "
                        >
                          <div>
                            <span v-html="substage.name.prettify()"></span>
                          </div>
                          <div style="font-weight:bold">
                            {{
                              format_energy(
                                substage[ss.prefix+'_nrg_cons']
                              )
                            }}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!--charts ghg-->
        <div v-if="current_view=='charts_ghg'">
          <!--pie charts ghg-->
          <div
            style="
              display:grid;
              grid-template-columns:50% 50%;
            "
          >
            <div class=chart_container style="border-right:none">
              <div class=chart_title>
                <img src="frontend/img/viti/select_scenario/icon-co2.svg" class=icon_co2>
                <span>{{translate("GHG emissions")}}</span>
              </div>
              <div class=flex>
                <div>
                  <table class=legend>
                    <tr>
                      <td style="background:var(--color-level-Water)"></td>
                      <td>{{translate('Water')}}</td>
                      <td>{{format_emission(Global.Water.ws_KPI_GHG().total)}}</td>
                      <td class=unit v-html="current_unit_ghg.prettify()"></td>
                    </tr>
                    <tr>
                      <td style="background:var(--color-level-Waste)"></td>
                      <td>{{translate('Waste')}}</td>
                      <td>{{format_emission(Global.Waste.ww_KPI_GHG().total)}}</td>
                      <td class=unit v-html="current_unit_ghg.prettify()"></td>
                    </tr>
                  </table>
                </div>
                <div>
                  <div id=chart_1></div>
                </div>
              </div>
            </div>

            <div class=chart_container>
              <div class=chart_title>
                <img src="frontend/img/viti/select_scenario/icon-co2.svg" class=icon_co2>
                {{translate("GHG emissions by stage")}}
              </div>
              <div class=flex>
                <div>
                  <table class=legend>
                    <tr
                      v-for="stage in Structure.filter(s=>s.sublevel)"
                      v-if="Global[stage.level][stage.sublevel].length"
                    >
                      <td :style="{background:stage.color}"></td>
                      <td>
                        {{translate(stage.sublevel)}}
                      </td>
                      <td>
                        {{ format_emission(Global[stage.level][stage.sublevel].map(s=>s[stage.prefix+'_KPI_GHG']().total).sum()) }}
                      </td>
                      <td class=unit v-html="current_unit_ghg.prettify()"></td>
                    </tr>
                  </table>
                </div>
                <div>
                  <div id=chart_2></div>
                </div>
              </div>
            </div>

            <div class=chart_container style="border-right:none">
              <div class=chart_title>
                <img src="frontend/img/viti/select_scenario/icon-co2.svg" class=icon_co2>
                {{translate("GHG emissions by gas emitted")}}
              </div>
              <div
                class=flex
              >
                <div>
                  <table class=legend>
                    <tr v-for="value,key in Global.TotalGHG()" v-if="key!='total'">
                      <td :style="{background:Charts.gas_colors[key]}"></td>
                      <td>
                        <div v-html="key.toUpperCase().prettify()"></div>
                      </td>
                      <td>
                        <div v-html="format_emission(value)"></div>
                      </td>
                      <td class=unit v-html="current_unit_ghg.prettify()"></td>
                    </tr>
                  </table>
                </div>
                <div>
                  <div id=chart_3></div>
                </div>
              </div>
            </div>

            <!--ipcc categories
            <div class=chart_container style="border-right:none">
              <div class=chart_title>
                <img src="frontend/img/viti/select_scenario/icon-co2.svg" class=icon_co2>
                GHG emissions by IPCC category
              </div>
              <div class=flex>
                <table class=legend>
                  <tr v-for="[key,obj] in Object.entries(IPCC_categories)" :title="key">
                    <td :style="{background:obj.color}"></td>
                    <td>
                      {{obj.description}}
                    </td>
                    <td>
                      <div v-html="format_emission(obj.emissions(Global))"></div>
                    </td>
                    <td class=unit v-html="current_unit_ghg.prettify()"></td>
                  </tr>
                </table>
                <div id=chart_ipcc_categories></div>
              </div>
            </div>
            -->
            <div class=chart_container></div>
          </div>

          <!--bar chart ghg substages-->
          <div class="chart_container bar">
            <div class=chart_title style="justify-content:center">
              <img src="frontend/img/viti/select_scenario/icon-co2.svg" class=icon_co2>
              {{translate("GHG emissions by substage")}}
            </div>
            <div>
              <canvas id="bar_chart_ghg_substages" width="400" height="400"></canvas>
            </div>
          </div>
        </div>

        <!--charts nrg-->
        <div v-if="current_view=='charts_nrg'">
          <!--pie charts nrg-->
          <div
            style="
              display:grid;
              grid-template-columns:50% 50%;
            "
          >
            <div class=chart_container style="border-right:none">
              <div class=chart_title>
                <img src="frontend/img/viti/select_scenario/icon-energy.svg" class=icon_nrg>
                {{translate("Energy consumption")}}
              </div>

              <div class=flex>
                <div>
                  <table class=legend>
                    <tr>
                      <td style="background:var(--color-level-Water)"></td>
                      <td>{{translate('Water')}}</td>
                      <td>{{format_energy(Global.Water.ws_nrg_cons())}}</td>
                      <td class=unit v-html="current_unit_nrg"></td>
                    </tr>
                    <tr>
                      <td style="background:var(--color-level-Waste)"></td>
                      <td>{{translate('Waste')}}</td>
                      <td>{{format_energy(Global.Waste.ww_nrg_cons())}}</td>
                      <td class=unit v-html="current_unit_nrg"></td>
                    </tr>
                  </table>
                </div>
                <div>
                  <div id=chart_nrg_levels></div>
                </div>
              </div>
            </div>

            <div class=chart_container>
              <div class=chart_title>
                <img src="frontend/img/viti/select_scenario/icon-energy.svg" class=icon_nrg>
                {{translate("Energy consumption by stage")}}
              </div>

              <div class=flex>
                <div>
                  <table class=legend>
                    <tr v-for="stage in Structure.filter(s=>s.sublevel)">
                      <td :style="{background:stage.color}">
                      </td>
                      <td>
                        {{translate(stage.sublevel)}}
                      </td>
                      <td>
                        {{ format_energy(Global[stage.level][stage.sublevel].map(s=>s[stage.prefix+'_nrg_cons']).sum()) }}
                      </td>
                      <td class=unit v-html="current_unit_nrg"></td>
                    </tr>
                  </table>
                </div>
                <div>
                  <div id=chart_nrg_stages></div>
                </div>
              </div>
            </div>
          </div>

          <!--bar chart nrg substages-->
          <div class="chart_container bar">
            <div class=chart_title style="justify-content:center">
              <img src="frontend/img/viti/select_scenario/icon-energy.svg" class=icon_nrg>
              {{translate("Energy consumption by substage")}}
            </div>
            <div>
              <canvas id="bar_chart_nrg_substages" width="400" height="400"></canvas>
            </div>
          </div>
        </div>

        <!--charts serviced population-->
        <div v-if="current_view=='charts_pop'">
          <div class="chart_container">
            <div class=chart_title>
              {{translate("Serviced population in water supply and wastewater sanitation stages")}}
            </div>
            <br><br>
            <div style="
              display:grid;
              grid-template-columns:50% 50%;
            ">
              <div class=flex>
                <table class=legend>
                  <tr>
                    <td :style="{background:'var(--color-level-Water)'}"></td>
                    <td>{{translate('ws_serv_pop_descr')}}</td>
                    <td>{{format(Global.Water.ws_serv_pop()) }}</td>
                    <td class=unit v-html="translate('people')"></td>
                  </tr>
                  <tr>
                    <td :style="{background:'#eee'}"></td>
                    <td>{{translate('Non-serviced population')}}</td>
                    <td>{{format(Global.Water.ws_resi_pop - Global.Water.ws_serv_pop())}}</td>
                    <td class=unit v-html="translate('people')"></td>
                  </tr>
                </table>
                <div id=pie_chart_ws_serv_pop></div>
              </div>
              <div class=flex>
                <table class=legend>
                  <tr>
                    <td :style="{background:'var(--color-level-Waste)'}"></td>
                    <td>{{translate('ww_serv_pop_descr')}}</td>
                    <td>{{format(Global.Waste.ww_serv_pop()) }}</td>
                    <td class=unit v-html="translate('people')"></td>
                  </tr>
                  <tr>
                    <td :style="{background:'#eee'}"></td>
                    <td>{{translate('Non-serviced population')}}</td>
                    <td>{{format(Global.Waste.ww_resi_pop - Global.Waste.ww_serv_pop()) }}</td>
                    <td class=unit v-html="translate('people')"></td>
                  </tr>
                </table>
                <div id=pie_chart_ww_serv_pop></div>
              </div>
            </div>
          </div>
        </div>
        <!--SFD-->
        <div v-if="current_view=='sfd'">
                    <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <div style="display:flex;gap:.75em;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:.5em;">
              <div style="display:flex;gap:.5em;align-items:center;flex-wrap:wrap;">
                <b>Upload SFD graphic</b>
                <input type="file" accept="image/png,image/jpeg" @change="on_sfd_file_change">
                <button type="button" v-if="sfd_image_dataurl" @click.prevent="clear_sfd_image()">Remove</button>
                <span v-if="sfd_status_msg" style="color:#2c6; font-weight:600; margin-left:.25em;">{{sfd_status_msg}}</span>
              </div>

              <div style="display:flex;gap:.5em;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <button type="button" @click.prevent="download_sfd_jpg()" :disabled="!sfd_image_dataurl">Download JPG</button>
              </div>
            </div>
          </div>

<div id="sfd_export_area" style="display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:1em; align-items:start; width:100%;">
            <div class="chart_container" style="min-width:0;">
              <div class="chart_title">Emissions summary</div>

              <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center; margin-top:1em;">
                <div>
                  <b>OFFSITE SANITATION</b>
                  <table class="legend" style="width:100%; margin-top:.5em;">
                    <tr><td>Collection</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.Collection)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td>Transport</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.Transport)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td>Treatment</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.Treatment)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td><b>{{translate("Total")}}</b></td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.total)}}</b> ({{current_unit_ghg}})</td></tr>
                  </table>
                </div>
                <div><div id="chart_sfd_offsite"></div></div>
              </div>

              <hr style="border-color:#eee; margin:1.2em 0;">

              <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center;">
                <div>
                  <b>ONSITE SANITATION</b>
                  <table class="legend" style="width:100%; margin-top:.5em;">
                    <tr><td>Containment</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Containment)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td>Emptying</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Emptying)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td>Treatment</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Treatment)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td>Discharge</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Discharge)}}</b> ({{current_unit_ghg}})</td></tr>
                    <tr><td><b>{{translate("Total")}}</b></td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.total)}}</b> ({{current_unit_ghg}})</td></tr>
                  </table>
                </div>
                <div><div id="chart_sfd_onsite"></div></div>
              </div>
            </div>

            <div class="chart_container" style="min-width:0;">
              <div class="chart_title">SFD graphic</div>
              <div style="margin-top:1em;">
                <div v-if="sfd_image_dataurl">
                  <img :src="sfd_image_dataurl" style="display:block; width:100%; max-width:100%; height:auto; max-height:72vh; margin:0 auto; border:1px solid #ddd; object-fit:contain; box-sizing:border-box;">
                </div>
                <div v-else style="color:#888; padding:1em; border:1px dashed #ccc;">
                  No SFD image uploaded yet.
                </div>
              </div>
            </div>
          </div>
        </div>

<div v-if="current_view=='sfd_compare'">
  <div class="chart_container" style="margin-top:1em;">
    <div class="chart_title">SFD comparison (Baseline vs Future 2040)</div>

    <div style="display:grid; grid-template-columns:50% 50%; gap:1em; margin-top:1em; align-items:start;">
      <div style="border:1px solid #ddd; padding:1em;">
        <div style="font-weight:700; margin-bottom:.5em;">Baseline scenario</div>
        <div style="margin-bottom:.75em;">
          <b>Upload ECAM JSON</b><br>
          <input type="file" accept=".json,application/json" @change="on_compare_json_upload('baseline',$event)">
          <div v-if="compare_baseline_meta" style="color:#666; font-size:.9em; margin-top:.25em;">
            Loaded: {{compare_baseline_meta}}
          </div>
        </div>
        <div>
          <b>Upload SFD graphic (optional)</b><br>
          <input type="file" accept="image/png,image/jpeg" @change="on_compare_sfd_upload('baseline',$event)">
        </div>
      </div>

      <div style="border:1px solid #ddd; padding:1em;">
        <div style="font-weight:700; margin-bottom:.5em;">Future scenario (2040)</div>
        <div style="margin-bottom:.75em;">
          <b>Upload ECAM JSON</b><br>
          <input type="file" accept=".json,application/json" @change="on_compare_json_upload('future',$event)">
          <div v-if="compare_future_meta" style="color:#666; font-size:.9em; margin-top:.25em;">
            Loaded: {{compare_future_meta}}
          </div>
        </div>
        <div>
          <b>Upload SFD graphic (optional)</b><br>
          <input type="file" accept="image/png,image/jpeg" @change="on_compare_sfd_upload('future',$event)">
        </div>
      </div>
    </div>

    <div style="display:flex; gap:.5em; justify-content:flex-end; margin-top:1em; flex-wrap:wrap;">
      <button type="button" @click.prevent="clear_compare_uploads()" :disabled="!compare_baseline_json && !compare_future_json && !compare_baseline_sfd && !compare_future_sfd">Clear</button>
      <button type="button" @click.prevent="generate_compare_from_uploads()" :disabled="!compare_baseline_json || !compare_future_json">Generate comparison</button>
    </div>

    <div v-if="compare_error" style="margin-top:.75em; color:#b91c1c; font-weight:600;">
      {{compare_error}}
    </div>

    <div v-if="compare_rows && compare_rows.length" style="margin-top:1.25em;">
      <div style="font-weight:700; color:var(--color-level-generic); margin-bottom:.5em;">Comparison table</div>
      <table class="legend" style="width:100%;">
        <tr style="font-weight:700;">
          <td>Component</td>
          <td style="text-align:right;">Baseline</td>
          <td style="text-align:right;">Future</td>
          <td style="text-align:right;">Δ</td>
          <td style="text-align:right;">Δ%</td>
        </tr>

        <tr style="font-weight:700;"><td colspan="5" style="padding-top:.6em;">OFFSITE SANITATION</td></tr>
        <tr v-for="r in get_compare_rows_offsite()" :key="r.key">
          <td>{{r.label}}</td>
          <td style="text-align:right;"><b>{{format_emission(r.baseline)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right;"><b>{{format_emission(r.future)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right;"><b>{{format_emission(r.diff)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right;">{{ r.pct===null ? "-" : format(r.pct,1,1)+'%' }}</td>
        </tr>

        <tr style="font-weight:700;"><td colspan="5" style="padding-top:.9em;">ONSITE SANITATION</td></tr>
        <tr v-for="r in get_compare_rows_onsite()" :key="r.key">
          <td>{{r.label}}</td>
          <td style="text-align:right;"><b>{{format_emission(r.baseline)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right;"><b>{{format_emission(r.future)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right;"><b>{{format_emission(r.diff)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right;">{{ r.pct===null ? "-" : format(r.pct,1,1)+'%' }}</td>
        </tr>

        <tr style="font-weight:700;">
          <td style="padding-top:.9em;">Total (offsite + onsite)</td>
          <td style="text-align:right; padding-top:.9em;"><b>{{format_emission(compare_total_baseline)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right; padding-top:.9em;"><b>{{format_emission(compare_total_future)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right; padding-top:.9em;"><b>{{format_emission(compare_total_diff)}}</b> ({{current_unit_ghg}})</td>
          <td style="text-align:right; padding-top:.9em;">{{ compare_total_pct===null ? "-" : format(compare_total_pct,1,1)+'%' }}</td>
        </tr>
      </table>

      <div style="display:grid; grid-template-columns:50% 50%; gap:1em; margin-top:1.25em; align-items:stretch;">
        <div style="border:1px solid #eee; padding:1em;">
          <div style="font-weight:700; margin-bottom:.75em;">Change summary</div>
          <div style="display:grid; grid-template-columns:42% 58%; row-gap:.75em; column-gap:1em; align-items:center;">
            <div>Total change</div>
            <div :style="{fontWeight:'700', color:compare_change_color()}">{{ compare_change_text() || '-' }}</div>
            <div>Offsite change</div>
            <div>{{ get_compare_rows_offsite().length ? ((get_compare_rows_offsite()[3] && get_compare_rows_offsite()[3].pct!==null) ? format(get_compare_rows_offsite()[3].pct,1,1)+'%' : '-') : '-' }}</div>
            <div>Onsite change</div>
            <div>{{ get_compare_rows_onsite().length ? ((get_compare_rows_onsite()[4] && get_compare_rows_onsite()[4].pct!==null) ? format(get_compare_rows_onsite()[4].pct,1,1)+'%' : '-') : '-' }}</div>
          </div>
        </div>

        <div style="border:1px solid #eee; padding:1em;">
          <div style="font-weight:700; margin-bottom:.75em;">Total emissions comparison</div>
          <div style="display:grid; grid-template-columns:110px 1fr auto; gap:.6em .75em; align-items:center;">
            <div>Baseline</div>
            <div style="background:#eef2f7; border-radius:4px; height:20px; overflow:hidden;">
              <div :style="{width: compare_bar_width(compare_total_baseline)+'%', height:'100%', background:'#4f81bd'}"></div>
            </div>
            <div><b>{{format_emission(compare_total_baseline)}}</b> ({{current_unit_ghg}})</div>

            <div>Future</div>
            <div style="background:#eef2f7; border-radius:4px; height:20px; overflow:hidden;">
              <div :style="{width: compare_bar_width(compare_total_future)+'%', height:'100%', background:'#9bbb59'}"></div>
            </div>
            <div><b>{{format_emission(compare_total_future)}}</b> ({{current_unit_ghg}})</div>
          </div>

          <div style="margin-top:.9em; padding-top:.75em; border-top:1px solid #eee; color:#444;">
            <b>&#916;</b> {{format_emission(compare_total_diff)}} ({{current_unit_ghg}})
            <span v-if="compare_total_pct!==null"> / {{format(compare_total_pct,1,1)}}%</span>
          </div>
        </div>
      </div>

<div class="compare-scenario-grid" style="margin-top:1.25em;">
  <div style="border:1px solid #eee; padding:1em;">
    <div style="font-weight:700; margin-bottom:.75em;">Baseline scenario</div>
    <div style="color:var(--color-level-generic); font-size:large; font-weight:bold; margin-bottom:.75em;">Emissions summary</div>

    <div v-if="compare_baseline_emissions()">
      <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center;">
        <div>
          <b>OFFSITE SANITATION</b>
          <table class="legend" style="width:100%; margin-top:.35em;">
            <tr><td>Collection</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().offsite.Collection)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Transport</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().offsite.Transport)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Treatment</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().offsite.Treatment)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td><b>Total</b></td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().offsite.total)}}</b> ({{current_unit_ghg}})</td></tr>
          </table>
        </div>
        <div><div id="chart_compare_baseline_offsite"></div></div>
      </div>

      <hr style="border-color:#eee; margin:1.2em 0;">

      <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center;">
        <div>
          <b>ONSITE SANITATION</b>
          <table class="legend" style="width:100%; margin-top:.35em;">
            <tr><td>Containment</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().onsite.Containment)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Emptying</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().onsite.Emptying)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Treatment</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().onsite.Treatment)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Discharge</td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().onsite.Discharge)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td><b>Total</b></td><td style="text-align:right;"><b>{{format_emission(compare_baseline_emissions().onsite.total)}}</b> ({{current_unit_ghg}})</td></tr>
          </table>
        </div>
        <div><div id="chart_compare_baseline_onsite"></div></div>
      </div>
    </div>
  </div>

  <div style="border:1px solid #eee; padding:1em;">
    <div style="font-weight:700; margin-bottom:.75em;">Future scenario (2040)</div>
    <div style="color:var(--color-level-generic); font-size:large; font-weight:bold; margin-bottom:.75em;">Emissions summary</div>

    <div v-if="compare_future_emissions()">
      <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center;">
        <div>
          <b>OFFSITE SANITATION</b>
          <table class="legend" style="width:100%; margin-top:.35em;">
            <tr><td>Collection</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().offsite.Collection)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Transport</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().offsite.Transport)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Treatment</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().offsite.Treatment)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td><b>Total</b></td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().offsite.total)}}</b> ({{current_unit_ghg}})</td></tr>
          </table>
        </div>
        <div><div id="chart_compare_future_offsite"></div></div>
      </div>

      <hr style="border-color:#eee; margin:1.2em 0;">

      <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center;">
        <div>
          <b>ONSITE SANITATION</b>
          <table class="legend" style="width:100%; margin-top:.35em;">
            <tr><td>Containment</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().onsite.Containment)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Emptying</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().onsite.Emptying)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Treatment</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().onsite.Treatment)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td>Discharge</td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().onsite.Discharge)}}</b> ({{current_unit_ghg}})</td></tr>
            <tr><td><b>Total</b></td><td style="text-align:right;"><b>{{format_emission(compare_future_emissions().onsite.total)}}</b> ({{current_unit_ghg}})</td></tr>
          </table>
        </div>
        <div><div id="chart_compare_future_onsite"></div></div>
      </div>
    </div>
  </div>
</div>

<div v-if="compare_baseline_sfd || compare_future_sfd" style="display:grid; grid-template-columns:50% 50%; gap:1em; margin-top:1.25em; align-items:start;">
        <div>
          <div style="font-weight:700; margin-bottom:.5em;">Baseline SFD</div>
          <div v-if="compare_baseline_sfd"><img :src="compare_baseline_sfd" style="max-width:100%; height:auto; border:1px solid #ddd;"></div>
        </div>
        <div>
          <div style="font-weight:700; margin-bottom:.5em;">Future SFD</div>
          <div v-if="compare_future_sfd"><img :src="compare_future_sfd" style="max-width:100%; height:auto; border:1px solid #ddd;"></div>
        </div>
      </div>

    </div>
  </div>
</div>

        </div>

      </div>
    </div>
  `,

  updated(){
    let _this=this;
    this.$nextTick(()=>{
      try{
        _this.sync_globals();
        _this.set_sfd_key_from_global_if_empty();
        _this.auto_load_sfd_if_available();

        _this.draw_all_charts();
        try{ _this.draw_sfd_charts(); }catch(e){}
      }catch(e){
        console.warn(e);
      }
    })
  },

  style:`
    <style>
      #summary_ghg {
        padding:1em;
      }
      #summary_ghg table {
        border-collapse:separate;
        border-spacing:3px;
      }
      #summary_ghg table th,
      #summary_ghg table td {
        border:none;
        background:inherit;
        padding:10px;
      }
      #summary_ghg div.number_placeholder {
        width:150px;
        font-size:large;
        font-weight:bold;
        padding:0.5em 0;
        background:white;
        border:1px solid var(--color-level-generic);
        color:var(--color-level-generic);
        margin:0 5px;
      }

      #summary_ghg button[selected]{
        background:var(--color-level-generic);
        color:white;
        outline:none;
      }

      /*pie chart*/
      #summary_ghg div.chart_container {
        background:white;
        border:1px solid #ccc;
        padding:1em;
        border-top:none;
      }
      #summary_ghg div.chart_container div.chart_title{
        color:var(--color-level-generic);
        font-size:large;
        font-weight:bold;
        display:flex;
        align-items:center;
      }
      #summary_ghg div.chart_container div.chart_title img.icon_co2,
      #summary_ghg div.chart_container div.chart_title img.icon_nrg{
        width:50px;
        display:block;
        margin-right:5px;
        margin-bottom:5px;
      }
      #summary_ghg div.chart_container table.legend {
        width:38%;
      }
      #sfd_export_area{
        display:grid !important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr) !important;
        gap:1em;
        align-items:start;
        width:100%;
      }
      #sfd_export_area > .chart_container{
        min-width:0;
        width:100%;
        overflow:hidden;
        box-sizing:border-box;
      }
      #sfd_export_area .chart_container table.legend{
        width:100% !important;
      }
      #sfd_export_area .chart_container img{
        max-width:100% !important;
      }
      @media (max-width: 900px){
        #sfd_export_area{
          grid-template-columns:1fr !important;
        }
      }
      .compare-scenario-grid{
        display:grid;
        grid-template-columns:50% 50%;
        gap:1em;
        align-items:start;
      }
      @media (max-width: 900px){
        .compare-scenario-grid{
          grid-template-columns:1fr;
        }
      }


      #summary_ghg div.chart_container div.bar_background {
        background:#dadada;
        width:100%;
        height:2em;
      }
      #summary_ghg div.chart_container div.bar_background div.progress{
        text-align:center;
        height:2em;
      }

      /*bar chart css*/
      #summary_ghg div.chart_container.bar svg {
        font: 10px sans-serif;
        shape-rendering: crispEdges;
      }
      #summary_ghg div.chart_container.bar .axis path,
      #summary_ghg div.chart_container.bar .axis line {
        fill: none;
        stroke: #000;
      }
      #summary_ghg div.chart_container.bar path.domain {
        stroke: none;
      }
      #summary_ghg div.chart_container.bar .y .tick line {
        stroke: #ddd;
      }

      #summary_ghg div.subdivision{
        display:grid;
        align-items:center;
        grid-template-columns:15% 85%;
      }
    </style>
  `,
});
