/** GPL-3.0-only. Host SDK 1.0. All methods return JSON; no host credentials. */
type Json = string | number | boolean | null | Json[] | { [key:string]:Json };
type PluginMethod = 'host.info'|'context.get'|'ui.toast'|'ui.openExternal'|'storage.get'|'storage.set'|'storage.remove'|'storage.keys'|'secrets.get'|'secrets.set'|'secrets.remove'|'fs.read'|'fs.write'|'fs.list'|'fs.remove'|'files.pick'|'files.save'|'https.request'|'network.request'|'characters.list'|'characters.get'|'characters.update'|'chat.read'|'chat.append'|'ai.generate'|'prompt.set'|'clipboard.read'|'clipboard.write';
interface SkivuSdk {
  readonly apiVersion:'1.0';
  call<T extends Json=Json>(method:PluginMethod,params?:{[key:string]:Json}):Promise<T>;
  on(event:'context.changed'|'host.pause'|'host.suspend',handler:(detail:Json)=>void):()=>void;
}
declare const Skivu:SkivuSdk;

/** ui.openExternal({url}) requires external.open and host >= 0.2.39. HTTPS only. */
interface ExternalOpenReceipt { status: 'accepted' | 'cancelled' | 'not_available'; }
