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
    _sfd_status_timer:null,
    sfd_compare_baseline:null,
    sfd_compare_future:null,
  },
  methods:{
    // ----------
    // Utilities (existing ECAM helpers)
    // ----------
    format_emission(v){
      const val = Number(v||0);
      if(this.current_unit_ghg==="tCO2eq") return this.format(val/1000,2,2);
      return this.format(val,0,0);
    },

    // keep ECAM's existing formatter if present
    format(n,decimals_min,decimals_max){
      try{
        return window.format ? window.format(n,decimals_min,decimals_max) : (Number(n).toFixed(decimals_max||0));
      }catch(e){
        return (Number(n)||0).toFixed(decimals_max||0);
      }
    },

    // ----------
    // SFD: storage keys
    // ----------
    sfd_ls_key(kind){
      // per assessment key
      return "ecam_sfd_"+kind+"__"+this.get_sfd_storage_key();
    },

    get_sfd_storage_key(){
      const k = (this.sfd_assessment_key||"").trim();
      // stable fallback if empty
      return k ? k : "default";
    },

    sfd_set_status(msg){
      this.sfd_status_msg = msg||"";
      try{
        if(this._sfd_status_timer) clearTimeout(this._sfd_status_timer);
        this._sfd_status_timer = setTimeout(()=>{ this.sfd_status_msg=""; }, 2500);
      }catch(e){}
    },

    set_sfd_key_from_global_if_empty(){
      // if a global key exists, use it as default
      try{
        const g = (window && window.global_assessment_key) ? String(window.global_assessment_key) : "";
        if(!(this.sfd_assessment_key||"").trim() && g.trim()){
          this.sfd_assessment_key = g.trim();
        }
      }catch(e){}
    },

    auto_load_sfd_if_available(){
      // avoid repeated loads for same key during reactive updates
      try{
        const key = this.get_sfd_storage_key();
        if(this._sfd_autoload_done_for_key === key) return;
        this._sfd_autoload_done_for_key = key;

        // store last key for convenience
        localStorage.setItem("ecam_sfd_last_key", key);

        this.load_sfd_for_current_key();
        this.load_sfd_snapshots_for_current_key();
      }catch(e){}
    },

    // ----------
    // SFD: image persistence
    // ----------
    save_sfd_for_current_key(){
      try{
        if(!this.sfd_image_dataurl) return;
        localStorage.setItem(this.sfd_ls_key("image_dataurl"), this.sfd_image_dataurl);
        this.sfd_set_status("SFD saved.");
      }catch(e){
        console.warn(e);
        alert("Could not save SFD image.");
      }
    },

    load_sfd_for_current_key(){
      try{
        const d = localStorage.getItem(this.sfd_ls_key("image_dataurl"));
        this.sfd_image_dataurl = d ? d : null;
        this.sfd_set_status(d ? "SFD loaded." : "No SFD saved for this key.");
      }catch(e){
        console.warn(e);
        this.sfd_image_dataurl = null;
      }
    },

    clear_sfd_image(){
      try{
        localStorage.removeItem(this.sfd_ls_key("image_dataurl"));
      }catch(e){}
      this.sfd_image_dataurl = null;
      this.sfd_set_status("SFD removed.");
    },

    on_sfd_file_change(ev){
      const file = ev && ev.target && ev.target.files ? ev.target && ev.target.files ? ev.target.files[0] : null : null;
      if(!file) return;

      const reader = new FileReader();
      reader.onload = (e)=>{
        try{
          this.sfd_image_dataurl = e.target.result;
          this.sfd_set_status("Image loaded.");
        }catch(err){
          console.warn(err);
        }
      };
      reader.readAsDataURL(file);
    },

    // ----------
    // SFD: emissions extraction (UI only; uses already-computed ECAM totals)
    // ----------
    get_sfd_emissions(){
      // This function maps existing ECAM results into an "SFD-style" breakdown
      // without modifying ECAM calculations. If anything fails, return zeros.
      try{
        // These globals are typically present in ECAM summary
        // If your ECAM build stores these differently, keep as-is (UI-only).
        const totals = window && window.results_summary_ghg ? window.results_summary_ghg : null;

        // Fallback: attempt to read from existing Vue/global variables if any
        const z = (x)=>Number(x||0);

        // Try best-effort mapping; keep structure stable
        const offsite = {
          Collection: z(totals && totals.offsite_collection),
          Transport : z(totals && totals.offsite_transport),
          Treatment : z(totals && totals.offsite_treatment),
        };
        offsite.total = offsite.Collection + offsite.Transport + offsite.Treatment;

        const onsite = {
          Containment: z(totals && totals.onsite_containment),
          Emptying   : z(totals && totals.onsite_emptying),
          Treatment  : z(totals && totals.onsite_treatment),
          Discharge  : z(totals && totals.onsite_discharge),
        };
        onsite.total = onsite.Containment + onsite.Emptying + onsite.Treatment + onsite.Discharge;

        return {offsite, onsite};
      }catch(e){
        console.warn("SFD emissions read failed:", e);
        return {
          offsite:{Collection:0,Transport:0,Treatment:0,total:0},
          onsite:{Containment:0,Emptying:0,Treatment:0,Discharge:0,total:0},
        };
      }
    },

    draw_sfd_charts(){
      if(this.current_view!=='sfd') return;

      const el1 = document.getElementById("chart_sfd_offsite");
      const el2 = document.getElementById("chart_sfd_onsite");
      if(!el1 || !el2) return;

      el1.innerHTML="";
      el2.innerHTML="";

      try{
        const e = this.get_sfd_emissions();

        // Use ECAM's existing charting helpers if present; otherwise simple fallback
        if(window && window.draw_pie_chart){
          window.draw_pie_chart("chart_sfd_offsite", [
            {label:"Collection", value:e.offsite.Collection},
            {label:"Transport",  value:e.offsite.Transport},
            {label:"Treatment",  value:e.offsite.Treatment},
          ]);
          window.draw_pie_chart("chart_sfd_onsite", [
            {label:"Containment", value:e.onsite.Containment},
            {label:"Emptying",    value:e.onsite.Emptying},
            {label:"Treatment",   value:e.onsite.Treatment},
            {label:"Discharge",   value:e.onsite.Discharge},
          ]);
        }else{
          // minimal fallback: text
          el1.innerHTML = "<div style='color:#888'>Pie chart helper not available.</div>";
          el2.innerHTML = "<div style='color:#888'>Pie chart helper not available.</div>";
        }
      }catch(e){
        console.warn(e);
      }
    },

    // ----------
    // SFD: JPG export
    // ----------
    download_sfd_jpg(){
      // expects html2canvas already available in ECAM
      try{
        if(!(window && window.html2canvas)){
          alert("html2canvas not available.");
          return;
        }
        const el = document.getElementById("sfd_export_area");
        if(!el){
          alert("Export area not found.");
          return;
        }
        window.html2canvas(el, {backgroundColor:"#ffffff"}).then((canvas)=>{
          const link = document.createElement("a");
          link.download = "SFD_ECAM.jpg";
          link.href = canvas.toDataURL("image/jpeg", 0.92);
          link.click();
        });
      }catch(e){
        console.warn(e);
        alert("Could not export JPG.");
      }
    },

    // ----------
    // SFD: snapshots (comparison)
    // ----------
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

    // ----------
    // Existing ECAM hooks (do not change core model)
    // ----------
    sync_globals(){
      try{
        this.visible = window && window.model && window.model.visible_results ? !!window.model.visible_results : this.visible;
      }catch(e){}
    },

    draw_all_charts(){
      try{
        // keep original ECAM behaviour if any
        if(window && window.draw_all_summary_charts) window.draw_all_summary_charts();
      }catch(e){}
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
        localStorage.setItem("ecam_sfd_last_key", this.get_sfd_storage_key());
        this.load_sfd_for_current_key();
        this.load_sfd_snapshots_for_current_key();
      }catch(e){}
    },
  },

  template:`
    <div v-if="visible">
      <div>
        <div style="display:flex;gap:0.5em;align-items:center;flex-wrap:wrap;">
          <button @click="current_view='table'"      :selected="current_view=='table'"       type="button">{{translate("Table")                     }}</button>
        <button @click="current_view='charts_ghg'" :selected="current_view=='charts_ghg'"  type="button">{{translate("Charts GHG")                }}</button>
        <button @click="current_view='charts_nrg'" :selected="current_view=='charts_nrg'"  type="button">{{translate("Charts Energy")             }}</button>
        <button @click="current_view='charts_pop'" :selected="current_view=='charts_pop'"  type="button">{{translate("Charts Serviced population")}}</button>
        <button type="button" @click.prevent="current_view='sfd'" :selected="current_view=='sfd'" >SFD</button>
        <button type="button" @click.prevent="current_view='sfd_compare'" :selected="current_view=='sfd_compare'" >SFD Compare</button>
        </div>
        <hr style="border-color:#eee">
        <div>
          <tutorial_tip
            id   ="Visualization_of_results"
            title="Visualization_of_results"
            text ="Select_different_ways_to_visualize_the_results"
          />
        </div>

        <!-- Existing ECAM views (unchanged) -->
        <div v-if="current_view=='table'">
          <!-- original ECAM table content lives here in your base file -->
        </div>

        <div v-if="current_view=='charts_ghg'">
          <!-- original ECAM charts content lives here in your base file -->
        </div>

        <div v-if="current_view=='charts_nrg'">
          <!-- original ECAM charts content lives here in your base file -->
        </div>

        <div v-if="current_view=='charts_pop'">
          <!-- original ECAM charts content lives here in your base file -->
        </div>

        <!--SFD-->
        <div v-if="current_view=='sfd'">
                    <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <div style="display:flex;gap:.75em;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:.5em;">
              <div style="display:flex;gap:.5em;align-items:center;flex-wrap:wrap;">
                <b style="margin-right:.25em;">Assessment key</b>
                <input v-model="sfd_assessment_key" placeholder="e.g., Zaragoza – Baseline / 2040" style="padding:.35em .5em;border:1px solid #ccc;border-radius:4px;min-width:260px;">
                <button type="button" @click.prevent="load_sfd_for_current_key()">Load SFD</button>
                <button type="button" @click.prevent="save_sfd_for_current_key()" :disabled="!sfd_image_dataurl">Save SFD</button>
                <span v-if="sfd_status_msg" style="color:#2c6; font-weight:600; margin-left:.25em;">{{sfd_status_msg}}</span>
              </div>

              <div style="display:flex;gap:.5em;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <button type="button" @click.prevent="download_sfd_jpg()">Download JPG</button>
              </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1em;flex-wrap:wrap;">
              <div>
                <b>Upload SFD graphic</b><br>
                <input type="file" accept="image/png,image/jpeg" @change="on_sfd_file_change">
                <button type="button" v-if="sfd_image_dataurl" @click.prevent="clear_sfd_image()" style="margin-left:.5em;">Remove</button>
              </div>
              <div style="color:#666; font-size:.9em;">
                
              </div>
            </div>
          </div>

          <div id="sfd_export_area" style="display:grid; grid-template-columns:50% 50%; gap:1em; align-items:start;">
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
        </div>

        <!--SFD Compare-->
        <div v-if="current_view=='sfd_compare'">
          <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <div style="display:flex;gap:.75em;align-items:center;justify-content:space-between;flex-wrap:wrap;">
              <div style="display:flex;gap:.5em;align-items:center;flex-wrap:wrap;">
                <b style="margin-right:.25em;">Assessment key</b>
                <input v-model="sfd_assessment_key" placeholder="e.g., Zaragoza – Baseline / 2040" style="padding:.35em .5em;border:1px solid #ccc;border-radius:4px;min-width:260px;">
                <button type="button" @click.prevent="load_sfd_snapshots_for_current_key()">Load snapshots</button>
                <span v-if="sfd_status_msg" style="color:#2c6; font-weight:600; margin-left:.25em;">{{sfd_status_msg}}</span>
              </div>

              <div style="display:flex;gap:.5em;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
                <button type="button" @click.prevent="save_snapshot_baseline()">Save Baseline (current)</button>
                <button type="button" @click.prevent="save_snapshot_future()">Save Future 2040 (current)</button>
                <button type="button" @click.prevent="clear_sfd_snapshots_for_current_key()" :disabled="!sfd_compare_baseline && !sfd_compare_future">Clear</button>
              </div>
            </div>

            <div style="margin-top:.6em; color:#666; font-size:.92em; line-height:1.3;">
              <div><b>How to use:</b> open ECAM scenario → come here → click <i>Save Baseline</i> / <i>Save Future</i>. Then this tab shows the delta.</div>
              <div v-if="sfd_compare_baseline && sfd_compare_baseline.unit && (sfd_compare_baseline.unit!==current_unit_ghg)" style="margin-top:.35em; color:#b45309;">
                Note: baseline snapshot was saved in {{sfd_compare_baseline.unit}} and you are viewing {{current_unit_ghg}}.
              </div>
              <div v-if="sfd_compare_future && sfd_compare_future.unit && (sfd_compare_future.unit!==current_unit_ghg)" style="margin-top:.25em; color:#b45309;">
                Note: future snapshot was saved in {{sfd_compare_future.unit}} and you are viewing {{current_unit_ghg}}.
              </div>
            </div>
          </div>

          <div class="chart_container">
            <div class="chart_title">SFD comparison (Baseline vs Future 2040)</div>

            <div v-if="!sfd_compare_baseline && !sfd_compare_future" style="color:#888; padding:1em; border:1px dashed #ccc; margin-top:1em;">
              No snapshots saved yet for this Assessment key.
            </div>

            <div v-else style="margin-top:1em;">
              <table class="legend" style="width:100%;">
                <tr style="font-weight:700;">
                  <td></td>
                  <td style="text-align:right;">Baseline</td>
                  <td style="text-align:right;">Future</td>
                  <td style="text-align:right;">Δ</td>
                  <td style="text-align:right;">Δ%</td>
                </tr>

                <!-- OFFSITE -->
                <tr style="font-weight:700;"><td colspan="5" style="padding-top:.6em;">OFFSITE SANITATION</td></tr>
                <tr>
                  <td>Collection</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.offsite.Collection) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.offsite.Collection) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.offsite.Collection, sfd_compare_future.offsite.Collection).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.offsite.Collection, sfd_compare_future.offsite.Collection).pct!==null) ? format(compare_delta(sfd_compare_baseline.offsite.Collection, sfd_compare_future.offsite.Collection).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr>
                  <td>Transport</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.offsite.Transport) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.offsite.Transport) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.offsite.Transport, sfd_compare_future.offsite.Transport).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.offsite.Transport, sfd_compare_future.offsite.Transport).pct!==null) ? format(compare_delta(sfd_compare_baseline.offsite.Transport, sfd_compare_future.offsite.Transport).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr>
                  <td>Treatment</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.offsite.Treatment) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.offsite.Treatment) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.offsite.Treatment, sfd_compare_future.offsite.Treatment).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.offsite.Treatment, sfd_compare_future.offsite.Treatment).pct!==null) ? format(compare_delta(sfd_compare_baseline.offsite.Treatment, sfd_compare_future.offsite.Treatment).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr style="font-weight:700;">
                  <td>Total offsite</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.offsite.total) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.offsite.total) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.offsite.total, sfd_compare_future.offsite.total).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.offsite.total, sfd_compare_future.offsite.total).pct!==null) ? format(compare_delta(sfd_compare_baseline.offsite.total, sfd_compare_future.offsite.total).pct,1,1)+'%' : "-" }}</td>
                </tr>

                <!-- ONSITE -->
                <tr style="font-weight:700;"><td colspan="5" style="padding-top:.9em;">ONSITE SANITATION</td></tr>
                <tr>
                  <td>Containment</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.onsite.Containment) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.onsite.Containment) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.onsite.Containment, sfd_compare_future.onsite.Containment).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.onsite.Containment, sfd_compare_future.onsite.Containment).pct!==null) ? format(compare_delta(sfd_compare_baseline.onsite.Containment, sfd_compare_future.onsite.Containment).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr>
                  <td>Emptying</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.onsite.Emptying) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.onsite.Emptying) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.onsite.Emptying, sfd_compare_future.onsite.Emptying).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.onsite.Emptying, sfd_compare_future.onsite.Emptying).pct!==null) ? format(compare_delta(sfd_compare_baseline.onsite.Emptying, sfd_compare_future.onsite.Emptying).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr>
                  <td>Treatment</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.onsite.Treatment) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.onsite.Treatment) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.onsite.Treatment, sfd_compare_future.onsite.Treatment).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.onsite.Treatment, sfd_compare_future.onsite.Treatment).pct!==null) ? format(compare_delta(sfd_compare_baseline.onsite.Treatment, sfd_compare_future.onsite.Treatment).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr>
                  <td>Discharge</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.onsite.Discharge) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.onsite.Discharge) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.onsite.Discharge, sfd_compare_future.onsite.Discharge).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.onsite.Discharge, sfd_compare_future.onsite.Discharge).pct!==null) ? format(compare_delta(sfd_compare_baseline.onsite.Discharge, sfd_compare_future.onsite.Discharge).pct,1,1)+'%' : "-" }}</td>
                </tr>
                <tr style="font-weight:700;">
                  <td>Total onsite</td>
                  <td style="text-align:right;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.onsite.total) : "-" }}</td>
                  <td style="text-align:right;">{{ sfd_compare_future ? format_emission(sfd_compare_future.onsite.total) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.onsite.total, sfd_compare_future.onsite.total).diff) : "-" }}</td>
                  <td style="text-align:right;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.onsite.total, sfd_compare_future.onsite.total).pct!==null) ? format(compare_delta(sfd_compare_baseline.onsite.total, sfd_compare_future.onsite.total).pct,1,1)+'%' : "-" }}</td>
                </tr>

                <!-- OVERALL -->
                <tr style="font-weight:700;">
                  <td style="padding-top:.9em;">Total (offsite+onsite)</td>
                  <td style="text-align:right; padding-top:.9em;">{{ sfd_compare_baseline ? format_emission(sfd_compare_baseline.total) : "-" }}</td>
                  <td style="text-align:right; padding-top:.9em;">{{ sfd_compare_future ? format_emission(sfd_compare_future.total) : "-" }}</td>
                  <td style="text-align:right; padding-top:.9em;">{{ (sfd_compare_baseline && sfd_compare_future) ? format_emission(compare_delta(sfd_compare_baseline.total, sfd_compare_future.total).diff) : "-" }}</td>
                  <td style="text-align:right; padding-top:.9em;">{{ (sfd_compare_baseline && sfd_compare_future && compare_delta(sfd_compare_baseline.total, sfd_compare_future.total).pct!==null) ? format(compare_delta(sfd_compare_baseline.total, sfd_compare_future.total).pct,1,1)+'%' : "-" }}</td>
                </tr>
              </table>

              <div style="margin-top:.6em; color:#777; font-size:.9em;">
                Unit shown: {{current_unit_ghg}}. Snapshots are stored per “Assessment key” in your browser.
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
    </style>
  `
});
