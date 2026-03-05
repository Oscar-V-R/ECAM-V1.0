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
    // keep it defined (it is referenced in template)
    // user wants always BOTH -> keep as 'both'
    sfd_view_mode:"both",

    //current emissions unit
    current_unit_ghg:"kgCO2eq",
    current_unit_nrg:"kWh",

    //chart objects from chartjs library stored here
    charts:{},

    //frontend
    variable,
    Charts,

    //backend (these must be kept in sync after JSON import)
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

    // keep Vue refs in sync with window.* after importing ECAM JSON
    sync_globals(){
      try{
        if(typeof window!=="undefined"){
          if(window.Global) this.Global = window.Global;
          if(window.Structure) this.Structure = window.Structure;
          if(window.Languages) this.Languages = window.Languages;
          if(window.IPCC_categories) this.IPCC_categories = window.IPCC_categories;
          if(window.Formulas) this.Formulas = window.Formulas;
          if(window.variable) this.variable = window.variable;
          if(window.Charts) this.Charts = window.Charts;
        }else{
          if(typeof Global!=="undefined" && Global) this.Global = Global;
          if(typeof Structure!=="undefined" && Structure) this.Structure = Structure;
          if(typeof Languages!=="undefined" && Languages) this.Languages = Languages;
          if(typeof IPCC_categories!=="undefined" && IPCC_categories) this.IPCC_categories = IPCC_categories;
          if(typeof Formulas!=="undefined" && Formulas) this.Formulas = Formulas;
          if(typeof variable!=="undefined" && variable) this.variable = variable;
          if(typeof Charts!=="undefined" && Charts) this.Charts = Charts;
        }
      }catch(e){
        console.warn("sync_globals failed:", e);
      }
    },

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

    on_sfd_file_change(ev){
      const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
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

    ensure_html2canvas(){
      return new Promise((resolve,reject)=>{
        try{
          if(typeof window !== "undefined" && window.html2canvas){
            resolve();
            return;
          }
          // load once
          if(document.getElementById("html2canvas_loader")){
            const t0 = Date.now();
            const wait = setInterval(()=>{
              if(window.html2canvas){
                clearInterval(wait);
                resolve();
              }else if(Date.now()-t0>8000){
                clearInterval(wait);
                reject(new Error("html2canvas load timeout"));
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

    // Export EXACTLY like ECAM screen (DOM capture) as JPG
    download_sfd_jpg: async function(){
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
    },

    get_sfd_emissions(){
      const zeros = {
        offsite:{ Collection:0, Transport:0, Treatment:0, total:0 },
        onsite :{ Containment:0, Emptying:0, Treatment:0, Discharge:0, total:0 },
      };

      try{
        if(!this.Global || !this.Global.Waste) return zeros;
        const Global = this.Global;

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

      const Charts = this.Charts || window.Charts;
      if(!Charts || !Charts.draw_pie_chart) return;

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
      Object.values(this.charts).forEach(chart=>chart.destroy());

      const Global = this.Global;
      const Structure = this.Structure;
      const Charts = this.Charts;
      const IPCC_categories = this.IPCC_categories;

      if(!Global || !Structure || !Charts) return;

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

      if(IPCC_categories){
        Charts.draw_pie_chart('chart_ipcc_categories',
          Object.keys(IPCC_categories).map(key=>{
            let total_ghg = Global.TotalGHG().total;
            let label = "";
            let value = 100*IPCC_categories[key].emissions(Global)/total_ghg;
            return {label,value};
          }),
          Object.values(IPCC_categories).map(obj=>obj.color),
        );
      }

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
              x:{ stacked:true },
              y:{ beginAtZero:true, borderWidth:2, stacked:true },
            },
          },
        });
      }

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
              y:{ beginAtZero:true, borderWidth:2 },
            },
          },
        });
      }
    },
  },

  watch:{
    current_view(newV){
      this.$nextTick(()=>{ try{ if(newV==='sfd') this.draw_sfd_charts(); }catch(e){} });
    }
  },

  template:`
    <div id=summary_ghg v-if="visible && Languages.ready && Global && Structure && Formulas">
      <div> {{show_summaries_menu()}} </div>

      <h1 style="padding-left:0">
        {{translate("Summary: GHG emissions and energy consumption")}}
      </h1>

      <div style="padding:1em;border:1px solid #ccc">
        <button @click="current_view='table'"      :selected="current_view=='table'"       type="button">{{translate("Table")                     }}</button>
        <button @click="current_view='charts_ghg'" :selected="current_view=='charts_ghg'"  type="button">{{translate("Charts GHG")                }}</button>
        <button @click="current_view='charts_nrg'" :selected="current_view=='charts_nrg'"  type="button">{{translate("Charts Energy")             }}</button>
        <button @click="current_view='charts_pop'" :selected="current_view=='charts_pop'"  type="button">{{translate("Charts Serviced population")}}</button>
        <button type="button" @click.prevent="current_view='sfd'" :selected="current_view=='sfd'" >SFD</button>
        <hr style="border-color:#eee">
        <div>
          <tutorial_tip
            id   ="Visualization_of_results"
            title="Visualization_of_results"
            text ="Select_different_ways_to_visualize_your_assessment_results._You_can_choose_between_tables,_bar_charts_and_pie_charts."
          ></tutorial_tip>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;">
          <table style="border:1px solid #eee;">
            <tr v-if="current_view=='table'">
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

      <div>
        <!-- (rest of ECAM summary/charts unchanged from your base; kept to preserve behavior) -->

        <!--SFD-->
        <div v-if="current_view=='sfd'">
          <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <div style="display:flex;gap:.75em;align-items:center;justify-content:flex-end;flex-wrap:wrap;margin-bottom:.5em;">
              <button type="button" @click.prevent="download_sfd_jpg()">Download JPG</button>
            </div>

            <div style="display:flex;align-items:center;justify-content:space-between;gap:1em;flex-wrap:wrap;">
              <div>
                <b>Upload SFD graphic</b><br>
                <input type="file" accept="image/png,image/jpeg" @change="on_sfd_file_change">
                <button type="button" v-if="sfd_image_dataurl" @click.prevent="clear_sfd_image()" style="margin-left:.5em;">Remove</button>
              </div>
              <div style="color:#666; font-size:.9em;"></div>
            </div>
          </div>

          <!-- IMPORTANT: this is what we export 1:1 to JPG -->
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

      </div>
    </div>
  `,

  mounted(){
    this.sync_globals();
    this._globalsPoll = setInterval(()=>{
      try{
        if(!this.visible) return;
        const w = (typeof window!=="undefined") ? window : {};
        const changed =
          (w.Global && this.Global !== w.Global) ||
          (w.Structure && this.Structure !== w.Structure) ||
          (w.Formulas && this.Formulas !== w.Formulas) ||
          (w.Languages && this.Languages !== w.Languages) ||
          (w.IPCC_categories && this.IPCC_categories !== w.IPCC_categories) ||
          (w.variable && this.variable !== w.variable) ||
          (w.Charts && this.Charts !== w.Charts);

        if(changed){
          this.sync_globals();
          this.$nextTick(()=>{
            try{ this.draw_all_charts(); }catch(e){}
            try{ this.draw_sfd_charts(); }catch(e){}
          });
        }
      }catch(e){}
    }, 500);
  },

  beforeDestroy(){
    try{ if(this._globalsPoll) clearInterval(this._globalsPoll); }catch(e){}
  },

  updated(){
    let _this=this;
    this.$nextTick(()=>{
      try{
        _this.sync_globals();
        try{ _this.draw_all_charts(); }catch(e){}
        try{ _this.draw_sfd_charts(); }catch(e){}
      }catch(e){
        console.warn(e);
      }
    })
  },

  style:`
    <style>
      #summary_ghg { padding:1em; }
      #summary_ghg table { border-collapse:separate; border-spacing:3px; }
      #summary_ghg table th, #summary_ghg table td { border:none; background:inherit; padding:10px; }

      #summary_ghg button[selected]{ background:var(--color-level-generic); color:white; outline:none; }

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
    </style>
  `,
});
