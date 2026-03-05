let summary_ghg=new Vue({

  el:"#summary_ghg",

  data:{
    visible:false,

    see_emissions_disgregated:false,
    type_of_summary_table:"ghg",
    hide_zero_valued_variables:true,

    unfolded_levels:['Water','Waste'],

    current_view:"table",

    // SFD storage
    sfd_storage_key:"ecam_sfd_image_v1",
    sfd_image_dataurl:null,
    sfd_loaded:false,

    current_unit_ghg:"kgCO2eq",
    current_unit_nrg:"kWh",

    charts:{},

    variable,
    Charts,

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

    get_summary_unit(){
      if(this.type_of_summary_table=='ghg'){
        return this.current_unit_ghg;
      }else{
        return this.current_unit_nrg;
      }
    },

    format_emission(number){
      let divisor = this.current_unit_ghg=='tCO2eq' ? 1000:1;
      return format(number,undefined,divisor);
    },

    show_summaries_menu(){
      summaries_menu.visible=true;
    },

    toggle_folded_level(level){
      let index = this.unfolded_levels.indexOf(level);
      if(index==-1){
        this.unfolded_levels.push(level);
      }else{
        this.unfolded_levels.splice(index,1);
      }
    },

    // -------------------------
    // SFD IMAGE MANAGEMENT
    // -------------------------

    ensure_sfd_loaded(){

      if(this.sfd_loaded) return;

      this.sfd_loaded=true;

      try{

        let saved = localStorage.getItem(this.sfd_storage_key);

        if(saved){
          this.sfd_image_dataurl=saved;
        }

      }catch(e){
        console.warn(e);
      }

    },

    upload_sfd(ev){

      const file = ev.target.files[0];

      if(!file) return;

      const reader = new FileReader();

      reader.onload = (evt)=>{

        this.sfd_image_dataurl=evt.target.result;

        try{
          localStorage.setItem(this.sfd_storage_key,this.sfd_image_dataurl);
        }catch(e){
          console.warn(e);
        }

      };

      reader.readAsDataURL(file);

    },

    clear_sfd(){

      this.sfd_image_dataurl=null;

      localStorage.removeItem(this.sfd_storage_key);

    }

  },

template:`

<div id=summary_ghg v-if="visible && Languages.ready">

<h1 style="padding-left:0">
{{translate("Summary: GHG emissions and energy consumption")}}
</h1>

<div style="padding:1em;border:1px solid #ccc">

<button @click="current_view='table'" :selected="current_view=='table'">
{{translate("Table")}}
</button>

<button @click="current_view='charts_ghg'" :selected="current_view=='charts_ghg'">
{{translate("Charts GHG")}}
</button>

<button @click="current_view='charts_nrg'" :selected="current_view=='charts_nrg'">
{{translate("Charts Energy")}}
</button>

<button @click="current_view='charts_pop'" :selected="current_view=='charts_pop'">
{{translate("Charts Serviced population")}}
</button>

<button @click="current_view='sfd'" :selected="current_view=='sfd'">
SFD
</button>

<hr style="border-color:#eee">


<!-- SFD PANEL -->

<div v-if="current_view=='sfd'">

<span style="display:none">{{ensure_sfd_loaded()}}</span>

<h3>Upload SFD graphic</h3>

<input type="file" accept="image/png,image/jpeg" @change="upload_sfd">

<button v-if="sfd_image_dataurl" @click="clear_sfd">
Remove
</button>

<div style="margin-top:20px">

<img v-if="sfd_image_dataurl"
:src="sfd_image_dataurl"
style="max-width:100%;border:1px solid #ccc">

<div v-if="!sfd_image_dataurl" style="color:#888">

No SFD image uploaded

</div>

</div>

</div>

</div>

</div>

`

});
