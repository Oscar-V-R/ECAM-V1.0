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

    // Read-only grouping of ECAM results into OFFSITE / ONSITE buckets.
    // Uses already-computed ECAM KPIs (no changes to calculation logic).
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
          Structure.filter(s=>s.sublevel)
          .filter(s=>Global[s.level][s.sublevel].length)
          .map(s=>{
            let label = "";
            let value = 100*Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_KPI_GHG']().total).sum()/Global.TotalGHG().total;
            return {label,value};
          }),
          Structure.filter(s=>s.sublevel)
          .filter(s=>Global[s.level][s.sublevel].length)
          .map(s=>s.color),
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
          Structure.filter(s=>s.sublevel)
          .filter(s=>Global[s.level][s.sublevel].length)
          .map(s=>{
            let total_nrg = Global.TotalNRG();
            let label = "";
            let value = 100*Global[s.level][s.sublevel].map(ss=>ss[s.prefix+'_nrg_cons']).sum()/total_nrg;
            return {label,value};
          }),
          Structure.filter(s=>s.sublevel)
          .filter(s=>Global[s.level][s.sublevel].length)
          .map(s=>s.color),
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
                      return Global[s.level][s.sublevel].map(ss
