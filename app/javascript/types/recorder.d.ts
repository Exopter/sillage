export interface RecorderAssembly {name:string; identity_label:string; serial_number:string|null; hardware_definition:string|null}
export interface Identity {
  deviceId:string; firmware?:string; model?:string; capabilities?:number;
  mavlinkSystemId?:number; mavlinkComponentId?:number;
  assembly?:RecorderAssembly|null;
}
export interface Recorder {device_id:string; assembly?:RecorderAssembly|null; connectivity_url:string; initialization_url:string; initialization_confirmed:boolean}
export interface Aircraft {registration:string}
export interface Issue {message:string;technical:string}
export interface Facts {recording:boolean;health:string;storage:string;synchronization:string;issue:Issue|null}
export interface Heartbeat {
  recorder:{device_id:string;firmware?:string;model?:string;assembly?:RecorderAssembly|null};
  seen_at:string; aircraft?:Aircraft|null;
  recording_command?:{sequence:number;status:string}|null;
  status:import("../lib/fdr_heartbeat").RawStatus & {diagnostics?:import("../lib/fdr_heartbeat").RawFields};
}
