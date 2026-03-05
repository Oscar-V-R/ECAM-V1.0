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


    // SFD Compare (file-based, no local storage)
    compare_baseline_raw:null,
    compare_future_raw:null,
    compare_baseline_sfd:null,
    compare_future_sfd:null,
    compare_error:"",
    compare_result_ready:false,
    compare_rows_offsite:[],
    compare_rows_onsite:[],
    compare_total:{baseline:0,future:0,diff:0,pct:null},

    // SFD persistence / comparison
    sfd_assessment_key:"",
    _sfd_autoload_done_for_key:null,
    sfd_status_msg:"",
    sfd_compare_baseline:null,
    sfd_compare_future:null,

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

    // ----------
    // SFD Compare (file-based)
    // ----------
    on_compare_baseline_json(ev){
      const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (e)=>{
        try{
          this.compare_baseline_raw = JSON.parse(e.target.result);
          this.compare_error = "";
          this.compare_result_ready = false;
        }catch(err){
          console.warn(err);
          this.compare_baseline_raw = null;
          this.compare_error = "Could not read Baseline JSON (invalid JSON).";
          this.compare_result_ready = false;
        }
      };
      reader.readAsText(file);
    },

    on_compare_future_json(ev){
      const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (e)=>{
        try{
          this.compare_future_raw = JSON.parse(e.target.result);
          this.compare_error = "";
          this.compare_result_ready = false;
        }catch(err){
          console.warn(err);
          this.compare_future_raw = null;
          this.compare_error = "Could not read Future JSON (invalid JSON).";
          this.compare_result_ready = false;
        }
      };
      reader.readAsText(file);
    },

    on_compare_baseline_sfd(ev){
      const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (e)=>{ this.compare_baseline_sfd = e.target.result; };
      reader.readAsDataURL(file);
    },

    on_compare_future_sfd(ev){
      const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (e)=>{ this.compare_future_sfd = e.target.result; };
      reader.readAsDataURL(file);
    },

    clear_compare_inputs(){
      this.compare_baseline_raw = null;
      this.compare_future_raw = null;
      this.compare_baseline_sfd = null;
      this.compare_future_sfd = null;
      this.compare_rows_offsite = [];
      this.compare_rows_onsite = [];
      this.compare_total = {baseline:0,future:0,diff:0,pct:null};
      this.compare_result_ready = false;
      this.compare_error = "";
    },

    _deepFindFirstNumberByKey(obj, keyCandidates){
      // keyCandidates: array of strings; case-insensitive exact match on object keys
      const targets = (keyCandidates||[]).map(s=>String(s).toLowerCase());
      const seen = new Set();
      const walk = (x)=>{
        if(x===null || x===undefined) return null;
        if(typeof x === "number" && isFinite(x)) return null; // plain numbers without key context ignored
        if(typeof x !== "object") return null;
        if(seen.has(x)) return null;
        seen.add(x);

        if(Array.isArray(x)){
          for(const it of x){
            const r = walk(it);
            if(typeof r === "number") return r;
          }
          return null;
        }

        // object
        for(const k of Object.keys(x)){
          const kl = String(k).toLowerCase();
          const v = x[k];
          if(targets.includes(kl)){
            const num = Number(v);
            if(isFinite(num)) return num;
          }
        }
        // recurse
        for(const k of Object.keys(x)){
          const r = walk(x[k]);
          if(typeof r === "number") return r;
        }
        return null;
      };
      return walk(obj);
    },

    _extract_emissions_from_ecam_json(raw){
      // Robust extraction: tries multiple key variants across nested JSON.
      const get = (keys)=>{
        const v = this._deepFindFirstNumberByKey(raw, keys);
        return (typeof v === "number" && isFinite(v)) ? v : 0;
      };

      const off_collection = get(["offsite_collection","offsiteCollection","offsite_collect","collection_offsite","ghg_offsite_collection"]);
      const off_transport  = get(["offsite_transport","offsiteTransport","offsite_trans","transport_offsite","ghg_offsite_transport"]);
      const off_treatment  = get(["offsite_treatment","offsiteTreatment","offsite_treat","treatment_offsite","ghg_offsite_treatment"]);

      const on_containment = get(["onsite_containment","onsiteContainment","onsite_contain","containment_onsite","ghg_onsite_containment"]);
      const on_emptying    = get(["onsite_emptying","onsiteEmptying","emptying_onsite","ghg_onsite_emptying"]);
      const on_treatment   = get(["onsite_treatment","onsiteTreatment","onsite_treat","treatment_onsite","ghg_onsite_treatment"]);
      const on_discharge   = get(["onsite_discharge","onsiteDischarge","discharge_onsite","ghg_onsite_discharge"]);

      const off_total = off_collection + off_transport + off_treatment;
      const on_total  = on_containment + on_emptying + on_treatment + on_discharge;
      const total = off_total + on_total;

      return {
        offsite:{Collection:off_collection, Transport:off_transport, Treatment:off_treatment, total:off_total},
        onsite:{Containment:on_containment, Emptying:on_emptying, Treatment:on_treatment, Discharge:on_discharge, total:on_total},
        total
      };
    },

    _mk_row(label, b, f){
      const diff = (f||0) - (b||0);
      const pct = (b!==0) ? (100*diff/b) : null;
      return {label, baseline:(b||0), future:(f||0), diff, pct};
    },

    compute_compare(){
      try{
        this.compare_error = "";
        this.compare_result_ready = false;

        if(!this.compare_baseline_raw || !this.compare_future_raw){
          this.compare_error = "Please upload both Baseline and Future ECAM JSON files.";
          return;
        }

        const B = this._extract_emissions_from_ecam_json(this.compare_baseline_raw);
        const F = this._extract_emissions_from_ecam_json(this.compare_future_raw);

        this.compare_rows_offsite = [
          this._mk_row("Collection", B.offsite.Collection, F.offsite.Collection),
          this._mk_row("Transport",  B.offsite.Transport,  F.offsite.Transport),
          this._mk_row("Treatment",  B.offsite.Treatment,  F.offsite.Treatment),
          this._mk_row("Total offsite", B.offsite.total, F.offsite.total),
        ];

        this.compare_rows_onsite = [
          this._mk_row("Containment", B.onsite.Containment, F.onsite.Containment),
          this._mk_row("Emptying",    B.onsite.Emptying,    F.onsite.Emptying),
          this._mk_row("Treatment",   B.onsite.Treatment,   F.onsite.Treatment),
          this._mk_row("Discharge",   B.onsite.Discharge,   F.onsite.Discharge),
          this._mk_row("Total onsite", B.onsite.total, F.onsite.total),
        ];

        this.compare_total = this._mk_row("Total (offsite+onsite)", B.total, F.total);

        this.compare_result_ready = true;
      }catch(e){
        console.warn(e);
        this.compare_error = "Comparison failed (could not parse emissions from the provided JSON files).";
        this.compare_result_ready = false;
      }
    },

  },

  watch:{
    current_view(newV){
      this.$nextTick(()=>{ try{ if(newV==='sfd') this.draw_sfd_charts(); }catch(e){} });
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
        <button type="button" @click.prevent="current_view=\'sfd_compare\'" :selected="current_view==\'sfd_compare\'" >SFD Compare</button>
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
                    <div style=\"margin:1em 0; padding:1em; border:1px solid #ccc;\">
            <div style=\"display:flex;gap:.75em;align-items:center;justify-content:space-between;flex-wrap:wrap;\">
              <div>
                <b>Upload SFD graphic</b><br>
                <input type=\"file\" accept=\"image/png,image/jpeg\" @change=\"on_sfd_file_change\">
                <button type=\"button\" v-if=\"sfd_image_dataurl\" @click.prevent=\"clear_sfd_image()\" style=\"margin-left:.5em;\">Remove</button>
              </div>
              <div style=\"display:flex;gap:.5em;align-items:center;flex-wrap:wrap;justify-content:flex-end;\">
                <button type=\"button\" @click.prevent=\"download_sfd_jpg()\" :disabled=\"!sfd_image_dataurl\">Download JPG</button>
              </div>
            </div>
          </div>

          <div id=\"sfd_export_area\" style="display:grid; grid-template-columns:50% 50%; gap:1em; align-items:start;">
            <div class="chart_container">
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
            </div>

            <div class="chart_container">
              <div class="chart_title">SFD graphic</div>
              <div style="margin-top:1em;">
                <div v-if="sfd_image_dataurl">
                  <img :src="sfd_image_dataurl" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ddd;">
                </div>
                <div v-else style="color:#888; padding:1em; border:1px dashed #ccc;">
                  No SFD image uploaded yet.
                </div>
              </div>
            </div>
          </div>

        <!--SFD Compare-->
        <div v-if="current_view=='sfd_compare'">
          <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <div style="display:grid; grid-template-columns:50% 50%; gap:1em; align-items:start;">
              <div>
                <div style="font-weight:700; color:var(--color-level-generic); margin-bottom:.5em;">Baseline scenario</div>
                <div style="margin-bottom:.75em;">
                  <b>Upload ECAM JSON</b><br>
                  <input type="file" accept="application/json,.json" @change="on_compare_baseline_json">
                </div>
                <div>
                  <b>Upload SFD graphic (optional)</b><br>
                  <input type="file" accept="image/png,image/jpeg" @change="on_compare_baseline_sfd">
                </div>
              </div>

              <div>
                <div style="font-weight:700; color:var(--color-level-generic); margin-bottom:.5em;">Future scenario (2040)</div>
                <div style="margin-bottom:.75em;">
                  <b>Upload ECAM JSON</b><br>
                  <input type="file" accept="application/json,.json" @change="on_compare_future_json">
                </div>
                <div>
                  <b>Upload SFD graphic (optional)</b><br>
                  <input type="file" accept="image/png,image/jpeg" @change="on_compare_future_sfd">
                </div>
              </div>
            </div>

            <div style="margin-top:1em; display:flex; gap:.5em; flex-wrap:wrap; align-items:center; justify-content:flex-end;">
              <button type="button" @click.prevent="clear_compare_inputs()" :disabled="!compare_baseline_raw && !compare_future_raw && !compare_baseline_sfd && !compare_future_sfd">Clear</button>
              <button type="button" @click.prevent="compute_compare()" :disabled="!compare_baseline_raw || !compare_future_raw">Generate comparison</button>
            </div>

            <div v-if="compare_error" style="margin-top:.75em; color:#b91c1c; font-weight:600;">
              {{compare_error}}
            </div>
          </div>

          <div class="chart_container">
            <div class="chart_title">Comparison (Baseline vs Future 2040)</div>

            <div v-if="!compare_result_ready" style="color:#888; padding:1em; border:1px dashed #ccc; margin-top:1em;">
              Upload both ECAM JSON files and click “Generate comparison”.
            </div>

            <div v-else style="margin-top:1em;">
              <table class="legend" style="width:100%;">
                <tr style="font-weight:700;">
                  <td>Component</td>
                  <td style="text-align:right;">Baseline</td>
                  <td style="text-align:right;">Future</td>
                  <td style="text-align:right;">Δ</td>
                  <td style="text-align:right;">Δ%</td>
                </tr>

                <tr style="font-weight:700;"><td colspan="5" style="padding-top:.6em;">OFFSITE SANITATION</td></tr>
                <tr v-for="row in compare_rows_offsite">
                  <td>{{row.label}}</td>
                  <td style="text-align:right;">{{format_emission(row.baseline)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right;">{{format_emission(row.future)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right;">{{format_emission(row.diff)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right;">{{ row.pct===null ? '-' : format(row.pct,1,1)+'%' }}</td>
                </tr>

                <tr style="font-weight:700;"><td colspan="5" style="padding-top:.9em;">ONSITE SANITATION</td></tr>
                <tr v-for="row in compare_rows_onsite">
                  <td>{{row.label}}</td>
                  <td style="text-align:right;">{{format_emission(row.baseline)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right;">{{format_emission(row.future)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right;">{{format_emission(row.diff)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right;">{{ row.pct===null ? '-' : format(row.pct,1,1)+'%' }}</td>
                </tr>

                <tr style="font-weight:700;">
                  <td style="padding-top:.9em;">TOTAL (offsite+onsite)</td>
                  <td style="text-align:right; padding-top:.9em;">{{format_emission(compare_total.baseline)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right; padding-top:.9em;">{{format_emission(compare_total.future)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right; padding-top:.9em;">{{format_emission(compare_total.diff)}} <span class="unit" v-html="current_unit_ghg.prettify()"></span></td>
                  <td style="text-align:right; padding-top:.9em;">{{ compare_total.pct===null ? '-' : format(compare_total.pct,1,1)+'%' }}</td>
                </tr>
              </table>

              <div style="margin-top:1em; display:grid; grid-template-columns:50% 50%; gap:1em;" v-if="compare_baseline_sfd || compare_future_sfd">
                <div class="chart_container" style="border:1px solid #eee;">
                  <div class="chart_title">Baseline SFD</div>
                  <div style="margin-top:1em;">
                    <img v-if="compare_baseline_sfd" :src="compare_baseline_sfd" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ddd;">
                    <div v-else style="color:#888; padding:1em; border:1px dashed #ccc;">No baseline SFD uploaded.</div>
                  </div>
                </div>
                <div class="chart_container" style="border:1px solid #eee;">
                  <div class="chart_title">Future SFD</div>
                  <div style="margin-top:1em;">
                    <img v-if="compare_future_sfd" :src="compare_future_sfd" style="max-width:100%; height:auto; display:block; margin:0 auto; border:1px solid #ddd;">
                    <div v-else style="color:#888; padding:1em; border:1px dashed #ccc;">No future SFD uploaded.</div>
                  </div>
                </div>
              </div>

              <div style="margin-top:.75em; color:#777; font-size:.9em;">
                Tip: export one JSON from ECAM for Baseline, switch scenario, export another JSON for Future, then upload both here.
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
