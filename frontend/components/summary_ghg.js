let summary_ghg = new Vue({
  el: "#summary_ghg",

  data: {
    visible: false,

    see_emissions_disgregated: false,
    type_of_summary_table: "ghg",
    hide_zero_valued_variables: true,

    unfolded_levels: ['Water', 'Waste'],

    current_view: "table",

    current_unit_ghg: "kgCO2eq",
    current_unit_nrg: "kWh",

    charts: {},

    variable,
    Charts,

    Global,
    Structure,
    Languages,
    IPCC_categories,
    Formulas,

    // SFD
    sfd_image_dataurl: null
  },

  methods: {

    translate,
    format,
    go_to,
    get_sum_of_substages,

    toggle_folded_level(level){
      let index = this.unfolded_levels.indexOf(level);
      if(index == -1){
        this.unfolded_levels.push(level)
      }else{
        this.unfolded_levels.splice(index,1)
      }
    },

    format_emission(number){
      let divisor = this.current_unit_ghg == 'tCO2eq' ? 1000 : 1
      return format(number, undefined, divisor)
    },

    format_energy(number){
      let divisor = this.current_unit_nrg == 'MWh' ? 1000 : 1
      return format(number, undefined, divisor)
    },

    show_summaries_menu(){
      summaries_menu.visible = true
    },

    // SFD IMAGE
    on_sfd_file_change(ev){

      const file = ev.target.files[0]

      if(!file) return

      const reader = new FileReader()

      reader.onload = () => {

        this.sfd_image_dataurl = reader.result

        localStorage.setItem("ecam_sfd_image", reader.result)

      }

      reader.readAsDataURL(file)

    },

    load_sfd(){

      const saved = localStorage.getItem("ecam_sfd_image")

      if(saved){
        this.sfd_image_dataurl = saved
      }

    }

  },

  mounted(){

    this.load_sfd()

  },

  template: `

<div id="summary_ghg" v-if="visible && Languages.ready">

<h1>Summary: GHG emissions and energy consumption</h1>

<div style="padding:1em;border:1px solid #ccc">

<button @click="current_view='table'">Table</button>
<button @click="current_view='charts_ghg'">Charts GHG</button>
<button @click="current_view='charts_nrg'">Charts Energy</button>
<button @click="current_view='charts_pop'">Charts Serviced population</button>
<button @click="current_view='sfd'">SFD</button>

<hr>

<!-- TABLE -->

<div v-if="current_view=='table'">

<table>

<tr>

<th>System</th>
<th>Stage</th>
<th>Substage</th>
<th>Emission</th>

</tr>

<tr>

<td>Total</td>
<td></td>
<td></td>
<td>{{format_emission(Global.TotalGHG().total)}}</td>

</tr>

</table>

</div>


<!-- CHARTS GHG -->

<div v-if="current_view=='charts_ghg'">

<div class="chart_container">

<h2>GHG emissions</h2>

<div id="chart_1"></div>

</div>

</div>


<!-- CHARTS ENERGY -->

<div v-if="current_view=='charts_nrg'">

<div class="chart_container">

<h2>Energy consumption</h2>

<div id="chart_nrg_levels"></div>

</div>

</div>


<!-- SERVICED POPULATION -->

<div v-if="current_view=='charts_pop'">

<div class="chart_container">

<h2>Serviced population</h2>

<div id="pie_chart_ws_serv_pop"></div>

<div id="pie_chart_ww_serv_pop"></div>

</div>

</div>



<!-- SFD TAB -->

<div v-if="current_view=='sfd'">

<div style="border:1px solid #ccc;padding:1em;margin-bottom:1em">

<h3>Upload SFD Graphic</h3>

<input type="file" accept="image/png,image/jpeg" @change="on_sfd_file_change">

</div>

<div style="display:grid;grid-template-columns:50% 50%;gap:1em">

<div>

<h3>Emissions summary</h3>

<p>Run ECAM assessment to populate emissions.</p>

<div id="chart_sfd_offsite"></div>

<div id="chart_sfd_onsite"></div>

</div>

<div>

<h3>SFD graphic</h3>

<img v-if="sfd_image_dataurl" :src="sfd_image_dataurl" style="max-width:100%">

<p v-else>No SFD image uploaded</p>

</div>

</div>

</div>


</div>

</div>

`

})
