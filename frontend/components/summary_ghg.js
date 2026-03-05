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
    // keep it defined (it was referenced in template before)
    // user wants always BOTH -> we keep the field but we don't hide anything based on it
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
        // use window.* as source of truth if present
        if(typeof window!=="undefined"){
          if(window.Global) this.Global = window.Global;
          if(window.Structure) this.Structure = window.Structure;
          if(window.Languages) this.Languages = window.Languages;
          if(window.IPCC_categories) this.IPCC_categories = window.IPCC_categories;
          if(window.Formulas) this.Formulas = window.Formulas;
          if(window.variable) this.variable = window.variable;
          if(window.Charts) this.Charts = window.Charts;
        }else{
          // fallback to globals (non-window contexts)
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

    // Download a single JPG image containing: emissions numbers + pie charts + the SFD graphic
    download_sfd_jpg(){
      if(!this.sfd_image_dataurl){
        alert("Please upload an SFD image first.");
        return;
      }

      const e = this.get_sfd_emissions();
      const unit = this.current_unit_ghg;

      const W = 1600;
      const H = 1000;
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0,0,W,H);

      const fmt = (v)=>this.format_emission(v);
      ctx.fillStyle="#000";
      ctx.font="700 34px Arial";
      ctx.fillText("ECAM – SFD + Emissions Summary", 50, 60);

      // --- Layout (centered like ECAM) ---
      const margin = 80;   // outer margin
      const gap    = 70;   // gap between left panel and SFD panel

      // Right panel (SFD)
      const boxW = 800;
      const boxH = 820;
      const boxX = W - margin - boxW;
      const boxY = 140;

      // Left panel (numbers + pies)
      const leftX = margin;
      const leftRight = boxX - gap;
      const leftW = leftRight - leftX;

      // Right-aligned column for values (replaces fixed 650)
      const colRight = leftRight;

      // Pie X center inside the left panel
      const pieCX = leftX + Math.round(leftW * 0.78);

      // Tops
      const topY = 110;
      ctx.font="700 20px Arial";
      ctx.fillText("OFFSITE SANITATION", leftX, topY);

      const line = (label, val, y, bold=false)=>{
        ctx.font = (bold ? "700 18px Arial":"18px Arial");
        ctx.fillStyle="#000";
        ctx.fillText(label, leftX, y);
        const txt = `${fmt(val)} (${unit})`;
        const tw = ctx.measureText(txt).width;
        ctx.fillText(txt, colRight - tw, y);
      };

      line("Collection", e.offsite.Collection, topY+40);
      line("Transport",  e.offsite.Transport,  topY+70);
      line("Treatment",  e.offsite.Treatment,  topY+100);
      line("Total",      e.offsite.total,      topY+140, true);

      const drawPie = (cx, cy, r, values, colors)=>{
        const tot = values.reduce((p,c)=>p+c,0);
        if(tot<=0){
          ctx.fillStyle="#eee";
          ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fill();
          return;
        }
        let a = -Math.PI/2;
        for(let i=0;i<values.length;i++){
          const v=values[i];
          const ang = (v/tot)*Math.PI*2;
          ctx.fillStyle = colors[i] || "#ccc";
          ctx.beginPath();
          ctx.moveTo(cx,cy);
          ctx.arc(cx,cy,r,a,a+ang);
          ctx.closePath();
          ctx.fill();
          a += ang;
        }
        ctx.strokeStyle="#fff";
        ctx.lineWidth=3;
        ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
      };

      drawPie(pieCX, topY+85, 90,
        [e.offsite.Collection, e.offsite.Transport, e.offsite.Treatment],
        ["#4f81bd","#f79646","#9bbb59"]
      );

      const y2 = topY+260;
      ctx.font="700 20px Arial";
      ctx.fillText("ONSITE SANITATION", leftX, y2);

      line("Containment", e.onsite.Containment, y2+40);
      line("Emptying",    e.onsite.Emptying,    y2+70);
      line("Treatment",   e.onsite.Treatment,   y2+100);
      line("Discharge",   e.onsite.Discharge,   y2+130);
      line("Total",       e.onsite.total,       y2+170, true);

      drawPie(pieCX, y2+110, 90,
        [e.onsite.Containment, e.onsite.Emptying, e.onsite.Treatment, e.onsite.Discharge],
        ["#4f81bd","#f79646","#9bbb59","#c9c9c9"]
      );

      const img = new Image();
      img.onload = () => {
        ctx.fillStyle="#000";
        ctx.font="700 20px Arial";
        ctx.fillText("SFD graphic", boxX, 120);

        const scale = Math.min(boxW / img.width, boxH / img.height);
        const dw = img.width * scale;
        const dh = img.height * scale;
        const dx = boxX + (boxW - dw)/2;
        const dy = boxY + (boxH - dh)/2;

        ctx.strokeStyle="#ddd";
        ctx.lineWidth=2;
        ctx.strokeRect(boxX, boxY, boxW, boxH);

        ctx.drawImage(img, dx, dy, dw, dh);

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
      };
      img.onerror = () => alert("Could not load SFD image for export.");
      img.src = this.sfd_image_dataurl;
    },

    get_sfd_emissions(){
      const zeros = {
        offsite:{ Collection:0, Transport:0, Treatment:0, total:0 },
        onsite :{ Containment:0, Emptying:0, Treatment:0, Discharge:0, total:0 },
      };

      try{
        // IMPORTANT: use the current (synced) reference
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

      // IMPORTANT: use the current charts helper (synced)
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
      //destroy all charts
      Object.values(this.charts).forEach(chart=>chart.destroy());

      // IMPORTANT: use current (synced) refs
      const Global = this.Global;
      const Structure = this.Structure;
      const Charts = this.Charts;
      const IPCC_categories = this.IPCC_categories;

      if(!Global || !Structure || !Charts) return;

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
              x:{ stacked:true },
              y:{ beginAtZero:true, borderWidth:2, stacked:true },
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
              y:{ beginAtZero:true, borderWidth:2 },
            },
          },
        });
      }
    },
  },

  watch:{
    current_view(newV){
      // DO NOT clear the uploaded SFD image just because the user clicks the tab.
      // Only redraw charts when entering SFD.
      this.$nextTick(()=>{ try{ if(newV==='sfd') this.draw_sfd_charts(); }catch(e){} });
    }
  },

  template:`
    <div id=summary_ghg v-if="visible && Languages.ready && Global && Structure && Formulas">
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

              <div style="margin-top:1em; color:#888; font-size:.9em;"></div>
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
    // initial sync + keep syncing after JSON import (ECAM replaces window.Global)
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
