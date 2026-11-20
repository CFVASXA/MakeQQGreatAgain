"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {EventEmitter}=require("node:events");
const {temp,loaderRoot}=require("./helpers.cjs");
function mainFixture(){
    const root=fs.mkdtempSync(path.join(temp,"reload-")),pluginRoot=path.join(root,"plugins","reload-test"),main=path.join(pluginRoot,"main.js"),helper=path.join(pluginRoot,"helper.js");
    fs.mkdirSync(pluginRoot,{recursive:true});fs.writeFileSync(helper,'module.exports={version:1};');fs.writeFileSync(main,'module.exports=require("./helper.js");');
    const plugin={manifest:{slug:"reload-test",version:"1.0.0"},disabled:false,incompatible:false,path:{plugin:pluginRoot,data:path.join(root,"data"),injects:{main}}};
    const stages=[],app=new EventEmitter();app.isReady=()=>false;app.commandLine={getSwitchValue:()=>"",appendSwitch:()=>{}};
    const electron={app,protocol:{},webContents:{getAllWebContents:()=>[]}};
    let state;
    const host={PATHS:{root,profile:root,plugins:path.join(root,"plugins"),logs:path.join(root,"logs"),data:path.join(root,"data")},log:()=>{},loaderConfig:()=>({enable_plugins:true,disabled_plugins:[],debug_console:false}),createApi:()=>({}),protectedPlugins:()=>[],stagesFor:()=>({}),setStage:(...args)=>stages.push(args),loadPlugins:()=>({"reload-test":plugin}),on:()=>{},applyPendingPluginDeletions:()=>[],writeJson:()=>{}};
    const hooks={installElectronHook:()=>electron,installIpc:(e,s)=>{state=s;},registerProtocol:()=>{},registerProtocolOn:()=>{},injectPreloadIntoSession:()=>{},readUtf8:()=>null};
    const req=(name)=>{
        if(name==="./host.js")return host;
        if(name==="./hooks.js")return hooks;
        if(name==="./module-cache.js")return require(path.join(loaderRoot,"src","module-cache.js"));
        if(name==="electron")return electron;
        if(name===path.join(root,"package.json"))return {version:"fixture"};
        if(name===path.join(root,"resources","app","package.json"))return {version:"qq-fixture"};
        if(name.includes("application.asar"))return {};
        return require(name);
    };
    req.cache=require.cache;req.resolve=require.resolve;
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(loaderRoot,"src","main.js"),"utf8"),{
        require:req,module,exports:module.exports,process:{pid:process.pid,platform:process.platform,versions:process.versions,resourcesPath:path.join(root,"resources")},console:{log(){},warn(){},error(){},info(){}},global:{},setImmediate:()=>{}
    },{filename:"main-loader-fixture.js"});
    assert.equal(module.exports.ready,true);
    return {root,pluginRoot,main,helper,plugin,state,stages,active:()=>Array.from(state.pluginModules.values())[0]};
}
test("plugin reload refreshes changed local helper modules, not just its entry file",()=>{
    const f=mainFixture();assert.equal(f.active().version,1);
    fs.writeFileSync(f.helper,'module.exports={version:2};');f.state.api.reloadPlugins();
    assert.equal(f.active().version,2);
});
test("reload leaves modules outside the plugin root cached",()=>{
    const f=mainFixture(),shared=path.join(f.root,"shared.js");fs.writeFileSync(shared,'module.exports={shared:true};');
    const old=require(shared);f.state.api.reloadPlugins();
    assert.equal(require.cache[require.resolve(shared)].exports,old);
});
test("owned native cache entries require restart and do not mix old addons with fresh JS",()=>{
    const f=mainFixture(),addon=path.join(f.pluginRoot,"addon.node"),old=require.cache[f.main];
    require.cache[addon]={filename:addon,exports:{},loaded:true};
    try{
        fs.writeFileSync(f.helper,'module.exports={version:2};');
        const report=f.state.api.reloadPlugins();
        assert.equal(report.restartRequired.includes("reload-test"),true);assert.equal(require.cache[f.main],old);assert.equal(f.active().version,1);
    }finally{delete require.cache[addon];}
});
test("owned ESM namespace cache entries are reported as restart-required",()=>{
    const f=mainFixture(),esm=path.join(f.pluginRoot,"helper.mjs"),exports=Object.create(null);exports[Symbol.toStringTag]="Module";
    require.cache[esm]={filename:esm,exports,loaded:true};
    try{assert.equal(f.state.api.reloadPlugins().restartRequired.includes("reload-test"),true);}
    finally{delete require.cache[esm];}
});
test("failed reload keeps the previous callback exports and reports the failure",()=>{
    const f=mainFixture(),old=f.active();fs.writeFileSync(f.main,'module.exports = ;');
    const report=f.state.api.reloadPlugins();assert.equal(f.active(),old);assert.equal(report.errors[0].slug,"reload-test");
});
