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
          ],[
            "var(--color-level-Water)",
            "var(--color-level-Waste)",
          ]
        );

        Charts.draw_pie_chart('chart_nrg_substages',
          Structure.filter(s=>s.sublevel).map(s=>{
            let label = "";
            let value = 100*Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_nrg_cons']()).sum()/Global.TotalNRG();
            return {label,value};
          }),
          Structure.filter(s=>s.sublevel).map(s=>s.color),
        );

      //bar charts
      //bar chart: GHG emissions by stage and gas (stacked bar chart)
      Charts.draw_bar_chart('chart_ghg_by_stage',
        Structure.filter(s=>s.sublevel).map(s=>translate(s.title)),
        [
          {
            label:translate("CO2"),
            data:Structure.filter(s=>s.sublevel).map(s=>Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_KPI_GHG']().co2).sum()),
            backgroundColor:Charts.gas_colors.co2,
          },
          {
            label:translate("N2O"),
            data:Structure.filter(s=>s.sublevel).map(s=>Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_KPI_GHG']().n2o).sum()),
            backgroundColor:Charts.gas_colors.n2o,
          },
          {
            label:translate("CH4"),
            data:Structure.filter(s=>s.sublevel).map(s=>Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_KPI_GHG']().ch4).sum()),
            backgroundColor:Charts.gas_colors.ch4,
          },
        ],{
          stacked:true,
          yAxisTitle:translate("GHG emissions")+" ("+this.get_summary_unit()+")",
        }
      );

      //bar chart: energy consumption by stage
      Charts.draw_bar_chart('chart_nrg_by_stage',
        Structure.filter(s=>s.sublevel).map(s=>translate(s.title)),
        [
          {
            label:translate("Energy consumption"),
            data:Structure.filter(s=>s.sublevel).map(s=>Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_nrg_cons']()).sum()),
            backgroundColor:"#888",
          },
        ],{
          stacked:false,
          yAxisTitle:translate("Energy consumption")+" ("+this.get_summary_unit()+")",
        }
      );
    },

    // ---------------------------
    // SFD tab (UI only)
    // ---------------------------
    ensure_sfd_loaded(){
      if(this.sfd_loaded_from_storage) return;
      this.sfd_loaded_from_storage = true;
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
      this.sfd_image_dataurl = null;
      try{ localStorage.removeItem(this.sfd_storage_key); }catch(e){}
    },

    // Safe getters so the tab never breaks if no assessment was computed yet
    get_sfd_emissions(){
      const zeros = {
        offsite:{ Collection:0, Transport:0, Treatment:0, total:0 },
        onsite :{ Containment:0, Emptying:0, Treatment:0, Discharge:0, total:0 },
      };

      try{
        if(!Global || !Global.Waste) return zeros;

        // OFFSITE
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

        // ONSITE
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
      if(this.current_view!=="sfd") return;

      const e = this.get_sfd_emissions();
      const pct = (v, tot) => tot>0 ? (100*v/tot) : 0;

      try{
        Charts.draw_pie_chart(
          "chart_sfd_offsite",
          [
            {label:"", value:pct(e.offsite.Collection, e.offsite.total)},
            {label:"", value:pct(e.offsite.Transport , e.offsite.total)},
            {label:"", value:pct(e.offsite.Treatment , e.offsite.total)},
          ],
          ["var(--color-level-Waste)","#F5B6AB","#FFD1C8"],
          220, 220
        );

        Charts.draw_pie_chart(
          "chart_sfd_onsite",
          [
            {label:"", value:pct(e.onsite.Containment, e.onsite.total)},
            {label:"", value:pct(e.onsite.Emptying   , e.onsite.total)},
            {label:"", value:pct(e.onsite.Treatment  , e.onsite.total)},
            {label:"", value:pct(e.onsite.Discharge  , e.onsite.total)},
          ],
          ["var(--color-level-Waste)","#F5B6AB","#FFD1C8","#eee"],
          220, 220
        );
      }catch(e2){
        console.warn("SFD chart draw failed:", e2);
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

        <!--SFD tab-->
        <div v-if="current_view=='sfd'">
          <span style="display:none">{{ensure_sfd_loaded()}}</span>
          <span style="display:none">{{draw_sfd_charts()}}</span>

          <div style="margin:1em 0; padding:1em; border:1px solid #ccc;">
            <h3 style="margin:0 0 .5em 0;">{{translate("Upload SFD graphic")}}</h3>
            <input type="file" accept="image/png,image/jpeg" @change="on_sfd_file_change">
            <button v-if="sfd_image_dataurl" @click="clear_sfd_image()" style="margin-left:.5em;">
              {{translate("Remove")}}
            </button>
            <div style="margin-top:.5em; color:#666; font-size:.9em;">
              {{translate("Saved in your browser and persists after refresh.")}}
            </div>
          </div>

          <div style="display:flex; gap:1em; align-items:flex-start;">
            <!-- LEFT -->
            <div style="flex:1; min-width:320px; border:1px solid #eee; padding:1em;">
              <h3 style="margin-top:0;">{{translate("Emissions summary")}}</h3>

              <h4>{{translate("OFFSITE SANITATION")}}</h4>
              <div style="display:flex; gap:1em; align-items:center;">
                <div id="chart_sfd_offsite"></div>
                <div>
                  <div>• {{translate("Collection")}}: <b>{{format_emission(get_sfd_emissions().offsite.Collection)}}</b> {{get_summary_unit()}}</div>
                  <div>• {{translate("Transport")}}: <b>{{format_emission(get_sfd_emissions().offsite.Transport )}}</b> {{get_summary_unit()}}</div>
                  <div>• {{translate("Treatment")}}: <b>{{format_emission(get_sfd_emissions().offsite.Treatment )}}</b> {{get_summary_unit()}}</div>
                  <div style="margin-top:.5em;">{{translate("Total")}}: <b>{{format_emission(get_sfd_emissions().offsite.total)}}</b> {{get_summary_unit()}}</div>
                </div>
              </div>

              <hr style="border-color:#eee; margin:1em 0;">

              <h4>{{translate("ONSITE SANITATION")}}</h4>
              <div style="display:flex; gap:1em; align-items:center;">
                <div id="chart_sfd_onsite"></div>
                <div>
                  <div>• {{translate("Containment")}}: <b>{{format_emission(get_sfd_emissions().onsite.Containment)}}</b> {{get_summary_unit()}}</div>
                  <div>• {{translate("Emptying")}}: <b>{{format_emission(get_sfd_emissions().onsite.Emptying   )}}</b> {{get_summary_unit()}}</div>
                  <div>• {{translate("Treatment")}}: <b>{{format_emission(get_sfd_emissions().onsite.Treatment  )}}</b> {{get_summary_unit()}}</div>
                  <div>• {{translate("Discharge")}}: <b>{{format_emission(get_sfd_emissions().onsite.Discharge  )}}</b> {{get_summary_unit()}}</div>
                  <div style="margin-top:.5em;">{{translate("Total")}}: <b>{{format_emission(get_sfd_emissions().onsite.total)}}</b> {{get_summary_unit()}}</div>
                </div>
              </div>

              <div style="margin-top:1em; color:#888; font-size:.9em;">
                {{translate("Note: charts show shares within offsite/onsite totals. Run an assessment to populate emissions.")}}
              </div>
            </div>

            <!-- RIGHT -->
            <div style="flex:1; border:1px solid #eee; padding:1em;">
              <h3 style="margin-top:0;">{{translate("SFD graphic")}}</h3>

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
  `,

  updated(){
    let _this=this;
    this.$nextTick(()=>{
      if(summary_ghg.visible){
        _this.draw_all_charts();
      }
    });
  },
});
