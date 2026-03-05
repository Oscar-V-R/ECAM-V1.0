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
    sfd_storage_key:"ecam_sfd_image_v1",
    sfd_image_dataurl:null,
    sfd_loaded_from_storage:false,

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
      let digits = undefined;
      return format(number,digits,divisor);
    },

    format_energy(number){
      let divisor = this.current_unit_nrg=='MWh' ? 1000:1;
      let digits = undefined;
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
    ensure_sfd_loaded(){
      if(this.sfd_loaded_from_storage) return;
      this.sfd_loaded_from_storage=true;
      try{
        let saved = localStorage.getItem(this.sfd_storage_key);
        if(saved) this.sfd_image_dataurl = saved;
      }catch(e){
        console.warn("SFD localStorage read failed:", e);
      }
    },

    on_sfd_file_change(ev){
      const file = ev && ev.target && ev.target.files ? ev.target.files[0] : null;
      if(!file) return;

      const ok = /image\/(png|jpeg)/i.test(file.type);
      if(!ok){
        alert(this.translate("Please upload a PNG or JPG image."));
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        this.sfd_image_dataurl = reader.result;
        try{
          localStorage.setItem(this.sfd_storage_key, this.sfd_image_dataurl);
        }catch(e){
          console.warn("SFD localStorage write failed:", e);
        }
      };
      reader.readAsDataURL(file);
    },

    clear_sfd_image(){
      this.sfd_image_dataurl=null;
      try{ localStorage.removeItem(this.sfd_storage_key); }catch(e){}
    },

    // Group ECAM results into OFFSITE / ONSITE buckets (read-only)
    get_sfd_emissions(){
      const zeros = {
        offsite:{ Collection:0, Transport:0, Treatment:0, total:0 },
        onsite :{ Containment:0, Emptying:0, Treatment:0, Discharge:0, total:0 },
      };

      try{
        if(!Global || !Global.Waste) return zeros;

        // OFFSITE SANITATION
        const off_collection =
          (Global.Waste.Collection||[]).map(s =>
            (s.wwc_KPI_GHG_col  ? s.wwc_KPI_GHG_col().total  : 0) +
            (s.wwc_KPI_GHG_cso  ? s.wwc_KPI_GHG_cso().total  : 0) +
            (s.wwc_KPI_GHG_elec ? s.wwc_KPI_GHG_elec().total : 0)
          ).sum();

        const off_transport =
          (Global.Waste.Collection||[]).map(s =>
            (s.wwc_KPI_GHG_fuel ? s.wwc_KPI_GHG_fuel().total : 0)
          ).sum();

        const off_treatment =
          (Global.Waste.Treatment||[]).map(s =>
            (s.wwt_KPI_GHG ? s.wwt_KPI_GHG().total : 0) +
            (s.wwt_KPI_GHG_elec ? s.wwt_KPI_GHG_elec().total : 0) +
            (s.wwt_KPI_GHG_fuel ? s.wwt_KPI_GHG_fuel().total : 0)
          ).sum();

        const off_total = off_collection + off_transport + off_treatment;

        // ONSITE SANITATION
        const on_containment =
          (Global.Waste.Onsite||[]).map(s =>
            (s.wwo_KPI_GHG_containment ? s.wwo_KPI_GHG_containment().total : 0)
          ).sum();

        const on_emptying =
          (Global.Waste.Onsite||[]).map(s =>
            (s.wwo_KPI_GHG_trck ? s.wwo_KPI_GHG_trck().total : 0) +
            (s.wwo_KPI_GHG_fuel ? s.wwo_KPI_GHG_fuel().total : 0)
          ).sum();

        const on_treatment =
          (Global.Waste.Onsite||[]).map(s =>
            (s.wwo_KPI_GHG_tre ? s.wwo_KPI_GHG_tre().total : 0) +
            (s.wwo_KPI_GHG_biog ? s.wwo_KPI_GHG_biog().total : 0) +
            (s.wwo_KPI_GHG_dig_fuel ? s.wwo_KPI_GHG_dig_fuel().total : 0)
          ).sum();

        const on_discharge =
          (Global.Waste.Onsite||[]).map(s =>
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

      const e = this.get_sfd_emissions();
      const pct = (v, tot) => tot>0 ? (100*v/tot) : 0;

      try{
        Charts.draw_pie_chart(
          'chart_sfd_offsite',
          [
            {label:'Collection', value:pct(e.offsite.Collection, e.offsite.total)},
            {label:'Transport',  value:pct(e.offsite.Transport , e.offsite.total)},
            {label:'Treatment',  value:pct(e.offsite.Treatment , e.offsite.total)},
          ],
          ['#4f81bd', '#f79646', '#9bbb59'],
          220, 220
        );

        Charts.draw_pie_chart(
          'chart_sfd_onsite',
          [
            {label:'Containment', value:pct(e.onsite.Containment, e.onsite.total)},
            {label:'Emptying',    value:pct(e.onsite.Emptying   , e.onsite.total)},
            {label:'Treatment',   value:pct(e.onsite.Treatment  , e.onsite.total)},
            {label:'Discharge',   value:pct(e.onsite.Discharge  , e.onsite.total)},
          ],
          ['#4f81bd', '#f79646', '#9bbb59', '#c9c9c9'],
          220, 220
        );
      }catch(e2){
        console.warn("SFD chart draw failed:", e2);
      }
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
          {label:translate('ws_serv_pop_descr'), value: 100*Global.Water.ws_serv_pop()/Global.Water.ws_resi_pop||0},
          {label:translate('ws_serv_pop_descr'), value:100-100*Global.Water.ws_serv_pop()/Global.Water.ws_resi_pop||0},
        ],
        colors=[
          "var(--color-level-Water)",
          "#eee",
        ],
      );

      Charts.draw_pie_chart('pie_chart_ww_serv_pop',
        [
          {label:translate('ww_serv_pop_descr'), value: 100*Global.Waste.ww_serv_pop()/Global.Waste.ww_resi_pop||0},
          {label:translate('ww_serv_pop_descr'), value:100-100*Global.Waste.ww_serv_pop()/Global.Waste.ww_resi_pop||0},
        ],
        colors=[
          "var(--color-level-Waste)",
          "#eee",
        ],
      );

      // SFD (UI only)
      this.draw_sfd_charts();

      //--


      //Chart.js bar chart -- ghg by substage
      if(document.getElementById('bar_chart_ghg_substages')){
        this.charts.bar_chart_ghg_substages = new Chart('bar_chart_ghg_substages',{
          type:'bar',
          data:{
            labels:
              Structure.filter(s=>s.sublevel).map(s=>{
                return Global[s.level][s.sublevel].map(ss=>{
                  return (s.prefix+" "+ss.name);
                });
              }).reduce((p,c)=>p.concat(c),[]),
            datasets:[
              ...['co2','ch4','n2o'].map(gas=>{
                return {
                  label:`${gas.toUpperCase()} (${this.current_unit_ghg})`,
                  data:
                    Structure.filter(s=>s.sublevel).map(s=>{
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
              x:{ stacked:true, },
              y:{ beginAtZero:true, borderWidth:2, stacked:true, },
            },
          },
        });
      }

      //Chart.js bar chart -- nrg by substage
      if(document.getElementById('bar_chart_nrg_substages')){
        this.charts.bar_chart_nrg_substages = new Chart('bar_chart_nrg_substages',{
          type:'bar',
          data:{
            labels:
              Structure.filter(s=>s.sublevel).map(s=>{
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
              y:{ beginAtZero:true, borderWidth:2, },
            },
          },
        });
      }
    },
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
        <button @click="current_view='table'"      :selected="current_view=='table'"      >{{translate("Table")                     }}</button>
        <button @click="current_view='charts_ghg'" :selected="current_view=='charts_ghg'" >{{translate("Charts GHG")                }}</button>
        <button @click="current_view='charts_nrg'" :selected="current_view=='charts_nrg'" >{{translate("Charts Energy")             }}</button>
        <button @click="current_view='charts_pop'" :selected="current_view=='charts_pop'" >{{translate("Charts Serviced population")}}</button>
        <button @click="current_view='sfd'"       :selected="current_view=='sfd'"       >{{translate("SFD")}}</button>
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

            <tr>
              <!--select units-->
              <td><b>{{translate("Select units")}}</b></td>
              <td colspan=2>
                <select v-model="current_unit_ghg" v-if="type_of_summary_table=='ghg'">
                  <option value=kgCO2eq>kgCO2eq</option>
                  <option value=tCO2eq>tCO2eq</option>
                </select>
                <select v-model="current_unit_nrg" v-if="type_of_summary_table=='nrg'">
                  <option value=kWh>kWh</option>
                  <option value=MWh>MWh</option>
                </select>
              </td>
            </tr>

            <tr v-if="current_view=='table'">
              <!--hide zero valued variables-->
              <td colspan=3>
                <label style="cursor:pointer">
                  <input type="checkbox" v-model="hide_zero_valued_variables">
                  {{translate("Hide_zero_(0)_values_in_results")}}
                </label>
              </td>
            </tr>
          </table>

          <!--show disgregated emissions-->
          <table v-if="current_view=='table'">
            <tr>
              <td>
                <b>{{translate("Show emissions disgregated")}}</b>
              </td>
              <td>
                <label>
                  <input type=radio v-model="see_emissions_disgregated" :value="false">
                  {{translate("no")}}
                </label>
              </td>
              <td>
                <label>
                  <input type=radio v-model="see_emissions_disgregated" :value="true">
                  {{translate("yes")}}
                </label>
              </td>
            </tr>
          </table>

          <!--total-->
          <table style="border:1px solid #eee;">
            <tr>
              <td>
                <b>{{translate("Total")}}</b>
              </td>
              <td style="text-align:right;">
                <b v-if="type_of_summary_table=='ghg'">{{format_emission(Global.TotalGHG().total)}}</b>
                <b v-else>{{format_energy(Global.TotalNRG())}}</b>
              </td>
              <td style="padding-left:.5em;">
                ({{get_summary_unit()}})
              </td>
            </tr>
          </table>

        </div>

        <!--tables-->
        <div v-if="current_view=='table'">
          <br><br>

          <table>
            <thead>
              <tr>
                <th>{{translate("System")}}</th>
                <th>{{translate("Stage")}}</th>
                <th>{{translate("Emission source")}}</th>
                <th>{{translate("Substages")}}</th>
                <th v-if="type_of_summary_table=='ghg'">{{translate("Emission")}}</th>
                <th v-else>{{translate("Energy consumption")}}</th>

                <th v-if="type_of_summary_table=='ghg'">${'CO2'.prettify()}</th>
                <th v-if="type_of_summary_table=='ghg'">${'CH4'.prettify()}</th>
                <th v-if="type_of_summary_table=='ghg'">${'N2O'.prettify()}</th>
              </tr>
            </thead>

            <tbody>

              <!--total-->
              <tr style="background:#e8e8e8">
                <td><b>{{translate("Total")}}</b></td>
                <td></td>
                <td></td>
                <td></td>
                <td style="text-align:right;">
                  <b v-if="type_of_summary_table=='ghg'">{{format_emission(Global.TotalGHG().total)}}</b>
                  <b v-else>{{format_energy(Global.TotalNRG())}}</b>
                </td>
                <td v-if="type_of_summary_table=='ghg'" style="text-align:right;"><b>{{format_emission(Global.TotalGHG().co2)}}</b></td>
                <td v-if="type_of_summary_table=='ghg'" style="text-align:right;"><b>{{format_emission(Global.TotalGHG().ch4)}}</b></td>
                <td v-if="type_of_summary_table=='ghg'" style="text-align:right;"><b>{{format_emission(Global.TotalGHG().n2o)}}</b></td>
              </tr>

              <!--levels-->
              <template v-for="s in Structure.filter(s=>s.level)">
                <tr style="background:#f3f3f3">
                  <td>
                    <div style="display:flex;align-items:center;gap:.5em;">
                      <button @click="toggle_folded_level(s.level)" style="min-width:2em;">
                        {{unfolded_levels.includes(s.level) ? '-' : '+'}}
                      </button>
                      <b>{{translate(s.level)}}</b>
                    </div>
                  </td>
                  <td></td><td></td><td></td>
                  <td style="text-align:right;">
                    <b v-if="type_of_summary_table=='ghg'">{{format_emission(Global[s.level][s.prefix+'_KPI_GHG']().total)}}</b>
                    <b v-else>{{format_energy(Global[s.level][s.prefix+'_nrg_cons']())}}</b>
                  </td>
                  <td v-if="type_of_summary_table=='ghg'" style="text-align:right;"><b>{{format_emission(Global[s.level][s.prefix+'_KPI_GHG']().co2)}}</b></td>
                  <td v-if="type_of_summary_table=='ghg'" style="text-align:right;"><b>{{format_emission(Global[s.level][s.prefix+'_KPI_GHG']().ch4)}}</b></td>
                  <td v-if="type_of_summary_table=='ghg'" style="text-align:right;"><b>{{format_emission(Global[s.level][s.prefix+'_KPI_GHG']().n2o)}}</b></td>
                </tr>

                <template v-if="unfolded_levels.includes(s.level)">
                  <!--substages-->
                  <template v-for="ss in Structure.filter(ss=>ss.level==s.level && ss.sublevel)">

                    <tr>
                      <td></td>
                      <td>{{translate(ss.sublevel)}}</td>
                      <td></td>
                      <td></td>
                      <td style="text-align:right;">
                        <span v-if="type_of_summary_table=='ghg'">
                          {{format_emission(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_KPI_GHG']().total).sum())}}
                        </span>
                        <span v-else>
                          {{format_energy(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_nrg_cons']).sum())}}
                        </span>
                      </td>
                      <td v-if="type_of_summary_table=='ghg'" style="text-align:right;">
                        {{format_emission(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_KPI_GHG']().co2).sum())}}
                      </td>
                      <td v-if="type_of_summary_table=='ghg'" style="text-align:right;">
                        {{format_emission(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_KPI_GHG']().ch4).sum())}}
                      </td>
                      <td v-if="type_of_summary_table=='ghg'" style="text-align:right;">
                        {{format_emission(Global[ss.level][ss.sublevel].map(subs=>subs[ss.prefix+'_KPI_GHG']().n2o).sum())}}
                      </td>
                    </tr>

                    <template v-if="see_emissions_disgregated && type_of_summary_table=='ghg'">

                      <template v-for="key in Object.keys(Formulas).sort(emission_sources_order)">
                        <template v-if="key.includes(ss.prefix+'_KPI_GHG')">

                          <tr v-if="!hide_zero_valued_variables || Global[ss.level][ss.sublevel].map(ss=>ss[key]().total).sum()!=0">
                            <td></td>
                            <td></td>
                            <td>{{translate(key)}}</td>
                            <td></td>
                            <td style="text-align:right;">
                              {{format_emission(Global[ss.level][ss.sublevel].map(ss=>ss[key]().total).sum())}}
                            </td>
                            <td style="text-align:right;">
                              {{format_emission(Global[ss.level][ss.sublevel].map(ss=>ss[key]().co2).sum())}}
                            </td>
                            <td style="text-align:right;">
                              {{format_emission(Global[ss.level][ss.sublevel].map(ss=>ss[key]().ch4).sum())}}
                            </td>
                            <td style="text-align:right;">
                              {{format_emission(Global[ss.level][ss.sublevel].map(ss=>ss[key]().n2o).sum())}}
                            </td>
                          </tr>

                        </template>
                      </template>

                    </template>

                  </template>
                </template>
              </template>

            </tbody>
          </table>

        </div>

        <!--charts GHG-->
        <div v-if="current_view=='charts_ghg'">
          <div class="chart_container">
            <div class=chart_title>
              <img src=./frontend/img/icon_co2.png class=icon_co2>
              {{translate("GHG emissions")}}
            </div>
            <br><br>
            <div style="
              display:grid;
              grid-template-columns:33% 33% 33%;
            ">
              <div class=flex>
                <table class=legend>
                  <tr>
                    <td :style="{background:'var(--color-level-Water)'}"></td>
                    <td>{{translate('Water')}}</td>
                    <td>{{format_emission(Global.Water.ws_KPI_GHG().total)}}</td>
                  </tr>
                  <tr>
                    <td :style="{background:'var(--color-level-Waste)'}"></td>
                    <td>{{translate('Waste')}}</td>
                    <td>{{format_emission(Global.Waste.ww_KPI_GHG().total)}}</td>
                  </tr>
                </table>
                <div id=chart_1></div>
              </div>

              <div class=flex>
                <table class=legend>
                  <tr v-for="stage in Structure.filter(s=>s.sublevel)">
                    <td :style="{background:stage.color}"></td>
                    <td>{{translate(stage.sublevel)}}</td>
                    <td>{{ format_emission(Global[stage.level][stage.sublevel].map(s=>s[stage.prefix+'_KPI_GHG']().total).sum()) }}</td>
                  </tr>
                </table>
                <div id=chart_2></div>
              </div>

              <div class=flex>
                <table class=legend>
                  <tr>
                    <td :style="{background:Charts.gas_colors.co2}"></td>
                    <td>CO2</td>
                    <td>{{format_emission(Global.TotalGHG().co2)}}</td>
                  </tr>
                  <tr>
                    <td :style="{background:Charts.gas_colors.ch4}"></td>
                    <td>CH4</td>
                    <td>{{format_emission(Global.TotalGHG().ch4)}}</td>
                  </tr>
                  <tr>
                    <td :style="{background:Charts.gas_colors.n2o}"></td>
                    <td>N2O</td>
                    <td>{{format_emission(Global.TotalGHG().n2o)}}</td>
                  </tr>
                </table>
                <div id=chart_3></div>
                <div style="color:#777; margin-top:.5em;">
                  {{translate('TotalGHG_descr')}}
                </div>
              </div>

            </div>
          </div>

          <div class="chart_container bar">
            <div class=chart_title>
              <img src=./frontend/img/bar_chart.png class=icon_co2>
              {{translate("GHG emissions by substage")}}
            </div>
            <br><br>
            <canvas id="bar_chart_ghg_substages" width="400" height="400"></canvas>
          </div>
        </div>

        <!--charts energy-->
        <div v-if="current_view=='charts_nrg'">
          <div class="chart_container">
            <div class=chart_title>
              <img src=./frontend/img/icon_nrg.png class=icon_nrg>
              {{translate("Energy consumption")}}
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
                    <td>{{translate('Water')}}</td>
                    <td>{{format_energy(Global.Water.ws_nrg_cons())}}</td>
                  </tr>
                  <tr>
                    <td :style="{background:'var(--color-level-Waste)'}"></td>
                    <td>{{translate('Waste')}}</td>
                    <td>{{format_energy(Global.Waste.ww_nrg_cons())}}</td>
                  </tr>
                </table>
                <div id=chart_nrg_levels></div>
              </div>

              <div class=flex>
                <table class=legend>
                  <tr v-for="stage in Structure.filter(s=>s.sublevel)">
                    <td :style="{background:stage.color}"></td>
                    <td>{{translate(stage.sublevel)}}</td>
                    <td>{{ format_energy(Global[stage.level][stage.sublevel].map(s=>s[stage.prefix+'_nrg_cons']).sum()) }}</td>
                  </tr>
                </table>
                <div id=chart_nrg_stages></div>
              </div>

            </div>
          </div>

          <div class="chart_container bar">
            <div class=chart_title>
              <img src=./frontend/img/bar_chart.png class=icon_nrg>
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
          <span style="display:none">{{ensure_sfd_loaded()}}</span>
          <span style="display:none">{{draw_sfd_charts()}}</span>

          <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1em;flex-wrap:wrap;">
              <div>
                <b>{{translate("Upload SFD graphic")}}</b><br>
                <input type="file" accept="image/png,image/jpeg" @change="on_sfd_file_change">
                <button v-if="sfd_image_dataurl" @click="clear_sfd_image()" style="margin-left:.5em;">{{translate("Remove")}}</button>
              </div>
              <div style="color:#666; font-size:.9em;">
                {{translate("The image is saved in your browser and persists after refresh.")}}
              </div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns:50% 50%; gap:1em; align-items:start;">
            <!-- LEFT: emissions -->
            <div class="chart_container">
              <div class="chart_title">{{translate("Emissions summary")}}</div>

              <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center; margin-top:1em;">
                <div>
                  <b>{{translate("OFFSITE SANITATION")}}</b>
                  <div style="display:flex; gap:.75em; align-items:center; flex-wrap:wrap; margin:.5em 0;">
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#4f81bd;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Collection")}}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#f79646;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Transport")}}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#9bbb59;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Treatment")}}</span>
                    </div>
                  </div>
                  <table class="legend" style="width:100%;">
                    <tr><td>{{translate("Collection")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.Collection)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td>{{translate("Transport")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.Transport)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td>{{translate("Treatment")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.Treatment)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td><b>{{translate("Total")}}</b></td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().offsite.total)}}</b> ({{get_summary_unit()}})</td></tr>
                  </table>
                </div>
                <div><div id="chart_sfd_offsite"></div></div>
              </div>

              <hr style="border-color:#eee; margin:1.2em 0;">

              <div style="display:grid; grid-template-columns:55% 45%; gap:1em; align-items:center;">
                <div>
                  <b>{{translate("ONSITE SANITATION")}}</b>
                  <div style="display:flex; gap:.75em; align-items:center; flex-wrap:wrap; margin:.5em 0;">
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#4f81bd;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Containment")}}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#f79646;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Emptying")}}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#9bbb59;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Treatment")}}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:.4em;">
                      <span style="width:12px;height:12px;background:#c9c9c9;display:inline-block;border:1px solid #999;"></span>
                      <span>{{translate("Discharge")}}</span>
                    </div>
                  </div>
                  <table class="legend" style="width:100%;">
                    <tr><td>{{translate("Containment")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Containment)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td>{{translate("Emptying")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Emptying)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td>{{translate("Treatment")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Treatment)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td>{{translate("Discharge")}}</td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.Discharge)}}</b> ({{get_summary_unit()}})</td></tr>
                    <tr><td><b>{{translate("Total")}}</b></td><td style="text-align:right;"><b>{{format_emission(get_sfd_emissions().onsite.total)}}</b> ({{get_summary_unit()}})</td></tr>
                  </table>
                </div>
                <div><div id="chart_sfd_onsite"></div></div>
              </div>

            </div>

            <!-- RIGHT: SFD image -->
            <div class="chart_container">
              <div class="chart_title">{{translate("SFD graphic")}}</div>
              <div style="margin-top:1em;">
                <div v-if="sfd_image_dataurl">
                  <img :src="sfd_image_dataurl" style="max-width:100%; height:auto; border:1px solid #ddd;">
                </div>
                <div v-else style="color:#888; padding:1em; border:1px dashed #ccc;">
                  {{translate("No SFD image uploaded yet.")}}
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

      #summary_ghg table.legend td:nth-child(1){
        width:15px;
        height:15px;
        border:1px solid #eee;
      }

      #summary_ghg div.chart_container.bar{
        padding:0;
      }
      #summary_ghg div.chart_container.bar div.chart_title{
        padding:1em;
        border-bottom:1px solid #eee;
      }
      #summary_ghg div.chart_container.bar canvas{
        display:block;
        width:100%;
        height:100%;
      }

      #summary_ghg .flex{
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:flex-start;
      }

      #summary_ghg td.unit{
        color:#777;
      }
    </style>
  `,
});
