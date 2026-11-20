"use strict";
const path = require("path");
const paths = require("./paths-safe.js");
function clearPluginCache(directory, cache = require.cache) {
    const owned = [], restartRequired = [];
    for (const [key, mod] of Object.entries(cache)) {
        const file = mod?.filename || key;
        if (typeof file !== "string" || !path.isAbsolute(file)) continue;
        try { if (!paths.isWithin(file,directory)) continue; } catch (_) { continue; }
        owned.push(key);
        if (path.extname(file).toLowerCase() === ".node" || path.extname(file).toLowerCase() === ".mjs" ||
            Object.prototype.toString.call(mod?.exports) === "[object Module]" || mod?.loaded === false) restartRequired.push(file);
    }
    // Do not mix retained native/ESM state with newly loaded JavaScript.
    if (restartRequired.length) return {cleared:[],restartRequired};
    for (const key of owned) delete cache[key];
    return {cleared:owned,restartRequired:[]};
}
module.exports = {clearPluginCache};
