#!/usr/bin/env node
"use strict";
var __create2 = Object.create;
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc2 = Object.getOwnPropertyDescriptor;
var __getOwnPropNames2 = Object.getOwnPropertyNames;
var __getProtoOf2 = Object.getPrototypeOf;
var __hasOwnProp2 = Object.prototype.hasOwnProperty;
var __commonJS2 = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames2(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps2 = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames2(from))
      if (!__hasOwnProp2.call(to, key) && key !== except)
        __defProp2(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc2(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM2 = (mod, isNodeMode, target) => (target = mod != null ? __create2(__getProtoOf2(mod)) : {}, __copyProps2(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp2(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/web-tree-sitter/tree-sitter.cjs
var require_tree_sitter2 = __commonJS2({
  "node_modules/web-tree-sitter/tree-sitter.cjs"(exports, module) {
    "use strict";
    var __create = Object.create;
    var __defProp = Object.defineProperty;
    var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
    var __getOwnPropNames = Object.getOwnPropertyNames;
    var __getProtoOf = Object.getPrototypeOf;
    var __hasOwnProp = Object.prototype.hasOwnProperty;
    var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
    var __commonJS = (cb, mod) => function __require() {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    };
    var __export = (target, all) => {
      for (var name2 in all)
        __defProp(target, name2, { get: all[name2], enumerable: true });
    };
    var __copyProps = (to, from, except, desc) => {
      if (from && typeof from === "object" || typeof from === "function") {
        for (let key of __getOwnPropNames(from))
          if (!__hasOwnProp.call(to, key) && key !== except)
            __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
      }
      return to;
    };
    var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
      // If the importer is in node compatibility mode or this is not an ESM
      // file that has been converted to a CommonJS file using a Babel-
      // compatible transform (i.e. "__esModule" has not been set), then set
      // "default" to the CommonJS "module.exports" for node compatibility.
      isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
      mod
    ));
    var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
    var require_tree_sitter = __commonJS({
      "lib/tree-sitter.cjs"(exports, module) {
        "use strict";
        var Module = (() => {
          var _scriptName = typeof document != "undefined" ? document.currentScript?.src : void 0;
          if (typeof __filename != "undefined") _scriptName = _scriptName || __filename;
          return async function(moduleArg = {}) {
            var moduleRtn;
            var Module = moduleArg;
            var readyPromiseResolve, readyPromiseReject;
            var readyPromise = new Promise((resolve4, reject) => {
              readyPromiseResolve = resolve4;
              readyPromiseReject = reject;
            });
            var ENVIRONMENT_IS_WEB = typeof window == "object";
            var ENVIRONMENT_IS_WORKER = typeof WorkerGlobalScope != "undefined";
            var ENVIRONMENT_IS_NODE = typeof process == "object" && typeof process.versions == "object" && typeof process.versions.node == "string" && process.type != "renderer";
            var ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
            if (ENVIRONMENT_IS_NODE) {
            }
            Module.currentQueryProgressCallback = null;
            Module.currentProgressCallback = null;
            Module.currentLogCallback = null;
            Module.currentParseCallback = null;
            var moduleOverrides = Object.assign({}, Module);
            var arguments_ = [];
            var thisProgram = "./this.program";
            var quit_ = /* @__PURE__ */ __name((status, toThrow) => {
              throw toThrow;
            }, "quit_");
            var scriptDirectory = "";
            function locateFile(path11) {
              if (Module["locateFile"]) {
                return Module["locateFile"](path11, scriptDirectory);
              }
              return scriptDirectory + path11;
            }
            __name(locateFile, "locateFile");
            var readAsync, readBinary;
            if (ENVIRONMENT_IS_NODE) {
              var fs = require("fs");
              var nodePath = require("path");
              scriptDirectory = __dirname + "/";
              readBinary = /* @__PURE__ */ __name((filename) => {
                filename = isFileURI(filename) ? new URL(filename) : filename;
                var ret = fs.readFileSync(filename);
                return ret;
              }, "readBinary");
              readAsync = /* @__PURE__ */ __name(async (filename, binary2 = true) => {
                filename = isFileURI(filename) ? new URL(filename) : filename;
                var ret = fs.readFileSync(filename, binary2 ? void 0 : "utf8");
                return ret;
              }, "readAsync");
              if (!Module["thisProgram"] && process.argv.length > 1) {
                thisProgram = process.argv[1].replace(/\\/g, "/");
              }
              arguments_ = process.argv.slice(2);
              quit_ = /* @__PURE__ */ __name((status, toThrow) => {
                process.exitCode = status;
                throw toThrow;
              }, "quit_");
            } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
              if (ENVIRONMENT_IS_WORKER) {
                scriptDirectory = self.location.href;
              } else if (typeof document != "undefined" && document.currentScript) {
                scriptDirectory = document.currentScript.src;
              }
              if (_scriptName) {
                scriptDirectory = _scriptName;
              }
              if (scriptDirectory.startsWith("blob:")) {
                scriptDirectory = "";
              } else {
                scriptDirectory = scriptDirectory.slice(0, scriptDirectory.replace(/[?#].*/, "").lastIndexOf("/") + 1);
              }
              {
                if (ENVIRONMENT_IS_WORKER) {
                  readBinary = /* @__PURE__ */ __name((url) => {
                    var xhr = new XMLHttpRequest();
                    xhr.open("GET", url, false);
                    xhr.responseType = "arraybuffer";
                    xhr.send(null);
                    return new Uint8Array(
                      /** @type{!ArrayBuffer} */
                      xhr.response
                    );
                  }, "readBinary");
                }
                readAsync = /* @__PURE__ */ __name(async (url) => {
                  if (isFileURI(url)) {
                    return new Promise((resolve4, reject) => {
                      var xhr = new XMLHttpRequest();
                      xhr.open("GET", url, true);
                      xhr.responseType = "arraybuffer";
                      xhr.onload = () => {
                        if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                          resolve4(xhr.response);
                          return;
                        }
                        reject(xhr.status);
                      };
                      xhr.onerror = reject;
                      xhr.send(null);
                    });
                  }
                  var response = await fetch(url, {
                    credentials: "same-origin"
                  });
                  if (response.ok) {
                    return response.arrayBuffer();
                  }
                  throw new Error(response.status + " : " + response.url);
                }, "readAsync");
              }
            } else {
            }
            var out = Module["print"] || console.log.bind(console);
            var err = Module["printErr"] || console.error.bind(console);
            Object.assign(Module, moduleOverrides);
            moduleOverrides = null;
            if (Module["arguments"]) arguments_ = Module["arguments"];
            if (Module["thisProgram"]) thisProgram = Module["thisProgram"];
            var dynamicLibraries = Module["dynamicLibraries"] || [];
            var wasmBinary = Module["wasmBinary"];
            var wasmMemory;
            var ABORT = false;
            var EXITSTATUS;
            function assert(condition, text) {
              if (!condition) {
                abort(text);
              }
            }
            __name(assert, "assert");
            var HEAP, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAP64, HEAPU64, HEAPF64;
            var HEAP_DATA_VIEW;
            var runtimeInitialized = false;
            var isFileURI = /* @__PURE__ */ __name((filename) => filename.startsWith("file://"), "isFileURI");
            function updateMemoryViews() {
              var b = wasmMemory.buffer;
              Module["HEAP_DATA_VIEW"] = HEAP_DATA_VIEW = new DataView(b);
              Module["HEAP8"] = HEAP8 = new Int8Array(b);
              Module["HEAP16"] = HEAP16 = new Int16Array(b);
              Module["HEAPU8"] = HEAPU8 = new Uint8Array(b);
              Module["HEAPU16"] = HEAPU16 = new Uint16Array(b);
              Module["HEAP32"] = HEAP32 = new Int32Array(b);
              Module["HEAPU32"] = HEAPU32 = new Uint32Array(b);
              Module["HEAPF32"] = HEAPF32 = new Float32Array(b);
              Module["HEAPF64"] = HEAPF64 = new Float64Array(b);
              Module["HEAP64"] = HEAP64 = new BigInt64Array(b);
              Module["HEAPU64"] = HEAPU64 = new BigUint64Array(b);
            }
            __name(updateMemoryViews, "updateMemoryViews");
            if (Module["wasmMemory"]) {
              wasmMemory = Module["wasmMemory"];
            } else {
              var INITIAL_MEMORY = Module["INITIAL_MEMORY"] || 33554432;
              wasmMemory = new WebAssembly.Memory({
                "initial": INITIAL_MEMORY / 65536,
                // In theory we should not need to emit the maximum if we want "unlimited"
                // or 4GB of memory, but VMs error on that atm, see
                // https://github.com/emscripten-core/emscripten/issues/14130
                // And in the pthreads case we definitely need to emit a maximum. So
                // always emit one.
                "maximum": 32768
              });
            }
            updateMemoryViews();
            var __RELOC_FUNCS__ = [];
            function preRun() {
              if (Module["preRun"]) {
                if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
                while (Module["preRun"].length) {
                  addOnPreRun(Module["preRun"].shift());
                }
              }
              callRuntimeCallbacks(onPreRuns);
            }
            __name(preRun, "preRun");
            function initRuntime() {
              runtimeInitialized = true;
              callRuntimeCallbacks(__RELOC_FUNCS__);
              wasmExports["__wasm_call_ctors"]();
              callRuntimeCallbacks(onPostCtors);
            }
            __name(initRuntime, "initRuntime");
            function preMain() {
            }
            __name(preMain, "preMain");
            function postRun() {
              if (Module["postRun"]) {
                if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
                while (Module["postRun"].length) {
                  addOnPostRun(Module["postRun"].shift());
                }
              }
              callRuntimeCallbacks(onPostRuns);
            }
            __name(postRun, "postRun");
            var runDependencies = 0;
            var dependenciesFulfilled = null;
            function getUniqueRunDependency(id) {
              return id;
            }
            __name(getUniqueRunDependency, "getUniqueRunDependency");
            function addRunDependency(id) {
              runDependencies++;
              Module["monitorRunDependencies"]?.(runDependencies);
            }
            __name(addRunDependency, "addRunDependency");
            function removeRunDependency(id) {
              runDependencies--;
              Module["monitorRunDependencies"]?.(runDependencies);
              if (runDependencies == 0) {
                if (dependenciesFulfilled) {
                  var callback = dependenciesFulfilled;
                  dependenciesFulfilled = null;
                  callback();
                }
              }
            }
            __name(removeRunDependency, "removeRunDependency");
            function abort(what) {
              Module["onAbort"]?.(what);
              what = "Aborted(" + what + ")";
              err(what);
              ABORT = true;
              what += ". Build with -sASSERTIONS for more info.";
              var e = new WebAssembly.RuntimeError(what);
              readyPromiseReject(e);
              throw e;
            }
            __name(abort, "abort");
            var wasmBinaryFile;
            function findWasmBinary() {
              return locateFile("tree-sitter.wasm");
            }
            __name(findWasmBinary, "findWasmBinary");
            function getBinarySync(file) {
              if (file == wasmBinaryFile && wasmBinary) {
                return new Uint8Array(wasmBinary);
              }
              if (readBinary) {
                return readBinary(file);
              }
              throw "both async and sync fetching of the wasm failed";
            }
            __name(getBinarySync, "getBinarySync");
            async function getWasmBinary(binaryFile) {
              if (!wasmBinary) {
                try {
                  var response = await readAsync(binaryFile);
                  return new Uint8Array(response);
                } catch {
                }
              }
              return getBinarySync(binaryFile);
            }
            __name(getWasmBinary, "getWasmBinary");
            async function instantiateArrayBuffer(binaryFile, imports2) {
              try {
                var binary2 = await getWasmBinary(binaryFile);
                var instance2 = await WebAssembly.instantiate(binary2, imports2);
                return instance2;
              } catch (reason) {
                err(`failed to asynchronously prepare wasm: ${reason}`);
                abort(reason);
              }
            }
            __name(instantiateArrayBuffer, "instantiateArrayBuffer");
            async function instantiateAsync(binary2, binaryFile, imports2) {
              if (!binary2 && typeof WebAssembly.instantiateStreaming == "function" && !isFileURI(binaryFile) && !ENVIRONMENT_IS_NODE) {
                try {
                  var response = fetch(binaryFile, {
                    credentials: "same-origin"
                  });
                  var instantiationResult = await WebAssembly.instantiateStreaming(response, imports2);
                  return instantiationResult;
                } catch (reason) {
                  err(`wasm streaming compile failed: ${reason}`);
                  err("falling back to ArrayBuffer instantiation");
                }
              }
              return instantiateArrayBuffer(binaryFile, imports2);
            }
            __name(instantiateAsync, "instantiateAsync");
            function getWasmImports() {
              return {
                "env": wasmImports,
                "wasi_snapshot_preview1": wasmImports,
                "GOT.mem": new Proxy(wasmImports, GOTHandler),
                "GOT.func": new Proxy(wasmImports, GOTHandler)
              };
            }
            __name(getWasmImports, "getWasmImports");
            async function createWasm() {
              function receiveInstance(instance2, module2) {
                wasmExports = instance2.exports;
                wasmExports = relocateExports(wasmExports, 1024);
                var metadata2 = getDylinkMetadata(module2);
                if (metadata2.neededDynlibs) {
                  dynamicLibraries = metadata2.neededDynlibs.concat(dynamicLibraries);
                }
                mergeLibSymbols(wasmExports, "main");
                LDSO.init();
                loadDylibs();
                __RELOC_FUNCS__.push(wasmExports["__wasm_apply_data_relocs"]);
                removeRunDependency("wasm-instantiate");
                return wasmExports;
              }
              __name(receiveInstance, "receiveInstance");
              addRunDependency("wasm-instantiate");
              function receiveInstantiationResult(result2) {
                return receiveInstance(result2["instance"], result2["module"]);
              }
              __name(receiveInstantiationResult, "receiveInstantiationResult");
              var info2 = getWasmImports();
              if (Module["instantiateWasm"]) {
                return new Promise((resolve4, reject) => {
                  Module["instantiateWasm"](info2, (mod, inst) => {
                    receiveInstance(mod, inst);
                    resolve4(mod.exports);
                  });
                });
              }
              wasmBinaryFile ??= findWasmBinary();
              try {
                var result = await instantiateAsync(wasmBinary, wasmBinaryFile, info2);
                var exports2 = receiveInstantiationResult(result);
                return exports2;
              } catch (e) {
                readyPromiseReject(e);
                return Promise.reject(e);
              }
            }
            __name(createWasm, "createWasm");
            var ASM_CONSTS = {};
            class ExitStatus {
              static {
                __name(this, "ExitStatus");
              }
              name = "ExitStatus";
              constructor(status) {
                this.message = `Program terminated with exit(${status})`;
                this.status = status;
              }
            }
            var GOT = {};
            var currentModuleWeakSymbols = /* @__PURE__ */ new Set([]);
            var GOTHandler = {
              get(obj2, symName) {
                var rtn = GOT[symName];
                if (!rtn) {
                  rtn = GOT[symName] = new WebAssembly.Global({
                    "value": "i32",
                    "mutable": true
                  });
                }
                if (!currentModuleWeakSymbols.has(symName)) {
                  rtn.required = true;
                }
                return rtn;
              }
            };
            var LE_HEAP_LOAD_F32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat32(byteOffset, true), "LE_HEAP_LOAD_F32");
            var LE_HEAP_LOAD_F64 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getFloat64(byteOffset, true), "LE_HEAP_LOAD_F64");
            var LE_HEAP_LOAD_I16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt16(byteOffset, true), "LE_HEAP_LOAD_I16");
            var LE_HEAP_LOAD_I32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getInt32(byteOffset, true), "LE_HEAP_LOAD_I32");
            var LE_HEAP_LOAD_U16 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint16(byteOffset, true), "LE_HEAP_LOAD_U16");
            var LE_HEAP_LOAD_U32 = /* @__PURE__ */ __name((byteOffset) => HEAP_DATA_VIEW.getUint32(byteOffset, true), "LE_HEAP_LOAD_U32");
            var LE_HEAP_STORE_F32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat32(byteOffset, value, true), "LE_HEAP_STORE_F32");
            var LE_HEAP_STORE_F64 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setFloat64(byteOffset, value, true), "LE_HEAP_STORE_F64");
            var LE_HEAP_STORE_I16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt16(byteOffset, value, true), "LE_HEAP_STORE_I16");
            var LE_HEAP_STORE_I32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setInt32(byteOffset, value, true), "LE_HEAP_STORE_I32");
            var LE_HEAP_STORE_U16 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint16(byteOffset, value, true), "LE_HEAP_STORE_U16");
            var LE_HEAP_STORE_U32 = /* @__PURE__ */ __name((byteOffset, value) => HEAP_DATA_VIEW.setUint32(byteOffset, value, true), "LE_HEAP_STORE_U32");
            var callRuntimeCallbacks = /* @__PURE__ */ __name((callbacks) => {
              while (callbacks.length > 0) {
                callbacks.shift()(Module);
              }
            }, "callRuntimeCallbacks");
            var onPostRuns = [];
            var addOnPostRun = /* @__PURE__ */ __name((cb) => onPostRuns.unshift(cb), "addOnPostRun");
            var onPreRuns = [];
            var addOnPreRun = /* @__PURE__ */ __name((cb) => onPreRuns.unshift(cb), "addOnPreRun");
            var UTF8Decoder = typeof TextDecoder != "undefined" ? new TextDecoder() : void 0;
            var UTF8ArrayToString = /* @__PURE__ */ __name((heapOrArray, idx = 0, maxBytesToRead = NaN) => {
              var endIdx = idx + maxBytesToRead;
              var endPtr = idx;
              while (heapOrArray[endPtr] && !(endPtr >= endIdx)) ++endPtr;
              if (endPtr - idx > 16 && heapOrArray.buffer && UTF8Decoder) {
                return UTF8Decoder.decode(heapOrArray.subarray(idx, endPtr));
              }
              var str2 = "";
              while (idx < endPtr) {
                var u0 = heapOrArray[idx++];
                if (!(u0 & 128)) {
                  str2 += String.fromCharCode(u0);
                  continue;
                }
                var u1 = heapOrArray[idx++] & 63;
                if ((u0 & 224) == 192) {
                  str2 += String.fromCharCode((u0 & 31) << 6 | u1);
                  continue;
                }
                var u2 = heapOrArray[idx++] & 63;
                if ((u0 & 240) == 224) {
                  u0 = (u0 & 15) << 12 | u1 << 6 | u2;
                } else {
                  u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | heapOrArray[idx++] & 63;
                }
                if (u0 < 65536) {
                  str2 += String.fromCharCode(u0);
                } else {
                  var ch = u0 - 65536;
                  str2 += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
                }
              }
              return str2;
            }, "UTF8ArrayToString");
            var getDylinkMetadata = /* @__PURE__ */ __name((binary2) => {
              var offset = 0;
              var end = 0;
              function getU8() {
                return binary2[offset++];
              }
              __name(getU8, "getU8");
              function getLEB() {
                var ret = 0;
                var mul = 1;
                while (1) {
                  var byte = binary2[offset++];
                  ret += (byte & 127) * mul;
                  mul *= 128;
                  if (!(byte & 128)) break;
                }
                return ret;
              }
              __name(getLEB, "getLEB");
              function getString() {
                var len = getLEB();
                offset += len;
                return UTF8ArrayToString(binary2, offset - len, len);
              }
              __name(getString, "getString");
              function failIf(condition, message) {
                if (condition) throw new Error(message);
              }
              __name(failIf, "failIf");
              var name2 = "dylink.0";
              if (binary2 instanceof WebAssembly.Module) {
                var dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                if (dylinkSection.length === 0) {
                  name2 = "dylink";
                  dylinkSection = WebAssembly.Module.customSections(binary2, name2);
                }
                failIf(dylinkSection.length === 0, "need dylink section");
                binary2 = new Uint8Array(dylinkSection[0]);
                end = binary2.length;
              } else {
                var int32View = new Uint32Array(new Uint8Array(binary2.subarray(0, 24)).buffer);
                var magicNumberFound = int32View[0] == 1836278016 || int32View[0] == 6386541;
                failIf(!magicNumberFound, "need to see wasm magic number");
                failIf(binary2[8] !== 0, "need the dylink section to be first");
                offset = 9;
                var section_size = getLEB();
                end = offset + section_size;
                name2 = getString();
              }
              var customSection = {
                neededDynlibs: [],
                tlsExports: /* @__PURE__ */ new Set(),
                weakImports: /* @__PURE__ */ new Set()
              };
              if (name2 == "dylink") {
                customSection.memorySize = getLEB();
                customSection.memoryAlign = getLEB();
                customSection.tableSize = getLEB();
                customSection.tableAlign = getLEB();
                var neededDynlibsCount = getLEB();
                for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                  var libname = getString();
                  customSection.neededDynlibs.push(libname);
                }
              } else {
                failIf(name2 !== "dylink.0");
                var WASM_DYLINK_MEM_INFO = 1;
                var WASM_DYLINK_NEEDED = 2;
                var WASM_DYLINK_EXPORT_INFO = 3;
                var WASM_DYLINK_IMPORT_INFO = 4;
                var WASM_SYMBOL_TLS = 256;
                var WASM_SYMBOL_BINDING_MASK = 3;
                var WASM_SYMBOL_BINDING_WEAK = 1;
                while (offset < end) {
                  var subsectionType = getU8();
                  var subsectionSize = getLEB();
                  if (subsectionType === WASM_DYLINK_MEM_INFO) {
                    customSection.memorySize = getLEB();
                    customSection.memoryAlign = getLEB();
                    customSection.tableSize = getLEB();
                    customSection.tableAlign = getLEB();
                  } else if (subsectionType === WASM_DYLINK_NEEDED) {
                    var neededDynlibsCount = getLEB();
                    for (var i2 = 0; i2 < neededDynlibsCount; ++i2) {
                      libname = getString();
                      customSection.neededDynlibs.push(libname);
                    }
                  } else if (subsectionType === WASM_DYLINK_EXPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var symname = getString();
                      var flags2 = getLEB();
                      if (flags2 & WASM_SYMBOL_TLS) {
                        customSection.tlsExports.add(symname);
                      }
                    }
                  } else if (subsectionType === WASM_DYLINK_IMPORT_INFO) {
                    var count = getLEB();
                    while (count--) {
                      var modname = getString();
                      var symname = getString();
                      var flags2 = getLEB();
                      if ((flags2 & WASM_SYMBOL_BINDING_MASK) == WASM_SYMBOL_BINDING_WEAK) {
                        customSection.weakImports.add(symname);
                      }
                    }
                  } else {
                    offset += subsectionSize;
                  }
                }
              }
              return customSection;
            }, "getDylinkMetadata");
            function getValue(ptr, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  return HEAP8[ptr];
                case "i8":
                  return HEAP8[ptr];
                case "i16":
                  return LE_HEAP_LOAD_I16((ptr >> 1) * 2);
                case "i32":
                  return LE_HEAP_LOAD_I32((ptr >> 2) * 4);
                case "i64":
                  return HEAP64[ptr >> 3];
                case "float":
                  return LE_HEAP_LOAD_F32((ptr >> 2) * 4);
                case "double":
                  return LE_HEAP_LOAD_F64((ptr >> 3) * 8);
                case "*":
                  return LE_HEAP_LOAD_U32((ptr >> 2) * 4);
                default:
                  abort(`invalid type for getValue: ${type}`);
              }
            }
            __name(getValue, "getValue");
            var newDSO = /* @__PURE__ */ __name((name2, handle2, syms) => {
              var dso = {
                refcount: Infinity,
                name: name2,
                exports: syms,
                global: true
              };
              LDSO.loadedLibsByName[name2] = dso;
              if (handle2 != void 0) {
                LDSO.loadedLibsByHandle[handle2] = dso;
              }
              return dso;
            }, "newDSO");
            var LDSO = {
              loadedLibsByName: {},
              loadedLibsByHandle: {},
              init() {
                newDSO("__main__", 0, wasmImports);
              }
            };
            var ___heap_base = 78224;
            var alignMemory = /* @__PURE__ */ __name((size2, alignment) => Math.ceil(size2 / alignment) * alignment, "alignMemory");
            var getMemory = /* @__PURE__ */ __name((size2) => {
              if (runtimeInitialized) {
                return _calloc(size2, 1);
              }
              var ret = ___heap_base;
              var end = ret + alignMemory(size2, 16);
              ___heap_base = end;
              GOT["__heap_base"].value = end;
              return ret;
            }, "getMemory");
            var isInternalSym = /* @__PURE__ */ __name((symName) => ["__cpp_exception", "__c_longjmp", "__wasm_apply_data_relocs", "__dso_handle", "__tls_size", "__tls_align", "__set_stack_limits", "_emscripten_tls_init", "__wasm_init_tls", "__wasm_call_ctors", "__start_em_asm", "__stop_em_asm", "__start_em_js", "__stop_em_js"].includes(symName) || symName.startsWith("__em_js__"), "isInternalSym");
            var uleb128Encode = /* @__PURE__ */ __name((n, target) => {
              if (n < 128) {
                target.push(n);
              } else {
                target.push(n % 128 | 128, n >> 7);
              }
            }, "uleb128Encode");
            var sigToWasmTypes = /* @__PURE__ */ __name((sig) => {
              var typeNames = {
                "i": "i32",
                "j": "i64",
                "f": "f32",
                "d": "f64",
                "e": "externref",
                "p": "i32"
              };
              var type = {
                parameters: [],
                results: sig[0] == "v" ? [] : [typeNames[sig[0]]]
              };
              for (var i2 = 1; i2 < sig.length; ++i2) {
                type.parameters.push(typeNames[sig[i2]]);
              }
              return type;
            }, "sigToWasmTypes");
            var generateFuncType = /* @__PURE__ */ __name((sig, target) => {
              var sigRet = sig.slice(0, 1);
              var sigParam = sig.slice(1);
              var typeCodes = {
                "i": 127,
                // i32
                "p": 127,
                // i32
                "j": 126,
                // i64
                "f": 125,
                // f32
                "d": 124,
                // f64
                "e": 111
              };
              target.push(96);
              uleb128Encode(sigParam.length, target);
              for (var i2 = 0; i2 < sigParam.length; ++i2) {
                target.push(typeCodes[sigParam[i2]]);
              }
              if (sigRet == "v") {
                target.push(0);
              } else {
                target.push(1, typeCodes[sigRet]);
              }
            }, "generateFuncType");
            var convertJsFunctionToWasm = /* @__PURE__ */ __name((func2, sig) => {
              if (typeof WebAssembly.Function == "function") {
                return new WebAssembly.Function(sigToWasmTypes(sig), func2);
              }
              var typeSectionBody = [1];
              generateFuncType(sig, typeSectionBody);
              var bytes = [
                0,
                97,
                115,
                109,
                // magic ("\0asm")
                1,
                0,
                0,
                0,
                // version: 1
                1
              ];
              uleb128Encode(typeSectionBody.length, bytes);
              bytes.push(...typeSectionBody);
              bytes.push(
                2,
                7,
                // import section
                // (import "e" "f" (func 0 (type 0)))
                1,
                1,
                101,
                1,
                102,
                0,
                0,
                7,
                5,
                // export section
                // (export "f" (func 0 (type 0)))
                1,
                1,
                102,
                0,
                0
              );
              var module2 = new WebAssembly.Module(new Uint8Array(bytes));
              var instance2 = new WebAssembly.Instance(module2, {
                "e": {
                  "f": func2
                }
              });
              var wrappedFunc = instance2.exports["f"];
              return wrappedFunc;
            }, "convertJsFunctionToWasm");
            var wasmTableMirror = [];
            var wasmTable = new WebAssembly.Table({
              "initial": 31,
              "element": "anyfunc"
            });
            var getWasmTableEntry = /* @__PURE__ */ __name((funcPtr) => {
              var func2 = wasmTableMirror[funcPtr];
              if (!func2) {
                if (funcPtr >= wasmTableMirror.length) wasmTableMirror.length = funcPtr + 1;
                wasmTableMirror[funcPtr] = func2 = wasmTable.get(funcPtr);
              }
              return func2;
            }, "getWasmTableEntry");
            var updateTableMap = /* @__PURE__ */ __name((offset, count) => {
              if (functionsInTableMap) {
                for (var i2 = offset; i2 < offset + count; i2++) {
                  var item = getWasmTableEntry(i2);
                  if (item) {
                    functionsInTableMap.set(item, i2);
                  }
                }
              }
            }, "updateTableMap");
            var functionsInTableMap;
            var getFunctionAddress = /* @__PURE__ */ __name((func2) => {
              if (!functionsInTableMap) {
                functionsInTableMap = /* @__PURE__ */ new WeakMap();
                updateTableMap(0, wasmTable.length);
              }
              return functionsInTableMap.get(func2) || 0;
            }, "getFunctionAddress");
            var freeTableIndexes = [];
            var getEmptyTableSlot = /* @__PURE__ */ __name(() => {
              if (freeTableIndexes.length) {
                return freeTableIndexes.pop();
              }
              try {
                wasmTable.grow(1);
              } catch (err2) {
                if (!(err2 instanceof RangeError)) {
                  throw err2;
                }
                throw "Unable to grow wasm table. Set ALLOW_TABLE_GROWTH.";
              }
              return wasmTable.length - 1;
            }, "getEmptyTableSlot");
            var setWasmTableEntry = /* @__PURE__ */ __name((idx, func2) => {
              wasmTable.set(idx, func2);
              wasmTableMirror[idx] = wasmTable.get(idx);
            }, "setWasmTableEntry");
            var addFunction = /* @__PURE__ */ __name((func2, sig) => {
              var rtn = getFunctionAddress(func2);
              if (rtn) {
                return rtn;
              }
              var ret = getEmptyTableSlot();
              try {
                setWasmTableEntry(ret, func2);
              } catch (err2) {
                if (!(err2 instanceof TypeError)) {
                  throw err2;
                }
                var wrapped = convertJsFunctionToWasm(func2, sig);
                setWasmTableEntry(ret, wrapped);
              }
              functionsInTableMap.set(func2, ret);
              return ret;
            }, "addFunction");
            var updateGOT = /* @__PURE__ */ __name((exports2, replace) => {
              for (var symName in exports2) {
                if (isInternalSym(symName)) {
                  continue;
                }
                var value = exports2[symName];
                GOT[symName] ||= new WebAssembly.Global({
                  "value": "i32",
                  "mutable": true
                });
                if (replace || GOT[symName].value == 0) {
                  if (typeof value == "function") {
                    GOT[symName].value = addFunction(value);
                  } else if (typeof value == "number") {
                    GOT[symName].value = value;
                  } else {
                    err(`unhandled export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            }, "updateGOT");
            var relocateExports = /* @__PURE__ */ __name((exports2, memoryBase2, replace) => {
              var relocated = {};
              for (var e in exports2) {
                var value = exports2[e];
                if (typeof value == "object") {
                  value = value.value;
                }
                if (typeof value == "number") {
                  value += memoryBase2;
                }
                relocated[e] = value;
              }
              updateGOT(relocated, replace);
              return relocated;
            }, "relocateExports");
            var isSymbolDefined = /* @__PURE__ */ __name((symName) => {
              var existing = wasmImports[symName];
              if (!existing || existing.stub) {
                return false;
              }
              return true;
            }, "isSymbolDefined");
            var dynCall = /* @__PURE__ */ __name((sig, ptr, args2 = []) => {
              var rtn = getWasmTableEntry(ptr)(...args2);
              return rtn;
            }, "dynCall");
            var stackSave = /* @__PURE__ */ __name(() => _emscripten_stack_get_current(), "stackSave");
            var stackRestore = /* @__PURE__ */ __name((val) => __emscripten_stack_restore(val), "stackRestore");
            var createInvokeFunction = /* @__PURE__ */ __name((sig) => (ptr, ...args2) => {
              var sp = stackSave();
              try {
                return dynCall(sig, ptr, args2);
              } catch (e) {
                stackRestore(sp);
                if (e !== e + 0) throw e;
                _setThrew(1, 0);
                if (sig[0] == "j") return 0n;
              }
            }, "createInvokeFunction");
            var resolveGlobalSymbol = /* @__PURE__ */ __name((symName, direct = false) => {
              var sym;
              if (isSymbolDefined(symName)) {
                sym = wasmImports[symName];
              } else if (symName.startsWith("invoke_")) {
                sym = wasmImports[symName] = createInvokeFunction(symName.split("_")[1]);
              }
              return {
                sym,
                name: symName
              };
            }, "resolveGlobalSymbol");
            var onPostCtors = [];
            var addOnPostCtor = /* @__PURE__ */ __name((cb) => onPostCtors.unshift(cb), "addOnPostCtor");
            var UTF8ToString = /* @__PURE__ */ __name((ptr, maxBytesToRead) => ptr ? UTF8ArrayToString(HEAPU8, ptr, maxBytesToRead) : "", "UTF8ToString");
            var loadWebAssemblyModule = /* @__PURE__ */ __name((binary, flags, libName, localScope, handle) => {
              var metadata = getDylinkMetadata(binary);
              currentModuleWeakSymbols = metadata.weakImports;
              function loadModule() {
                var memAlign = Math.pow(2, metadata.memoryAlign);
                var memoryBase = metadata.memorySize ? alignMemory(getMemory(metadata.memorySize + memAlign), memAlign) : 0;
                var tableBase = metadata.tableSize ? wasmTable.length : 0;
                if (handle) {
                  HEAP8[handle + 8] = 1;
                  LE_HEAP_STORE_U32((handle + 12 >> 2) * 4, memoryBase);
                  LE_HEAP_STORE_I32((handle + 16 >> 2) * 4, metadata.memorySize);
                  LE_HEAP_STORE_U32((handle + 20 >> 2) * 4, tableBase);
                  LE_HEAP_STORE_I32((handle + 24 >> 2) * 4, metadata.tableSize);
                }
                if (metadata.tableSize) {
                  wasmTable.grow(metadata.tableSize);
                }
                var moduleExports;
                function resolveSymbol(sym) {
                  var resolved = resolveGlobalSymbol(sym).sym;
                  if (!resolved && localScope) {
                    resolved = localScope[sym];
                  }
                  if (!resolved) {
                    resolved = moduleExports[sym];
                  }
                  return resolved;
                }
                __name(resolveSymbol, "resolveSymbol");
                var proxyHandler = {
                  get(stubs, prop) {
                    switch (prop) {
                      case "__memory_base":
                        return memoryBase;
                      case "__table_base":
                        return tableBase;
                    }
                    if (prop in wasmImports && !wasmImports[prop].stub) {
                      var res = wasmImports[prop];
                      return res;
                    }
                    if (!(prop in stubs)) {
                      var resolved;
                      stubs[prop] = (...args2) => {
                        resolved ||= resolveSymbol(prop);
                        return resolved(...args2);
                      };
                    }
                    return stubs[prop];
                  }
                };
                var proxy = new Proxy({}, proxyHandler);
                var info = {
                  "GOT.mem": new Proxy({}, GOTHandler),
                  "GOT.func": new Proxy({}, GOTHandler),
                  "env": proxy,
                  "wasi_snapshot_preview1": proxy
                };
                function postInstantiation(module, instance) {
                  updateTableMap(tableBase, metadata.tableSize);
                  moduleExports = relocateExports(instance.exports, memoryBase);
                  if (!flags.allowUndefined) {
                    reportUndefinedSymbols();
                  }
                  function addEmAsm(addr, body) {
                    var args = [];
                    var arity = 0;
                    for (; arity < 16; arity++) {
                      if (body.indexOf("$" + arity) != -1) {
                        args.push("$" + arity);
                      } else {
                        break;
                      }
                    }
                    args = args.join(",");
                    var func = `(${args}) => { ${body} };`;
                    ASM_CONSTS[start] = eval(func);
                  }
                  __name(addEmAsm, "addEmAsm");
                  if ("__start_em_asm" in moduleExports) {
                    var start = moduleExports["__start_em_asm"];
                    var stop = moduleExports["__stop_em_asm"];
                    while (start < stop) {
                      var jsString = UTF8ToString(start);
                      addEmAsm(start, jsString);
                      start = HEAPU8.indexOf(0, start) + 1;
                    }
                  }
                  function addEmJs(name, cSig, body) {
                    var jsArgs = [];
                    cSig = cSig.slice(1, -1);
                    if (cSig != "void") {
                      cSig = cSig.split(",");
                      for (var i in cSig) {
                        var jsArg = cSig[i].split(" ").pop();
                        jsArgs.push(jsArg.replace("*", ""));
                      }
                    }
                    var func = `(${jsArgs}) => ${body};`;
                    moduleExports[name] = eval(func);
                  }
                  __name(addEmJs, "addEmJs");
                  for (var name in moduleExports) {
                    if (name.startsWith("__em_js__")) {
                      var start = moduleExports[name];
                      var jsString = UTF8ToString(start);
                      var parts = jsString.split("<::>");
                      addEmJs(name.replace("__em_js__", ""), parts[0], parts[1]);
                      delete moduleExports[name];
                    }
                  }
                  var applyRelocs = moduleExports["__wasm_apply_data_relocs"];
                  if (applyRelocs) {
                    if (runtimeInitialized) {
                      applyRelocs();
                    } else {
                      __RELOC_FUNCS__.push(applyRelocs);
                    }
                  }
                  var init = moduleExports["__wasm_call_ctors"];
                  if (init) {
                    if (runtimeInitialized) {
                      init();
                    } else {
                      addOnPostCtor(init);
                    }
                  }
                  return moduleExports;
                }
                __name(postInstantiation, "postInstantiation");
                if (flags.loadAsync) {
                  if (binary instanceof WebAssembly.Module) {
                    var instance = new WebAssembly.Instance(binary, info);
                    return Promise.resolve(postInstantiation(binary, instance));
                  }
                  return WebAssembly.instantiate(binary, info).then((result) => postInstantiation(result.module, result.instance));
                }
                var module = binary instanceof WebAssembly.Module ? binary : new WebAssembly.Module(binary);
                var instance = new WebAssembly.Instance(module, info);
                return postInstantiation(module, instance);
              }
              __name(loadModule, "loadModule");
              if (flags.loadAsync) {
                return metadata.neededDynlibs.reduce((chain2, dynNeeded) => chain2.then(() => loadDynamicLibrary(dynNeeded, flags, localScope)), Promise.resolve()).then(loadModule);
              }
              metadata.neededDynlibs.forEach((needed) => loadDynamicLibrary(needed, flags, localScope));
              return loadModule();
            }, "loadWebAssemblyModule");
            var mergeLibSymbols = /* @__PURE__ */ __name((exports2, libName2) => {
              for (var [sym, exp] of Object.entries(exports2)) {
                const setImport = /* @__PURE__ */ __name((target) => {
                  if (!isSymbolDefined(target)) {
                    wasmImports[target] = exp;
                  }
                }, "setImport");
                setImport(sym);
                const main_alias = "__main_argc_argv";
                if (sym == "main") {
                  setImport(main_alias);
                }
                if (sym == main_alias) {
                  setImport("main");
                }
              }
            }, "mergeLibSymbols");
            var asyncLoad = /* @__PURE__ */ __name(async (url) => {
              var arrayBuffer = await readAsync(url);
              return new Uint8Array(arrayBuffer);
            }, "asyncLoad");
            function loadDynamicLibrary(libName2, flags2 = {
              global: true,
              nodelete: true
            }, localScope2, handle2) {
              var dso = LDSO.loadedLibsByName[libName2];
              if (dso) {
                if (!flags2.global) {
                  if (localScope2) {
                    Object.assign(localScope2, dso.exports);
                  }
                } else if (!dso.global) {
                  dso.global = true;
                  mergeLibSymbols(dso.exports, libName2);
                }
                if (flags2.nodelete && dso.refcount !== Infinity) {
                  dso.refcount = Infinity;
                }
                dso.refcount++;
                if (handle2) {
                  LDSO.loadedLibsByHandle[handle2] = dso;
                }
                return flags2.loadAsync ? Promise.resolve(true) : true;
              }
              dso = newDSO(libName2, handle2, "loading");
              dso.refcount = flags2.nodelete ? Infinity : 1;
              dso.global = flags2.global;
              function loadLibData() {
                if (handle2) {
                  var data = LE_HEAP_LOAD_U32((handle2 + 28 >> 2) * 4);
                  var dataSize = LE_HEAP_LOAD_U32((handle2 + 32 >> 2) * 4);
                  if (data && dataSize) {
                    var libData = HEAP8.slice(data, data + dataSize);
                    return flags2.loadAsync ? Promise.resolve(libData) : libData;
                  }
                }
                var libFile = locateFile(libName2);
                if (flags2.loadAsync) {
                  return asyncLoad(libFile);
                }
                if (!readBinary) {
                  throw new Error(`${libFile}: file not found, and synchronous loading of external files is not available`);
                }
                return readBinary(libFile);
              }
              __name(loadLibData, "loadLibData");
              function getExports() {
                if (flags2.loadAsync) {
                  return loadLibData().then((libData) => loadWebAssemblyModule(libData, flags2, libName2, localScope2, handle2));
                }
                return loadWebAssemblyModule(loadLibData(), flags2, libName2, localScope2, handle2);
              }
              __name(getExports, "getExports");
              function moduleLoaded(exports2) {
                if (dso.global) {
                  mergeLibSymbols(exports2, libName2);
                } else if (localScope2) {
                  Object.assign(localScope2, exports2);
                }
                dso.exports = exports2;
              }
              __name(moduleLoaded, "moduleLoaded");
              if (flags2.loadAsync) {
                return getExports().then((exports2) => {
                  moduleLoaded(exports2);
                  return true;
                });
              }
              moduleLoaded(getExports());
              return true;
            }
            __name(loadDynamicLibrary, "loadDynamicLibrary");
            var reportUndefinedSymbols = /* @__PURE__ */ __name(() => {
              for (var [symName, entry] of Object.entries(GOT)) {
                if (entry.value == 0) {
                  var value = resolveGlobalSymbol(symName, true).sym;
                  if (!value && !entry.required) {
                    continue;
                  }
                  if (typeof value == "function") {
                    entry.value = addFunction(value, value.sig);
                  } else if (typeof value == "number") {
                    entry.value = value;
                  } else {
                    throw new Error(`bad export type for '${symName}': ${typeof value}`);
                  }
                }
              }
            }, "reportUndefinedSymbols");
            var loadDylibs = /* @__PURE__ */ __name(() => {
              if (!dynamicLibraries.length) {
                reportUndefinedSymbols();
                return;
              }
              addRunDependency("loadDylibs");
              dynamicLibraries.reduce((chain2, lib) => chain2.then(() => loadDynamicLibrary(lib, {
                loadAsync: true,
                global: true,
                nodelete: true,
                allowUndefined: true
              })), Promise.resolve()).then(() => {
                reportUndefinedSymbols();
                removeRunDependency("loadDylibs");
              });
            }, "loadDylibs");
            var noExitRuntime = Module["noExitRuntime"] || true;
            function setValue(ptr, value, type = "i8") {
              if (type.endsWith("*")) type = "*";
              switch (type) {
                case "i1":
                  HEAP8[ptr] = value;
                  break;
                case "i8":
                  HEAP8[ptr] = value;
                  break;
                case "i16":
                  LE_HEAP_STORE_I16((ptr >> 1) * 2, value);
                  break;
                case "i32":
                  LE_HEAP_STORE_I32((ptr >> 2) * 4, value);
                  break;
                case "i64":
                  HEAP64[ptr >> 3] = BigInt(value);
                  break;
                case "float":
                  LE_HEAP_STORE_F32((ptr >> 2) * 4, value);
                  break;
                case "double":
                  LE_HEAP_STORE_F64((ptr >> 3) * 8, value);
                  break;
                case "*":
                  LE_HEAP_STORE_U32((ptr >> 2) * 4, value);
                  break;
                default:
                  abort(`invalid type for setValue: ${type}`);
              }
            }
            __name(setValue, "setValue");
            var ___memory_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1024);
            var ___stack_pointer = new WebAssembly.Global({
              "value": "i32",
              "mutable": true
            }, 78224);
            var ___table_base = new WebAssembly.Global({
              "value": "i32",
              "mutable": false
            }, 1);
            var __abort_js = /* @__PURE__ */ __name(() => abort(""), "__abort_js");
            __abort_js.sig = "v";
            var _emscripten_get_now = /* @__PURE__ */ __name(() => performance.now(), "_emscripten_get_now");
            _emscripten_get_now.sig = "d";
            var _emscripten_date_now = /* @__PURE__ */ __name(() => Date.now(), "_emscripten_date_now");
            _emscripten_date_now.sig = "d";
            var nowIsMonotonic = 1;
            var checkWasiClock = /* @__PURE__ */ __name((clock_id) => clock_id >= 0 && clock_id <= 3, "checkWasiClock");
            var INT53_MAX = 9007199254740992;
            var INT53_MIN = -9007199254740992;
            var bigintToI53Checked = /* @__PURE__ */ __name((num) => num < INT53_MIN || num > INT53_MAX ? NaN : Number(num), "bigintToI53Checked");
            function _clock_time_get(clk_id, ignored_precision, ptime) {
              ignored_precision = bigintToI53Checked(ignored_precision);
              if (!checkWasiClock(clk_id)) {
                return 28;
              }
              var now;
              if (clk_id === 0) {
                now = _emscripten_date_now();
              } else if (nowIsMonotonic) {
                now = _emscripten_get_now();
              } else {
                return 52;
              }
              var nsec = Math.round(now * 1e3 * 1e3);
              HEAP64[ptime >> 3] = BigInt(nsec);
              return 0;
            }
            __name(_clock_time_get, "_clock_time_get");
            _clock_time_get.sig = "iijp";
            var getHeapMax = /* @__PURE__ */ __name(() => (
              // Stay one Wasm page short of 4GB: while e.g. Chrome is able to allocate
              // full 4GB Wasm memories, the size will wrap back to 0 bytes in Wasm side
              // for any code that deals with heap sizes, which would require special
              // casing all heap size related code to treat 0 specially.
              2147483648
            ), "getHeapMax");
            var growMemory = /* @__PURE__ */ __name((size2) => {
              var b = wasmMemory.buffer;
              var pages = (size2 - b.byteLength + 65535) / 65536 | 0;
              try {
                wasmMemory.grow(pages);
                updateMemoryViews();
                return 1;
              } catch (e) {
              }
            }, "growMemory");
            var _emscripten_resize_heap = /* @__PURE__ */ __name((requestedSize) => {
              var oldSize = HEAPU8.length;
              requestedSize >>>= 0;
              var maxHeapSize = getHeapMax();
              if (requestedSize > maxHeapSize) {
                return false;
              }
              for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
                var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
                overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
                var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
                var replacement = growMemory(newSize);
                if (replacement) {
                  return true;
                }
              }
              return false;
            }, "_emscripten_resize_heap");
            _emscripten_resize_heap.sig = "ip";
            var _fd_close = /* @__PURE__ */ __name((fd) => 52, "_fd_close");
            _fd_close.sig = "ii";
            function _fd_seek(fd, offset, whence, newOffset) {
              offset = bigintToI53Checked(offset);
              return 70;
            }
            __name(_fd_seek, "_fd_seek");
            _fd_seek.sig = "iijip";
            var printCharBuffers = [null, [], []];
            var printChar = /* @__PURE__ */ __name((stream, curr) => {
              var buffer = printCharBuffers[stream];
              if (curr === 0 || curr === 10) {
                (stream === 1 ? out : err)(UTF8ArrayToString(buffer));
                buffer.length = 0;
              } else {
                buffer.push(curr);
              }
            }, "printChar");
            var flush_NO_FILESYSTEM = /* @__PURE__ */ __name(() => {
              if (printCharBuffers[1].length) printChar(1, 10);
              if (printCharBuffers[2].length) printChar(2, 10);
            }, "flush_NO_FILESYSTEM");
            var SYSCALLS = {
              varargs: void 0,
              getStr(ptr) {
                var ret = UTF8ToString(ptr);
                return ret;
              }
            };
            var _fd_write = /* @__PURE__ */ __name((fd, iov, iovcnt, pnum) => {
              var num = 0;
              for (var i2 = 0; i2 < iovcnt; i2++) {
                var ptr = LE_HEAP_LOAD_U32((iov >> 2) * 4);
                var len = LE_HEAP_LOAD_U32((iov + 4 >> 2) * 4);
                iov += 8;
                for (var j = 0; j < len; j++) {
                  printChar(fd, HEAPU8[ptr + j]);
                }
                num += len;
              }
              LE_HEAP_STORE_U32((pnum >> 2) * 4, num);
              return 0;
            }, "_fd_write");
            _fd_write.sig = "iippp";
            function _tree_sitter_log_callback(isLexMessage, messageAddress) {
              if (Module.currentLogCallback) {
                const message = UTF8ToString(messageAddress);
                Module.currentLogCallback(message, isLexMessage !== 0);
              }
            }
            __name(_tree_sitter_log_callback, "_tree_sitter_log_callback");
            function _tree_sitter_parse_callback(inputBufferAddress, index2, row2, column, lengthAddress) {
              const INPUT_BUFFER_SIZE = 10 * 1024;
              const string = Module.currentParseCallback(index2, {
                row: row2,
                column
              });
              if (typeof string === "string") {
                setValue(lengthAddress, string.length, "i32");
                stringToUTF16(string, inputBufferAddress, INPUT_BUFFER_SIZE);
              } else {
                setValue(lengthAddress, 0, "i32");
              }
            }
            __name(_tree_sitter_parse_callback, "_tree_sitter_parse_callback");
            function _tree_sitter_progress_callback(currentOffset, hasError) {
              if (Module.currentProgressCallback) {
                return Module.currentProgressCallback({
                  currentOffset,
                  hasError
                });
              }
              return false;
            }
            __name(_tree_sitter_progress_callback, "_tree_sitter_progress_callback");
            function _tree_sitter_query_progress_callback(currentOffset) {
              if (Module.currentQueryProgressCallback) {
                return Module.currentQueryProgressCallback({
                  currentOffset
                });
              }
              return false;
            }
            __name(_tree_sitter_query_progress_callback, "_tree_sitter_query_progress_callback");
            var runtimeKeepaliveCounter = 0;
            var keepRuntimeAlive = /* @__PURE__ */ __name(() => noExitRuntime || runtimeKeepaliveCounter > 0, "keepRuntimeAlive");
            var _proc_exit = /* @__PURE__ */ __name((code) => {
              EXITSTATUS = code;
              if (!keepRuntimeAlive()) {
                Module["onExit"]?.(code);
                ABORT = true;
              }
              quit_(code, new ExitStatus(code));
            }, "_proc_exit");
            _proc_exit.sig = "vi";
            var exitJS = /* @__PURE__ */ __name((status, implicit) => {
              EXITSTATUS = status;
              _proc_exit(status);
            }, "exitJS");
            var handleException = /* @__PURE__ */ __name((e) => {
              if (e instanceof ExitStatus || e == "unwind") {
                return EXITSTATUS;
              }
              quit_(1, e);
            }, "handleException");
            var lengthBytesUTF8 = /* @__PURE__ */ __name((str2) => {
              var len = 0;
              for (var i2 = 0; i2 < str2.length; ++i2) {
                var c = str2.charCodeAt(i2);
                if (c <= 127) {
                  len++;
                } else if (c <= 2047) {
                  len += 2;
                } else if (c >= 55296 && c <= 57343) {
                  len += 4;
                  ++i2;
                } else {
                  len += 3;
                }
              }
              return len;
            }, "lengthBytesUTF8");
            var stringToUTF8Array = /* @__PURE__ */ __name((str2, heap, outIdx, maxBytesToWrite) => {
              if (!(maxBytesToWrite > 0)) return 0;
              var startIdx = outIdx;
              var endIdx = outIdx + maxBytesToWrite - 1;
              for (var i2 = 0; i2 < str2.length; ++i2) {
                var u2 = str2.charCodeAt(i2);
                if (u2 >= 55296 && u2 <= 57343) {
                  var u1 = str2.charCodeAt(++i2);
                  u2 = 65536 + ((u2 & 1023) << 10) | u1 & 1023;
                }
                if (u2 <= 127) {
                  if (outIdx >= endIdx) break;
                  heap[outIdx++] = u2;
                } else if (u2 <= 2047) {
                  if (outIdx + 1 >= endIdx) break;
                  heap[outIdx++] = 192 | u2 >> 6;
                  heap[outIdx++] = 128 | u2 & 63;
                } else if (u2 <= 65535) {
                  if (outIdx + 2 >= endIdx) break;
                  heap[outIdx++] = 224 | u2 >> 12;
                  heap[outIdx++] = 128 | u2 >> 6 & 63;
                  heap[outIdx++] = 128 | u2 & 63;
                } else {
                  if (outIdx + 3 >= endIdx) break;
                  heap[outIdx++] = 240 | u2 >> 18;
                  heap[outIdx++] = 128 | u2 >> 12 & 63;
                  heap[outIdx++] = 128 | u2 >> 6 & 63;
                  heap[outIdx++] = 128 | u2 & 63;
                }
              }
              heap[outIdx] = 0;
              return outIdx - startIdx;
            }, "stringToUTF8Array");
            var stringToUTF8 = /* @__PURE__ */ __name((str2, outPtr, maxBytesToWrite) => stringToUTF8Array(str2, HEAPU8, outPtr, maxBytesToWrite), "stringToUTF8");
            var stackAlloc = /* @__PURE__ */ __name((sz) => __emscripten_stack_alloc(sz), "stackAlloc");
            var stringToUTF8OnStack = /* @__PURE__ */ __name((str2) => {
              var size2 = lengthBytesUTF8(str2) + 1;
              var ret = stackAlloc(size2);
              stringToUTF8(str2, ret, size2);
              return ret;
            }, "stringToUTF8OnStack");
            var AsciiToString = /* @__PURE__ */ __name((ptr) => {
              var str2 = "";
              while (1) {
                var ch = HEAPU8[ptr++];
                if (!ch) return str2;
                str2 += String.fromCharCode(ch);
              }
            }, "AsciiToString");
            var stringToUTF16 = /* @__PURE__ */ __name((str2, outPtr, maxBytesToWrite) => {
              maxBytesToWrite ??= 2147483647;
              if (maxBytesToWrite < 2) return 0;
              maxBytesToWrite -= 2;
              var startPtr = outPtr;
              var numCharsToWrite = maxBytesToWrite < str2.length * 2 ? maxBytesToWrite / 2 : str2.length;
              for (var i2 = 0; i2 < numCharsToWrite; ++i2) {
                var codeUnit = str2.charCodeAt(i2);
                LE_HEAP_STORE_I16((outPtr >> 1) * 2, codeUnit);
                outPtr += 2;
              }
              LE_HEAP_STORE_I16((outPtr >> 1) * 2, 0);
              return outPtr - startPtr;
            }, "stringToUTF16");
            var wasmImports = {
              /** @export */
              __heap_base: ___heap_base,
              /** @export */
              __indirect_function_table: wasmTable,
              /** @export */
              __memory_base: ___memory_base,
              /** @export */
              __stack_pointer: ___stack_pointer,
              /** @export */
              __table_base: ___table_base,
              /** @export */
              _abort_js: __abort_js,
              /** @export */
              clock_time_get: _clock_time_get,
              /** @export */
              emscripten_resize_heap: _emscripten_resize_heap,
              /** @export */
              fd_close: _fd_close,
              /** @export */
              fd_seek: _fd_seek,
              /** @export */
              fd_write: _fd_write,
              /** @export */
              memory: wasmMemory,
              /** @export */
              tree_sitter_log_callback: _tree_sitter_log_callback,
              /** @export */
              tree_sitter_parse_callback: _tree_sitter_parse_callback,
              /** @export */
              tree_sitter_progress_callback: _tree_sitter_progress_callback,
              /** @export */
              tree_sitter_query_progress_callback: _tree_sitter_query_progress_callback
            };
            var wasmExports = await createWasm();
            var ___wasm_call_ctors = wasmExports["__wasm_call_ctors"];
            var _malloc = Module["_malloc"] = wasmExports["malloc"];
            var _calloc = Module["_calloc"] = wasmExports["calloc"];
            var _realloc = Module["_realloc"] = wasmExports["realloc"];
            var _free = Module["_free"] = wasmExports["free"];
            var _memcmp = Module["_memcmp"] = wasmExports["memcmp"];
            var _ts_language_symbol_count = Module["_ts_language_symbol_count"] = wasmExports["ts_language_symbol_count"];
            var _ts_language_state_count = Module["_ts_language_state_count"] = wasmExports["ts_language_state_count"];
            var _ts_language_version = Module["_ts_language_version"] = wasmExports["ts_language_version"];
            var _ts_language_abi_version = Module["_ts_language_abi_version"] = wasmExports["ts_language_abi_version"];
            var _ts_language_metadata = Module["_ts_language_metadata"] = wasmExports["ts_language_metadata"];
            var _ts_language_name = Module["_ts_language_name"] = wasmExports["ts_language_name"];
            var _ts_language_field_count = Module["_ts_language_field_count"] = wasmExports["ts_language_field_count"];
            var _ts_language_next_state = Module["_ts_language_next_state"] = wasmExports["ts_language_next_state"];
            var _ts_language_symbol_name = Module["_ts_language_symbol_name"] = wasmExports["ts_language_symbol_name"];
            var _ts_language_symbol_for_name = Module["_ts_language_symbol_for_name"] = wasmExports["ts_language_symbol_for_name"];
            var _strncmp = Module["_strncmp"] = wasmExports["strncmp"];
            var _ts_language_symbol_type = Module["_ts_language_symbol_type"] = wasmExports["ts_language_symbol_type"];
            var _ts_language_field_name_for_id = Module["_ts_language_field_name_for_id"] = wasmExports["ts_language_field_name_for_id"];
            var _ts_lookahead_iterator_new = Module["_ts_lookahead_iterator_new"] = wasmExports["ts_lookahead_iterator_new"];
            var _ts_lookahead_iterator_delete = Module["_ts_lookahead_iterator_delete"] = wasmExports["ts_lookahead_iterator_delete"];
            var _ts_lookahead_iterator_reset_state = Module["_ts_lookahead_iterator_reset_state"] = wasmExports["ts_lookahead_iterator_reset_state"];
            var _ts_lookahead_iterator_reset = Module["_ts_lookahead_iterator_reset"] = wasmExports["ts_lookahead_iterator_reset"];
            var _ts_lookahead_iterator_next = Module["_ts_lookahead_iterator_next"] = wasmExports["ts_lookahead_iterator_next"];
            var _ts_lookahead_iterator_current_symbol = Module["_ts_lookahead_iterator_current_symbol"] = wasmExports["ts_lookahead_iterator_current_symbol"];
            var _ts_parser_delete = Module["_ts_parser_delete"] = wasmExports["ts_parser_delete"];
            var _ts_parser_reset = Module["_ts_parser_reset"] = wasmExports["ts_parser_reset"];
            var _ts_parser_set_language = Module["_ts_parser_set_language"] = wasmExports["ts_parser_set_language"];
            var _ts_parser_timeout_micros = Module["_ts_parser_timeout_micros"] = wasmExports["ts_parser_timeout_micros"];
            var _ts_parser_set_timeout_micros = Module["_ts_parser_set_timeout_micros"] = wasmExports["ts_parser_set_timeout_micros"];
            var _ts_parser_set_included_ranges = Module["_ts_parser_set_included_ranges"] = wasmExports["ts_parser_set_included_ranges"];
            var _ts_query_new = Module["_ts_query_new"] = wasmExports["ts_query_new"];
            var _ts_query_delete = Module["_ts_query_delete"] = wasmExports["ts_query_delete"];
            var _iswspace = Module["_iswspace"] = wasmExports["iswspace"];
            var _iswalnum = Module["_iswalnum"] = wasmExports["iswalnum"];
            var _ts_query_pattern_count = Module["_ts_query_pattern_count"] = wasmExports["ts_query_pattern_count"];
            var _ts_query_capture_count = Module["_ts_query_capture_count"] = wasmExports["ts_query_capture_count"];
            var _ts_query_string_count = Module["_ts_query_string_count"] = wasmExports["ts_query_string_count"];
            var _ts_query_capture_name_for_id = Module["_ts_query_capture_name_for_id"] = wasmExports["ts_query_capture_name_for_id"];
            var _ts_query_capture_quantifier_for_id = Module["_ts_query_capture_quantifier_for_id"] = wasmExports["ts_query_capture_quantifier_for_id"];
            var _ts_query_string_value_for_id = Module["_ts_query_string_value_for_id"] = wasmExports["ts_query_string_value_for_id"];
            var _ts_query_predicates_for_pattern = Module["_ts_query_predicates_for_pattern"] = wasmExports["ts_query_predicates_for_pattern"];
            var _ts_query_start_byte_for_pattern = Module["_ts_query_start_byte_for_pattern"] = wasmExports["ts_query_start_byte_for_pattern"];
            var _ts_query_end_byte_for_pattern = Module["_ts_query_end_byte_for_pattern"] = wasmExports["ts_query_end_byte_for_pattern"];
            var _ts_query_is_pattern_rooted = Module["_ts_query_is_pattern_rooted"] = wasmExports["ts_query_is_pattern_rooted"];
            var _ts_query_is_pattern_non_local = Module["_ts_query_is_pattern_non_local"] = wasmExports["ts_query_is_pattern_non_local"];
            var _ts_query_is_pattern_guaranteed_at_step = Module["_ts_query_is_pattern_guaranteed_at_step"] = wasmExports["ts_query_is_pattern_guaranteed_at_step"];
            var _ts_query_disable_capture = Module["_ts_query_disable_capture"] = wasmExports["ts_query_disable_capture"];
            var _ts_query_disable_pattern = Module["_ts_query_disable_pattern"] = wasmExports["ts_query_disable_pattern"];
            var _ts_tree_copy = Module["_ts_tree_copy"] = wasmExports["ts_tree_copy"];
            var _ts_tree_delete = Module["_ts_tree_delete"] = wasmExports["ts_tree_delete"];
            var _ts_init = Module["_ts_init"] = wasmExports["ts_init"];
            var _ts_parser_new_wasm = Module["_ts_parser_new_wasm"] = wasmExports["ts_parser_new_wasm"];
            var _ts_parser_enable_logger_wasm = Module["_ts_parser_enable_logger_wasm"] = wasmExports["ts_parser_enable_logger_wasm"];
            var _ts_parser_parse_wasm = Module["_ts_parser_parse_wasm"] = wasmExports["ts_parser_parse_wasm"];
            var _ts_parser_included_ranges_wasm = Module["_ts_parser_included_ranges_wasm"] = wasmExports["ts_parser_included_ranges_wasm"];
            var _ts_language_type_is_named_wasm = Module["_ts_language_type_is_named_wasm"] = wasmExports["ts_language_type_is_named_wasm"];
            var _ts_language_type_is_visible_wasm = Module["_ts_language_type_is_visible_wasm"] = wasmExports["ts_language_type_is_visible_wasm"];
            var _ts_language_supertypes_wasm = Module["_ts_language_supertypes_wasm"] = wasmExports["ts_language_supertypes_wasm"];
            var _ts_language_subtypes_wasm = Module["_ts_language_subtypes_wasm"] = wasmExports["ts_language_subtypes_wasm"];
            var _ts_tree_root_node_wasm = Module["_ts_tree_root_node_wasm"] = wasmExports["ts_tree_root_node_wasm"];
            var _ts_tree_root_node_with_offset_wasm = Module["_ts_tree_root_node_with_offset_wasm"] = wasmExports["ts_tree_root_node_with_offset_wasm"];
            var _ts_tree_edit_wasm = Module["_ts_tree_edit_wasm"] = wasmExports["ts_tree_edit_wasm"];
            var _ts_tree_included_ranges_wasm = Module["_ts_tree_included_ranges_wasm"] = wasmExports["ts_tree_included_ranges_wasm"];
            var _ts_tree_get_changed_ranges_wasm = Module["_ts_tree_get_changed_ranges_wasm"] = wasmExports["ts_tree_get_changed_ranges_wasm"];
            var _ts_tree_cursor_new_wasm = Module["_ts_tree_cursor_new_wasm"] = wasmExports["ts_tree_cursor_new_wasm"];
            var _ts_tree_cursor_copy_wasm = Module["_ts_tree_cursor_copy_wasm"] = wasmExports["ts_tree_cursor_copy_wasm"];
            var _ts_tree_cursor_delete_wasm = Module["_ts_tree_cursor_delete_wasm"] = wasmExports["ts_tree_cursor_delete_wasm"];
            var _ts_tree_cursor_reset_wasm = Module["_ts_tree_cursor_reset_wasm"] = wasmExports["ts_tree_cursor_reset_wasm"];
            var _ts_tree_cursor_reset_to_wasm = Module["_ts_tree_cursor_reset_to_wasm"] = wasmExports["ts_tree_cursor_reset_to_wasm"];
            var _ts_tree_cursor_goto_first_child_wasm = Module["_ts_tree_cursor_goto_first_child_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_wasm"];
            var _ts_tree_cursor_goto_last_child_wasm = Module["_ts_tree_cursor_goto_last_child_wasm"] = wasmExports["ts_tree_cursor_goto_last_child_wasm"];
            var _ts_tree_cursor_goto_first_child_for_index_wasm = Module["_ts_tree_cursor_goto_first_child_for_index_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_index_wasm"];
            var _ts_tree_cursor_goto_first_child_for_position_wasm = Module["_ts_tree_cursor_goto_first_child_for_position_wasm"] = wasmExports["ts_tree_cursor_goto_first_child_for_position_wasm"];
            var _ts_tree_cursor_goto_next_sibling_wasm = Module["_ts_tree_cursor_goto_next_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_next_sibling_wasm"];
            var _ts_tree_cursor_goto_previous_sibling_wasm = Module["_ts_tree_cursor_goto_previous_sibling_wasm"] = wasmExports["ts_tree_cursor_goto_previous_sibling_wasm"];
            var _ts_tree_cursor_goto_descendant_wasm = Module["_ts_tree_cursor_goto_descendant_wasm"] = wasmExports["ts_tree_cursor_goto_descendant_wasm"];
            var _ts_tree_cursor_goto_parent_wasm = Module["_ts_tree_cursor_goto_parent_wasm"] = wasmExports["ts_tree_cursor_goto_parent_wasm"];
            var _ts_tree_cursor_current_node_type_id_wasm = Module["_ts_tree_cursor_current_node_type_id_wasm"] = wasmExports["ts_tree_cursor_current_node_type_id_wasm"];
            var _ts_tree_cursor_current_node_state_id_wasm = Module["_ts_tree_cursor_current_node_state_id_wasm"] = wasmExports["ts_tree_cursor_current_node_state_id_wasm"];
            var _ts_tree_cursor_current_node_is_named_wasm = Module["_ts_tree_cursor_current_node_is_named_wasm"] = wasmExports["ts_tree_cursor_current_node_is_named_wasm"];
            var _ts_tree_cursor_current_node_is_missing_wasm = Module["_ts_tree_cursor_current_node_is_missing_wasm"] = wasmExports["ts_tree_cursor_current_node_is_missing_wasm"];
            var _ts_tree_cursor_current_node_id_wasm = Module["_ts_tree_cursor_current_node_id_wasm"] = wasmExports["ts_tree_cursor_current_node_id_wasm"];
            var _ts_tree_cursor_start_position_wasm = Module["_ts_tree_cursor_start_position_wasm"] = wasmExports["ts_tree_cursor_start_position_wasm"];
            var _ts_tree_cursor_end_position_wasm = Module["_ts_tree_cursor_end_position_wasm"] = wasmExports["ts_tree_cursor_end_position_wasm"];
            var _ts_tree_cursor_start_index_wasm = Module["_ts_tree_cursor_start_index_wasm"] = wasmExports["ts_tree_cursor_start_index_wasm"];
            var _ts_tree_cursor_end_index_wasm = Module["_ts_tree_cursor_end_index_wasm"] = wasmExports["ts_tree_cursor_end_index_wasm"];
            var _ts_tree_cursor_current_field_id_wasm = Module["_ts_tree_cursor_current_field_id_wasm"] = wasmExports["ts_tree_cursor_current_field_id_wasm"];
            var _ts_tree_cursor_current_depth_wasm = Module["_ts_tree_cursor_current_depth_wasm"] = wasmExports["ts_tree_cursor_current_depth_wasm"];
            var _ts_tree_cursor_current_descendant_index_wasm = Module["_ts_tree_cursor_current_descendant_index_wasm"] = wasmExports["ts_tree_cursor_current_descendant_index_wasm"];
            var _ts_tree_cursor_current_node_wasm = Module["_ts_tree_cursor_current_node_wasm"] = wasmExports["ts_tree_cursor_current_node_wasm"];
            var _ts_node_symbol_wasm = Module["_ts_node_symbol_wasm"] = wasmExports["ts_node_symbol_wasm"];
            var _ts_node_field_name_for_child_wasm = Module["_ts_node_field_name_for_child_wasm"] = wasmExports["ts_node_field_name_for_child_wasm"];
            var _ts_node_field_name_for_named_child_wasm = Module["_ts_node_field_name_for_named_child_wasm"] = wasmExports["ts_node_field_name_for_named_child_wasm"];
            var _ts_node_children_by_field_id_wasm = Module["_ts_node_children_by_field_id_wasm"] = wasmExports["ts_node_children_by_field_id_wasm"];
            var _ts_node_first_child_for_byte_wasm = Module["_ts_node_first_child_for_byte_wasm"] = wasmExports["ts_node_first_child_for_byte_wasm"];
            var _ts_node_first_named_child_for_byte_wasm = Module["_ts_node_first_named_child_for_byte_wasm"] = wasmExports["ts_node_first_named_child_for_byte_wasm"];
            var _ts_node_grammar_symbol_wasm = Module["_ts_node_grammar_symbol_wasm"] = wasmExports["ts_node_grammar_symbol_wasm"];
            var _ts_node_child_count_wasm = Module["_ts_node_child_count_wasm"] = wasmExports["ts_node_child_count_wasm"];
            var _ts_node_named_child_count_wasm = Module["_ts_node_named_child_count_wasm"] = wasmExports["ts_node_named_child_count_wasm"];
            var _ts_node_child_wasm = Module["_ts_node_child_wasm"] = wasmExports["ts_node_child_wasm"];
            var _ts_node_named_child_wasm = Module["_ts_node_named_child_wasm"] = wasmExports["ts_node_named_child_wasm"];
            var _ts_node_child_by_field_id_wasm = Module["_ts_node_child_by_field_id_wasm"] = wasmExports["ts_node_child_by_field_id_wasm"];
            var _ts_node_next_sibling_wasm = Module["_ts_node_next_sibling_wasm"] = wasmExports["ts_node_next_sibling_wasm"];
            var _ts_node_prev_sibling_wasm = Module["_ts_node_prev_sibling_wasm"] = wasmExports["ts_node_prev_sibling_wasm"];
            var _ts_node_next_named_sibling_wasm = Module["_ts_node_next_named_sibling_wasm"] = wasmExports["ts_node_next_named_sibling_wasm"];
            var _ts_node_prev_named_sibling_wasm = Module["_ts_node_prev_named_sibling_wasm"] = wasmExports["ts_node_prev_named_sibling_wasm"];
            var _ts_node_descendant_count_wasm = Module["_ts_node_descendant_count_wasm"] = wasmExports["ts_node_descendant_count_wasm"];
            var _ts_node_parent_wasm = Module["_ts_node_parent_wasm"] = wasmExports["ts_node_parent_wasm"];
            var _ts_node_child_with_descendant_wasm = Module["_ts_node_child_with_descendant_wasm"] = wasmExports["ts_node_child_with_descendant_wasm"];
            var _ts_node_descendant_for_index_wasm = Module["_ts_node_descendant_for_index_wasm"] = wasmExports["ts_node_descendant_for_index_wasm"];
            var _ts_node_named_descendant_for_index_wasm = Module["_ts_node_named_descendant_for_index_wasm"] = wasmExports["ts_node_named_descendant_for_index_wasm"];
            var _ts_node_descendant_for_position_wasm = Module["_ts_node_descendant_for_position_wasm"] = wasmExports["ts_node_descendant_for_position_wasm"];
            var _ts_node_named_descendant_for_position_wasm = Module["_ts_node_named_descendant_for_position_wasm"] = wasmExports["ts_node_named_descendant_for_position_wasm"];
            var _ts_node_start_point_wasm = Module["_ts_node_start_point_wasm"] = wasmExports["ts_node_start_point_wasm"];
            var _ts_node_end_point_wasm = Module["_ts_node_end_point_wasm"] = wasmExports["ts_node_end_point_wasm"];
            var _ts_node_start_index_wasm = Module["_ts_node_start_index_wasm"] = wasmExports["ts_node_start_index_wasm"];
            var _ts_node_end_index_wasm = Module["_ts_node_end_index_wasm"] = wasmExports["ts_node_end_index_wasm"];
            var _ts_node_to_string_wasm = Module["_ts_node_to_string_wasm"] = wasmExports["ts_node_to_string_wasm"];
            var _ts_node_children_wasm = Module["_ts_node_children_wasm"] = wasmExports["ts_node_children_wasm"];
            var _ts_node_named_children_wasm = Module["_ts_node_named_children_wasm"] = wasmExports["ts_node_named_children_wasm"];
            var _ts_node_descendants_of_type_wasm = Module["_ts_node_descendants_of_type_wasm"] = wasmExports["ts_node_descendants_of_type_wasm"];
            var _ts_node_is_named_wasm = Module["_ts_node_is_named_wasm"] = wasmExports["ts_node_is_named_wasm"];
            var _ts_node_has_changes_wasm = Module["_ts_node_has_changes_wasm"] = wasmExports["ts_node_has_changes_wasm"];
            var _ts_node_has_error_wasm = Module["_ts_node_has_error_wasm"] = wasmExports["ts_node_has_error_wasm"];
            var _ts_node_is_error_wasm = Module["_ts_node_is_error_wasm"] = wasmExports["ts_node_is_error_wasm"];
            var _ts_node_is_missing_wasm = Module["_ts_node_is_missing_wasm"] = wasmExports["ts_node_is_missing_wasm"];
            var _ts_node_is_extra_wasm = Module["_ts_node_is_extra_wasm"] = wasmExports["ts_node_is_extra_wasm"];
            var _ts_node_parse_state_wasm = Module["_ts_node_parse_state_wasm"] = wasmExports["ts_node_parse_state_wasm"];
            var _ts_node_next_parse_state_wasm = Module["_ts_node_next_parse_state_wasm"] = wasmExports["ts_node_next_parse_state_wasm"];
            var _ts_query_matches_wasm = Module["_ts_query_matches_wasm"] = wasmExports["ts_query_matches_wasm"];
            var _ts_query_captures_wasm = Module["_ts_query_captures_wasm"] = wasmExports["ts_query_captures_wasm"];
            var _memset = Module["_memset"] = wasmExports["memset"];
            var _memcpy = Module["_memcpy"] = wasmExports["memcpy"];
            var _memmove = Module["_memmove"] = wasmExports["memmove"];
            var _iswalpha = Module["_iswalpha"] = wasmExports["iswalpha"];
            var _iswblank = Module["_iswblank"] = wasmExports["iswblank"];
            var _iswdigit = Module["_iswdigit"] = wasmExports["iswdigit"];
            var _iswlower = Module["_iswlower"] = wasmExports["iswlower"];
            var _iswupper = Module["_iswupper"] = wasmExports["iswupper"];
            var _iswxdigit = Module["_iswxdigit"] = wasmExports["iswxdigit"];
            var _memchr = Module["_memchr"] = wasmExports["memchr"];
            var _strlen = Module["_strlen"] = wasmExports["strlen"];
            var _strcmp = Module["_strcmp"] = wasmExports["strcmp"];
            var _strncat = Module["_strncat"] = wasmExports["strncat"];
            var _strncpy = Module["_strncpy"] = wasmExports["strncpy"];
            var _towlower = Module["_towlower"] = wasmExports["towlower"];
            var _towupper = Module["_towupper"] = wasmExports["towupper"];
            var _setThrew = wasmExports["setThrew"];
            var __emscripten_stack_restore = wasmExports["_emscripten_stack_restore"];
            var __emscripten_stack_alloc = wasmExports["_emscripten_stack_alloc"];
            var _emscripten_stack_get_current = wasmExports["emscripten_stack_get_current"];
            var ___wasm_apply_data_relocs = wasmExports["__wasm_apply_data_relocs"];
            Module["setValue"] = setValue;
            Module["getValue"] = getValue;
            Module["UTF8ToString"] = UTF8ToString;
            Module["stringToUTF8"] = stringToUTF8;
            Module["lengthBytesUTF8"] = lengthBytesUTF8;
            Module["AsciiToString"] = AsciiToString;
            Module["stringToUTF16"] = stringToUTF16;
            Module["loadWebAssemblyModule"] = loadWebAssemblyModule;
            function callMain(args2 = []) {
              var entryFunction = resolveGlobalSymbol("main").sym;
              if (!entryFunction) return;
              args2.unshift(thisProgram);
              var argc = args2.length;
              var argv = stackAlloc((argc + 1) * 4);
              var argv_ptr = argv;
              args2.forEach((arg) => {
                LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, stringToUTF8OnStack(arg));
                argv_ptr += 4;
              });
              LE_HEAP_STORE_U32((argv_ptr >> 2) * 4, 0);
              try {
                var ret = entryFunction(argc, argv);
                exitJS(
                  ret,
                  /* implicit = */
                  true
                );
                return ret;
              } catch (e) {
                return handleException(e);
              }
            }
            __name(callMain, "callMain");
            function run(args2 = arguments_) {
              if (runDependencies > 0) {
                dependenciesFulfilled = run;
                return;
              }
              preRun();
              if (runDependencies > 0) {
                dependenciesFulfilled = run;
                return;
              }
              function doRun() {
                Module["calledRun"] = true;
                if (ABORT) return;
                initRuntime();
                preMain();
                readyPromiseResolve(Module);
                Module["onRuntimeInitialized"]?.();
                var noInitialRun = Module["noInitialRun"];
                if (!noInitialRun) callMain(args2);
                postRun();
              }
              __name(doRun, "doRun");
              if (Module["setStatus"]) {
                Module["setStatus"]("Running...");
                setTimeout(() => {
                  setTimeout(() => Module["setStatus"](""), 1);
                  doRun();
                }, 1);
              } else {
                doRun();
              }
            }
            __name(run, "run");
            if (Module["preInit"]) {
              if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
              while (Module["preInit"].length > 0) {
                Module["preInit"].pop()();
              }
            }
            run();
            moduleRtn = readyPromise;
            return moduleRtn;
          };
        })();
        if (typeof exports === "object" && typeof module === "object") {
          module.exports = Module;
          module.exports.default = Module;
        } else if (typeof define === "function" && define["amd"])
          define([], () => Module);
      }
    });
    var index_exports = {};
    __export(index_exports, {
      CaptureQuantifier: () => CaptureQuantifier,
      LANGUAGE_VERSION: () => LANGUAGE_VERSION,
      Language: () => Language,
      LookaheadIterator: () => LookaheadIterator,
      MIN_COMPATIBLE_VERSION: () => MIN_COMPATIBLE_VERSION,
      Node: () => Node,
      Parser: () => Parser,
      Query: () => Query,
      Tree: () => Tree,
      TreeCursor: () => TreeCursor
    });
    module.exports = __toCommonJS(index_exports);
    var SIZE_OF_SHORT = 2;
    var SIZE_OF_INT = 4;
    var SIZE_OF_CURSOR = 4 * SIZE_OF_INT;
    var SIZE_OF_NODE = 5 * SIZE_OF_INT;
    var SIZE_OF_POINT = 2 * SIZE_OF_INT;
    var SIZE_OF_RANGE = 2 * SIZE_OF_INT + 2 * SIZE_OF_POINT;
    var ZERO_POINT = { row: 0, column: 0 };
    var INTERNAL = Symbol("INTERNAL");
    function assertInternal(x) {
      if (x !== INTERNAL) throw new Error("Illegal constructor");
    }
    __name(assertInternal, "assertInternal");
    function isPoint(point) {
      return !!point && typeof point.row === "number" && typeof point.column === "number";
    }
    __name(isPoint, "isPoint");
    function setModule(module2) {
      C = module2;
    }
    __name(setModule, "setModule");
    var C;
    var LookaheadIterator = class {
      static {
        __name(this, "LookaheadIterator");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for WASM
      /** @internal */
      language;
      /** @internal */
      constructor(internal, address, language) {
        assertInternal(internal);
        this[0] = address;
        this.language = language;
      }
      /** Get the current symbol of the lookahead iterator. */
      get currentTypeId() {
        return C._ts_lookahead_iterator_current_symbol(this[0]);
      }
      /** Get the current symbol name of the lookahead iterator. */
      get currentType() {
        return this.language.types[this.currentTypeId] || "ERROR";
      }
      /** Delete the lookahead iterator, freeing its resources. */
      delete() {
        C._ts_lookahead_iterator_delete(this[0]);
        this[0] = 0;
      }
      /**
       * Reset the lookahead iterator.
       *
       * This returns `true` if the language was set successfully and `false`
       * otherwise.
       */
      reset(language, stateId2) {
        if (C._ts_lookahead_iterator_reset(this[0], language[0], stateId2)) {
          this.language = language;
          return true;
        }
        return false;
      }
      /**
       * Reset the lookahead iterator to another state.
       *
       * This returns `true` if the iterator was reset to the given state and
       * `false` otherwise.
       */
      resetState(stateId2) {
        return Boolean(C._ts_lookahead_iterator_reset_state(this[0], stateId2));
      }
      /**
       * Returns an iterator that iterates over the symbols of the lookahead iterator.
       *
       * The iterator will yield the current symbol name as a string for each step
       * until there are no more symbols to iterate over.
       */
      [Symbol.iterator]() {
        return {
          next: /* @__PURE__ */ __name(() => {
            if (C._ts_lookahead_iterator_next(this[0])) {
              return { done: false, value: this.currentType };
            }
            return { done: true, value: "" };
          }, "next")
        };
      }
    };
    function getText(tree, startIndex, endIndex, startPosition) {
      const length = endIndex - startIndex;
      let result = tree.textCallback(startIndex, startPosition);
      if (result) {
        startIndex += result.length;
        while (startIndex < endIndex) {
          const string = tree.textCallback(startIndex, startPosition);
          if (string && string.length > 0) {
            startIndex += string.length;
            result += string;
          } else {
            break;
          }
        }
        if (startIndex > endIndex) {
          result = result.slice(0, length);
        }
      }
      return result ?? "";
    }
    __name(getText, "getText");
    var Tree = class _Tree {
      static {
        __name(this, "Tree");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for WASM
      /** @internal */
      textCallback;
      /** The language that was used to parse the syntax tree. */
      language;
      /** @internal */
      constructor(internal, address, language, textCallback) {
        assertInternal(internal);
        this[0] = address;
        this.language = language;
        this.textCallback = textCallback;
      }
      /** Create a shallow copy of the syntax tree. This is very fast. */
      copy() {
        const address = C._ts_tree_copy(this[0]);
        return new _Tree(INTERNAL, address, this.language, this.textCallback);
      }
      /** Delete the syntax tree, freeing its resources. */
      delete() {
        C._ts_tree_delete(this[0]);
        this[0] = 0;
      }
      /** Get the root node of the syntax tree. */
      get rootNode() {
        C._ts_tree_root_node_wasm(this[0]);
        return unmarshalNode(this);
      }
      /**
       * Get the root node of the syntax tree, but with its position shifted
       * forward by the given offset.
       */
      rootNodeWithOffset(offsetBytes, offsetExtent) {
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, offsetBytes, "i32");
        marshalPoint(address + SIZE_OF_INT, offsetExtent);
        C._ts_tree_root_node_with_offset_wasm(this[0]);
        return unmarshalNode(this);
      }
      /**
       * Edit the syntax tree to keep it in sync with source code that has been
       * edited.
       *
       * You must describe the edit both in terms of byte offsets and in terms of
       * row/column coordinates.
       */
      edit(edit) {
        marshalEdit(edit);
        C._ts_tree_edit_wasm(this[0]);
      }
      /** Create a new {@link TreeCursor} starting from the root of the tree. */
      walk() {
        return this.rootNode.walk();
      }
      /**
       * Compare this old edited syntax tree to a new syntax tree representing
       * the same document, returning a sequence of ranges whose syntactic
       * structure has changed.
       *
       * For this to work correctly, this syntax tree must have been edited such
       * that its ranges match up to the new tree. Generally, you'll want to
       * call this method right after calling one of the [`Parser::parse`]
       * functions. Call it on the old tree that was passed to parse, and
       * pass the new tree that was returned from `parse`.
       */
      getChangedRanges(other2) {
        if (!(other2 instanceof _Tree)) {
          throw new TypeError("Argument must be a Tree");
        }
        C._ts_tree_get_changed_ranges_wasm(this[0], other2[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Get the included ranges that were used to parse the syntax tree. */
      getIncludedRanges() {
        C._ts_tree_included_ranges_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
    };
    var TreeCursor = class _TreeCursor {
      static {
        __name(this, "TreeCursor");
      }
      /** @internal */
      // @ts-expect-error: never read
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [1] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [2] = 0;
      // Internal handle for Wasm
      /** @internal */
      // @ts-expect-error: never read
      [3] = 0;
      // Internal handle for Wasm
      /** @internal */
      tree;
      /** @internal */
      constructor(internal, tree) {
        assertInternal(internal);
        this.tree = tree;
        unmarshalTreeCursor(this);
      }
      /** Creates a deep copy of the tree cursor. This allocates new memory. */
      copy() {
        const copy = new _TreeCursor(INTERNAL, this.tree);
        C._ts_tree_cursor_copy_wasm(this.tree[0]);
        unmarshalTreeCursor(copy);
        return copy;
      }
      /** Delete the tree cursor, freeing its resources. */
      delete() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_delete_wasm(this.tree[0]);
        this[0] = this[1] = this[2] = 0;
      }
      /** Get the tree cursor's current {@link Node}. */
      get currentNode() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_current_node_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the numerical field id of this tree cursor's current node.
       *
       * See also {@link TreeCursor#currentFieldName}.
       */
      get currentFieldId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_field_id_wasm(this.tree[0]);
      }
      /** Get the field name of this tree cursor's current node. */
      get currentFieldName() {
        return this.tree.language.fields[this.currentFieldId];
      }
      /**
       * Get the depth of the cursor's current node relative to the original
       * node that the cursor was constructed with.
       */
      get currentDepth() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_depth_wasm(this.tree[0]);
      }
      /**
       * Get the index of the cursor's current node out of all of the
       * descendants of the original node that the cursor was constructed with.
       */
      get currentDescendantIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_descendant_index_wasm(this.tree[0]);
      }
      /** Get the type of the cursor's current node. */
      get nodeType() {
        return this.tree.language.types[this.nodeTypeId] || "ERROR";
      }
      /** Get the type id of the cursor's current node. */
      get nodeTypeId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_type_id_wasm(this.tree[0]);
      }
      /** Get the state id of the cursor's current node. */
      get nodeStateId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_state_id_wasm(this.tree[0]);
      }
      /** Get the id of the cursor's current node. */
      get nodeId() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_id_wasm(this.tree[0]);
      }
      /**
       * Check if the cursor's current node is *named*.
       *
       * Named nodes correspond to named rules in the grammar, whereas
       * *anonymous* nodes correspond to string literals in the grammar.
       */
      get nodeIsNamed() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_is_named_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if the cursor's current node is *missing*.
       *
       * Missing nodes are inserted by the parser in order to recover from
       * certain kinds of syntax errors.
       */
      get nodeIsMissing() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_current_node_is_missing_wasm(this.tree[0]) === 1;
      }
      /** Get the string content of the cursor's current node. */
      get nodeText() {
        marshalTreeCursor(this);
        const startIndex = C._ts_tree_cursor_start_index_wasm(this.tree[0]);
        const endIndex = C._ts_tree_cursor_end_index_wasm(this.tree[0]);
        C._ts_tree_cursor_start_position_wasm(this.tree[0]);
        const startPosition = unmarshalPoint(TRANSFER_BUFFER);
        return getText(this.tree, startIndex, endIndex, startPosition);
      }
      /** Get the start position of the cursor's current node. */
      get startPosition() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_start_position_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the end position of the cursor's current node. */
      get endPosition() {
        marshalTreeCursor(this);
        C._ts_tree_cursor_end_position_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the start index of the cursor's current node. */
      get startIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_start_index_wasm(this.tree[0]);
      }
      /** Get the end index of the cursor's current node. */
      get endIndex() {
        marshalTreeCursor(this);
        return C._ts_tree_cursor_end_index_wasm(this.tree[0]);
      }
      /**
       * Move this cursor to the first child of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there were no children.
       */
      gotoFirstChild() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_first_child_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the last child of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there were no children.
       *
       * Note that this function may be slower than
       * {@link TreeCursor#gotoFirstChild} because it needs to
       * iterate through all the children to compute the child's position.
       */
      gotoLastChild() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_last_child_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the parent of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no parent node (the cursor was already on the
       * root node).
       *
       * Note that the node the cursor was constructed with is considered the root
       * of the cursor, and the cursor cannot walk outside this node.
       */
      gotoParent() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_parent_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the next sibling of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no next sibling node.
       *
       * Note that the node the cursor was constructed with is considered the root
       * of the cursor, and the cursor cannot walk outside this node.
       */
      gotoNextSibling() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_next_sibling_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the previous sibling of its current node.
       *
       * This returns `true` if the cursor successfully moved, and returns
       * `false` if there was no previous sibling node.
       *
       * Note that this function may be slower than
       * {@link TreeCursor#gotoNextSibling} due to how node
       * positions are stored. In the worst case, this will need to iterate
       * through all the children up to the previous sibling node to recalculate
       * its position. Also note that the node the cursor was constructed with is
       * considered the root of the cursor, and the cursor cannot walk outside this node.
       */
      gotoPreviousSibling() {
        marshalTreeCursor(this);
        const result = C._ts_tree_cursor_goto_previous_sibling_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move the cursor to the node that is the nth descendant of
       * the original node that the cursor was constructed with, where
       * zero represents the original node itself.
       */
      gotoDescendant(goalDescendantIndex) {
        marshalTreeCursor(this);
        C._ts_tree_cursor_goto_descendant_wasm(this.tree[0], goalDescendantIndex);
        unmarshalTreeCursor(this);
      }
      /**
       * Move this cursor to the first child of its current node that contains or
       * starts after the given byte offset.
       *
       * This returns `true` if the cursor successfully moved to a child node, and returns
       * `false` if no such child was found.
       */
      gotoFirstChildForIndex(goalIndex) {
        marshalTreeCursor(this);
        C.setValue(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalIndex, "i32");
        const result = C._ts_tree_cursor_goto_first_child_for_index_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Move this cursor to the first child of its current node that contains or
       * starts after the given byte offset.
       *
       * This returns the index of the child node if one was found, and returns
       * `null` if no such child was found.
       */
      gotoFirstChildForPosition(goalPosition) {
        marshalTreeCursor(this);
        marshalPoint(TRANSFER_BUFFER + SIZE_OF_CURSOR, goalPosition);
        const result = C._ts_tree_cursor_goto_first_child_for_position_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
        return result === 1;
      }
      /**
       * Re-initialize this tree cursor to start at the original node that the
       * cursor was constructed with.
       */
      reset(node2) {
        marshalNode(node2);
        marshalTreeCursor(this, TRANSFER_BUFFER + SIZE_OF_NODE);
        C._ts_tree_cursor_reset_wasm(this.tree[0]);
        unmarshalTreeCursor(this);
      }
      /**
       * Re-initialize a tree cursor to the same position as another cursor.
       *
       * Unlike {@link TreeCursor#reset}, this will not lose parent
       * information and allows reusing already created cursors.
       */
      resetTo(cursor) {
        marshalTreeCursor(this, TRANSFER_BUFFER);
        marshalTreeCursor(cursor, TRANSFER_BUFFER + SIZE_OF_CURSOR);
        C._ts_tree_cursor_reset_to_wasm(this.tree[0], cursor.tree[0]);
        unmarshalTreeCursor(this);
      }
    };
    var Node = class {
      static {
        __name(this, "Node");
      }
      /** @internal */
      // @ts-expect-error: never read
      [0] = 0;
      // Internal handle for Wasm
      /** @internal */
      _children;
      /** @internal */
      _namedChildren;
      /** @internal */
      constructor(internal, {
        id,
        tree,
        startIndex,
        startPosition,
        other: other2
      }) {
        assertInternal(internal);
        this[0] = other2;
        this.id = id;
        this.tree = tree;
        this.startIndex = startIndex;
        this.startPosition = startPosition;
      }
      /**
       * The numeric id for this node that is unique.
       *
       * Within a given syntax tree, no two nodes have the same id. However:
       *
       * * If a new tree is created based on an older tree, and a node from the old tree is reused in
       *   the process, then that node will have the same id in both trees.
       *
       * * A node not marked as having changes does not guarantee it was reused.
       *
       * * If a node is marked as having changed in the old tree, it will not be reused.
       */
      id;
      /** The byte index where this node starts. */
      startIndex;
      /** The position where this node starts. */
      startPosition;
      /** The tree that this node belongs to. */
      tree;
      /** Get this node's type as a numerical id. */
      get typeId() {
        marshalNode(this);
        return C._ts_node_symbol_wasm(this.tree[0]);
      }
      /**
       * Get the node's type as a numerical id as it appears in the grammar,
       * ignoring aliases.
       */
      get grammarId() {
        marshalNode(this);
        return C._ts_node_grammar_symbol_wasm(this.tree[0]);
      }
      /** Get this node's type as a string. */
      get type() {
        return this.tree.language.types[this.typeId] || "ERROR";
      }
      /**
       * Get this node's symbol name as it appears in the grammar, ignoring
       * aliases as a string.
       */
      get grammarType() {
        return this.tree.language.types[this.grammarId] || "ERROR";
      }
      /**
       * Check if this node is *named*.
       *
       * Named nodes correspond to named rules in the grammar, whereas
       * *anonymous* nodes correspond to string literals in the grammar.
       */
      get isNamed() {
        marshalNode(this);
        return C._ts_node_is_named_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node is *extra*.
       *
       * Extra nodes represent things like comments, which are not required
       * by the grammar, but can appear anywhere.
       */
      get isExtra() {
        marshalNode(this);
        return C._ts_node_is_extra_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node represents a syntax error.
       *
       * Syntax errors represent parts of the code that could not be incorporated
       * into a valid syntax tree.
       */
      get isError() {
        marshalNode(this);
        return C._ts_node_is_error_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node is *missing*.
       *
       * Missing nodes are inserted by the parser in order to recover from
       * certain kinds of syntax errors.
       */
      get isMissing() {
        marshalNode(this);
        return C._ts_node_is_missing_wasm(this.tree[0]) === 1;
      }
      /** Check if this node has been edited. */
      get hasChanges() {
        marshalNode(this);
        return C._ts_node_has_changes_wasm(this.tree[0]) === 1;
      }
      /**
       * Check if this node represents a syntax error or contains any syntax
       * errors anywhere within it.
       */
      get hasError() {
        marshalNode(this);
        return C._ts_node_has_error_wasm(this.tree[0]) === 1;
      }
      /** Get the byte index where this node ends. */
      get endIndex() {
        marshalNode(this);
        return C._ts_node_end_index_wasm(this.tree[0]);
      }
      /** Get the position where this node ends. */
      get endPosition() {
        marshalNode(this);
        C._ts_node_end_point_wasm(this.tree[0]);
        return unmarshalPoint(TRANSFER_BUFFER);
      }
      /** Get the string content of this node. */
      get text() {
        return getText(this.tree, this.startIndex, this.endIndex, this.startPosition);
      }
      /** Get this node's parse state. */
      get parseState() {
        marshalNode(this);
        return C._ts_node_parse_state_wasm(this.tree[0]);
      }
      /** Get the parse state after this node. */
      get nextParseState() {
        marshalNode(this);
        return C._ts_node_next_parse_state_wasm(this.tree[0]);
      }
      /** Check if this node is equal to another node. */
      equals(other2) {
        return this.tree === other2.tree && this.id === other2.id;
      }
      /**
       * Get the node's child at the given index, where zero represents the first child.
       *
       * This method is fairly fast, but its cost is technically log(n), so if
       * you might be iterating over a long list of children, you should use
       * {@link Node#children} instead.
       */
      child(index2) {
        marshalNode(this);
        C._ts_node_child_wasm(this.tree[0], index2);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's *named* child at the given index.
       *
       * See also {@link Node#isNamed}.
       * This method is fairly fast, but its cost is technically log(n), so if
       * you might be iterating over a long list of children, you should use
       * {@link Node#namedChildren} instead.
       */
      namedChild(index2) {
        marshalNode(this);
        C._ts_node_named_child_wasm(this.tree[0], index2);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's child with the given numerical field id.
       *
       * See also {@link Node#childForFieldName}. You can
       * convert a field name to an id using {@link Language#fieldIdForName}.
       */
      childForFieldId(fieldId) {
        marshalNode(this);
        C._ts_node_child_by_field_id_wasm(this.tree[0], fieldId);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the first child with the given field name.
       *
       * If multiple children may have the same field name, access them using
       * {@link Node#childrenForFieldName}.
       */
      childForFieldName(fieldName) {
        const fieldId = this.tree.language.fields.indexOf(fieldName);
        if (fieldId !== -1) return this.childForFieldId(fieldId);
        return null;
      }
      /** Get the field name of this node's child at the given index. */
      fieldNameForChild(index2) {
        marshalNode(this);
        const address = C._ts_node_field_name_for_child_wasm(this.tree[0], index2);
        if (!address) return null;
        return C.AsciiToString(address);
      }
      /** Get the field name of this node's named child at the given index. */
      fieldNameForNamedChild(index2) {
        marshalNode(this);
        const address = C._ts_node_field_name_for_named_child_wasm(this.tree[0], index2);
        if (!address) return null;
        return C.AsciiToString(address);
      }
      /**
       * Get an array of this node's children with a given field name.
       *
       * See also {@link Node#children}.
       */
      childrenForFieldName(fieldName) {
        const fieldId = this.tree.language.fields.indexOf(fieldName);
        if (fieldId !== -1 && fieldId !== 0) return this.childrenForFieldId(fieldId);
        return [];
      }
      /**
        * Get an array of this node's children with a given field id.
        *
        * See also {@link Node#childrenForFieldName}.
        */
      childrenForFieldId(fieldId) {
        marshalNode(this);
        C._ts_node_children_by_field_id_wasm(this.tree[0], fieldId);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
          C._free(buffer);
        }
        return result;
      }
      /** Get the node's first child that contains or starts after the given byte offset. */
      firstChildForIndex(index2) {
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, index2, "i32");
        C._ts_node_first_child_for_byte_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the node's first named child that contains or starts after the given byte offset. */
      firstNamedChildForIndex(index2) {
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, index2, "i32");
        C._ts_node_first_named_child_for_byte_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get this node's number of children. */
      get childCount() {
        marshalNode(this);
        return C._ts_node_child_count_wasm(this.tree[0]);
      }
      /**
       * Get this node's number of *named* children.
       *
       * See also {@link Node#isNamed}.
       */
      get namedChildCount() {
        marshalNode(this);
        return C._ts_node_named_child_count_wasm(this.tree[0]);
      }
      /** Get this node's first child. */
      get firstChild() {
        return this.child(0);
      }
      /**
       * Get this node's first named child.
       *
       * See also {@link Node#isNamed}.
       */
      get firstNamedChild() {
        return this.namedChild(0);
      }
      /** Get this node's last child. */
      get lastChild() {
        return this.child(this.childCount - 1);
      }
      /**
       * Get this node's last named child.
       *
       * See also {@link Node#isNamed}.
       */
      get lastNamedChild() {
        return this.namedChild(this.namedChildCount - 1);
      }
      /**
       * Iterate over this node's children.
       *
       * If you're walking the tree recursively, you may want to use the
       * {@link TreeCursor} APIs directly instead.
       */
      get children() {
        if (!this._children) {
          marshalNode(this);
          C._ts_node_children_wasm(this.tree[0]);
          const count = C.getValue(TRANSFER_BUFFER, "i32");
          const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          this._children = new Array(count);
          if (count > 0) {
            let address = buffer;
            for (let i2 = 0; i2 < count; i2++) {
              this._children[i2] = unmarshalNode(this.tree, address);
              address += SIZE_OF_NODE;
            }
            C._free(buffer);
          }
        }
        return this._children;
      }
      /**
       * Iterate over this node's named children.
       *
       * See also {@link Node#children}.
       */
      get namedChildren() {
        if (!this._namedChildren) {
          marshalNode(this);
          C._ts_node_named_children_wasm(this.tree[0]);
          const count = C.getValue(TRANSFER_BUFFER, "i32");
          const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          this._namedChildren = new Array(count);
          if (count > 0) {
            let address = buffer;
            for (let i2 = 0; i2 < count; i2++) {
              this._namedChildren[i2] = unmarshalNode(this.tree, address);
              address += SIZE_OF_NODE;
            }
            C._free(buffer);
          }
        }
        return this._namedChildren;
      }
      /**
       * Get the descendants of this node that are the given type, or in the given types array.
       *
       * The types array should contain node type strings, which can be retrieved from {@link Language#types}.
       *
       * Additionally, a `startPosition` and `endPosition` can be passed in to restrict the search to a byte range.
       */
      descendantsOfType(types, startPosition = ZERO_POINT, endPosition = ZERO_POINT) {
        if (!Array.isArray(types)) types = [types];
        const symbols = [];
        const typesBySymbol = this.tree.language.types;
        for (const node_type of types) {
          if (node_type == "ERROR") {
            symbols.push(65535);
          }
        }
        for (let i2 = 0, n = typesBySymbol.length; i2 < n; i2++) {
          if (types.includes(typesBySymbol[i2])) {
            symbols.push(i2);
          }
        }
        const symbolsAddress = C._malloc(SIZE_OF_INT * symbols.length);
        for (let i2 = 0, n = symbols.length; i2 < n; i2++) {
          C.setValue(symbolsAddress + i2 * SIZE_OF_INT, symbols[i2], "i32");
        }
        marshalNode(this);
        C._ts_node_descendants_of_type_wasm(
          this.tree[0],
          symbolsAddress,
          symbols.length,
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column
        );
        const descendantCount = C.getValue(TRANSFER_BUFFER, "i32");
        const descendantAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(descendantCount);
        if (descendantCount > 0) {
          let address = descendantAddress;
          for (let i2 = 0; i2 < descendantCount; i2++) {
            result[i2] = unmarshalNode(this.tree, address);
            address += SIZE_OF_NODE;
          }
        }
        C._free(descendantAddress);
        C._free(symbolsAddress);
        return result;
      }
      /** Get this node's next sibling. */
      get nextSibling() {
        marshalNode(this);
        C._ts_node_next_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get this node's previous sibling. */
      get previousSibling() {
        marshalNode(this);
        C._ts_node_prev_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's next *named* sibling.
       *
       * See also {@link Node#isNamed}.
       */
      get nextNamedSibling() {
        marshalNode(this);
        C._ts_node_next_named_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get this node's previous *named* sibling.
       *
       * See also {@link Node#isNamed}.
       */
      get previousNamedSibling() {
        marshalNode(this);
        C._ts_node_prev_named_sibling_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the node's number of descendants, including one for the node itself. */
      get descendantCount() {
        marshalNode(this);
        return C._ts_node_descendant_count_wasm(this.tree[0]);
      }
      /**
       * Get this node's immediate parent.
       * Prefer {@link Node#childWithDescendant} for iterating over this node's ancestors.
       */
      get parent() {
        marshalNode(this);
        C._ts_node_parent_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Get the node that contains `descendant`.
       *
       * Note that this can return `descendant` itself.
       */
      childWithDescendant(descendant) {
        marshalNode(this);
        marshalNode(descendant, 1);
        C._ts_node_child_with_descendant_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest node within this node that spans the given byte range. */
      descendantForIndex(start2, end = start2) {
        if (typeof start2 !== "number" || typeof end !== "number") {
          throw new Error("Arguments must be numbers");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, start2, "i32");
        C.setValue(address + SIZE_OF_INT, end, "i32");
        C._ts_node_descendant_for_index_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest named node within this node that spans the given byte range. */
      namedDescendantForIndex(start2, end = start2) {
        if (typeof start2 !== "number" || typeof end !== "number") {
          throw new Error("Arguments must be numbers");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        C.setValue(address, start2, "i32");
        C.setValue(address + SIZE_OF_INT, end, "i32");
        C._ts_node_named_descendant_for_index_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest node within this node that spans the given point range. */
      descendantForPosition(start2, end = start2) {
        if (!isPoint(start2) || !isPoint(end)) {
          throw new Error("Arguments must be {row, column} objects");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        marshalPoint(address, start2);
        marshalPoint(address + SIZE_OF_POINT, end);
        C._ts_node_descendant_for_position_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /** Get the smallest named node within this node that spans the given point range. */
      namedDescendantForPosition(start2, end = start2) {
        if (!isPoint(start2) || !isPoint(end)) {
          throw new Error("Arguments must be {row, column} objects");
        }
        marshalNode(this);
        const address = TRANSFER_BUFFER + SIZE_OF_NODE;
        marshalPoint(address, start2);
        marshalPoint(address + SIZE_OF_POINT, end);
        C._ts_node_named_descendant_for_position_wasm(this.tree[0]);
        return unmarshalNode(this.tree);
      }
      /**
       * Create a new {@link TreeCursor} starting from this node.
       *
       * Note that the given node is considered the root of the cursor,
       * and the cursor cannot walk outside this node.
       */
      walk() {
        marshalNode(this);
        C._ts_tree_cursor_new_wasm(this.tree[0]);
        return new TreeCursor(INTERNAL, this.tree);
      }
      /**
       * Edit this node to keep it in-sync with source code that has been edited.
       *
       * This function is only rarely needed. When you edit a syntax tree with
       * the {@link Tree#edit} method, all of the nodes that you retrieve from
       * the tree afterward will already reflect the edit. You only need to
       * use {@link Node#edit} when you have a specific {@link Node} instance that
       * you want to keep and continue to use after an edit.
       */
      edit(edit) {
        if (this.startIndex >= edit.oldEndIndex) {
          this.startIndex = edit.newEndIndex + (this.startIndex - edit.oldEndIndex);
          let subbedPointRow;
          let subbedPointColumn;
          if (this.startPosition.row > edit.oldEndPosition.row) {
            subbedPointRow = this.startPosition.row - edit.oldEndPosition.row;
            subbedPointColumn = this.startPosition.column;
          } else {
            subbedPointRow = 0;
            subbedPointColumn = this.startPosition.column;
            if (this.startPosition.column >= edit.oldEndPosition.column) {
              subbedPointColumn = this.startPosition.column - edit.oldEndPosition.column;
            }
          }
          if (subbedPointRow > 0) {
            this.startPosition.row += subbedPointRow;
            this.startPosition.column = subbedPointColumn;
          } else {
            this.startPosition.column += subbedPointColumn;
          }
        } else if (this.startIndex > edit.startIndex) {
          this.startIndex = edit.newEndIndex;
          this.startPosition.row = edit.newEndPosition.row;
          this.startPosition.column = edit.newEndPosition.column;
        }
      }
      /** Get the S-expression representation of this node. */
      toString() {
        marshalNode(this);
        const address = C._ts_node_to_string_wasm(this.tree[0]);
        const result = C.AsciiToString(address);
        C._free(address);
        return result;
      }
    };
    function unmarshalCaptures(query, tree, address, patternIndex, result) {
      for (let i2 = 0, n = result.length; i2 < n; i2++) {
        const captureIndex = C.getValue(address, "i32");
        address += SIZE_OF_INT;
        const node2 = unmarshalNode(tree, address);
        address += SIZE_OF_NODE;
        result[i2] = { patternIndex, name: query.captureNames[captureIndex], node: node2 };
      }
      return address;
    }
    __name(unmarshalCaptures, "unmarshalCaptures");
    function marshalNode(node2, index2 = 0) {
      let address = TRANSFER_BUFFER + index2 * SIZE_OF_NODE;
      C.setValue(address, node2.id, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, node2.startIndex, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, node2.startPosition.row, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, node2.startPosition.column, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, node2[0], "i32");
    }
    __name(marshalNode, "marshalNode");
    function unmarshalNode(tree, address = TRANSFER_BUFFER) {
      const id = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      if (id === 0) return null;
      const index2 = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const row2 = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const column = C.getValue(address, "i32");
      address += SIZE_OF_INT;
      const other2 = C.getValue(address, "i32");
      const result = new Node(INTERNAL, {
        id,
        tree,
        startIndex: index2,
        startPosition: { row: row2, column },
        other: other2
      });
      return result;
    }
    __name(unmarshalNode, "unmarshalNode");
    function marshalTreeCursor(cursor, address = TRANSFER_BUFFER) {
      C.setValue(address + 0 * SIZE_OF_INT, cursor[0], "i32");
      C.setValue(address + 1 * SIZE_OF_INT, cursor[1], "i32");
      C.setValue(address + 2 * SIZE_OF_INT, cursor[2], "i32");
      C.setValue(address + 3 * SIZE_OF_INT, cursor[3], "i32");
    }
    __name(marshalTreeCursor, "marshalTreeCursor");
    function unmarshalTreeCursor(cursor) {
      cursor[0] = C.getValue(TRANSFER_BUFFER + 0 * SIZE_OF_INT, "i32");
      cursor[1] = C.getValue(TRANSFER_BUFFER + 1 * SIZE_OF_INT, "i32");
      cursor[2] = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
      cursor[3] = C.getValue(TRANSFER_BUFFER + 3 * SIZE_OF_INT, "i32");
    }
    __name(unmarshalTreeCursor, "unmarshalTreeCursor");
    function marshalPoint(address, point) {
      C.setValue(address, point.row, "i32");
      C.setValue(address + SIZE_OF_INT, point.column, "i32");
    }
    __name(marshalPoint, "marshalPoint");
    function unmarshalPoint(address) {
      const result = {
        row: C.getValue(address, "i32") >>> 0,
        column: C.getValue(address + SIZE_OF_INT, "i32") >>> 0
      };
      return result;
    }
    __name(unmarshalPoint, "unmarshalPoint");
    function marshalRange(address, range2) {
      marshalPoint(address, range2.startPosition);
      address += SIZE_OF_POINT;
      marshalPoint(address, range2.endPosition);
      address += SIZE_OF_POINT;
      C.setValue(address, range2.startIndex, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, range2.endIndex, "i32");
      address += SIZE_OF_INT;
    }
    __name(marshalRange, "marshalRange");
    function unmarshalRange(address) {
      const result = {};
      result.startPosition = unmarshalPoint(address);
      address += SIZE_OF_POINT;
      result.endPosition = unmarshalPoint(address);
      address += SIZE_OF_POINT;
      result.startIndex = C.getValue(address, "i32") >>> 0;
      address += SIZE_OF_INT;
      result.endIndex = C.getValue(address, "i32") >>> 0;
      return result;
    }
    __name(unmarshalRange, "unmarshalRange");
    function marshalEdit(edit, address = TRANSFER_BUFFER) {
      marshalPoint(address, edit.startPosition);
      address += SIZE_OF_POINT;
      marshalPoint(address, edit.oldEndPosition);
      address += SIZE_OF_POINT;
      marshalPoint(address, edit.newEndPosition);
      address += SIZE_OF_POINT;
      C.setValue(address, edit.startIndex, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, edit.oldEndIndex, "i32");
      address += SIZE_OF_INT;
      C.setValue(address, edit.newEndIndex, "i32");
      address += SIZE_OF_INT;
    }
    __name(marshalEdit, "marshalEdit");
    function unmarshalLanguageMetadata(address) {
      const major_version = C.getValue(address, "i32");
      const minor_version = C.getValue(address += SIZE_OF_INT, "i32");
      const patch_version = C.getValue(address += SIZE_OF_INT, "i32");
      return { major_version, minor_version, patch_version };
    }
    __name(unmarshalLanguageMetadata, "unmarshalLanguageMetadata");
    var PREDICATE_STEP_TYPE_CAPTURE = 1;
    var PREDICATE_STEP_TYPE_STRING = 2;
    var QUERY_WORD_REGEX = /[\w-]+/g;
    var CaptureQuantifier = {
      Zero: 0,
      ZeroOrOne: 1,
      ZeroOrMore: 2,
      One: 3,
      OneOrMore: 4
    };
    var isCaptureStep = /* @__PURE__ */ __name((step) => step.type === "capture", "isCaptureStep");
    var isStringStep = /* @__PURE__ */ __name((step) => step.type === "string", "isStringStep");
    var QueryErrorKind = {
      Syntax: 1,
      NodeName: 2,
      FieldName: 3,
      CaptureName: 4,
      PatternStructure: 5
    };
    var QueryError = class _QueryError extends Error {
      constructor(kind, info2, index2, length) {
        super(_QueryError.formatMessage(kind, info2));
        this.kind = kind;
        this.info = info2;
        this.index = index2;
        this.length = length;
        this.name = "QueryError";
      }
      static {
        __name(this, "QueryError");
      }
      /** Formats an error message based on the error kind and info */
      static formatMessage(kind, info2) {
        switch (kind) {
          case QueryErrorKind.NodeName:
            return `Bad node name '${info2.word}'`;
          case QueryErrorKind.FieldName:
            return `Bad field name '${info2.word}'`;
          case QueryErrorKind.CaptureName:
            return `Bad capture name @${info2.word}`;
          case QueryErrorKind.PatternStructure:
            return `Bad pattern structure at offset ${info2.suffix}`;
          case QueryErrorKind.Syntax:
            return `Bad syntax at offset ${info2.suffix}`;
        }
      }
    };
    function parseAnyPredicate(steps, index2, operator, textPredicates) {
      if (steps.length !== 3) {
        throw new Error(
          `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}`
        );
      }
      if (!isCaptureStep(steps[1])) {
        throw new Error(
          `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}"`
        );
      }
      const isPositive = operator === "eq?" || operator === "any-eq?";
      const matchAll = !operator.startsWith("any-");
      if (isCaptureStep(steps[2])) {
        const captureName1 = steps[1].name;
        const captureName2 = steps[2].name;
        textPredicates[index2].push((captures) => {
          const nodes1 = [];
          const nodes2 = [];
          for (const c of captures) {
            if (c.name === captureName1) nodes1.push(c.node);
            if (c.name === captureName2) nodes2.push(c.node);
          }
          const compare = /* @__PURE__ */ __name((n1, n2, positive) => {
            return positive ? n1.text === n2.text : n1.text !== n2.text;
          }, "compare");
          return matchAll ? nodes1.every((n1) => nodes2.some((n2) => compare(n1, n2, isPositive))) : nodes1.some((n1) => nodes2.some((n2) => compare(n1, n2, isPositive)));
        });
      } else {
        const captureName = steps[1].name;
        const stringValue = steps[2].value;
        const matches = /* @__PURE__ */ __name((n) => n.text === stringValue, "matches");
        const doesNotMatch = /* @__PURE__ */ __name((n) => n.text !== stringValue, "doesNotMatch");
        textPredicates[index2].push((captures) => {
          const nodes = [];
          for (const c of captures) {
            if (c.name === captureName) nodes.push(c.node);
          }
          const test = isPositive ? matches : doesNotMatch;
          return matchAll ? nodes.every(test) : nodes.some(test);
        });
      }
    }
    __name(parseAnyPredicate, "parseAnyPredicate");
    function parseMatchPredicate(steps, index2, operator, textPredicates) {
      if (steps.length !== 3) {
        throw new Error(
          `Wrong number of arguments to \`#${operator}\` predicate. Expected 2, got ${steps.length - 1}.`
        );
      }
      if (steps[1].type !== "capture") {
        throw new Error(
          `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
        );
      }
      if (steps[2].type !== "string") {
        throw new Error(
          `Second argument of \`#${operator}\` predicate must be a string. Got @${steps[2].name}.`
        );
      }
      const isPositive = operator === "match?" || operator === "any-match?";
      const matchAll = !operator.startsWith("any-");
      const captureName = steps[1].name;
      const regex = new RegExp(steps[2].value);
      textPredicates[index2].push((captures) => {
        const nodes = [];
        for (const c of captures) {
          if (c.name === captureName) nodes.push(c.node.text);
        }
        const test = /* @__PURE__ */ __name((text, positive) => {
          return positive ? regex.test(text) : !regex.test(text);
        }, "test");
        if (nodes.length === 0) return !isPositive;
        return matchAll ? nodes.every((text) => test(text, isPositive)) : nodes.some((text) => test(text, isPositive));
      });
    }
    __name(parseMatchPredicate, "parseMatchPredicate");
    function parseAnyOfPredicate(steps, index2, operator, textPredicates) {
      if (steps.length < 2) {
        throw new Error(
          `Wrong number of arguments to \`#${operator}\` predicate. Expected at least 1. Got ${steps.length - 1}.`
        );
      }
      if (steps[1].type !== "capture") {
        throw new Error(
          `First argument of \`#${operator}\` predicate must be a capture. Got "${steps[1].value}".`
        );
      }
      const isPositive = operator === "any-of?";
      const captureName = steps[1].name;
      const stringSteps = steps.slice(2);
      if (!stringSteps.every(isStringStep)) {
        throw new Error(
          `Arguments to \`#${operator}\` predicate must be strings.".`
        );
      }
      const values = stringSteps.map((s) => s.value);
      textPredicates[index2].push((captures) => {
        const nodes = [];
        for (const c of captures) {
          if (c.name === captureName) nodes.push(c.node.text);
        }
        if (nodes.length === 0) return !isPositive;
        return nodes.every((text) => values.includes(text)) === isPositive;
      });
    }
    __name(parseAnyOfPredicate, "parseAnyOfPredicate");
    function parseIsPredicate(steps, index2, operator, assertedProperties, refutedProperties) {
      if (steps.length < 2 || steps.length > 3) {
        throw new Error(
          `Wrong number of arguments to \`#${operator}\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`
        );
      }
      if (!steps.every(isStringStep)) {
        throw new Error(
          `Arguments to \`#${operator}\` predicate must be strings.".`
        );
      }
      const properties = operator === "is?" ? assertedProperties : refutedProperties;
      if (!properties[index2]) properties[index2] = {};
      properties[index2][steps[1].value] = steps[2]?.value ?? null;
    }
    __name(parseIsPredicate, "parseIsPredicate");
    function parseSetDirective(steps, index2, setProperties) {
      if (steps.length < 2 || steps.length > 3) {
        throw new Error(`Wrong number of arguments to \`#set!\` predicate. Expected 1 or 2. Got ${steps.length - 1}.`);
      }
      if (!steps.every(isStringStep)) {
        throw new Error(`Arguments to \`#set!\` predicate must be strings.".`);
      }
      if (!setProperties[index2]) setProperties[index2] = {};
      setProperties[index2][steps[1].value] = steps[2]?.value ?? null;
    }
    __name(parseSetDirective, "parseSetDirective");
    function parsePattern(index2, stepType, stepValueId, captureNames, stringValues, steps, textPredicates, predicates, setProperties, assertedProperties, refutedProperties) {
      if (stepType === PREDICATE_STEP_TYPE_CAPTURE) {
        const name2 = captureNames[stepValueId];
        steps.push({ type: "capture", name: name2 });
      } else if (stepType === PREDICATE_STEP_TYPE_STRING) {
        steps.push({ type: "string", value: stringValues[stepValueId] });
      } else if (steps.length > 0) {
        if (steps[0].type !== "string") {
          throw new Error("Predicates must begin with a literal value");
        }
        const operator = steps[0].value;
        switch (operator) {
          case "any-not-eq?":
          case "not-eq?":
          case "any-eq?":
          case "eq?":
            parseAnyPredicate(steps, index2, operator, textPredicates);
            break;
          case "any-not-match?":
          case "not-match?":
          case "any-match?":
          case "match?":
            parseMatchPredicate(steps, index2, operator, textPredicates);
            break;
          case "not-any-of?":
          case "any-of?":
            parseAnyOfPredicate(steps, index2, operator, textPredicates);
            break;
          case "is?":
          case "is-not?":
            parseIsPredicate(steps, index2, operator, assertedProperties, refutedProperties);
            break;
          case "set!":
            parseSetDirective(steps, index2, setProperties);
            break;
          default:
            predicates[index2].push({ operator, operands: steps.slice(1) });
        }
        steps.length = 0;
      }
    }
    __name(parsePattern, "parsePattern");
    var Query = class {
      static {
        __name(this, "Query");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for WASM
      /** @internal */
      exceededMatchLimit;
      /** @internal */
      textPredicates;
      /** The names of the captures used in the query. */
      captureNames;
      /** The quantifiers of the captures used in the query. */
      captureQuantifiers;
      /**
       * The other user-defined predicates associated with the given index.
       *
       * This includes predicates with operators other than:
       * - `match?`
       * - `eq?` and `not-eq?`
       * - `any-of?` and `not-any-of?`
       * - `is?` and `is-not?`
       * - `set!`
       */
      predicates;
      /** The properties for predicates with the operator `set!`. */
      setProperties;
      /** The properties for predicates with the operator `is?`. */
      assertedProperties;
      /** The properties for predicates with the operator `is-not?`. */
      refutedProperties;
      /** The maximum number of in-progress matches for this cursor. */
      matchLimit;
      /**
       * Create a new query from a string containing one or more S-expression
       * patterns.
       *
       * The query is associated with a particular language, and can only be run
       * on syntax nodes parsed with that language. References to Queries can be
       * shared between multiple threads.
       *
       * @link {@see https://tree-sitter.github.io/tree-sitter/using-parsers/queries}
       */
      constructor(language, source) {
        const sourceLength = C.lengthBytesUTF8(source);
        const sourceAddress = C._malloc(sourceLength + 1);
        C.stringToUTF8(source, sourceAddress, sourceLength + 1);
        const address = C._ts_query_new(
          language[0],
          sourceAddress,
          sourceLength,
          TRANSFER_BUFFER,
          TRANSFER_BUFFER + SIZE_OF_INT
        );
        if (!address) {
          const errorId = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
          const errorByte = C.getValue(TRANSFER_BUFFER, "i32");
          const errorIndex = C.UTF8ToString(sourceAddress, errorByte).length;
          const suffix = source.slice(errorIndex, errorIndex + 100).split("\n")[0];
          const word = suffix.match(QUERY_WORD_REGEX)?.[0] ?? "";
          C._free(sourceAddress);
          switch (errorId) {
            case QueryErrorKind.Syntax:
              throw new QueryError(QueryErrorKind.Syntax, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
            case QueryErrorKind.NodeName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.FieldName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.CaptureName:
              throw new QueryError(errorId, { word }, errorIndex, word.length);
            case QueryErrorKind.PatternStructure:
              throw new QueryError(errorId, { suffix: `${errorIndex}: '${suffix}'...` }, errorIndex, 0);
          }
        }
        const stringCount = C._ts_query_string_count(address);
        const captureCount = C._ts_query_capture_count(address);
        const patternCount = C._ts_query_pattern_count(address);
        const captureNames = new Array(captureCount);
        const captureQuantifiers = new Array(patternCount);
        const stringValues = new Array(stringCount);
        for (let i2 = 0; i2 < captureCount; i2++) {
          const nameAddress = C._ts_query_capture_name_for_id(
            address,
            i2,
            TRANSFER_BUFFER
          );
          const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
          captureNames[i2] = C.UTF8ToString(nameAddress, nameLength);
        }
        for (let i2 = 0; i2 < patternCount; i2++) {
          const captureQuantifiersArray = new Array(captureCount);
          for (let j = 0; j < captureCount; j++) {
            const quantifier = C._ts_query_capture_quantifier_for_id(address, i2, j);
            captureQuantifiersArray[j] = quantifier;
          }
          captureQuantifiers[i2] = captureQuantifiersArray;
        }
        for (let i2 = 0; i2 < stringCount; i2++) {
          const valueAddress = C._ts_query_string_value_for_id(
            address,
            i2,
            TRANSFER_BUFFER
          );
          const nameLength = C.getValue(TRANSFER_BUFFER, "i32");
          stringValues[i2] = C.UTF8ToString(valueAddress, nameLength);
        }
        const setProperties = new Array(patternCount);
        const assertedProperties = new Array(patternCount);
        const refutedProperties = new Array(patternCount);
        const predicates = new Array(patternCount);
        const textPredicates = new Array(patternCount);
        for (let i2 = 0; i2 < patternCount; i2++) {
          const predicatesAddress = C._ts_query_predicates_for_pattern(address, i2, TRANSFER_BUFFER);
          const stepCount = C.getValue(TRANSFER_BUFFER, "i32");
          predicates[i2] = [];
          textPredicates[i2] = [];
          const steps = new Array();
          let stepAddress = predicatesAddress;
          for (let j = 0; j < stepCount; j++) {
            const stepType = C.getValue(stepAddress, "i32");
            stepAddress += SIZE_OF_INT;
            const stepValueId = C.getValue(stepAddress, "i32");
            stepAddress += SIZE_OF_INT;
            parsePattern(
              i2,
              stepType,
              stepValueId,
              captureNames,
              stringValues,
              steps,
              textPredicates,
              predicates,
              setProperties,
              assertedProperties,
              refutedProperties
            );
          }
          Object.freeze(textPredicates[i2]);
          Object.freeze(predicates[i2]);
          Object.freeze(setProperties[i2]);
          Object.freeze(assertedProperties[i2]);
          Object.freeze(refutedProperties[i2]);
        }
        C._free(sourceAddress);
        this[0] = address;
        this.captureNames = captureNames;
        this.captureQuantifiers = captureQuantifiers;
        this.textPredicates = textPredicates;
        this.predicates = predicates;
        this.setProperties = setProperties;
        this.assertedProperties = assertedProperties;
        this.refutedProperties = refutedProperties;
        this.exceededMatchLimit = false;
      }
      /** Delete the query, freeing its resources. */
      delete() {
        C._ts_query_delete(this[0]);
        this[0] = 0;
      }
      /**
       * Iterate over all of the matches in the order that they were found.
       *
       * Each match contains the index of the pattern that matched, and a list of
       * captures. Because multiple patterns can match the same set of nodes,
       * one match may contain captures that appear *before* some of the
       * captures from a previous match.
       *
       * @param {Node} node - The node to execute the query on.
       *
       * @param {QueryOptions} options - Options for query execution.
       */
      matches(node2, options = {}) {
        const startPosition = options.startPosition ?? ZERO_POINT;
        const endPosition = options.endPosition ?? ZERO_POINT;
        const startIndex = options.startIndex ?? 0;
        const endIndex = options.endIndex ?? 0;
        const matchLimit = options.matchLimit ?? 4294967295;
        const maxStartDepth = options.maxStartDepth ?? 4294967295;
        const timeoutMicros = options.timeoutMicros ?? 0;
        const progressCallback = options.progressCallback;
        if (typeof matchLimit !== "number") {
          throw new Error("Arguments must be numbers");
        }
        this.matchLimit = matchLimit;
        if (endIndex !== 0 && startIndex > endIndex) {
          throw new Error("`startIndex` cannot be greater than `endIndex`");
        }
        if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
          throw new Error("`startPosition` cannot be greater than `endPosition`");
        }
        if (progressCallback) {
          C.currentQueryProgressCallback = progressCallback;
        }
        marshalNode(node2);
        C._ts_query_matches_wasm(
          this[0],
          node2.tree[0],
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column,
          startIndex,
          endIndex,
          matchLimit,
          maxStartDepth,
          timeoutMicros
        );
        const rawCount = C.getValue(TRANSFER_BUFFER, "i32");
        const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
        const result = new Array(rawCount);
        this.exceededMatchLimit = Boolean(didExceedMatchLimit);
        let filteredCount = 0;
        let address = startAddress;
        for (let i2 = 0; i2 < rawCount; i2++) {
          const patternIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureCount = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captures = new Array(captureCount);
          address = unmarshalCaptures(this, node2.tree, address, patternIndex, captures);
          if (this.textPredicates[patternIndex].every((p) => p(captures))) {
            result[filteredCount] = { pattern: patternIndex, patternIndex, captures };
            const setProperties = this.setProperties[patternIndex];
            result[filteredCount].setProperties = setProperties;
            const assertedProperties = this.assertedProperties[patternIndex];
            result[filteredCount].assertedProperties = assertedProperties;
            const refutedProperties = this.refutedProperties[patternIndex];
            result[filteredCount].refutedProperties = refutedProperties;
            filteredCount++;
          }
        }
        result.length = filteredCount;
        C._free(startAddress);
        C.currentQueryProgressCallback = null;
        return result;
      }
      /**
       * Iterate over all of the individual captures in the order that they
       * appear.
       *
       * This is useful if you don't care about which pattern matched, and just
       * want a single, ordered sequence of captures.
       *
       * @param {Node} node - The node to execute the query on.
       *
       * @param {QueryOptions} options - Options for query execution.
       */
      captures(node2, options = {}) {
        const startPosition = options.startPosition ?? ZERO_POINT;
        const endPosition = options.endPosition ?? ZERO_POINT;
        const startIndex = options.startIndex ?? 0;
        const endIndex = options.endIndex ?? 0;
        const matchLimit = options.matchLimit ?? 4294967295;
        const maxStartDepth = options.maxStartDepth ?? 4294967295;
        const timeoutMicros = options.timeoutMicros ?? 0;
        const progressCallback = options.progressCallback;
        if (typeof matchLimit !== "number") {
          throw new Error("Arguments must be numbers");
        }
        this.matchLimit = matchLimit;
        if (endIndex !== 0 && startIndex > endIndex) {
          throw new Error("`startIndex` cannot be greater than `endIndex`");
        }
        if (endPosition !== ZERO_POINT && (startPosition.row > endPosition.row || startPosition.row === endPosition.row && startPosition.column > endPosition.column)) {
          throw new Error("`startPosition` cannot be greater than `endPosition`");
        }
        if (progressCallback) {
          C.currentQueryProgressCallback = progressCallback;
        }
        marshalNode(node2);
        C._ts_query_captures_wasm(
          this[0],
          node2.tree[0],
          startPosition.row,
          startPosition.column,
          endPosition.row,
          endPosition.column,
          startIndex,
          endIndex,
          matchLimit,
          maxStartDepth,
          timeoutMicros
        );
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const startAddress = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const didExceedMatchLimit = C.getValue(TRANSFER_BUFFER + 2 * SIZE_OF_INT, "i32");
        const result = new Array();
        this.exceededMatchLimit = Boolean(didExceedMatchLimit);
        const captures = new Array();
        let address = startAddress;
        for (let i2 = 0; i2 < count; i2++) {
          const patternIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureCount = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          const captureIndex = C.getValue(address, "i32");
          address += SIZE_OF_INT;
          captures.length = captureCount;
          address = unmarshalCaptures(this, node2.tree, address, patternIndex, captures);
          if (this.textPredicates[patternIndex].every((p) => p(captures))) {
            const capture = captures[captureIndex];
            const setProperties = this.setProperties[patternIndex];
            capture.setProperties = setProperties;
            const assertedProperties = this.assertedProperties[patternIndex];
            capture.assertedProperties = assertedProperties;
            const refutedProperties = this.refutedProperties[patternIndex];
            capture.refutedProperties = refutedProperties;
            result.push(capture);
          }
        }
        C._free(startAddress);
        C.currentQueryProgressCallback = null;
        return result;
      }
      /** Get the predicates for a given pattern. */
      predicatesForPattern(patternIndex) {
        return this.predicates[patternIndex];
      }
      /**
       * Disable a certain capture within a query.
       *
       * This prevents the capture from being returned in matches, and also
       * avoids any resource usage associated with recording the capture.
       */
      disableCapture(captureName) {
        const captureNameLength = C.lengthBytesUTF8(captureName);
        const captureNameAddress = C._malloc(captureNameLength + 1);
        C.stringToUTF8(captureName, captureNameAddress, captureNameLength + 1);
        C._ts_query_disable_capture(this[0], captureNameAddress, captureNameLength);
        C._free(captureNameAddress);
      }
      /**
       * Disable a certain pattern within a query.
       *
       * This prevents the pattern from matching, and also avoids any resource
       * usage associated with the pattern. This throws an error if the pattern
       * index is out of bounds.
       */
      disablePattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        C._ts_query_disable_pattern(this[0], patternIndex);
      }
      /**
       * Check if, on its last execution, this cursor exceeded its maximum number
       * of in-progress matches.
       */
      didExceedMatchLimit() {
        return this.exceededMatchLimit;
      }
      /** Get the byte offset where the given pattern starts in the query's source. */
      startIndexForPattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        return C._ts_query_start_byte_for_pattern(this[0], patternIndex);
      }
      /** Get the byte offset where the given pattern ends in the query's source. */
      endIndexForPattern(patternIndex) {
        if (patternIndex >= this.predicates.length) {
          throw new Error(
            `Pattern index is ${patternIndex} but the pattern count is ${this.predicates.length}`
          );
        }
        return C._ts_query_end_byte_for_pattern(this[0], patternIndex);
      }
      /** Get the number of patterns in the query. */
      patternCount() {
        return C._ts_query_pattern_count(this[0]);
      }
      /** Get the index for a given capture name. */
      captureIndexForName(captureName) {
        return this.captureNames.indexOf(captureName);
      }
      /** Check if a given pattern within a query has a single root node. */
      isPatternRooted(patternIndex) {
        return C._ts_query_is_pattern_rooted(this[0], patternIndex) === 1;
      }
      /** Check if a given pattern within a query has a single root node. */
      isPatternNonLocal(patternIndex) {
        return C._ts_query_is_pattern_non_local(this[0], patternIndex) === 1;
      }
      /**
       * Check if a given step in a query is 'definite'.
       *
       * A query step is 'definite' if its parent pattern will be guaranteed to
       * match successfully once it reaches the step.
       */
      isPatternGuaranteedAtStep(byteIndex) {
        return C._ts_query_is_pattern_guaranteed_at_step(this[0], byteIndex) === 1;
      }
    };
    var LANGUAGE_FUNCTION_REGEX = /^tree_sitter_\w+$/;
    var Language = class _Language {
      static {
        __name(this, "Language");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for WASM
      /**
       * A list of all node types in the language. The index of each type in this
       * array is its node type id.
       */
      types;
      /**
       * A list of all field names in the language. The index of each field name in
       * this array is its field id.
       */
      fields;
      /** @internal */
      constructor(internal, address) {
        assertInternal(internal);
        this[0] = address;
        this.types = new Array(C._ts_language_symbol_count(this[0]));
        for (let i2 = 0, n = this.types.length; i2 < n; i2++) {
          if (C._ts_language_symbol_type(this[0], i2) < 2) {
            this.types[i2] = C.UTF8ToString(C._ts_language_symbol_name(this[0], i2));
          }
        }
        this.fields = new Array(C._ts_language_field_count(this[0]) + 1);
        for (let i2 = 0, n = this.fields.length; i2 < n; i2++) {
          const fieldName = C._ts_language_field_name_for_id(this[0], i2);
          if (fieldName !== 0) {
            this.fields[i2] = C.UTF8ToString(fieldName);
          } else {
            this.fields[i2] = null;
          }
        }
      }
      /**
       * Gets the name of the language.
       */
      get name() {
        const ptr = C._ts_language_name(this[0]);
        if (ptr === 0) return null;
        return C.UTF8ToString(ptr);
      }
      /**
       * @deprecated since version 0.25.0, use {@link Language#abiVersion} instead
       * Gets the version of the language.
       */
      get version() {
        return C._ts_language_version(this[0]);
      }
      /**
       * Gets the ABI version of the language.
       */
      get abiVersion() {
        return C._ts_language_abi_version(this[0]);
      }
      /**
      * Get the metadata for this language. This information is generated by the
      * CLI, and relies on the language author providing the correct metadata in
      * the language's `tree-sitter.json` file.
      */
      get metadata() {
        C._ts_language_metadata(this[0]);
        const length = C.getValue(TRANSFER_BUFFER, "i32");
        const address = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        if (length === 0) return null;
        return unmarshalLanguageMetadata(address);
      }
      /**
       * Gets the number of fields in the language.
       */
      get fieldCount() {
        return this.fields.length - 1;
      }
      /**
       * Gets the number of states in the language.
       */
      get stateCount() {
        return C._ts_language_state_count(this[0]);
      }
      /**
       * Get the field id for a field name.
       */
      fieldIdForName(fieldName) {
        const result = this.fields.indexOf(fieldName);
        return result !== -1 ? result : null;
      }
      /**
       * Get the field name for a field id.
       */
      fieldNameForId(fieldId) {
        return this.fields[fieldId] ?? null;
      }
      /**
       * Get the node type id for a node type name.
       */
      idForNodeType(type, named) {
        const typeLength = C.lengthBytesUTF8(type);
        const typeAddress = C._malloc(typeLength + 1);
        C.stringToUTF8(type, typeAddress, typeLength + 1);
        const result = C._ts_language_symbol_for_name(this[0], typeAddress, typeLength, named ? 1 : 0);
        C._free(typeAddress);
        return result || null;
      }
      /**
       * Gets the number of node types in the language.
       */
      get nodeTypeCount() {
        return C._ts_language_symbol_count(this[0]);
      }
      /**
       * Get the node type name for a node type id.
       */
      nodeTypeForId(typeId) {
        const name2 = C._ts_language_symbol_name(this[0], typeId);
        return name2 ? C.UTF8ToString(name2) : null;
      }
      /**
       * Check if a node type is named.
       *
       * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/2-basic-parsing.html#named-vs-anonymous-nodes}
       */
      nodeTypeIsNamed(typeId) {
        return C._ts_language_type_is_named_wasm(this[0], typeId) ? true : false;
      }
      /**
       * Check if a node type is visible.
       */
      nodeTypeIsVisible(typeId) {
        return C._ts_language_type_is_visible_wasm(this[0], typeId) ? true : false;
      }
      /**
       * Get the supertypes ids of this language.
       *
       * @see {@link https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html?highlight=supertype#supertype-nodes}
       */
      get supertypes() {
        C._ts_language_supertypes_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = C.getValue(address, "i16");
            address += SIZE_OF_SHORT;
          }
        }
        return result;
      }
      /**
       * Get the subtype ids for a given supertype node id.
       */
      subtypes(supertype) {
        C._ts_language_subtypes_wasm(this[0], supertype);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = C.getValue(address, "i16");
            address += SIZE_OF_SHORT;
          }
        }
        return result;
      }
      /**
       * Get the next state id for a given state id and node type id.
       */
      nextState(stateId2, typeId) {
        return C._ts_language_next_state(this[0], stateId2, typeId);
      }
      /**
       * Create a new lookahead iterator for this language and parse state.
       *
       * This returns `null` if state is invalid for this language.
       *
       * Iterating {@link LookaheadIterator} will yield valid symbols in the given
       * parse state. Newly created lookahead iterators will return the `ERROR`
       * symbol from {@link LookaheadIterator#currentType}.
       *
       * Lookahead iterators can be useful for generating suggestions and improving
       * syntax error diagnostics. To get symbols valid in an `ERROR` node, use the
       * lookahead iterator on its first leaf node state. For `MISSING` nodes, a
       * lookahead iterator created on the previous non-extra leaf node may be
       * appropriate.
       */
      lookaheadIterator(stateId2) {
        const address = C._ts_lookahead_iterator_new(this[0], stateId2);
        if (address) return new LookaheadIterator(INTERNAL, address, this);
        return null;
      }
      /**
       * @deprecated since version 0.25.0, call `new` on a {@link Query} instead
       *
       * Create a new query from a string containing one or more S-expression
       * patterns.
       *
       * The query is associated with a particular language, and can only be run
       * on syntax nodes parsed with that language. References to Queries can be
       * shared between multiple threads.
       *
       * @link {@see https://tree-sitter.github.io/tree-sitter/using-parsers/queries}
       */
      query(source) {
        console.warn("Language.query is deprecated. Use new Query(language, source) instead.");
        return new Query(this, source);
      }
      /**
       * Load a language from a WebAssembly module.
       * The module can be provided as a path to a file or as a buffer.
       */
      static async load(input) {
        let bytes;
        if (input instanceof Uint8Array) {
          bytes = Promise.resolve(input);
        } else {
          if (globalThis.process?.versions.node) {
            const fs22 = await import("fs/promises");
            bytes = fs22.readFile(input);
          } else {
            bytes = fetch(input).then((response) => response.arrayBuffer().then((buffer) => {
              if (response.ok) {
                return new Uint8Array(buffer);
              } else {
                const body2 = new TextDecoder("utf-8").decode(buffer);
                throw new Error(`Language.load failed with status ${response.status}.

${body2}`);
              }
            }));
          }
        }
        const mod = await C.loadWebAssemblyModule(await bytes, { loadAsync: true });
        const symbolNames = Object.keys(mod);
        const functionName = symbolNames.find((key) => LANGUAGE_FUNCTION_REGEX.test(key) && !key.includes("external_scanner_"));
        if (!functionName) {
          console.log(`Couldn't find language function in WASM file. Symbols:
${JSON.stringify(symbolNames, null, 2)}`);
          throw new Error("Language.load failed: no language function found in WASM file");
        }
        const languageAddress = mod[functionName]();
        return new _Language(INTERNAL, languageAddress);
      }
    };
    var import_tree_sitter = __toESM(require_tree_sitter(), 1);
    var Module2 = null;
    async function initializeBinding(moduleOptions) {
      if (!Module2) {
        Module2 = await (0, import_tree_sitter.default)(moduleOptions);
      }
      return Module2;
    }
    __name(initializeBinding, "initializeBinding");
    function checkModule() {
      return !!Module2;
    }
    __name(checkModule, "checkModule");
    var TRANSFER_BUFFER;
    var LANGUAGE_VERSION;
    var MIN_COMPATIBLE_VERSION;
    var Parser = class {
      static {
        __name(this, "Parser");
      }
      /** @internal */
      [0] = 0;
      // Internal handle for WASM
      /** @internal */
      [1] = 0;
      // Internal handle for WASM
      /** @internal */
      logCallback = null;
      /** The parser's current language. */
      language = null;
      /**
       * This must always be called before creating a Parser.
       *
       * You can optionally pass in options to configure the WASM module, the most common
       * one being `locateFile` to help the module find the `.wasm` file.
       */
      static async init(moduleOptions) {
        setModule(await initializeBinding(moduleOptions));
        TRANSFER_BUFFER = C._ts_init();
        LANGUAGE_VERSION = C.getValue(TRANSFER_BUFFER, "i32");
        MIN_COMPATIBLE_VERSION = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      }
      /**
       * Create a new parser.
       */
      constructor() {
        this.initialize();
      }
      /** @internal */
      initialize() {
        if (!checkModule()) {
          throw new Error("cannot construct a Parser before calling `init()`");
        }
        C._ts_parser_new_wasm();
        this[0] = C.getValue(TRANSFER_BUFFER, "i32");
        this[1] = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
      }
      /** Delete the parser, freeing its resources. */
      delete() {
        C._ts_parser_delete(this[0]);
        C._free(this[1]);
        this[0] = 0;
        this[1] = 0;
      }
      /**
       * Set the language that the parser should use for parsing.
       *
       * If the language was not successfully assigned, an error will be thrown.
       * This happens if the language was generated with an incompatible
       * version of the Tree-sitter CLI. Check the language's version using
       * {@link Language#version} and compare it to this library's
       * {@link LANGUAGE_VERSION} and {@link MIN_COMPATIBLE_VERSION} constants.
       */
      setLanguage(language) {
        let address;
        if (!language) {
          address = 0;
          this.language = null;
        } else if (language.constructor === Language) {
          address = language[0];
          const version = C._ts_language_version(address);
          if (version < MIN_COMPATIBLE_VERSION || LANGUAGE_VERSION < version) {
            throw new Error(
              `Incompatible language version ${version}. Compatibility range ${MIN_COMPATIBLE_VERSION} through ${LANGUAGE_VERSION}.`
            );
          }
          this.language = language;
        } else {
          throw new Error("Argument must be a Language");
        }
        C._ts_parser_set_language(this[0], address);
        return this;
      }
      /**
       * Parse a slice of UTF8 text.
       *
       * @param {string | ParseCallback} callback - The UTF8-encoded text to parse or a callback function.
       *
       * @param {Tree | null} [oldTree] - A previous syntax tree parsed from the same document. If the text of the
       *   document has changed since `oldTree` was created, then you must edit `oldTree` to match
       *   the new text using {@link Tree#edit}.
       *
       * @param {ParseOptions} [options] - Options for parsing the text.
       *  This can be used to set the included ranges, or a progress callback.
       *
       * @returns {Tree | null} A {@link Tree} if parsing succeeded, or `null` if:
       *  - The parser has not yet had a language assigned with {@link Parser#setLanguage}.
       *  - The progress callback returned true.
       */
      parse(callback, oldTree, options) {
        if (typeof callback === "string") {
          C.currentParseCallback = (index2) => callback.slice(index2);
        } else if (typeof callback === "function") {
          C.currentParseCallback = callback;
        } else {
          throw new Error("Argument must be a string or a function");
        }
        if (options?.progressCallback) {
          C.currentProgressCallback = options.progressCallback;
        } else {
          C.currentProgressCallback = null;
        }
        if (this.logCallback) {
          C.currentLogCallback = this.logCallback;
          C._ts_parser_enable_logger_wasm(this[0], 1);
        } else {
          C.currentLogCallback = null;
          C._ts_parser_enable_logger_wasm(this[0], 0);
        }
        let rangeCount = 0;
        let rangeAddress = 0;
        if (options?.includedRanges) {
          rangeCount = options.includedRanges.length;
          rangeAddress = C._calloc(rangeCount, SIZE_OF_RANGE);
          let address = rangeAddress;
          for (let i2 = 0; i2 < rangeCount; i2++) {
            marshalRange(address, options.includedRanges[i2]);
            address += SIZE_OF_RANGE;
          }
        }
        const treeAddress = C._ts_parser_parse_wasm(
          this[0],
          this[1],
          oldTree ? oldTree[0] : 0,
          rangeAddress,
          rangeCount
        );
        if (!treeAddress) {
          C.currentParseCallback = null;
          C.currentLogCallback = null;
          C.currentProgressCallback = null;
          return null;
        }
        if (!this.language) {
          throw new Error("Parser must have a language to parse");
        }
        const result = new Tree(INTERNAL, treeAddress, this.language, C.currentParseCallback);
        C.currentParseCallback = null;
        C.currentLogCallback = null;
        C.currentProgressCallback = null;
        return result;
      }
      /**
       * Instruct the parser to start the next parse from the beginning.
       *
       * If the parser previously failed because of a timeout, cancellation,
       * or callback, then by default, it will resume where it left off on the
       * next call to {@link Parser#parse} or other parsing functions.
       * If you don't want to resume, and instead intend to use this parser to
       * parse some other document, you must call `reset` first.
       */
      reset() {
        C._ts_parser_reset(this[0]);
      }
      /** Get the ranges of text that the parser will include when parsing. */
      getIncludedRanges() {
        C._ts_parser_included_ranges_wasm(this[0]);
        const count = C.getValue(TRANSFER_BUFFER, "i32");
        const buffer = C.getValue(TRANSFER_BUFFER + SIZE_OF_INT, "i32");
        const result = new Array(count);
        if (count > 0) {
          let address = buffer;
          for (let i2 = 0; i2 < count; i2++) {
            result[i2] = unmarshalRange(address);
            address += SIZE_OF_RANGE;
          }
          C._free(buffer);
        }
        return result;
      }
      /**
       * @deprecated since version 0.25.0, prefer passing a progress callback to {@link Parser#parse}
       *
       * Get the duration in microseconds that parsing is allowed to take.
       *
       * This is set via {@link Parser#setTimeoutMicros}.
       */
      getTimeoutMicros() {
        return C._ts_parser_timeout_micros(this[0]);
      }
      /**
       * @deprecated since version 0.25.0, prefer passing a progress callback to {@link Parser#parse}
       *
       * Set the maximum duration in microseconds that parsing should be allowed
       * to take before halting.
       *
       * If parsing takes longer than this, it will halt early, returning `null`.
       * See {@link Parser#parse} for more information.
       */
      setTimeoutMicros(timeout) {
        C._ts_parser_set_timeout_micros(this[0], 0, timeout);
      }
      /** Set the logging callback that a parser should use during parsing. */
      setLogger(callback) {
        if (!callback) {
          this.logCallback = null;
        } else if (typeof callback !== "function") {
          throw new Error("Logger callback must be a function");
        } else {
          this.logCallback = callback;
        }
        return this;
      }
      /** Get the parser's current logger. */
      getLogger() {
        return this.logCallback;
      }
    };
  }
});

// src/cli.ts
var fs10 = __toESM2(require("node:fs"));
var path10 = __toESM2(require("node:path"));

// src/core/cache.ts
var fs2 = __toESM2(require("node:fs"));
var path = __toESM2(require("node:path"));

// src/core/ir.ts
var SCHEMA_VERSION = 5;
var TOOL_NAME = "hesperus";
var REPO_ID = "repo";
var NODE_KINDS = [
  "repo",
  "directory",
  "package",
  "file",
  "type",
  "function",
  "method",
  "field",
  "variable",
  "state",
  "event",
  "external_package",
  "external",
  "unresolved",
  // View-only: the boundary view's grouping of outside calls (core/boundary.ts). Never stored.
  "boundary"
];
var EDGE_KINDS = ["contains", "call", "override", "flow", "transition", "guard"];
var PROVENANCES = ["resolved", "may", "unresolved"];
var isCallable = (k) => k === "function" || k === "method";
function cmpStr(a, b) {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i2 = 0; i2 < n; i2++) {
    let x = a.charCodeAt(i2), y = b.charCodeAt(i2);
    if (x === y) continue;
    if (x >= 55296 && y >= 55296) {
      x = x >= 57344 ? x - 2048 : x + 8192;
      y = y >= 57344 ? y - 2048 : y + 8192;
    }
    return x < y ? -1 : 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}
var cmpNum = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function cmpOpt(a, b, f) {
  if (a === void 0) return b === void 0 ? 0 : -1;
  return b === void 0 ? 1 : f(a, b);
}
var rank = (xs) => (a, b) => cmpNum(xs.indexOf(a), xs.indexOf(b));
var cmpNodeKind = rank(NODE_KINDS);
var cmpEdgeKind = rank(EDGE_KINDS);
var cmpProvenance = rank(PROVENANCES);
function cmpRange(a, b) {
  return cmpNum(a.start_line, b.start_line) || cmpNum(a.start_col, b.start_col) || cmpNum(a.end_line, b.end_line) || cmpNum(a.end_col, b.end_col);
}
var cmpSite = (a, b) => cmpStr(a.path, b.path) || cmpRange(a.range, b.range);
function contains(outer, o) {
  const le = (l1, c1, l2, c2) => l1 < l2 || l1 === l2 && c1 <= c2;
  return le(outer.start_line, outer.start_col, o.start_line, o.start_col) && le(o.end_line, o.end_col, outer.end_line, outer.end_col);
}
function cmpSize(a, b) {
  return cmpNum(a.end_line - a.start_line, b.end_line - b.start_line) || cmpNum(a.end_col - a.start_col >>> 0, b.end_col - b.start_col >>> 0);
}
var rangeKey = (r) => `${r.start_line},${r.start_col},${r.end_line},${r.end_col}`;
function cmpNode(a, b) {
  return cmpStr(a.id, b.id) || cmpNodeKind(a.kind, b.kind) || cmpStr(a.name, b.name) || cmpOpt(a.path, b.path, cmpStr) || cmpOpt(a.range, b.range, cmpRange) || cmpOpt(a.signature, b.signature, cmpStr) || cmpOpt(a.doc, b.doc, cmpStr) || cmpOpt(a.hash, b.hash, cmpStr);
}
function cmpEdge(a, b) {
  return cmpStr(a.from, b.from) || cmpStr(a.to, b.to) || cmpEdgeKind(a.kind, b.kind) || cmpOpt(a.site, b.site, cmpSite) || cmpOpt(a.label, b.label, cmpStr) || cmpProvenance(a.provenance, b.provenance);
}
var range = (r) => ({ start_line: r.start_line, start_col: r.start_col, end_line: r.end_line, end_col: r.end_col });
function node(n) {
  const o = { id: n.id, kind: n.kind, name: n.name };
  if (n.path !== void 0) o.path = n.path;
  if (n.range !== void 0) o.range = range(n.range);
  if (n.signature !== void 0) o.signature = n.signature;
  if (n.doc !== void 0) o.doc = n.doc;
  if (n.hash !== void 0) o.hash = n.hash;
  if (n.unindexed) o.unindexed = true;
  return o;
}
function edge(e) {
  const o = { from: e.from, to: e.to, kind: e.kind, provenance: e.provenance };
  if (e.label !== void 0) o.label = e.label;
  if (e.site !== void 0) o.site = { path: e.site.path, range: range(e.site.range) };
  return o;
}
var newGraph = () => ({ schema_version: SCHEMA_VERSION, nodes: [], edges: [] });
function sortDedup(xs, cmp) {
  xs.sort(cmp);
  return xs.filter((x, i2) => i2 === 0 || cmp(xs[i2 - 1], x) !== 0);
}
function canonicalize(g) {
  g.nodes = sortDedup(g.nodes, cmpNode);
  g.edges = sortDedup(g.edges, cmpEdge);
}
var pretty = (v) => JSON.stringify(v, null, 2) + "\n";
var fail = (what) => {
  throw new Error(what);
};
var str = (v, f) => typeof v === "string" ? v : fail(`${f}: expected a string`);
var optStr = (v, f) => v == null ? void 0 : str(v, f);
var u32 = (v, f) => Number.isInteger(v) && v >= 0 && v <= 4294967295 ? v : fail(`${f}: expected u32`);
var oneOf = (xs, v, f) => xs.includes(v) ? v : fail(`${f}: unknown variant ${JSON.stringify(v)}`);
var obj = (v, f) => v && typeof v === "object" && !Array.isArray(v) ? v : fail(`${f}: expected an object`);
var arr = (v, f) => Array.isArray(v) ? v : fail(`${f}: expected an array`);
function parseRange(v) {
  const r = obj(v, "range");
  return { start_line: u32(r.start_line, "start_line"), start_col: u32(r.start_col, "start_col"), end_line: u32(r.end_line, "end_line"), end_col: u32(r.end_col, "end_col") };
}
function parseNode(v) {
  const n = obj(v, "node");
  return node({
    id: str(n.id, "id"),
    kind: oneOf(NODE_KINDS, n.kind, "kind"),
    name: str(n.name, "name"),
    path: optStr(n.path, "path"),
    range: n.range == null ? void 0 : parseRange(n.range),
    signature: optStr(n.signature, "signature"),
    doc: optStr(n.doc, "doc"),
    hash: optStr(n.hash, "hash")
  });
}
function parseEdge(v) {
  const e = obj(v, "edge");
  const site2 = e.site == null ? void 0 : obj(e.site, "site");
  return edge({
    from: str(e.from, "from"),
    to: str(e.to, "to"),
    kind: oneOf(EDGE_KINDS, e.kind, "kind"),
    provenance: oneOf(PROVENANCES, e.provenance, "provenance"),
    label: optStr(e.label, "label"),
    site: site2 && { path: str(site2.path, "path"), range: parseRange(site2.range) }
  });
}

// src/core/aggregate.ts
function withoutNodes(v, out2) {
  out2 = new Set(out2);
  const groups = v.groups.filter((gr) => !gr.members.every((m) => out2.has(m)));
  for (const gr of v.groups) if (!groups.includes(gr)) out2.add(gr.id);
  return { ...v, nodes: v.nodes.filter((id) => !out2.has(id)), rollups: v.rollups.filter((r) => !out2.has(r.from) && !out2.has(r.to)), groups };
}
function withoutUnindexed(g, v) {
  const kids = /* @__PURE__ */ new Map();
  for (const e of g.edges) if (e.kind === "contains") (kids.get(e.from) ?? kids.set(e.from, []).get(e.from)).push(e.to);
  const hide = new Set(g.nodes.filter((n) => n.unindexed).map((n) => n.id));
  const seen = /* @__PURE__ */ new Set();
  const empty = (id) => {
    if (hide.has(id)) return true;
    const k = kids.get(id);
    if (!k || seen.has(id)) return false;
    seen.add(id);
    const all = k.every(empty);
    if (all) hide.add(id);
    return all;
  };
  for (const id of kids.keys()) empty(id);
  const groups = v.groups.filter((gr) => !gr.members.every((m) => hide.has(m)));
  for (const gr of v.groups) if (!groups.includes(gr)) hide.add(gr.id);
  return { ...v, nodes: v.nodes.filter((id) => !hide.has(id)), rollups: v.rollups.filter((r) => !hide.has(r.from) && !hide.has(r.to)), groups };
}
var GROUP_OVER = 12;
var isGroup = (id) => id.startsWith("tier:");
function parents(g) {
  const m = /* @__PURE__ */ new Map();
  for (const e of g.edges) if (e.kind === "contains") m.set(e.to, e.from);
  return m;
}
var STRUCTURE = /* @__PURE__ */ new Set(["directory", "package", "file"]);
function flowThrough(g, par, expanded) {
  const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const kids = /* @__PURE__ */ new Map();
  for (const e of g.edges) if (e.kind === "contains") kids.set(e.from, (kids.get(e.from) ?? 0) + 1);
  return (id) => {
    const p = par.get(id);
    if (!STRUCTURE.has(kind.get(id) ?? "") || !kids.get(id) || p === void 0) return false;
    return expanded.has(id) || kids.get(p) === 1;
  };
}
function passThrough(g, par = parents(g), opts = {}) {
  const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const kids = /* @__PURE__ */ new Map();
  for (const e of g.edges) if (e.kind === "contains") kids.set(e.from, (kids.get(e.from) ?? 0) + 1);
  return (id) => {
    const k = kind.get(id) ?? "";
    const p = par.get(id);
    if (!STRUCTURE.has(k) || !kids.get(id) || p === void 0 || p === REPO_ID) return false;
    return k === "file" && !opts.files || kids.get(p) === 1;
  };
}
function view(g, expanded, opts = {}) {
  return build(g, expanded, opts).view;
}
function build(g, expanded, opts) {
  const par = parents(g);
  const through = opts.flow ? flowThrough(g, par, expanded) : passThrough(g, par, opts);
  const memo = /* @__PURE__ */ new Map();
  const rep = (id) => {
    const hit = memo.get(id);
    if (hit !== void 0) return hit;
    const chain2 = [id];
    for (let p = par.get(id); p !== void 0; p = par.get(p)) {
      chain2.push(p);
      if (chain2.length > par.size + 1) break;
    }
    chain2.reverse();
    let cur = chain2[0];
    for (const x of chain2.slice(1)) {
      if (cur === REPO_ID || expanded.has(cur) || through(cur)) cur = x;
      else break;
    }
    while (cur !== REPO_ID && through(cur)) cur = par.get(cur) ?? REPO_ID;
    memo.set(id, cur);
    return cur;
  };
  const groups = opts.flow ? [] : tiers(g, par, rep, expanded, through);
  const tierOf = /* @__PURE__ */ new Map();
  for (const gr of groups) for (const m of gr.members) tierOf.set(m, gr);
  const memo2 = /* @__PURE__ */ new Map();
  const rep2 = (id) => {
    const r = rep(id);
    const hit = memo2.get(r);
    if (hit !== void 0) return hit;
    let out2 = r;
    for (let x = r; x !== void 0 && x !== REPO_ID; x = par.get(x)) {
      const t = tierOf.get(x);
      if (t && !t.expanded) out2 = t.id;
    }
    memo2.set(r, out2);
    return out2;
  };
  const visible = new Set(g.nodes.filter((n) => n.id !== REPO_ID && rep(n.id) === n.id && !through(n.id)).map((n) => n.id));
  const drawn = (c) => c === REPO_ID || visible.has(c) && rep2(c) === c;
  const live = groups.filter((gr) => drawn(gr.parent));
  const shown = /* @__PURE__ */ new Set();
  for (const id of visible) shown.add(rep2(id));
  for (const gr of live) if (gr.expanded) shown.add(gr.id);
  const nodes = [...shown].sort(cmpStr);
  const acc = /* @__PURE__ */ new Map();
  g.edges.forEach((e, i2) => {
    if (e.kind === "contains") return;
    const a = rep2(e.from), b = rep2(e.to);
    if (a === b || a === REPO_ID || b === REPO_ID) return;
    const k = `${a}\0${b}\0${e.kind}`;
    let r = acc.get(k);
    if (!r) acc.set(k, r = { from: a, to: b, kind: e.kind, weight: 0, resolved: 0, may: 0, unresolved: 0, edges: [] });
    r.weight++;
    r[e.provenance]++;
    r.edges.push(i2);
  });
  const rollups = [...acc.values()].sort((x, y) => cmpStr(x.from, y.from) || cmpStr(x.to, y.to) || cmpEdgeKind(x.kind, y.kind));
  if (!opts.flow) return { view: { nodes, rollups, groups: live }, all: nodes };
  const keep = /* @__PURE__ */ new Set();
  for (const r of rollups) for (const id of [r.from, r.to]) for (let x = id; x !== void 0 && !keep.has(x); x = par.get(x)) keep.add(x);
  const linked = nodes.filter((id) => keep.has(id));
  if (!linked.length) return { view: { nodes, rollups, groups: live, isolated: 0 }, all: nodes };
  return { view: { nodes: linked, rollups, groups: live, isolated: nodes.length - linked.length }, all: nodes };
}
var OVERVIEW_NODES = 60;
function overview(g, budget = OVERVIEW_NODES, opts = {}) {
  const hasKids = new Set(g.edges.filter((e) => e.kind === "contains").map((e) => e.from));
  const outside = new Set(g.nodes.filter((n) => n.kind === "external_package" || n.kind === "external" || n.kind === "boundary").map((n) => n.id));
  let open = /* @__PURE__ */ new Set(), v = build(g, open, opts);
  for (; ; ) {
    const level2 = v.all.filter((id) => !open.has(id) && !outside.has(id) && (hasKids.has(id) || v.view.groups.some((gr) => gr.id === id && !gr.members.every((m) => outside.has(m)))));
    if (!level2.length) return open;
    const next = /* @__PURE__ */ new Set([...open, ...level2]);
    const nv = build(g, next, opts);
    if (nv.view.nodes.length > budget) return open;
    [open, v] = [next, nv];
  }
}
function tiers(g, par, rep, expanded, through) {
  const drawnParent = (id) => {
    let p = par.get(id);
    while (p !== void 0 && p !== REPO_ID && through(p)) p = par.get(p);
    return p;
  };
  const kids = /* @__PURE__ */ new Map();
  for (const n of g.nodes) {
    const p = through(n.id) ? void 0 : drawnParent(n.id);
    if (p !== void 0) (kids.get(p) ?? kids.set(p, []).get(p)).push(n.id);
  }
  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const out2 = [];
  for (const c of [...kids.keys()].sort(cmpStr)) {
    const ch = kids.get(c).sort(cmpStr);
    if (ch.length <= GROUP_OVER) continue;
    if (c !== REPO_ID && (!expanded.has(c) || rep(c) !== c)) continue;
    if (kindOf.get(c) === "field" || kindOf.get(c) === "variable") continue;
    const away = (id) => kindOf.get(id) === "external_package" || kindOf.get(id) === "boundary";
    const ext = ch.filter(away);
    const own = ch.filter((id) => !away(id));
    const mk = (key, name2, members) => {
      const id = `tier:${c}#${key}`;
      out2.push({ id, parent: c, name: name2, members, expanded: expanded.has(id) });
    };
    if (ext.length > 1) mk("ext", `external \xB7 ${ext.length}`, ext);
    if (own.length <= GROUP_OVER) continue;
    const childOf = /* @__PURE__ */ new Map();
    const lift = (id) => {
      const hit = childOf.get(id);
      if (hit !== void 0) return hit;
      const p = drawnParent(id);
      const r = p === void 0 ? null : p === c ? id : lift(p);
      childOf.set(id, r);
      return r;
    };
    const ownSet = new Set(own);
    const adj = new Map(own.map((id) => [id, /* @__PURE__ */ new Set()]));
    for (const e of g.edges) {
      if (e.kind !== "call" && e.kind !== "override" || e.provenance !== "resolved") continue;
      const a = lift(e.from), b = lift(e.to);
      if (a && b && a !== b && ownSet.has(a) && ownSet.has(b)) adj.get(a).add(b);
    }
    const level2 = layers(own, adj);
    const linked = /* @__PURE__ */ new Set();
    for (const [a, bs] of adj) if (bs.size) {
      linked.add(a);
      for (const b of bs) linked.add(b);
    }
    const byLevel = /* @__PURE__ */ new Map();
    for (const id of own) if (linked.has(id)) (byLevel.get(level2.get(id)) ?? byLevel.set(level2.get(id), []).get(level2.get(id))).push(id);
    const lv = [...byLevel.keys()].sort((a, b) => a - b);
    lv.forEach((l, i2) => {
      const role = i2 === 0 ? " \xB7 callers" : i2 === lv.length - 1 ? " \xB7 callees" : "";
      mk(String(i2 + 1).padStart(3, "0"), `layer ${i2 + 1}${role}`, byLevel.get(l));
    });
    const alone = own.filter((id) => !linked.has(id));
    if (alone.length) mk("solo", "unconnected", alone);
  }
  return out2;
}
function layers(ids, adj) {
  const succ = (id) => [...adj.get(id)].sort(cmpStr);
  const index2 = /* @__PURE__ */ new Map(), low = /* @__PURE__ */ new Map(), comp = /* @__PURE__ */ new Map();
  const stack = [], on = /* @__PURE__ */ new Set();
  let next = 0, ncomp = 0;
  for (const root of ids) {
    if (index2.has(root)) continue;
    const work = [[root, succ(root), 0]];
    index2.set(root, next);
    low.set(root, next);
    next++;
    stack.push(root);
    on.add(root);
    while (work.length) {
      const top = work[work.length - 1];
      const [v, ss] = top;
      if (top[2] < ss.length) {
        const w = ss[top[2]++];
        if (!index2.has(w)) {
          index2.set(w, next);
          low.set(w, next);
          next++;
          stack.push(w);
          on.add(w);
          work.push([w, succ(w), 0]);
        } else if (on.has(w)) low.set(v, Math.min(low.get(v), index2.get(w)));
        continue;
      }
      work.pop();
      if (work.length) {
        const u2 = work[work.length - 1][0];
        low.set(u2, Math.min(low.get(u2), low.get(v)));
      }
      if (low.get(v) === index2.get(v)) {
        let w;
        do {
          w = stack.pop();
          on.delete(w);
          comp.set(w, ncomp);
        } while (w !== v);
        ncomp++;
      }
    }
  }
  const preds = /* @__PURE__ */ new Map();
  for (const [a, bs] of adj) for (const b of bs) {
    const ca = comp.get(a), cb = comp.get(b);
    if (ca !== cb) (preds.get(cb) ?? preds.set(cb, /* @__PURE__ */ new Set()).get(cb)).add(ca);
  }
  const lvl = new Array(ncomp).fill(0);
  for (let c = ncomp - 1; c >= 0; c--) for (const p of preds.get(c) ?? []) lvl[c] = Math.max(lvl[c], lvl[p] + 1);
  return new Map(ids.map((id) => [id, lvl[comp.get(id)]]));
}

// src/core/hash.ts
var import_node_crypto = require("node:crypto");
var sha256Hex = (bytes) => (0, import_node_crypto.createHash)("sha256").update(bytes).digest("hex");

// src/core/cache.ts
var CACHE_DIR = ".hesperus";
function ioMessage(e) {
  const err2 = e;
  if (err2.code === "ENOENT") return "No such file or directory";
  if (err2.code === "EACCES") return "Permission denied";
  return err2.message ?? String(e);
}
function io(p, f) {
  try {
    return f();
  } catch (e) {
    throw new Error(`${p}: ${ioMessage(e)}`);
  }
}
function readJson(p) {
  const s = io(p, () => fs2.readFileSync(p, "utf8"));
  try {
    const v = JSON.parse(s);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("expected an object");
    return v;
  } catch (e) {
    throw new Error(`${p}: ${e.message}`);
  }
}
function shardOf(g) {
  const par = parents(g);
  const kinds = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const out2 = /* @__PURE__ */ new Map();
  for (const n of g.nodes) {
    let cur = n.id;
    let key = "_repo";
    for (let i2 = 0; i2 <= par.size; i2++) {
      const k = kinds.get(cur);
      if (k === "package" || k === "external_package") {
        key = cur;
        break;
      }
      const p = par.get(cur);
      if (p === void 0) break;
      cur = p;
    }
    out2.set(n.id, key);
  }
  return out2;
}
var shardFile = (key) => `shards/${sha256Hex(key).slice(0, 16)}.json`;
function write(p, s) {
  io(path.dirname(p), () => fs2.mkdirSync(path.dirname(p), { recursive: true }));
  io(p, () => fs2.writeFileSync(p, s));
}
var KEEP = /* @__PURE__ */ new Set(["baseline.json"]);
function writeCache(repo, header2, g) {
  const dir = path.join(repo, CACHE_DIR);
  const old = io(dir, () => fs2.existsSync(dir) ? fs2.readdirSync(dir) : []);
  for (const f of old) if (!KEEP.has(f)) io(path.join(dir, f), () => fs2.rmSync(path.join(dir, f), { recursive: true, force: true }));
  const key = shardOf(g);
  const shards = /* @__PURE__ */ new Map();
  const shard = (k) => {
    let s = shards.get(k);
    if (!s) shards.set(k, s = { key: k, nodes: [], edges: [] });
    return s;
  };
  for (const n of g.nodes) shard(key.get(n.id)).nodes.push(n);
  for (const e of g.edges) shard(key.get(e.from) ?? "_repo").edges.push(e);
  const index2 = {};
  for (const k of [...shards.keys()].sort(cmpStr)) {
    const f = shardFile(k);
    write(path.join(dir, f), pretty(shards.get(k)));
    index2[k] = f;
  }
  write(path.join(dir, "index.json"), pretty({ shards: index2 }));
  write(path.join(dir, ".gitignore"), "*\n");
  write(path.join(dir, "header.json"), pretty({
    tool: header2.tool,
    tool_version: header2.tool_version,
    schema_version: header2.schema_version,
    indexer: header2.indexer,
    lockfile_hash: header2.lockfile_hash,
    commit: header2.commit
  }));
}
function readHeader(repo) {
  const p = path.join(repo, CACHE_DIR, "header.json");
  const h = readJson(p);
  const s = (k) => {
    if (typeof h[k] !== "string") throw new Error(`${p}: missing or invalid field \`${k}\``);
    return h[k];
  };
  if (!Number.isInteger(h.schema_version)) throw new Error(`${p}: missing or invalid field \`schema_version\``);
  return {
    tool: s("tool"),
    tool_version: s("tool_version"),
    schema_version: h.schema_version,
    indexer: s("indexer"),
    lockfile_hash: s("lockfile_hash"),
    commit: s("commit")
  };
}
function readShards(repo, only) {
  const dir = path.join(repo, CACHE_DIR);
  const ip = path.join(dir, "index.json");
  const idx = readJson(ip);
  const shards = idx.shards;
  if (!shards || typeof shards !== "object" || Array.isArray(shards)) throw new Error(`${ip}: missing or invalid field \`shards\``);
  const g = newGraph();
  for (const [k, f] of Object.entries(shards).sort(([a], [b]) => cmpStr(a, b))) {
    if (only && !only.includes(k)) continue;
    if (typeof f !== "string") throw new Error(`${ip}: invalid shard file for ${k}`);
    const p = path.join(dir, f);
    const s = readJson(p);
    try {
      for (const n of arr(s.nodes, "nodes")) g.nodes.push(parseNode(n));
      for (const e of arr(s.edges, "edges")) g.edges.push(parseEdge(e));
    } catch (e) {
      throw new Error(`${p}: ${e.message}`);
    }
  }
  canonicalize(g);
  return g;
}

// src/core/boundary.ts
var BOUNDARIES = ["database", "network", "ai", "cloud", "messaging", "filesystem", "process", "environment"];
var BOUNDARY_INFO = {
  database: { label: "Database", doc: "SQL and NoSQL clients, ORMs, key-value stores, browser storage." },
  network: { label: "Network", doc: "HTTP clients and servers, sockets, fetch, WebSockets, RPC." },
  ai: { label: "AI models", doc: "LLM and model APIs." },
  cloud: { label: "Cloud & SaaS", doc: "Cloud provider SDKs and hosted APIs (payments, messaging, source hosting)." },
  messaging: { label: "Queues", doc: "Message brokers, queues, pub/sub." },
  filesystem: { label: "Filesystem", doc: "Reading and writing files and directories." },
  process: { label: "Processes", doc: "Spawning or controlling other processes and shells." },
  environment: { label: "Environment", doc: "Environment variables and secrets read at run time." }
};
var JS = /^(javascript|typescript|npm)$/;
var PY = /^(python|pip)$/;
var GO = /^(go|gomod)$/;
var RS = /^(rust|cargo)$/;
var JVM = /^(java|kotlin|maven)$/;
var CS = /^(csharp|nuget)$/;
var RULES = [
  // JavaScript / TypeScript: npm packages, node built-ins (module in quotes), and the platform's globals.
  { b: "network", lang: JS, mod: /^(node:)?(http|https|http2|net|dgram|dns|tls)(\/.*)?$/ },
  { b: "filesystem", lang: JS, mod: /^(node:)?fs(\/promises)?$/ },
  { b: "database", lang: JS, mod: /^(node:)?sqlite$/ },
  { b: "process", lang: JS, mod: /^(node:)?(child_process|cluster|worker_threads)$/ },
  { b: "network", lang: JS, pkg: /^builtins$/, name: /^(fetch|XMLHttpRequest|WebSocket|EventSource|Navigator\.sendBeacon)\b/ },
  { b: "database", lang: JS, pkg: /^builtins$/, name: /^(IDBFactory|IDBDatabase|IDBObjectStore|IDBIndex|Storage)\b/ },
  { b: "messaging", lang: JS, pkg: /^(kafkajs|amqplib|amqp-connection-manager|nats|bullmq|bull|bee-queue|@google-cloud\/pubsub|mqtt|zeromq|rhea|@azure\/service-bus)$/ },
  { b: "database", lang: JS, pkg: /^(pg|pg-promise|postgres|mysql2?|mariadb|sqlite3?|better-sqlite3|@libsql\/.*|mongodb|mongoose|redis|ioredis|@redis\/.*|@upstash\/redis|knex|sequelize|typeorm|@prisma\/client|prisma|drizzle-orm|@neondatabase\/.*|@planetscale\/.*|@supabase\/.*|kysely|dynamoose|cassandra-driver|neo4j-driver|@elastic\/elasticsearch|level|lmdb|idb|dexie|@google-cloud\/firestore|@aws-sdk\/client-dynamodb|@aws-sdk\/lib-dynamodb)$/ },
  { b: "ai", lang: JS, pkg: /^(openai|@anthropic-ai\/.*|@google\/generative-ai|@google\/genai|cohere-ai|@mistralai\/.*|groq-sdk|replicate|ollama|langchain|@langchain\/.*|ai|@ai-sdk\/.*|@huggingface\/.*|together-ai|@pinecone-database\/.*)$/ },
  { b: "cloud", lang: JS, pkg: /^(aws-sdk|@aws-sdk\/.*|@google-cloud\/.*|firebase|firebase-admin|@firebase\/.*|@azure\/.*|stripe|twilio|@sendgrid\/.*|resend|@slack\/.*|@octokit\/.*|octokit|@vercel\/.*|cloudinary|algoliasearch|@sentry\/.*)$/ },
  { b: "network", lang: JS, pkg: /^(axios|node-fetch|cross-fetch|isomorphic-fetch|got|ky|undici|superagent|request|needle|ws|socket\.io|socket\.io-client|express|fastify|koa|@koa\/.*|@hapi\/.*|hono|@grpc\/.*|graphql-request|@apollo\/.*|apollo-server.*|@trpc\/.*|nodemailer)$/ },
  { b: "filesystem", lang: JS, pkg: /^(fs-extra|graceful-fs|glob|fast-glob|chokidar|rimraf|mkdirp|tmp)$/ },
  { b: "process", lang: JS, pkg: /^(execa|cross-spawn|shelljs|zx|node-pty)$/ },
  { b: "environment", lang: JS, pkg: /^(dotenv|@dotenvx\/.*|env-var)$/ },
  // Python: the top-level package from site-packages, or the stdlib module.
  { b: "environment", lang: PY, pkg: /^os$/, name: /^(getenv|putenv|unsetenv|environ)\b/ },
  { b: "process", lang: PY, pkg: /^os$/, name: /^(system|popen|exec\w*|spawn\w*|fork|kill|_exit)$/ },
  { b: "filesystem", lang: PY, pkg: /^os$/, name: /^(open|remove|unlink|rename|replace|mkdir|makedirs|rmdir|removedirs|listdir|scandir|walk|stat|chmod|chown|symlink|link|truncate)$/ },
  { b: "filesystem", lang: PY, pkg: /^builtins$/, name: /^open$/ },
  { b: "messaging", lang: PY, pkg: /^(kafka|confluent_kafka|aiokafka|pika|aio_pika|celery|kombu|nats|paho|zmq|pulsar|dramatiq|rq)$/ },
  { b: "database", lang: PY, pkg: /^(sqlite3|dbm|shelve|psycopg|psycopg2|psycopg_pool|asyncpg|pymysql|MySQLdb|mysql|aiomysql|sqlalchemy|pymongo|motor|redis|aioredis|peewee|tortoise|elasticsearch|cassandra|neo4j|duckdb|supabase|databases|sqlmodel|pony|clickhouse_connect|chromadb|pinecone|qdrant_client|weaviate)$/ },
  { b: "ai", lang: PY, pkg: /^(openai|anthropic|cohere|mistralai|groq|langchain|langchain_\w+|langgraph|llama_index|transformers|huggingface_hub|ollama|litellm|replicate|together|vertexai)$/ },
  { b: "cloud", lang: PY, pkg: /^(boto3|botocore|aiobotocore|s3fs|azure|firebase_admin|stripe|twilio|sendgrid|slack_sdk|github|sentry_sdk)$/ },
  { b: "network", lang: PY, pkg: /^(requests|httpx|aiohttp|urllib3|urllib|http|socket|ssl|ftplib|smtplib|imaplib|poplib|xmlrpc|websocket|websockets|grpc|httplib2|fastapi|flask|starlette|tornado|sanic|paramiko|pycurl|django)$/ },
  { b: "process", lang: PY, pkg: /^(subprocess|multiprocessing|pexpect|sh|plumbum)$/ },
  { b: "filesystem", lang: PY, pkg: /^(shutil|pathlib|tempfile|glob|aiofiles|fsspec|watchdog)$/ },
  { b: "environment", lang: PY, pkg: /^(dotenv|decouple|environs)$/ },
  // Go: the stdlib package's folder, or the module path.
  { b: "environment", lang: GO, pkg: /^os$/, name: /^(Getenv|LookupEnv|Setenv|Unsetenv|Clearenv|Environ|ExpandEnv)$/ },
  { b: "process", lang: GO, pkg: /^os$/, name: /^(StartProcess|FindProcess|Exit|Process\b.*)/ },
  { b: "filesystem", lang: GO, pkg: /^(os|ioutil|fs)$/ },
  { b: "process", lang: GO, pkg: /^(exec|syscall)$/ },
  { b: "database", lang: GO, pkg: /^(sql|database\/sql|github\.com\/lib\/pq|github\.com\/jackc\/pgx.*|github\.com\/go-sql-driver\/mysql|github\.com\/mattn\/go-sqlite3|modernc\.org\/sqlite|gorm\.io\/.*|github\.com\/jmoiron\/sqlx|go\.mongodb\.org\/mongo-driver.*|github\.com\/redis\/go-redis.*|github\.com\/go-redis\/redis.*|go\.etcd\.io\/bbolt|github\.com\/dgraph-io\/badger.*|entgo\.io\/ent|github\.com\/uptrace\/bun.*)$/ },
  { b: "messaging", lang: GO, pkg: /^(github\.com\/segmentio\/kafka-go|github\.com\/confluentinc\/.*|github\.com\/IBM\/sarama|github\.com\/Shopify\/sarama|github\.com\/rabbitmq\/amqp091-go|github\.com\/streadway\/amqp|github\.com\/nats-io\/.*)$/ },
  { b: "ai", lang: GO, pkg: /^(github\.com\/sashabaranov\/go-openai|github\.com\/openai\/openai-go.*|github\.com\/anthropics\/anthropic-sdk-go.*|github\.com\/tmc\/langchaingo.*|google\.golang\.org\/genai|github\.com\/ollama\/ollama.*)$/ },
  { b: "cloud", lang: GO, pkg: /^(github\.com\/aws\/.*|cloud\.google\.com\/go.*|github\.com\/Azure\/.*|github\.com\/stripe\/.*|firebase\.google\.com\/.*)$/ },
  { b: "network", lang: GO, pkg: /^(http|net|httputil|httptest|rpc|smtp|websocket|google\.golang\.org\/grpc.*|github\.com\/gorilla\/.*|github\.com\/gin-gonic\/gin|github\.com\/labstack\/echo.*|github\.com\/gofiber\/fiber.*|github\.com\/go-chi\/chi.*|nhooyr\.io\/websocket|github\.com\/coder\/websocket|github\.com\/valyala\/fasthttp|github\.com\/go-resty\/resty.*)$/ },
  // Rust: the crate.
  { b: "network", lang: RS, pkg: /^std$/, name: /^(TcpStream|TcpListener|UdpSocket)\b/ },
  { b: "filesystem", lang: RS, pkg: /^std$/, name: /^(File|OpenOptions|DirEntry|ReadDir|read_to_string|read_dir|create_dir\w*|remove_\w+|rename|copy|metadata)\b/ },
  { b: "process", lang: RS, pkg: /^std$/, name: /^(Command|Child|exit)\b/ },
  { b: "environment", lang: RS, pkg: /^std$/, name: /^(var|var_os|vars|set_var|remove_var)$/ },
  { b: "database", lang: RS, pkg: /^(sqlx|diesel|rusqlite|tokio-postgres|postgres|mysql|mysql_async|mongodb|redis|sea-orm|sled|rocksdb|deadpool-postgres|bb8|surrealdb)$/ },
  { b: "messaging", lang: RS, pkg: /^(rdkafka|lapin|async-nats|nats|zmq)$/ },
  { b: "ai", lang: RS, pkg: /^(async-openai|ollama-rs|anthropic-sdk|genai)$/ },
  { b: "cloud", lang: RS, pkg: /^(aws-sdk-.*|aws-config|rusoto_.*|google-cloud-.*|azure_.*|async-stripe)$/ },
  { b: "network", lang: RS, pkg: /^(reqwest|hyper|ureq|surf|isahc|tokio-tungstenite|tungstenite|axum|actix-web|warp|rocket|tonic|tower-http|lettre)$/ },
  { b: "process", lang: RS, pkg: /^(duct|subprocess)$/ },
  { b: "environment", lang: RS, pkg: /^(dotenvy|dotenv|envy)$/ },
  // JVM, .NET, PHP, Ruby, Dart, C/C++: packages are less telling here, so owning types and functions decide.
  { b: "network", lang: JVM, name: /^(HttpClient|HttpRequest|HttpURLConnection|URLConnection|URL\.openConnection|Socket|ServerSocket|DatagramSocket|OkHttpClient|Call|RestTemplate|WebClient|Retrofit|Feign)\b/ },
  { b: "database", lang: JVM, name: /^(DriverManager|Connection|PreparedStatement|Statement|ResultSet|DataSource|EntityManager|JdbcTemplate|NamedParameterJdbcTemplate|MongoClient|MongoCollection|Jedis|RedisTemplate|Session\.(createQuery|save|get))\b/ },
  { b: "filesystem", lang: JVM, name: /^(Files|FileInputStream|FileOutputStream|FileReader|FileWriter|RandomAccessFile|File\.(delete|mkdirs?|createNewFile|listFiles))\b/ },
  { b: "process", lang: JVM, name: /^(ProcessBuilder|Runtime\.exec)\b/ },
  { b: "environment", lang: JVM, name: /^System\.getenv\b/ },
  { b: "network", lang: CS, name: /^(HttpClient|WebClient|HttpWebRequest|Socket|TcpClient|TcpListener|UdpClient|WebSocket|ClientWebSocket)\b/ },
  { b: "database", lang: CS, name: /^(SqlConnection|SqlCommand|NpgsqlConnection|NpgsqlCommand|MySqlConnection|SqliteConnection|DbConnection|DbCommand|DbContext|DbSet|MongoClient|IMongoCollection|ConnectionMultiplexer|IDatabase)\b/ },
  { b: "filesystem", lang: CS, name: /^(File|Directory|FileStream|FileInfo|DirectoryInfo|StreamReader|StreamWriter)\b/ },
  { b: "process", lang: CS, name: /^Process\b/ },
  { b: "environment", lang: CS, name: /^Environment\.(GetEnvironmentVariable|SetEnvironmentVariable)/ },
  { b: "database", lang: /^php$/, name: /^(PDO|PDOStatement|mysqli|mysqli_\w+|pg_\w+|Redis|MongoDB)\b/ },
  { b: "network", lang: /^php$/, name: /^(curl_\w+|fsockopen|stream_socket_client|GuzzleHttp\b.*|Http\.(get|post|put|delete))/ },
  { b: "process", lang: /^php$/, name: /^(exec|shell_exec|system|passthru|proc_open|popen)$/ },
  { b: "environment", lang: /^php$/, name: /^(getenv|putenv|env)$/ },
  { b: "filesystem", lang: /^php$/, name: /^(fopen|fwrite|fread|file_put_contents|file_get_contents|unlink|mkdir|rmdir|rename|copy|scandir)$/ },
  { b: "network", lang: /^ruby$/, name: /^(Net\.HTTP|HTTParty|Faraday|RestClient|TCPSocket|Socket)\b/ },
  { b: "database", lang: /^ruby$/, name: /^(ActiveRecord|PG|Mysql2|SQLite3|Redis|Mongo|Sequel)\b/ },
  { b: "filesystem", lang: /^ruby$/, name: /^(File|Dir|FileUtils)\b/ },
  { b: "process", lang: /^ruby$/, name: /^(Open3|Process|Kernel\.(system|spawn|exec))\b/ },
  { b: "network", lang: /^dart$/, pkg: /^(http|dio|web_socket_channel|grpc)$/ },
  { b: "database", lang: /^dart$/, pkg: /^(sqflite|drift|hive|hive_flutter|isar|shared_preferences|cloud_firestore|postgres|mongo_dart|objectbox)$/ },
  { b: "cloud", lang: /^dart$/, pkg: /^(firebase_\w+|supabase_flutter|supabase)$/ },
  { b: "network", lang: /^dart$/, name: /^(HttpClient|WebSocket|Socket|ServerSocket|HttpServer)\b/ },
  { b: "filesystem", lang: /^dart$/, name: /^(File|Directory)\b/ },
  { b: "process", lang: /^dart$/, name: /^Process\b/ },
  { b: "environment", lang: /^dart$/, name: /^Platform\.environment\b/ },
  { b: "network", lang: /^cpp$/, name: /^(socket|connect|bind|listen|accept|send|recv|sendto|recvfrom|getaddrinfo|curl_\w+)$/ },
  { b: "database", lang: /^cpp$/, name: /^(sqlite3_\w+|PQ\w+|mysql_\w+)$/ },
  { b: "filesystem", lang: /^cpp$/, name: /^(fopen|fread|fwrite|fclose|unlink|mkdir|rmdir|remove|rename|ifstream|ofstream|fstream)\b/ },
  { b: "process", lang: /^cpp$/, name: /^(system|popen|fork|execv\w*|execl\w*|posix_spawn\w*|CreateProcess\w*)$/ },
  { b: "environment", lang: /^cpp$/, name: /^(getenv|setenv|putenv|secure_getenv)$/ }
];
var GUESSES = [
  ["ai", /(openai|anthropic|llm|genai|langchain|ollama|gpt)/i],
  ["messaging", /(kafka|amqp|rabbit|nats|mqtt|pubsub|queue)/i],
  ["database", /(sql|postgres|mongo|redis|dynamo|cassandra|couch|neo4j|clickhouse|database|prisma|(^|[-_/])db($|[-_/]))/i],
  ["cloud", /((^|[-_/@])aws|azure|google-cloud|gcloud|firebase)/i],
  ["network", /(http|fetch|grpc|websocket|graphql|rest-?client)/i]
];
var matchers = (extra = {}) => BOUNDARIES.flatMap((b) => (extra[b] ?? []).map((p) => {
  const re = p.length > 2 && p.startsWith("/") && p.endsWith("/") ? new RegExp(p.slice(1, -1)) : void 0;
  return [b, re ? (s) => re.test(s) : (s) => s === p];
}));
function classify(s, extra = {}, compiled = matchers(extra)) {
  for (const [b, m] of compiled) if (m(s.pkg) || m(s.module)) return { boundary: b, basis: "policy" };
  const alt = RS.test(s.lang) ? s.pkg.replace(/_/g, "-") : s.pkg;
  for (const r of RULES) {
    if (r.lang && !r.lang.test(s.lang)) continue;
    if (r.pkg && !r.pkg.test(s.pkg) && !r.pkg.test(alt)) continue;
    if (r.mod && !r.mod.test(s.module)) continue;
    if (r.name && !r.name.test(s.name)) continue;
    return { boundary: r.b, basis: "table" };
  }
  if (["builtins", "std", "node", "core", "alloc", "stdlib"].includes(s.pkg)) return void 0;
  for (const [b, re] of GUESSES) if (re.test(s.pkg)) return { boundary: b, basis: "name" };
  return void 0;
}
function subject(n, pkg) {
  const lang = n.id.split(" ")[1] ?? "";
  const m = /^(["'`])(.*?)\1\.?(.*)$/.exec(n.name);
  return m ? { lang, pkg, module: m[2], name: m[3] } : { lang, pkg, module: pkg, name: n.name };
}
var boundaryId = (b) => `boundary:${b}`;
function classifyGraph(g, extra = {}) {
  const compiled = matchers(extra);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out2 = /* @__PURE__ */ new Map();
  for (const e of g.edges) {
    if (e.kind !== "contains") continue;
    const p = byId.get(e.from), n = byId.get(e.to);
    if (p?.kind !== "external_package" || n?.kind !== "external") continue;
    const s = subject(n, p.name);
    const c = classify(s, extra, compiled);
    if (c) out2.set(n.id, { ...c, package: p.name, module: s.module });
  }
  return out2;
}
function crossings(g, extra = {}) {
  const cls = classifyGraph(g, extra);
  const out2 = [];
  const seen = /* @__PURE__ */ new Set();
  for (const e of g.edges) {
    if (e.kind !== "call") continue;
    const to = cls.get(e.to), from = cls.get(e.from);
    if (!!to === !!from) continue;
    const [dir, local, ext, c] = to ? ["out", e.from, e.to, to] : ["in", e.to, e.from, from];
    const k = `${dir}\0${local}\0${ext}\0${e.site?.path ?? ""}\0${e.site ? `${e.site.range.start_line},${e.site.range.start_col}` : ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out2.push({ boundary: c.boundary, dir, local, external: ext, package: c.module !== c.package ? c.module : c.package, provenance: e.provenance, basis: c.basis, site: e.site });
  }
  return out2.sort((a, b) => cmpStr(a.local, b.local) || cmpStr(a.external, b.external) || cmpStr(a.dir, b.dir) || cmpStr(a.site?.path ?? "", b.site?.path ?? "") || (a.site?.range.start_line ?? 0) - (b.site?.range.start_line ?? 0));
}
function boundaryGraph(g, extra = {}) {
  const cls = classifyGraph(g, extra);
  if (!cls.size) return g;
  const nodes = [];
  const edges = [];
  const moved = new Set(cls.keys());
  const added = /* @__PURE__ */ new Map();
  for (const [ext, c] of cls) {
    const bid = boundaryId(c.boundary);
    if (!added.has(bid)) {
      const info2 = BOUNDARY_INFO[c.boundary];
      added.set(bid, { id: bid, kind: "boundary", name: info2.label, doc: info2.doc });
      edges.push({ from: REPO_ID, to: bid, kind: "contains", provenance: "resolved" });
    }
    const pid = `${bid}/${c.module}`;
    if (!added.has(pid)) {
      added.set(pid, { id: pid, kind: "external_package", name: c.module, doc: c.basis === "name" ? `Filed under ${BOUNDARY_INFO[c.boundary].label} by its package name.` : void 0 });
      edges.push({ from: bid, to: pid, kind: "contains", provenance: "resolved" });
    }
    edges.push({ from: pid, to: ext, kind: "contains", provenance: "resolved" });
  }
  const kept = /* @__PURE__ */ new Map();
  for (const e of g.edges) if (e.kind === "contains" && !moved.has(e.to)) kept.set(e.from, (kept.get(e.from) ?? 0) + 1);
  const gone = new Set(g.nodes.filter((n) => n.kind === "external_package" && !kept.get(n.id)).map((n) => n.id));
  for (const n of g.nodes) if (!gone.has(n.id)) nodes.push(n);
  nodes.push(...added.values());
  const base = g.edges.filter((e) => !(e.kind === "contains" && (moved.has(e.to) || gone.has(e.to))));
  return { schema_version: g.schema_version, nodes, edges: [...base, ...edges] };
}
function libraryNodes(g) {
  const under = /* @__PURE__ */ new Set();
  const kids = /* @__PURE__ */ new Map();
  for (const e of g.edges) if (e.kind === "contains") (kids.get(e.from) ?? kids.set(e.from, []).get(e.from)).push(e.to);
  const walk3 = (id) => {
    for (const k of kids.get(id) ?? []) if (!under.has(k)) under.add(k), walk3(k);
  };
  for (const n of g.nodes) if (n.kind === "boundary") walk3(n.id);
  return new Set(g.nodes.filter((n) => (n.kind === "external" || n.kind === "external_package") && !under.has(n.id)).map((n) => n.id));
}

// src/core/lint.ts
var POLICY_FILE = "hesperus.json";
var BASELINE_FILE = "baseline.json";
var REPORT_FILE = "report.json";
var LEVELS = ["error", "warning", "info", "off"];
var defaultPolicy = () => ({ boundaries: {}, rules: [], review: { crossings: "warning", dependencies: "info" } });
var fail2 = (what) => {
  throw new Error(`${POLICY_FILE}: ${what}`);
};
var strs = (v, f) => Array.isArray(v) && v.every((x) => typeof x === "string") ? v : fail2(`${f}: expected an array of strings`);
var bounds = (v, f) => strs(v, f).map((b) => BOUNDARIES.includes(b) ? b : fail2(`${f}: unknown boundary ${JSON.stringify(b)}; one of ${BOUNDARIES.join(", ")}`));
var level = (v, f, d) => v === void 0 ? d : LEVELS.includes(v) ? v : fail2(`${f}: one of ${LEVELS.join(", ")}`);
function parsePolicy(text) {
  const p = defaultPolicy();
  if (text === void 0) return p;
  let o;
  try {
    o = JSON.parse(text);
  } catch (e) {
    return fail2(e.message);
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) fail2("expected an object");
  if (o.boundaries !== void 0) {
    const b = o.boundaries;
    if (!b || typeof b !== "object" || Array.isArray(b)) fail2("boundaries: expected an object");
    for (const [k, v] of Object.entries(b)) {
      if (!BOUNDARIES.includes(k)) fail2(`boundaries: unknown boundary ${JSON.stringify(k)}`);
      p.boundaries[k] = strs(v, `boundaries.${k}`);
    }
  }
  if (o.rules !== void 0) {
    if (!Array.isArray(o.rules)) fail2("rules: expected an array");
    o.rules.forEach((r, i2) => {
      const f = `rules[${i2}]`;
      if (!r || typeof r !== "object") fail2(`${f}: expected an object`);
      if (r.deny === void 0 && r.allow === void 0) fail2(`${f}: needs deny or allow`);
      const severity = level(r.severity, `${f}.severity`, "error");
      if (severity === "off") return;
      p.rules.push({
        paths: r.paths === void 0 ? ["**"] : strs(r.paths, `${f}.paths`),
        deny: r.deny === void 0 ? void 0 : bounds(r.deny, `${f}.deny`),
        allow: r.allow === void 0 ? void 0 : bounds(r.allow, `${f}.allow`),
        severity,
        reason: typeof r.reason === "string" ? r.reason : void 0
      });
    });
  }
  if (o.review !== void 0) {
    const r = o.review;
    p.review = { crossings: level(r.crossings, "review.crossings", "warning"), dependencies: level(r.dependencies, "review.dependencies", "info") };
  }
  return p;
}
function glob(pattern) {
  const p = pattern.replace(/^\.\//, "").replace(/\/+$/, "");
  if (!/[*?]/.test(p)) return new RegExp(`^${esc(p)}(/.*)?$`);
  let re = "";
  for (let i2 = 0; i2 < p.length; i2++) {
    const c = p[i2];
    if (c === "*" && p[i2 + 1] === "*") {
      re += p[i2 + 2] === "/" ? "(.*/)?" : ".*";
      i2 += p[i2 + 2] === "/" ? 2 : 1;
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else re += esc(c);
  }
  return new RegExp(`^${re}$`);
}
var esc = (s) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
var crossingKey = (c) => `${c.dir} ${c.local} -> ${c.external}`;
var packageKey = (c) => `${c.boundary}:${c.package}`;
function snapshot(g, policy, commit2) {
  const cs = crossings(g, policy.boundaries);
  return { commit: commit2, crossings: uniq(cs.map(crossingKey)), packages: uniq(cs.map(packageKey)) };
}
var uniq = (xs) => [...new Set(xs)].sort(cmpStr);
var baselineToJson = (b) => pretty({ commit: b.commit, crossings: uniq(b.crossings), packages: uniq(b.packages) });
function parseBaseline(text) {
  const o = JSON.parse(text);
  const list = (v) => Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  return { commit: typeof o?.commit === "string" ? o.commit : "unknown", crossings: list(o?.crossings), packages: list(o?.packages) };
}
var SEV_ORDER = { error: 0, warning: 1, info: 2 };
function lint(g, policy, baseline) {
  const cs = crossings(g, policy.boundaries);
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name2 = (id) => byId.get(id)?.name ?? id;
  const where = (c) => byId.get(c.local)?.path ?? c.site?.path ?? "";
  const rules = policy.rules.map((r) => ({ r, res: r.paths.map(glob) }));
  const findings = [];
  const counts = {};
  const acceptedX = new Set(baseline?.crossings ?? []), acceptedP = new Set(baseline?.packages ?? []);
  const newPkgs = /* @__PURE__ */ new Set();
  for (const c of cs) {
    const n = counts[c.boundary] ?? (counts[c.boundary] = { out: 0, in: 0 });
    n[c.dir]++;
    const label = BOUNDARY_INFO[c.boundary].label;
    const at = { boundary: c.boundary, local: c.local, external: c.external, path: c.site?.path, range: c.site?.range };
    const how = c.dir === "out" ? `calls ${name2(c.external)}` : `is called by ${name2(c.external)}`;
    const p = where(c);
    for (const { r, res } of rules) {
      if (!res.some((re) => re.test(p))) continue;
      const denied = r.deny?.includes(c.boundary) || r.allow !== void 0 && !r.allow.includes(c.boundary);
      if (!denied) continue;
      findings.push({
        ...at,
        rule: "boundary-denied",
        severity: r.severity,
        key: crossingKey(c),
        message: `${name2(c.local)} ${how} (${label}); ${p} may not reach ${label}${r.reason ? `: ${r.reason}` : "."}`
      });
      break;
    }
    if (!baseline) continue;
    if (policy.review.dependencies !== "off" && !acceptedP.has(packageKey(c)) && !newPkgs.has(packageKey(c))) {
      newPkgs.add(packageKey(c));
      findings.push({
        ...at,
        rule: "new-dependency",
        severity: policy.review.dependencies,
        key: packageKey(c),
        message: `New dependency on ${c.package} (${label}), first reached by ${name2(c.local)}.`
      });
    }
    if (policy.review.crossings !== "off" && !acceptedX.has(crossingKey(c)))
      findings.push({
        ...at,
        rule: "new-crossing",
        severity: policy.review.crossings,
        key: crossingKey(c),
        message: `New crossing into ${label}: ${name2(c.local)} ${how}${c.provenance === "resolved" ? "" : ` (${c.provenance})`}.`
      });
  }
  const now = new Set(cs.map(crossingKey));
  const removed = baseline ? baseline.crossings.filter((k) => !now.has(k)) : [];
  findings.sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || cmpStr(a.path ?? "", b.path ?? "") || (a.range?.start_line ?? 0) - (b.range?.start_line ?? 0) || cmpStr(a.rule, b.rule) || cmpStr(a.key, b.key));
  return { findings, crossings: cs, removed, counts };
}
function accept(b, keys) {
  const xs = new Set(b.crossings), ps = new Set(b.packages);
  for (const k of keys) (k.startsWith("out ") || k.startsWith("in ") ? xs : ps).add(k);
  return { ...b, crossings: [...xs], packages: [...ps] };
}
function reportToJson(g, r, stale) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const name2 = (id) => byId.get(id)?.name ?? id;
  return pretty({
    ...stale ? { stale } : {},
    summary: {
      errors: r.findings.filter((f) => f.severity === "error").length,
      warnings: r.findings.filter((f) => f.severity === "warning").length,
      info: r.findings.filter((f) => f.severity === "info").length,
      removed: r.removed.length
    },
    boundaries: Object.fromEntries(BOUNDARIES.filter((b) => r.counts[b]).map((b) => [b, r.counts[b]])),
    findings: r.findings.map((f) => ({
      rule: f.rule,
      severity: f.severity,
      message: f.message,
      boundary: f.boundary,
      ...f.path ? { path: f.path, line: (f.range?.start_line ?? 0) + 1, column: (f.range?.start_col ?? 0) + 1 } : {},
      local: name2(f.local),
      external: name2(f.external),
      key: f.key
    })),
    removed: r.removed
  });
}

// src/mcp.ts
var import_node_child_process3 = require("node:child_process");
var readline = __toESM2(require("node:readline"));
var path9 = __toESM2(require("node:path"));

// src/mapapp.ts
var fs3 = __toESM2(require("node:fs"));
var path2 = __toESM2(require("node:path"));
var MAP_URI = "ui://hesperus/map";
var MAP_MIME = "text/html;profile=mcp-app";
var APP_SDK = "https://unpkg.com/@modelcontextprotocol/ext-apps@1.7.5/dist/src/app-with-deps.js";
var MAP_CSP = { resourceDomains: ["https://unpkg.com"] };
function media(name2) {
  for (const d of [path2.join(__dirname, "media"), path2.join(__dirname, "..", "media")]) {
    const p = path2.join(d, name2);
    if (fs3.existsSync(p)) return fs3.readFileSync(p, "utf8");
  }
  throw new Error(`media/${name2} not found beside ${__dirname}`);
}
var THEME = `:root { color-scheme: light dark;
  --vscode-editor-background: #ffffff; --vscode-editor-foreground: #1f2328; --vscode-foreground: #1f2328; --vscode-descriptionForeground: #656d76;
  --vscode-font-family: system-ui, sans-serif; --vscode-editor-font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  --vscode-charts-blue: #1a73e8; --vscode-charts-yellow: #b58900; --vscode-charts-red: #d1242f; --vscode-charts-green: #1a7f37; --vscode-charts-orange: #bc4c00; --vscode-charts-purple: #8250df;
  --vscode-errorForeground: #d1242f; --vscode-editorError-foreground: #d1242f; --vscode-editorWarning-foreground: #9a6700; --vscode-editorInfo-foreground: #0969da;
  --vscode-editorWidget-background: #f6f8fa; --vscode-editorWidget-border: #d0d7de; --vscode-widget-shadow: rgba(0,0,0,.16); --vscode-focusBorder: #0969da;
  --vscode-editorHoverWidget-background: #ffffff; --vscode-editorHoverWidget-foreground: #1f2328; --vscode-editorHoverWidget-border: #d0d7de;
  --vscode-toolbar-hoverBackground: rgba(0,0,0,.06); --vscode-panel-border: #d0d7de; --vscode-icon-foreground: #424a53;
  --vscode-symbolIcon-variableForeground: #0969da; --vscode-symbolIcon-functionForeground: #8250df; --vscode-symbolIcon-enumeratorMemberForeground: #1a7f37; }
@media (prefers-color-scheme: dark) { :root {
  --vscode-editor-background: #1e1e1e; --vscode-editor-foreground: #d4d4d4; --vscode-foreground: #cccccc; --vscode-descriptionForeground: #9d9d9d;
  --vscode-charts-blue: #3794ff; --vscode-charts-yellow: #cca700; --vscode-charts-red: #f14c4c; --vscode-charts-green: #89d185; --vscode-charts-orange: #d18616; --vscode-charts-purple: #b180d7;
  --vscode-errorForeground: #f48771; --vscode-editorError-foreground: #f14c4c; --vscode-editorWarning-foreground: #cca700; --vscode-editorInfo-foreground: #3794ff;
  --vscode-editorWidget-background: #252526; --vscode-editorWidget-border: #454545; --vscode-widget-shadow: rgba(0,0,0,.36); --vscode-focusBorder: #007fd4;
  --vscode-editorHoverWidget-background: #252526; --vscode-editorHoverWidget-foreground: #cccccc; --vscode-editorHoverWidget-border: #454545;
  --vscode-toolbar-hoverBackground: rgba(90,93,94,.31); --vscode-panel-border: #2b2b2b; --vscode-icon-foreground: #c5c5c5;
  --vscode-symbolIcon-variableForeground: #75beff; --vscode-symbolIcon-functionForeground: #b180d7; --vscode-symbolIcon-enumeratorMemberForeground: #75beff; } }
html, body { height: 560px !important; }`;
var BODY = `<svg id="view" xmlns="http://www.w3.org/2000/svg"><g id="scene"></g><g id="labels"></g></svg>
<div id="tools"><button id="auto" title="Semantic Zoom: zooming in opens boxes" aria-pressed="true"><svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3M5 7h4M7 5v4"/></svg></button><span class="sep"></span><button id="out" title="Zoom Out"><svg viewBox="0 0 16 16"><path d="M3.5 8h9"/></svg></button><span id="zoom">100%</span><button id="in" title="Zoom In"><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5v9"/></svg></button><button id="fit" title="Fit to Window"><svg viewBox="0 0 16 16"><path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/></svg></button></div>
<div id="msg">Loading\u2026</div><div id="tip" hidden></div>`;
var SHIM = `window.__hq = []; let __hs = {};
window.acquireVsCodeApi = () => ({ getState: () => __hs, setState: (s) => { __hs = s; }, postMessage: (m) => (window.__hsend ? window.__hsend(m) : window.__hq.push(m)) });`;
var BRIDGE = `import { App } from "${APP_SDK}";
const app = new App({ name: "Hesperus map", version: "1" });
const deliver = (data) => window.dispatchEvent(new MessageEvent("message", { data }));
const show = (r, extra = {}) => {
  const sc = r && r.structuredContent;
  if (sc && sc.layout) deliver({ type: "layout", layout: sc.layout, hidden: [], ...extra });
  else deliver({ type: "status", status: { state: "error", detail: (r && r.content && r.content[0] && r.content[0].text) || "No map in that result." } });
};
const call = (args) => app.callServerTool({ name: "hesperus_map", arguments: args });
window.__hsend = async (m) => {
  try {
    if (m.type === "toggle") show(await call({ toggle: m.id }), { anchor: m.id });
    else if (m.type === "zoom") show(await call({ open: m.open || [], close: m.close || [] }), { anchor: m.anchor, seq: m.seq });
    else if (m.type === "open") await app.callServerTool({ name: "hesperus_open", arguments: { id: m.id } });
  } catch (e) { deliver({ type: "status", status: { state: "error", detail: String(e && e.message || e) } }); }
};
app.ontoolresult = (r) => show(r);
await app.connect();
for (const m of window.__hq.splice(0)) window.__hsend(m);`;
var safe = (s) => s.replace(/<\/script/gi, "<\\/script");
function mapHtml() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Hesperus map</title>
<style>${THEME}
${media("graph.css")}</style></head><body>${BODY}
<script>${SHIM}</script>
<script>${safe(media("graph.js"))}</script>
<script type="module">${BRIDGE}</script></body></html>`;
}

// src/layout.ts
var MAX_WIRES = 200;
var CHAR = 6.6;
var PAD = 40;
var MIN_W = 72;
var MAX_W = 260;
var LEAF_H = 26;
var EXT_H = 14;
var MAX_CHARS = Math.floor((MAX_W - PAD) / CHAR);
var elkLoaded;
function elkClass() {
  try {
    elkLoaded ??= require("elkjs/lib/elk.bundled.js");
  } catch {
    throw new Error("the layout library elkjs is not installed; run `npm ci` in Hesperus's folder");
  }
  return elkLoaded;
}
function elk() {
  const Elk = elkClass();
  const g = globalThis;
  const self2 = g.self;
  if (self2 === void 0) return new Elk();
  delete g.self;
  try {
    return new Elk();
  } finally {
    g.self = self2;
  }
}
var width = (n) => Math.min(MAX_W, Math.max(MIN_W, Math.ceil(n.name.length * CHAR) + PAD + 14));
async function layout(graph, view2, opts = {}) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parent = /* @__PURE__ */ new Map();
  const hasKids = /* @__PURE__ */ new Set();
  for (const e of graph.edges)
    if (e.kind === "contains") {
      parent.set(e.to, e.from);
      hasKids.add(e.from);
    }
  for (const gr of view2.groups) {
    const what = gr.id.endsWith("#ext") ? "Packages outside the repo." : gr.id.endsWith("#solo") ? "No resolved calls to or from their siblings." : "Siblings grouped by their longest chain of resolved callers inside the parent; cycles share a layer.";
    const doc = `View grouping, not code structure. ${what}
${gr.members.length} children.`;
    byId.set(gr.id, { id: gr.id, kind: "tier", name: gr.name, doc });
    hasKids.add(gr.id);
    parent.set(gr.id, gr.parent);
    for (const m of gr.members) parent.set(m, gr.id);
  }
  const visible = new Set(view2.nodes);
  const up = (id) => {
    let p = parent.get(id);
    while (p !== void 0 && !visible.has(p)) p = parent.get(p);
    return p;
  };
  const kids = /* @__PURE__ */ new Map();
  const roots = [];
  for (const id of [...view2.nodes].sort(cmpStr)) {
    const p = up(id);
    if (p) {
      if (!kids.has(p)) kids.set(p, []);
      kids.get(p).push(id);
    } else roots.push(id);
  }
  const mk = (id) => {
    const ch = kids.get(id);
    const node2 = byId.get(id);
    const pin = roles.has(id) && !up(id) ? { "elk.layered.layering.layerConstraint": roles.get(id) === "entry" ? "FIRST" : "LAST" } : {};
    if (ch)
      return { id, children: ch.map(mk), layoutOptions: { "elk.padding": "[top=38,left=12,bottom=12,right=12]", ...pin } };
    const ext = stubs.get(id);
    if (ext) {
      const text = Math.ceil(ext.map((x) => x.name).join(", ").length * CHAR) + 30;
      return { id, width: Math.max(node2 ? width(node2) : MIN_W, Math.min(MAX_W, text)), height: LEAF_H + EXT_H };
    }
    return { id, width: node2 ? width(node2) : MIN_W, height: LEAF_H, ...roles.has(id) ? { layoutOptions: pin } : {} };
  };
  const outsideNode = (id) => ["external_package", "external", "boundary"].includes(byId.get(id)?.kind ?? "");
  const roles = /* @__PURE__ */ new Map();
  if (opts.flow) {
    const called = /* @__PURE__ */ new Set(), calls2 = /* @__PURE__ */ new Set();
    for (const r of view2.rollups) {
      if (r.kind !== "call" && r.kind !== "override") continue;
      called.add(r.to);
      calls2.add(r.from);
    }
    for (const id of view2.nodes) {
      if (outsideNode(id)) roles.set(id, "sink");
      else if (calls2.has(id) && !called.has(id)) roles.set(id, "entry");
    }
  }
  const byPair = /* @__PURE__ */ new Map();
  const drawn = new Set(view2.nodes);
  for (const r of view2.rollups) {
    if (!drawn.has(r.from) || !drawn.has(r.to)) continue;
    const k = cmpStr(r.from, r.to) < 0 ? r.from + "\0" + r.to : r.to + "\0" + r.from;
    if (!byPair.has(k)) byPair.set(k, []);
    byPair.get(k).push(r);
  }
  const pairs = /* @__PURE__ */ new Map();
  for (const [k, rs] of byPair) {
    const [a, b] = k.split("\0");
    const score = (from2) => rs.reduce((s, r) => s + (r.from === from2 ? (r.kind === "flow" ? 1 : 1e6) * r.weight : 0), 0);
    const [from, to] = score(b) > score(a) ? [b, a] : [a, b];
    pairs.set(from + "\0" + to, rs.sort((x, y) => cmpStr(x.kind, y.kind) || (x.from === from ? 0 : 1) - (y.from === from ? 0 : 1)));
  }
  let omitted = 0;
  if (pairs.size > MAX_WIRES) {
    const weight = (rs) => rs.reduce((s, r) => s + r.weight, 0);
    const first2 = (rs) => opts.keep && rs.some(opts.keep) ? 1 : 0;
    const keep = [...pairs].sort(([ka, a], [kb, b]) => first2(b) - first2(a) || weight(b) - weight(a) || cmpStr(ka, kb)).slice(0, MAX_WIRES);
    omitted = pairs.size - keep.length;
    pairs.clear();
    for (const [k, rs] of keep) pairs.set(k, rs);
  }
  const bounded = (id) => {
    for (let p = id; p !== void 0; p = parent.get(p)) if (byId.get(p)?.kind === "boundary") return true;
    return false;
  };
  const outside = (id) => ["external_package", "external"].includes(byId.get(id)?.kind ?? "") && !bounded(id);
  const stubs = /* @__PURE__ */ new Map();
  const keys = [...pairs.keys()].sort(cmpStr).filter((k) => {
    const [from, to] = k.split("\0");
    if (opts.flow || outside(from) === outside(to)) return true;
    const [inner, ext] = outside(to) ? [from, to] : [to, from];
    if (kids.has(inner)) return true;
    if (!stubs.has(inner)) stubs.set(inner, []);
    stubs.get(inner).push({ id: ext, name: byId.get(ext).name, rollups: pairs.get(k) });
    return false;
  });
  for (const ss of stubs.values()) ss.sort((a, b) => cmpStr(a.name, b.name) || cmpStr(a.id, b.id));
  const chain2 = (id) => {
    const out3 = [];
    for (let p = up(id); p; p = up(p)) out3.push(p);
    return out3;
  };
  const elkEdges = /* @__PURE__ */ new Map();
  keys.forEach((k, i2) => {
    const [from, to] = k.split("\0");
    const up2 = new Set(chain2(from));
    const lca = chain2(to).find((p) => up2.has(p) && p !== from && p !== to) ?? "root";
    if (!elkEdges.has(lca)) elkEdges.set(lca, []);
    elkEdges.get(lca).push({ id: `e${i2}`, sources: [from], targets: [to] });
  });
  const attach = (n) => {
    const es = elkEdges.get(n.id);
    if (es) n.edges = es;
    n.children?.forEach(attach);
  };
  const root = {
    id: "root",
    children: roots.map(mk),
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.randomSeed": "1",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      // Orthogonal wires read like a circuit: parallel runs, few crossings, no loops around the outside.
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.spacing.nodeNode": "18",
      "elk.layered.spacing.nodeNodeBetweenLayers": "56",
      "elk.spacing.edgeNode": "14",
      "elk.spacing.edgeEdge": "7",
      "elk.layered.spacing.edgeEdgeBetweenLayers": "7",
      "elk.layered.spacing.edgeNodeBetweenLayers": "14",
      // Each wire keeps its own port, so every line can be followed end to end.
      "elk.layered.mergeEdges": "true",
      // Sorted input order breaks ties, so expanding one box moves its neighbours as little as possible.
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      // Network-simplex placement is ~25x slower on repo-sized views.
      "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF"
    }
  };
  attach(root);
  const out2 = await elk().layout(root);
  const boxes = [];
  const origin = /* @__PURE__ */ new Map([["root", { x: 0, y: 0 }]]);
  const routed = /* @__PURE__ */ new Map();
  const walk3 = (n, ox, oy) => {
    for (const e of n.edges ?? []) routed.set(e.id, e);
    for (const c of n.children ?? []) {
      const x = ox + (c.x ?? 0), y = oy + (c.y ?? 0);
      const node2 = byId.get(c.id);
      origin.set(c.id, { x, y });
      if (node2)
        boxes.push({ id: c.id, x, y, w: c.width ?? 0, h: c.height ?? 0, node: node2, container: !!c.children, expandable: hasKids.has(c.id), ...n.id === "root" ? {} : { parent: n.id }, ...stubs.has(c.id) ? { ext: stubs.get(c.id) } : {}, ...roles.has(c.id) ? { role: roles.get(c.id) } : {} });
      walk3(c, x, y);
    }
  };
  walk3(out2, 0, 0);
  const pos = new Map(boxes.map((b) => [b.id, b]));
  const wires = keys.flatMap((k, i2) => {
    const [from, to] = k.split("\0");
    const a = pos.get(from), b = pos.get(to);
    if (!a || !b) return [];
    const e = routed.get(`e${i2}`);
    const s = e?.sections?.[0];
    const o = origin.get(e?.container ?? "root") ?? { x: 0, y: 0 };
    const points = s ? [s.startPoint, ...s.bendPoints ?? [], s.endPoint].map((q) => ({ x: o.x + q.x, y: o.y + q.y })) : [{ x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }];
    const labels = /* @__PURE__ */ new Set();
    for (const r of pairs.get(k)) if (r.kind === "transition") for (const i3 of r.edges) {
      const l = graph.edges[i3]?.label;
      if (l !== void 0) labels.add(l);
    }
    return [{ from, to, rollups: pairs.get(k), points, labels: [...labels].sort(cmpStr) }];
  });
  boxes.sort((a, b) => cmpStr(a.id, b.id));
  return { width: out2.width ?? 0, height: out2.height ?? 0, boxes, wires, omitted };
}

// src/picture.ts
function merge(into, f) {
  const worse = (a, b) => ["error", "warning", "info"].indexOf(a) <= ["error", "warning", "info"].indexOf(b);
  if (!into) return { severity: f.severity, notes: [...f.notes] };
  return { severity: worse(into.severity, f.severity) ? into.severity : f.severity, notes: [.../* @__PURE__ */ new Set([...into.notes, ...f.notes])] };
}
var MAX_BOXES = 500;
async function boundaryPicture(g, policy, report, budget = OVERVIEW_NODES, open) {
  const shown = boundaryGraph(g, policy.boundaries);
  const opts = { flow: true };
  const ids = new Set(shown.nodes.map((n) => n.id));
  const expanded = open ? new Set([...open].filter((id) => ids.has(id) || isGroup(id))) : overview(shown, budget, opts);
  const all = view(shown, expanded, opts);
  if (all.nodes.length > MAX_BOXES) throw new Error(`that view would draw ${all.nodes.length} boxes; the limit is ${MAX_BOXES}`);
  const v = withoutUnindexed(shown, withoutNodes(all, libraryNodes(shown)));
  const flags2 = /* @__PURE__ */ new Map();
  for (const f of report?.findings ?? []) {
    const [from, to] = f.key.startsWith("in ") ? [f.external, f.local] : [f.local, f.external];
    const k = `${from}\0${to}`;
    flags2.set(k, merge(flags2.get(k), { severity: f.severity, notes: [f.message] }));
  }
  const flagsOf = (r) => r.kind === "call" ? r.edges.map((i2) => flags2.get(`${shown.edges[i2].from}\0${shown.edges[i2].to}`)).filter((f) => !!f) : [];
  const laid = await layout(shown, v, { flow: true, keep: (r) => flagsOf(r).length > 0 });
  const boxes = new Map(laid.boxes.map((b) => [b.id, b]));
  for (const w of laid.wires)
    for (const r of w.rollups)
      for (const f of flagsOf(r)) {
        w.flag = merge(w.flag, f);
        for (const id of [w.from, w.to]) {
          const b = boxes.get(id);
          if (b) b.flag = merge(b.flag, f);
        }
      }
  return { ...laid, open: [...expanded].sort(), graph: shown };
}

// src/service.ts
var fs9 = __toESM2(require("node:fs"));
var path8 = __toESM2(require("node:path"));

// src/engine.ts
var import_node_child_process = require("node:child_process");

// src/core/scip.ts
var ROLE_DEFINITION = 1;
var PLAIN = /^[A-Za-z0-9_+\-$]+$/;
var esc2 = (s) => PLAIN.test(s) ? s : "`" + s.replace(/`/g, "``") + "`";
function externalSymbol(language, pkg, names) {
  const ns = names.length ? names : ["?"];
  return `lsp ${language} ${pkg.replace(/ /g, "  ") || "?"} . ${ns.slice(0, -1).map((n) => esc2(n) + "#").join("")}${esc2(ns[ns.length - 1])}(0).`;
}
var KIND_FIELD = 15;
var CONSTANT_KINDS = [8, 12];
var CALLABLE_KINDS = [9, 17, 26, 66, 67, 80];
var u = (x) => x >>> 0;
function typed(s, m) {
  if (m) return { start_line: u(m.start_line), start_col: u(m.start_character), end_line: u(m.end_line), end_col: u(m.end_character) };
  if (s) return { start_line: u(s.line), start_col: u(s.start_character), end_line: u(s.line), end_col: u(s.end_character) };
  return void 0;
}
function parseRange2(r) {
  if (r.length === 3) return { start_line: u(r[0]), start_col: u(r[1]), end_line: u(r[0]), end_col: u(r[2]) };
  if (r.length === 4) return { start_line: u(r[0]), start_col: u(r[1]), end_line: u(r[2]), end_col: u(r[3]) };
  return void 0;
}
var occRange = (o) => typed(o.single_line_range, o.multi_line_range) ?? parseRange2(o.range);
var occEnclosing = (o) => typed(o.single_line_enclosing_range, o.multi_line_enclosing_range) ?? parseRange2(o.enclosing_range);
function merge2(indexes) {
  const out2 = { documents: [], external_symbols: [] };
  for (const i2 of indexes) {
    out2.documents.push(...i2.documents);
    out2.external_symbols.push(...i2.external_symbols);
  }
  out2.documents.sort((a, b) => cmpStr(a.relative_path, b.relative_path));
  out2.external_symbols.sort((a, b) => cmpStr(a.symbol, b.symbol));
  return out2;
}
var prefix = (s, orig, n) => Array.from(orig).slice(0, s.ends[n - 1]).join("");
var SUFFIX = { "/": "namespace", "#": "type", ".": "term", ":": "meta", "!": "macro" };
function parseSymbol(s) {
  if (!s || s.startsWith("local ")) return void 0;
  const b = Array.from(s);
  const parts2 = [];
  let i2 = 0;
  while (parts2.length < 4) {
    let cur = "";
    for (; ; ) {
      if (i2 >= b.length) return void 0;
      if (b[i2] === " ") {
        if (b[i2 + 1] === " ") {
          cur += " ";
          i2 += 2;
          continue;
        }
        i2 += 1;
        break;
      }
      cur += b[i2++];
    }
    parts2.push(cur);
  }
  const base = i2;
  const rest2 = b.slice(i2);
  const descriptors = [];
  const ends = [];
  let j = 0;
  while (j < rest2.length) {
    let name2 = "";
    if (rest2[j] === "[" || rest2[j] === "(") {
      const close = rest2[j] === "[" ? "]" : ")";
      j++;
      while (j < rest2.length && rest2[j] !== close) name2 += rest2[j++];
      j++;
      descriptors.push({ name: name2, kind: close === "]" ? "type_param" : "parameter" });
      ends.push(base + j);
      continue;
    }
    if (rest2[j] === "`") {
      j++;
      while (j < rest2.length) {
        if (rest2[j] === "`") {
          if (rest2[j + 1] === "`") {
            name2 += "`";
            j += 2;
            continue;
          }
          j++;
          break;
        }
        name2 += rest2[j++];
      }
    } else {
      while (j < rest2.length && !"/#.:!(".includes(rest2[j])) name2 += rest2[j++];
    }
    let kind;
    const c = rest2[j];
    if (c === "(") {
      while (j < rest2.length && rest2[j] !== ")") j++;
      j++;
      kind = "method";
    } else if (c !== void 0 && SUFFIX[c]) kind = SUFFIX[c];
    else return void 0;
    j++;
    descriptors.push({ name: name2, kind });
    ends.push(base + j);
  }
  return { package: parts2[2], descriptors, ends };
}

// src/core/bridge.ts
var BRIDGE_TOOL = { name: "editor-lsp", version: "4" };
function byteCol(lines, p) {
  const l = lines[p.line] ?? "";
  return /[^\x00-\x7f]/.test(l) ? Buffer.byteLength(l.slice(0, p.character), "utf8") : p.character;
}
var size = (r) => (r.end.line - r.start.line) * 1e6 + (r.end.character - (r.end.line === r.start.line ? r.start.character : 0));
var posKey = (a, b) => a.line - b.line || a.character - b.character;
function descriptor(s, ordinal) {
  const n = esc2(s.name);
  if (s.shape === "namespace") return `${n}/`;
  if (s.shape === "type") return `${n}#`;
  if (s.shape === "method") return `${n}(${ordinal}).`;
  return `${n}.`;
}
function split(s) {
  const parts2 = s.name.split("::").filter((p) => p !== "");
  if (parts2.length < 2 || s.shape === "namespace") return { owners: [], leaf: s };
  return { owners: parts2.slice(0, -1), leaf: { ...s, name: parts2[parts2.length - 1] } };
}
function walk(files, texts) {
  const out2 = { defs: [], infos: /* @__PURE__ */ new Map(), byFile: /* @__PURE__ */ new Map(), entries: [] };
  const seen = /* @__PURE__ */ new Map();
  for (const f of files) {
    const lines = texts.get(f.path);
    const occs = [];
    const infos = [];
    const base = `lsp ${f.language} workspace . ${f.path.split("/").map((p) => esc2(p) + "/").join("")}`;
    const visit2 = (list, prefix2, parent, qprefix) => {
      const ordinals = /* @__PURE__ */ new Map();
      for (const raw of [...list].sort((a, b) => posKey(a.selection.start, b.selection.start) || cmpStr(a.name, b.name))) {
        const { owners, leaf } = split(raw);
        let pre = prefix2, par = parent, qpre = qprefix;
        for (const o of owners) {
          pre += `${esc2(o)}#`;
          qpre += `${esc2(o)}#`;
          par = pre;
        }
        const key = `${pre}\0${leaf.shape}\0${leaf.name}`;
        const k = ordinals.get(key) ?? 0;
        ordinals.set(key, k + 1);
        const id = pre + descriptor(leaf, k);
        const sel = raw.selection;
        const occ = { symbol: id, symbol_roles: ROLE_DEFINITION, ...span(lines, sel, raw.range) };
        const old = seen.get(id);
        if (old) {
          if (size(raw.range) > old.size) Object.assign(old.occ, occ), old.def.selection = sel, old.size = size(raw.range);
          continue;
        }
        const info2 = { symbol: id, documentation: [], relationships: [], kind: leaf.kind, display_name: leaf.name, enclosing_symbol: par };
        const entry = { occ, def: { id, path: f.path, selection: sel, shape: leaf.shape }, size: size(raw.range), qual: qpre + descriptor(leaf, 0), shape: leaf.shape, info: info2 };
        seen.set(id, entry);
        out2.entries.push(entry);
        occs.push(occ);
        infos.push(info2);
        out2.defs.push(seen.get(id).def);
        if (leaf.shape === "namespace" || leaf.shape === "type") visit2(raw.children, id, id, qpre + descriptor(leaf, 0));
      }
    };
    visit2(f.symbols, base, "", "");
    out2.byFile.set(f.path, occs);
    out2.infos.set(f.path, infos);
  }
  return out2;
}
function span(lines, s, enclosing) {
  const arr2 = (r) => {
    const a = byteCol(lines, r.start), b = byteCol(lines, r.end);
    return r.start.line === r.end.line ? [r.start.line, a, b] : [r.start.line, a, r.end.line, b];
  };
  return { range: arr2(s), enclosing_range: enclosing ? arr2(enclosing) : [] };
}
async function pool(xs, n, fn) {
  const out2 = new Array(xs.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => {
    for (let i2 = next++; i2 < xs.length; i2 = next++) out2[i2] = await fn(xs[i2]);
  }));
  return out2;
}
var sameSpan = (a, b) => posKey(a.start, b.start) === 0 && posKey(a.end, b.end) === 0;
function unify(w) {
  const groups = /* @__PURE__ */ new Map();
  for (const e of w.entries) (groups.get(e.qual) ?? groups.set(e.qual, []).get(e.qual)).push(e);
  const alias = /* @__PURE__ */ new Map();
  for (const g of groups.values()) {
    if (g.length !== 2 || g[0].def.path === g[1].def.path || g[0].shape !== g[1].shape) continue;
    const whole = g[0].shape === "type" || g[0].shape === "namespace";
    const [a, b] = [...g].sort((x, y) => (whole ? y.size - x.size : x.size - y.size) || cmpStr(x.def.id, y.def.id));
    alias.set(b.def.id, a.def.id);
  }
  if (!alias.size) return;
  const olds = [...alias.keys()].sort((x, y) => y.length - x.length || cmpStr(x, y));
  const to = (id) => {
    for (const o of olds) if (id.startsWith(o)) return alias.get(o) + id.slice(o.length);
    return id;
  };
  for (const e of w.entries) {
    e.occ.symbol = e.def.id = e.info.symbol = to(e.def.id);
    if (e.info.enclosing_symbol) e.info.enclosing_symbol = to(e.info.enclosing_symbol);
  }
  for (const [path11, infos] of w.infos) {
    const seen = /* @__PURE__ */ new Set();
    w.infos.set(path11, infos.filter((i2) => !seen.has(i2.symbol) && seen.add(i2.symbol)));
  }
}
var within = (p, s) => posKey(s.start, p) <= 0 && posKey(p, s.end) <= 0;
async function bridge(files, refsOf, opts = {}) {
  const sorted = [...files].sort((a, b) => cmpStr(a.path, b.path));
  const texts = new Map(sorted.map((f) => [f.path, f.text.split("\n")]));
  const w = walk(sorted, texts);
  if (opts.unify) unify(w);
  const concurrency = opts.concurrency ?? 8;
  const asked = w.defs.map((d, i2) => ({ d, i: i2 })).filter(({ d }) => d.shape === "method" || d.shape === "term");
  const refs = w.defs.map(() => []);
  let done = 0;
  await pool(asked, concurrency, async ({ d, i: i2 }) => void (refs[i2] = await refsOf(d, ++done, asked.length)));
  const covered = /* @__PURE__ */ new Set();
  const key = (path11, p) => `${path11}\0${p.line}:${p.character}`;
  w.defs.forEach((d, i2) => {
    for (const r of refs[i2]) {
      const lines = texts.get(r.path);
      const occs = w.byFile.get(r.path);
      if (!lines || !occs || r.path === d.path && sameSpan(r.span, d.selection)) continue;
      occs.push({ symbol: d.id, symbol_roles: 0, ...span(lines, r.span) });
      covered.add(key(r.path, r.span.start));
    }
  });
  const { sites, definitionsOf } = opts;
  if (sites && definitionsOf) {
    const byPath = /* @__PURE__ */ new Map();
    for (const d of w.defs) (byPath.get(d.path) ?? byPath.set(d.path, []).get(d.path)).push(d);
    const todo = sorted.flatMap((f) => sites(f).filter((s) => !covered.has(key(f.path, s.start))).map((s) => ({ path: f.path, site: s })));
    const found = await pool(todo, concurrency, (t) => definitionsOf(t.path, t.site.start));
    const lang = new Map(sorted.map((f) => [f.path, f.language]));
    todo.forEach((t, i2) => {
      const inside = found[i2].filter((l) => "path" in l);
      const hit = inside.map((l) => (byPath.get(l.path) ?? []).find((d) => within(l.span.start, d.selection))).find((d) => d !== void 0);
      const ext = inside.length ? void 0 : found[i2].find((l) => "package" in l);
      const symbol2 = hit?.id ?? (ext && externalSymbol(lang.get(t.path), ext.package, ext.names));
      if (symbol2) w.byFile.get(t.path).push({ symbol: symbol2, symbol_roles: 0, ...span(texts.get(t.path), t.site) });
    });
  }
  return {
    metadata: { version: 0, tool_info: { name: BRIDGE_TOOL.name, version: BRIDGE_TOOL.version, arguments: [] }, project_root: "", text_document_encoding: 1 },
    documents: sorted.map((f) => ({
      relative_path: f.path,
      language: f.language,
      text: "",
      position_encoding: 1,
      occurrences: dedupe(w.byFile.get(f.path)),
      symbols: w.infos.get(f.path).sort((a, b) => cmpStr(a.symbol, b.symbol))
    })),
    external_symbols: []
  };
}
var startOf = (o) => [o.range[0], o.range[1]];
function dedupe(occs) {
  const key = (o) => `${startOf(o).join(",")}\0${o.symbol}\0${o.symbol_roles}`;
  const m = /* @__PURE__ */ new Map();
  for (const o of occs) if (!m.has(key(o))) m.set(key(o), o);
  return [...m.values()].sort((a, b) => {
    const x = startOf(a), y = startOf(b);
    return x[0] - y[0] || x[1] - y[1] || cmpStr(a.symbol, b.symbol) || a.symbol_roles - b.symbol_roles;
  });
}

// src/headless.ts
var fs4 = __toESM2(require("node:fs"));
var path3 = __toESM2(require("node:path"));
var HEADLESS_TOOL = { name: "headless", version: "1" };
var ASCII = /^[\x00-\x7f]*$/;
var utf16 = (lines, line, col2) => {
  const s = lines[line] ?? "";
  return ASCII.test(s) ? Math.min(col2, s.length) : Buffer.from(s, "utf8").subarray(0, col2).toString("utf8").length;
};
function spanOf(lines, r) {
  return { start: { line: r.start_line, character: utf16(lines, r.start_line, r.start_col) }, end: { line: r.end_line, character: utf16(lines, r.end_line, r.end_col) } };
}
var before = (a, b) => a.start_line - b.start_line || a.start_col - b.start_col;
var within2 = (inner, outer) => before(outer, inner) <= 0 && (inner.end_line < outer.end_line || inner.end_line === outer.end_line && inner.end_col <= outer.end_col);
function outline(lines, symbols) {
  const sorted = [...symbols].sort((a, b) => before(a.range, b.range) || b.range.end_line - a.range.end_line || b.range.end_col - a.range.end_col);
  const root = [];
  const stack = [];
  for (const d of sorted) {
    while (stack.length && !within2(d.range, stack[stack.length - 1].decl.range)) stack.pop();
    const sym = { name: d.name, shape: d.shape, kind: d.kind, range: spanOf(lines, d.range), selection: spanOf(lines, d.selection), children: [] };
    (stack.length ? stack[stack.length - 1].sym.children : root).push(sym);
    stack.push({ decl: d, sym });
  }
  const merge3 = (list) => {
    const out2 = [];
    const seen = /* @__PURE__ */ new Map();
    for (const s of list) {
      const k = s.shape === "type" || s.shape === "namespace" ? `${s.shape}\0${s.name}` : void 0;
      const old = k === void 0 ? void 0 : seen.get(k);
      if (old) old.children.push(...s.children);
      else {
        out2.push(s);
        if (k !== void 0) seen.set(k, s);
      }
    }
    for (const s of out2) s.children = merge3(s.children);
    return out2;
  };
  return merge3(root);
}
var posKey2 = (a, b) => a.line - b.line || a.character - b.character;
var holds = (p, s) => posKey2(s.start, p) <= 0 && posKey2(p, s.end) <= 0;
var SELF = /* @__PURE__ */ new Set(["this", "self", "cls", "Self"]);
async function headlessIndex(repo, fe, files) {
  const docs = /* @__PURE__ */ new Map();
  for (const p of [...files].sort(cmpStr)) {
    let text;
    try {
      text = fs4.readFileSync(path3.join(repo, p), "utf8");
    } catch {
      continue;
    }
    const syn = fe.syntax(p);
    if (!syn) continue;
    const facts = syn.facts(text);
    const lines = text.split("\n");
    const tree = outline(lines, facts.symbols);
    const calls2 = /* @__PURE__ */ new Map();
    const sites2 = facts.calls.map((c) => {
      const s = spanOf(lines, c.callee);
      const k = `${s.start.line}:${s.start.character}`;
      if (!calls2.has(k)) calls2.set(k, c);
      return s;
    });
    docs.set(p, { file: { path: p, language: fe.id, text, symbols: tree }, facts, lines, tree, calls: calls2, sites: sites2 });
  }
  const byDir = /* @__PURE__ */ new Map();
  for (const d of docs.values()) {
    const dir = path3.posix.dirname(d.file.path);
    (byDir.get(dir) ?? byDir.set(dir, []).get(dir)).push(d);
  }
  const ref = (d, s) => ({ path: d.file.path, span: s.selection });
  const top = (d, name2, shape) => d.tree.filter((s) => s.name === name2 && (!shape || s.shape === shape));
  const member3 = (t, name2) => t.children.find((c) => c.name === name2 && c.shape === "method");
  const callees = (callee) => fe.imports?.path(callee) ?? (/^[\w$]+([.:]+[\w$]+)*$/.test(callee) ? callee.split(/[.:]+/) : []);
  const enclosingType = (d, at) => {
    let found;
    const walk3 = (list) => {
      for (const s of list) {
        if (!holds(at, s.range)) continue;
        if (s.shape === "type") found = s;
        walk3(s.children);
      }
    };
    walk3(d.tree);
    return found;
  };
  const definitionsOf = async (p, at) => {
    const d = docs.get(p);
    if (!d) return [];
    const call = d.calls.get(`${at.line}:${at.character}`);
    if (!call) return [];
    const segs = callees(call.callee_text);
    if (!segs.length) return [];
    const scopes = [d, ...(byDir.get(path3.posix.dirname(p)) ?? []).filter((x) => x !== d)];
    if (segs.length === 1) {
      for (const shape of ["method", "type"]) for (const x of scopes) for (const s of top(x, segs[0], shape)) return [ref(x, s)];
      const t = enclosingType(d, at);
      const m = t && member3(t, segs[0]);
      return m ? [ref(d, m)] : [];
    }
    const [head, ...rest2] = segs;
    const types = SELF.has(head) ? [enclosingType(d, at)].filter((t) => !!t).map((t) => [d, t]) : scopes.flatMap((x) => top(x, head, "type").map((t) => [x, t]));
    for (const [x, t] of types) {
      let cur = t;
      for (const n of rest2) cur = cur?.children.find((c) => c.name === n);
      if (cur) return [ref(x, cur)];
    }
    return [];
  };
  const sites = (f) => {
    const d = docs.get(f.path);
    return d ? d.sites : [];
  };
  return bridge([...docs.values()].map((d) => d.file), async () => [], { unify: fe.declarationsAcrossFiles, sites, definitionsOf, concurrency: 64 });
}

// src/engine.ts
var fs7 = __toESM2(require("node:fs"));
var path6 = __toESM2(require("node:path"));

// src/core/states.ts
var isLocation = (k) => k === "field" || k === "variable";
var stateId = (loc, key) => `state:${loc}:${key}`;
var isLocal = (s) => s.startsWith("local ");
var LOCAL = "local:";
function states(inp) {
  const localIds = /* @__PURE__ */ new Map();
  const localDefs = [];
  for (const d of inp.docs) {
    for (const a of d.facts.assigns) {
      const s = a.target.form === "name" ? d.symAt(a.target.name) : void 0;
      const def = s !== void 0 && isLocal(s) ? d.localDef(s) : void 0;
      const key = `${d.path}\0${s}`;
      if (!def || localIds.has(key)) continue;
      localIds.set(key, "");
      localDefs.push({ key, path: d.path, def, owner: d.callerAt(def), name: a.target.text });
    }
  }
  localDefs.sort((a, b) => cmpStr(a.path, b.path) || cmpRange(a.def, b.def));
  const seen = /* @__PURE__ */ new Map();
  for (const l of localDefs) {
    const base = `${LOCAL}${l.owner}:${l.name}`, n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    localIds.set(l.key, n === 1 ? base : `${base}#${n}`);
  }
  const localInfo = new Map(localDefs.map((l) => [localIds.get(l.key), l]));
  const locOf = (d, s) => s === void 0 ? void 0 : isLocal(s) ? localIds.get(`${d.path}\0${s}`) || void 0 : s;
  const writes = [];
  const written = /* @__PURE__ */ new Set();
  const targets = /* @__PURE__ */ new Set();
  for (const d of inp.docs) {
    for (const a of d.facts.assigns) {
      if (a.target.form !== "name") continue;
      const loc = locOf(d, d.symAt(a.target.name));
      if (loc === void 0 || !(localInfo.has(loc) || isLocation(inp.kindOf(loc)))) continue;
      writes.push({ path: d.path, site: a.target.name, caller: d.callerAt(a.target.name), loc, receiver: a.target.receiver, value: a.value, init: a.init });
      written.add(loc);
      targets.add(`${d.path}\0${rangeKey(a.target.name)}`);
    }
  }
  const consts = new Map(inp.docs.map((d) => [d.path, new Set(d.facts.consts.map(rangeKey))]));
  const value = (d, o, loc) => {
    const site2 = { path: d.path, range: o.name };
    if (o.form === "literal") return { key: /^(true|false)$/i.test(o.text) ? o.text.toLowerCase() : o.text, name: o.text, site: site2 };
    if (o.form !== "name") return void 0;
    const s = d.symAt(o.name);
    if (s === void 0 || s === loc || written.has(s)) return void 0;
    if (isLocal(s)) {
      const def = d.localDef(s);
      if (!def || !consts.get(d.path).has(rangeKey(def)) || written.has(locOf(d, s) ?? "")) return void 0;
      return { key: `${LOCAL}${o.text}`, name: o.text, site: { path: d.path, range: def } };
    }
    const k = inp.kindOf(s);
    const constant = k === void 0 ? inp.isExternalValue(s) : k === "variable" || k === "field" && inp.isConstantKind(s);
    return constant ? { key: s, name: inp.nameOf(s), sym: s, site: site2 } : void 0;
  };
  let checks = [];
  for (const d of inp.docs) {
    for (const g of d.facts.guards) {
      for (const [l, r] of [[g.left, g.right], [g.right, g.left]]) {
        if (l.form !== "name") continue;
        const loc = locOf(d, d.symAt(l.name));
        if (loc === void 0 || !written.has(loc)) continue;
        const v = value(d, r, loc);
        if (v) checks.push({ path: d.path, loc, receiver: l.receiver, value: v, body: g.body, certain: g.certain, truth: !!g.truth, equal: g.equal });
        break;
      }
    }
  }
  const docOf2 = new Map(inp.docs.map((d) => [d.path, d]));
  const values = /* @__PURE__ */ new Map();
  const note = (loc, v) => {
    if (!v) return;
    const m = values.get(loc) ?? values.set(loc, /* @__PURE__ */ new Map()).get(loc);
    const old = m.get(v.key);
    if (!old || cmpSite(v.site, old.site) < 0) m.set(v.key, v);
  };
  const moves = writes.map((w) => {
    const d = docOf2.get(w.path);
    const here = { caller: w.caller, site: { path: w.path, range: w.site } };
    if (w.value.negates && locOf(d, d.symAt(w.value.negates)) === w.loc) return [{ value: void 0, flip: true, ...here }];
    const s = w.value.form === "name" ? d.symAt(w.value.name) : void 0;
    const p = s === void 0 ? void 0 : inp.paramOf(w.path, s);
    if (!p) return [{ value: value(d, w.value, w.loc), ...here }];
    const barred = new Set(d.facts.guards.flatMap((g) => {
      if (g.equal || !g.certain || !contains(g.body, w.site)) return [];
      const [l, r] = d.symAt(g.left.name) === s ? [g.left, g.right] : d.symAt(g.right.name) === s ? [g.right, g.left] : [];
      return r?.form === "literal" ? [r.text] : r?.form === "name" && d.symAt(r.name) !== void 0 ? [d.symAt(r.name)] : [];
    }));
    const ins = inp.argsTo(p[0], p[1]).filter((a) => {
      const v = value(docOf2.get(a.path), a.value, w.loc);
      return !v || !barred.has(v.key);
    });
    if (!ins.length) return [{ value: void 0, ...here }];
    return ins.map((a) => ({ value: value(docOf2.get(a.path), a.value, w.loc), caller: a.caller, site: { path: a.path, range: a.site } }));
  });
  const assigned = /* @__PURE__ */ new Map(), held = /* @__PURE__ */ new Map();
  const add = (m, loc, key) => (m.get(loc) ?? m.set(loc, /* @__PURE__ */ new Set()).get(loc)).add(key);
  writes.forEach((w, i2) => {
    for (const m of moves[i2]) {
      for (const key of m.flip ? ["false", "true"] : m.value ? [m.value.key] : []) {
        add(held, w.loc, key);
        if (!w.init) add(assigned, w.loc, key);
      }
    }
  });
  const boolean = (loc) => [...held.get(loc) ?? []].every((k) => k === "true" || k === "false");
  const not = (v) => v.key === "true" ? { ...v, key: "false", name: "false" } : { ...v, key: "true", name: "true" };
  checks = checks.filter((t) => !t.truth || boolean(t.loc)).map((t) => !t.equal && boolean(t.loc) && /^(true|false)$/.test(t.value.key) ? { ...t, equal: true, value: not(t.value) } : t);
  const tests = checks.filter((t) => t.equal);
  const machines = /* @__PURE__ */ new Set();
  for (const t of tests) if (assigned.has(t.loc) && (held.get(t.loc)?.size ?? 0) >= 2) machines.add(t.loc);
  for (const [loc, ks] of held) if (!localInfo.has(loc) && boolean(loc) && ks.size === 2 && assigned.has(loc)) machines.add(loc);
  const out2 = { nodes: [], parents: [], edges: [] };
  const made = /* @__PURE__ */ new Set();
  const pseudo = (loc, key, kind, name2, doc) => {
    const id = stateId(loc, key);
    if (!made.has(id)) {
      made.add(id);
      out2.nodes.push({ id, kind, name: name2, doc });
      out2.parents.push([id, loc]);
    }
    return id;
  };
  const real = (loc, v) => stateId(loc, v.key);
  for (const t of tests) if (machines.has(t.loc)) note(t.loc, t.value);
  const truth = (key, site2) => ({ key, name: key, site: site2 });
  writes.forEach((w, i2) => machines.has(w.loc) && moves[i2].forEach((m) => (m.flip ? [truth("false", m.site), truth("true", m.site)] : [m.value]).forEach((v) => note(w.loc, v))));
  for (const loc of [...values.keys()].sort(cmpStr)) {
    const l = localInfo.get(loc);
    if (l) {
      out2.nodes.push({ id: loc, kind: "variable", name: l.name, path: l.path, range: l.def });
      out2.parents.push([loc, l.owner]);
    }
    for (const [key, v] of [...values.get(loc)].sort(([a], [b]) => cmpStr(a, b))) {
      const at = v.sym && inp.defSite(v.sym) || v.site;
      const id = stateId(loc, key);
      made.add(id);
      out2.nodes.push({ id, kind: "state", name: v.name, path: at.path, range: at.range });
      out2.parents.push([id, loc]);
    }
  }
  writes.forEach((w, i2) => {
    const site2 = { path: w.path, range: w.site };
    if (!localInfo.has(w.loc)) out2.edges.push({ from: w.caller, to: w.loc, kind: "flow", provenance: "resolved", label: "write", site: site2 });
    if (!machines.has(w.loc)) return;
    const around = tests.filter((t) => t.loc === w.loc && t.path === w.path && contains(t.body, w.site));
    const inner = around.reduce((m, t) => m === void 0 || cmpSize(t.body, m) < 0 ? t.body : m, void 0);
    for (const m of moves[i2]) {
      if (m.flip) {
        const from = inner ? around.filter((t) => cmpRange(t.body, inner) === 0).map((t) => t.value.key) : ["false", "true"];
        for (const f of from.filter((k) => k === "true" || k === "false"))
          out2.edges.push({ from: stateId(w.loc, f), to: stateId(w.loc, f === "true" ? "false" : "true"), kind: "transition", provenance: "resolved", label: inp.nameOf(m.caller), site: m.site });
        continue;
      }
      const to = m.value ? real(w.loc, m.value) : pseudo(w.loc, "?", "unresolved", "?", "A value that is not a constant.");
      const emit = (from, prov) => out2.edges.push({ from, to, kind: "transition", provenance: m.value ? prov : "unresolved", label: inp.nameOf(m.caller), site: m.site });
      if (w.init) emit(pseudo(w.loc, "#initial", "state", "initial", "Before any write: declaration initializers and literal elements."), "resolved");
      else if (!inner) emit(pseudo(w.loc, "#any", "state", "any", "Any state: a write no guard on this location encloses."), "may");
      else for (const t of around)
        if (cmpRange(t.body, inner) === 0) emit(real(w.loc, t.value), t.certain && t.receiver === w.receiver ? "resolved" : "may");
    }
  });
  for (const t of checks) {
    if (!machines.has(t.loc) || !values.get(t.loc)?.has(t.value.key)) continue;
    const d = docOf2.get(t.path);
    out2.edges.push({ from: d.callerAt(t.body), to: stateId(t.loc, t.value.key), kind: "guard", provenance: t.certain ? "resolved" : "may", label: t.equal ? "==" : "!=", site: { path: t.path, range: t.body } });
  }
  const dispatch = [];
  for (const d of inp.docs) {
    for (const g of d.facts.guards) {
      const caller = d.callerAt(g.body);
      if (!inp.isHandler(caller)) continue;
      const decl = d.facts.params.filter((p) => contains(p.decl, g.body)).reduce((m, p) => m === void 0 || cmpSize(p.decl, m) < 0 ? p.decl : m, void 0);
      const names = new Set(d.facts.params.filter((p) => decl && cmpRange(p.decl, decl) === 0).map((p) => p.name));
      for (const [l, r] of [[g.left, g.right], [g.right, g.left]]) {
        if (l.form !== "name" || r.form !== "literal" || g.truth || !(names.has(l.receiver) || l.receiver === "" && names.has(l.text))) continue;
        dispatch.push({ caller, on: l.text, value: r, guard: g, path: d.path });
        break;
      }
    }
  }
  const kinds = /* @__PURE__ */ new Map();
  for (const x of dispatch) if (x.guard.equal) add(kinds, `${x.caller}\0${x.on}`, x.value.text);
  for (const x of [...dispatch].sort((a, b) => cmpStr(a.path, b.path) || cmpRange(a.value.name, b.value.name))) {
    if ((kinds.get(`${x.caller}\0${x.on}`)?.size ?? 0) < 2) continue;
    const id = `event:${x.caller}:${x.on}=${x.value.text}`;
    if (!made.has(id)) {
      made.add(id);
      out2.nodes.push({ id, kind: "event", name: x.value.text.replace(/^(["'`])(.*)\1$/, "$2"), path: x.path, range: x.value.name, doc: `${x.on} == ${x.value.text}` });
      out2.parents.push([id, x.caller]);
    }
    out2.edges.push({ from: x.caller, to: id, kind: "guard", provenance: x.guard.certain ? "resolved" : "may", label: x.guard.equal ? "==" : "!=", site: { path: x.path, range: x.guard.body } });
  }
  for (const d of inp.docs) {
    for (const [r, s] of d.refs) {
      if (!written.has(s) || targets.has(`${d.path}\0${rangeKey(r)}`)) continue;
      out2.edges.push({ from: s, to: d.callerAt(r), kind: "flow", provenance: "resolved", label: "read", site: { path: d.path, range: r } });
    }
  }
  return out2;
}

// src/core/syntax.ts
var noFacts = () => ({ calls: [], symbols: [], imports: [], params: [], decls: [], assigns: [], guards: [], consts: [], lambdas: [], branches: [] });

// src/core/build.ts
var fileId = (path11) => `file:${path11}`;
function pkgId(sym) {
  const ns = [];
  for (const d of sym.descriptors) {
    if (d.kind !== "namespace") break;
    ns.push(d.name);
  }
  return ns.length ? `pkg:${sym.package}:${ns.join("/")}` : `pkg:${sym.package}`;
}
var callableKind = (info2) => info2 !== void 0 && CALLABLE_KINDS.includes(info2.kind);
function classify2(sym, info2) {
  const n = sym.descriptors.length;
  const last = sym.descriptors[n - 1];
  if (!last) return void 0;
  const parentIsType = n >= 2 && sym.descriptors[n - 2].kind === "type";
  if (last.kind === "method" || last.kind === "term" && callableKind(info2)) return parentIsType ? "method" : "function";
  if (last.kind === "type") return info2 !== void 0 && CONSTANT_KINDS.includes(info2.kind) && parentIsType ? "field" : "type";
  if (last.kind === "term") return parentIsType || (info2?.kind ?? 0) === KIND_FIELD ? "field" : "variable";
  return void 0;
}
var lastKind = (sym) => sym.descriptors[sym.descriptors.length - 1]?.kind;
var isCallableSym = (sym, info2) => lastKind(sym) === "method" || callableKind(info2);
var baseName = (path11) => path11.slice(path11.lastIndexOf("/") + 1);
function minBy(xs, cmp) {
  let best;
  for (const x of xs) if (best === void 0 || cmp(x, best) < 0) best = x;
  return best;
}
var sortedKeys = (m) => [...m.keys()].sort(cmpStr);
var bare = (id, kind, name2) => ({ id, kind, name: name2 });
function build2(inp) {
  const docs = [...inp.index.documents].sort((a, b) => cmpStr(a.relative_path, b.relative_path));
  const info2 = /* @__PURE__ */ new Map();
  for (const d of docs) for (const s of d.symbols) if (!info2.has(s.symbol)) info2.set(s.symbol, s);
  for (const s of inp.index.external_symbols) if (!info2.has(s.symbol)) info2.set(s.symbol, s);
  const defs = /* @__PURE__ */ new Map();
  const ctxs = [];
  const texts = /* @__PURE__ */ new Map();
  for (const d of docs) {
    const path11 = d.relative_path;
    const text = d.text === "" ? inp.readSource(path11) : d.text;
    const syn = inp.syntaxFor(d.language, path11);
    const facts = text !== void 0 && syn ? syn.facts(text) : noFacts();
    const refs = /* @__PURE__ */ new Map();
    const refsByEnd = /* @__PURE__ */ new Map();
    const defsAt = /* @__PURE__ */ new Map();
    const localDefs = [];
    for (const o of d.occurrences) {
      const r = occRange(o);
      if (!r || o.symbol === "") continue;
      if (o.symbol_roles & ROLE_DEFINITION) {
        const body2 = occEnclosing(o) ?? minBy(facts.decls.filter((x) => contains(x, r)), cmpSize);
        localDefs.push([o.symbol, r, body2]);
        const k = rangeKey(r);
        if (!defsAt.has(k)) defsAt.set(k, o.symbol);
      } else {
        const k = rangeKey(r);
        if (!refs.has(k)) refs.set(k, o.symbol);
        const ek = `${r.end_line},${r.end_col}`;
        const list = refsByEnd.get(ek);
        list ? list.push(r) : refsByEnd.set(ek, [r]);
      }
    }
    for (const [sym, r, body2] of localDefs) {
      const i2 = info2.get(sym);
      if (i2 && !callableKind(i2) && parseSymbol(sym) && lastKind(parseSymbol(sym)) === "term" && facts.decls.some((d2) => contains(d2, r) && (!body2 || contains(body2, d2))))
        info2.set(sym, { ...i2, kind: 17 });
    }
    const callables = [];
    const docAt = /* @__PURE__ */ new Map();
    for (const s of facts.symbols) if (s.doc) docAt.set(rangeKey(s.selection), s.doc);
    for (const [sym, r, body2] of localDefs) {
      const ps = parseSymbol(sym);
      if (!ps) continue;
      const kind = classify2(ps, info2.get(sym));
      if (!kind) continue;
      const old = defs.get(sym);
      const doc = docAt.get(rangeKey(r));
      if (!old || (cmpStr(old.path, path11) || cmpRange(old.ident, r)) > 0) defs.set(sym, doc === void 0 ? { path: path11, ident: r } : { path: path11, ident: r, doc });
      if (isCallable(kind) && body2) callables.push({ symbol: sym, ident: r, body: body2 });
    }
    texts.set(path11, text);
    const bound = /* @__PURE__ */ new Map();
    for (const i2 of facts.imports) if (!bound.has(i2.local)) bound.set(i2.local, i2);
    ctxs.push({ doc: d, facts, refs, refsByEnd, defsAt, callables, generic: !syn, imports: inp.importsFor?.(d.language, path11), bound });
  }
  const hashes = /* @__PURE__ */ new Map();
  const hashOf = (path11) => {
    if (!hashes.has(path11)) {
      const t = texts.get(path11);
      hashes.set(path11, t === void 0 ? void 0 : sha256Hex(t));
    }
    return hashes.get(path11);
  };
  const nodes = /* @__PURE__ */ new Map();
  const parent = /* @__PURE__ */ new Map();
  const edges = [];
  const ensure = (n) => nodes.has(n.id) || nodes.set(n.id, n);
  nodes.set(REPO_ID, bare(REPO_ID, "repo", "repo"));
  const filePkgs = /* @__PURE__ */ new Map();
  for (const sym of sortedKeys(defs)) {
    const def = defs.get(sym);
    const ps = parseSymbol(sym);
    const inf = info2.get(sym);
    const kind = classify2(ps, inf);
    const name2 = inf && inf.display_name !== "" ? inf.display_name : ps.descriptors[ps.descriptors.length - 1]?.name ?? "";
    const signature = inf?.signature_documentation?.text || void 0;
    const doc = inf?.documentation.join("\n") || def.doc || void 0;
    nodes.set(sym, { id: sym, kind, name: name2, path: def.path, range: def.ident, signature, doc, hash: hashOf(def.path) });
    const pkgs = filePkgs.get(def.path) ?? filePkgs.set(def.path, /* @__PURE__ */ new Set()).get(def.path);
    pkgs.add(pkgId(ps));
    const n = ps.descriptors.length;
    let owner2;
    if (n >= 2 && ps.descriptors[n - 2].kind === "type") {
      const p = prefix(ps, sym, n - 1);
      if (defs.has(p)) owner2 = p;
    }
    parent.set(sym, owner2 ?? fileId(def.path));
  }
  for (const ctx of ctxs) {
    const path11 = ctx.doc.relative_path;
    const fid = fileId(path11);
    nodes.set(fid, { id: fid, kind: "file", name: baseName(path11), path: path11, hash: hashOf(path11) });
    const pkgs = filePkgs.get(path11);
    parent.set(fid, pkgs ? minBy(pkgs, cmpStr) : REPO_ID);
  }
  for (const u2 of inp.unindexed ?? []) {
    const fid = fileId(u2.path);
    if (nodes.has(fid)) continue;
    const text = inp.readSource(u2.path);
    nodes.set(fid, { id: fid, kind: "file", name: baseName(u2.path), path: u2.path, hash: text === void 0 ? void 0 : sha256Hex(text), doc: u2.reason, unindexed: true });
    parent.set(fid, REPO_ID);
  }
  for (const pkgs of filePkgs.values()) {
    for (const pid of pkgs) {
      let name2 = pid.startsWith("pkg:") ? pid.slice(4) : pid;
      const colon = name2.indexOf(":");
      if (colon >= 0) name2 = name2.slice(colon + 1);
      const tail = name2.replace(/\/+$/, "");
      if (tail.includes("/")) name2 = tail.slice(tail.lastIndexOf("/") + 1);
      ensure(bare(pid, "package", name2));
      parent.set(pid, REPO_ID);
    }
  }
  directories(nodes, parent, filePkgs);
  const named = /* @__PURE__ */ new Map();
  for (const sym of sortedKeys(defs)) {
    const p = parent.get(sym), name2 = nodes.get(sym)?.name;
    if (p === void 0 || name2 === void 0) continue;
    const m = named.get(p) ?? named.set(p, /* @__PURE__ */ new Map()).get(p);
    (m.get(name2) ?? m.set(name2, []).get(name2)).push(sym);
  }
  const inDir = /* @__PURE__ */ new Map();
  for (const ctx of ctxs) {
    const p = ctx.doc.relative_path, d = dirOf(p);
    (inDir.get(d) ?? inDir.set(d, []).get(d)).push(p);
  }
  const lookup = (files, names) => {
    if (!names.length) return void 0;
    for (const f of files.flatMap((f2) => f2.endsWith("/") ? inDir.get(f2.slice(0, -1)) ?? [] : texts.has(f2) ? [f2] : [])) {
      let holders = [fileId(f)];
      for (const n of names) holders = holders.flatMap((h) => named.get(h)?.get(n) ?? []);
      if (holders.length) return holders[0];
    }
    return void 0;
  };
  const viaImport = (ctx, call) => {
    const imp = ctx.imports;
    if (!imp) return void 0;
    const segs = imp.path(call.callee_text);
    if (!segs.length) return void 0;
    const decl = ctx.bound.get(segs[0]);
    let module2, names;
    if (decl) {
      module2 = decl.module;
      names = decl.member !== void 0 ? [decl.member, ...segs.slice(1)] : segs.slice(1);
      if (!names.length) names = [decl.local];
    } else {
      const q = imp.qualified?.(segs);
      if (!q) return void 0;
      ({ module: module2, names } = q);
    }
    for (const l of imp.local(module2, ctx.doc.relative_path, names)) {
      const sym = lookup(l.files, l.names);
      if (sym === void 0) continue;
      const kind = nodes.get(sym)?.kind;
      return kind === "type" ? "type" : kind !== void 0 && isCallable(kind) ? sym : void 0;
    }
    const ext = imp.external(module2, names);
    return ext && externalSymbol(ctx.doc.language, ext.package, ext.names);
  };
  const ensureExternal = (sym) => {
    if (defs.has(sym) || nodes.has(sym)) return;
    const ps = parseSymbol(sym);
    if (!ps) return;
    const pid = `ext:${ps.package}`;
    ensure(bare(pid, "external_package", ps.package));
    parent.set(pid, REPO_ID);
    const named2 = ps.descriptors.filter((d) => d.kind === "type" || d.kind === "method" || d.kind === "term");
    nodes.set(sym, bare(sym, "external", named2.map((d) => d.name).join(".") || (ps.descriptors[ps.descriptors.length - 1]?.name ?? "")));
    parent.set(sym, pid);
  };
  const impls = /* @__PURE__ */ new Map();
  for (const sym of sortedKeys(defs)) {
    const def = defs.get(sym);
    const i2 = info2.get(sym);
    if (!i2) continue;
    for (const r of i2.relationships) {
      if (!r.is_implementation) continue;
      (impls.get(r.symbol) ?? impls.set(r.symbol, /* @__PURE__ */ new Set()).get(r.symbol)).add(sym);
      ensureExternal(r.symbol);
      edges.push({ from: sym, to: r.symbol, kind: "override", provenance: "resolved", site: { path: def.path, range: def.ident } });
    }
  }
  const paramsOf = /* @__PURE__ */ new Map();
  const paramSym = /* @__PURE__ */ new Map();
  const pathSym = (path11, sym) => `${path11}\0${sym}`;
  for (const ctx of ctxs) {
    const defsAt = ctx.defsAt;
    for (const p of ctx.facts.params) {
      const c = ctx.callables.find((c2) => contains(p.decl, c2.ident));
      if (!c) continue;
      (paramsOf.get(c.symbol) ?? paramsOf.set(c.symbol, []).get(c.symbol)).push([p.index, p.name]);
      const s = defsAt.get(rangeKey(p.range));
      if (s !== void 0) paramSym.set(pathSym(ctx.doc.relative_path, s), [c.symbol, p.index]);
    }
  }
  for (const ctx of ctxs) {
    if (!ctx.generic) continue;
    const path11 = ctx.doc.relative_path;
    for (const o of ctx.doc.occurrences) {
      const rg = occRange(o);
      if (!rg || o.symbol === "" || o.symbol_roles & ROLE_DEFINITION || o.symbol.startsWith("local ") || !defs.has(o.symbol)) continue;
      const ps = parseSymbol(o.symbol);
      if (!ps || !isCallableSym(ps, info2.get(o.symbol))) continue;
      const caller = callerAt(ctx, rg);
      if (caller === fileId(path11)) continue;
      edges.push(callEdge(caller, o.symbol, "may", "reference", { path: path11, range: rg }));
    }
  }
  const paramCalls = [];
  const fnFlows = [];
  const argsTo = /* @__PURE__ */ new Map();
  const handlers = /* @__PURE__ */ new Set();
  const callbacks = [];
  for (const ctx of ctxs) {
    const path11 = ctx.doc.relative_path;
    const holder = ctx.facts.lambdas.map((l) => minBy(
      ctx.facts.calls.flatMap((c, i2) => c.args.filter((a) => contains(a, l)).map((a) => ({ i: i2, a }))),
      (x, y) => cmpSize(x.a, y.a)
    )?.i);
    const lines = (texts.get(path11) ?? "").split("\n");
    const between = (a, b) => a.start_line === b.start_line ? lines[a.start_line]?.slice(a.start_col, b.start_col) ?? "" : [lines[a.start_line]?.slice(a.start_col) ?? "", ...lines.slice(a.start_line + 1, b.start_line), lines[b.start_line]?.slice(0, b.start_col) ?? ""].join("\n");
    const end = (r) => ({ start_line: r.end_line, start_col: r.end_col, end_line: r.end_line, end_col: r.end_col });
    const registers = (c, depth = 0) => {
      if (!c.result_used) return true;
      const last = c.args[c.args.length - 1];
      return !!last && depth < 8 && ctx.facts.calls.some((o) => o !== c && o.args.some((a) => contains(a, c.callee) && contains(a, last) && /^[\s,]*\)$/.test(between(end(last), end(a)))) && registers(o, depth + 1));
    };
    ctx.facts.calls.forEach((call, ci) => {
      const caller = callerAt(ctx, call.callee);
      const site2 = { path: path11, range: call.callee };
      const targets = [];
      let stub = false;
      const s = ctx.refs.get(rangeKey(call.callee));
      if (s === void 0) stub = true;
      else if (!s.startsWith("local ")) {
        const ps = parseSymbol(s);
        if (ps && isCallableSym(ps, info2.get(s))) {
          ensureExternal(s);
          edges.push(callEdge(caller, s, "resolved", void 0, site2));
          targets.push([s, "resolved"]);
          for (const imp of [...impls.get(s) ?? []].sort(cmpStr)) {
            edges.push(callEdge(caller, imp, "may", "dispatch", site2));
            targets.push([imp, "may"]);
          }
        } else if (ps && lastKind(ps) === "type") return;
        else stub = true;
      } else {
        const pc = paramSym.get(pathSym(path11, s));
        if (pc) paramCalls.push({ func: pc[0], idx: pc[1], caller, site: site2, name: call.callee_text });
        stub = true;
      }
      if (stub) {
        const via = viaImport(ctx, call);
        if (via === "type") return;
        if (via !== void 0) {
          ensureExternal(via);
          edges.push(callEdge(caller, via, "resolved", void 0, site2));
          targets.push([via, "resolved"]);
          for (const imp of [...impls.get(via) ?? []].sort(cmpStr)) {
            edges.push(callEdge(caller, imp, "may", "dispatch", site2));
            targets.push([imp, "may"]);
          }
          stub = false;
        }
      }
      if (stub) {
        const text = call.callee_text.length > 40 || call.callee_text.includes("\n") ? call.callee_text.split("\n")[0].slice(0, 39).trimEnd() + "\u2026" : call.callee_text;
        const id = `unresolved:${caller}:${text}`;
        ensure(bare(id, "unresolved", text));
        parent.set(id, caller);
        edges.push(callEdge(caller, id, "unresolved", void 0, site2));
        targets.push([id, "unresolved"]);
      }
      for (const [t, prov] of targets) {
        const names = paramsOf.get(t);
        call.args.forEach((arg, i2) => {
          const name2 = names?.find(([k]) => k === i2)?.[1];
          const label = name2 === void 0 ? `arg${i2}` : `arg${i2}:${name2}`;
          if (prov === "resolved" && call.values[i2]) {
            const k = `${t}\0${i2}`;
            (argsTo.get(k) ?? argsTo.set(k, []).get(k)).push({ path: path11, caller, site: call.callee, value: call.values[i2] });
          }
          edges.push({ from: caller, to: t, kind: "flow", provenance: prov, label, site: site2 });
          if (prov !== "resolved") return;
          let fv;
          for (const r of ctx.refsByEnd.get(`${arg.end_line},${arg.end_col}`) ?? []) {
            const sym = ctx.refs.get(rangeKey(r));
            if (sym === void 0) continue;
            const ps = parseSymbol(sym);
            if (ps && contains(arg, r) && isCallableSym(ps, info2.get(sym)) && defs.has(sym)) {
              fv = sym;
              break;
            }
          }
          if (fv !== void 0) {
            edges.push({ from: fv, to: t, kind: "flow", provenance: "resolved", label: `fn:${label}`, site: site2 });
            fnFlows.push([t, i2, fv]);
            if (!defs.has(t)) {
              edges.push(callEdge(t, fv, "may", "callback", site2));
              handlers.add(fv);
            }
          }
        });
        if (call.result_used) edges.push({ from: t, to: caller, kind: "flow", provenance: prov, label: "return", site: site2 });
      }
      const ext = targets.find(([t, prov]) => prov === "resolved" && !defs.has(t))?.[0];
      if (ext === void 0 || !registers(call)) return;
      ctx.facts.lambdas.forEach((l, li) => {
        if (holder[li] !== ci) return;
        const id = `event:${caller}:${nodes.get(ext).name}@${l.start_line + 1}:${l.start_col}`;
        ensure({ id, kind: "event", name: nodes.get(ext).name, path: path11, range: l, doc: "Code outside the repo calls this function literal." });
        parent.set(id, caller);
        edges.push({ from: caller, to: id, kind: "guard", provenance: "may", label: "callback", site: { path: path11, range: l } });
        edges.push(callEdge(ext, id, "may", "callback", { path: path11, range: l }));
        callbacks.push({ path: path11, range: l });
      });
    });
  }
  for (const e of edges)
    if (e.kind === "call" && defs.has(e.to) && e.site && callbacks.some((c) => c.path === e.site.path && contains(c.range, e.site.range))) handlers.add(e.to);
  for (const pc of paramCalls) {
    for (const [callee, idx, f] of fnFlows) {
      if (callee === pc.func && idx === pc.idx) edges.push(callEdge(pc.caller, f, "may", `via ${pc.name}`, pc.site));
    }
  }
  const constRanges = new Map(ctxs.map((c) => [c.doc.relative_path, new Set(c.facts.consts.map(rangeKey))]));
  const declaredConst = (sym) => {
    const d = defs.get(sym);
    return !!d && !!constRanges.get(d.path)?.has(rangeKey(d.ident));
  };
  const st = states({
    docs: ctxs.map((ctx) => {
      const localDefs = /* @__PURE__ */ new Map();
      for (const [k, sym] of ctx.defsAt) if (sym.startsWith("local ") && !localDefs.has(sym)) localDefs.set(sym, keyRange(k));
      return {
        path: ctx.doc.relative_path,
        facts: ctx.facts,
        symAt: (r) => ctx.refs.get(rangeKey(r)) ?? ctx.defsAt.get(rangeKey(r)),
        refs: [...ctx.refs].map(([k, sym]) => [keyRange(k), sym]),
        callerAt: (r) => callerAt(ctx, r),
        localDef: (sym) => localDefs.get(sym)
      };
    }),
    kindOf: (sym) => defs.has(sym) ? nodes.get(sym)?.kind : void 0,
    isExternalValue: (sym) => {
      const ps = parseSymbol(sym);
      return !!ps && lastKind(ps) === "term" && !isCallableSym(ps, info2.get(sym));
    },
    paramOf: (path11, sym) => paramSym.get(pathSym(path11, sym)),
    isHandler: (callable) => handlers.has(callable),
    argsTo: (callable, idx) => argsTo.get(`${callable}\0${idx}`) ?? [],
    isConstantKind: (sym) => CONSTANT_KINDS.includes(info2.get(sym)?.kind ?? 0) || declaredConst(sym),
    nameOf: (id) => nodes.get(id)?.name ?? id,
    defSite: (sym) => {
      const d = defs.get(sym);
      return d && { path: d.path, range: d.ident };
    }
  });
  for (const n of st.nodes) ensure(n);
  for (const [child, p] of st.parents) parent.set(child, p);
  edges.push(...st.edges);
  for (const [child, p] of parent) edges.push({ from: p, to: child, kind: "contains", provenance: "resolved" });
  const g = newGraph();
  g.nodes = [...nodes.values()].map(node);
  g.edges = edges.map(edge);
  canonicalize(g);
  return g;
}
var keyRange = (k) => {
  const [a, b, c, d] = k.split(",").map(Number);
  return { start_line: a, start_col: b, end_line: c, end_col: d };
};
function callerAt(ctx, r) {
  return minBy(ctx.callables.filter((c) => contains(c.body, r)), (a, b) => cmpSize(a.body, b.body))?.symbol ?? fileId(ctx.doc.relative_path);
}
function callEdge(from, to, provenance, label, site2) {
  return { from, to, kind: "call", provenance, label, site: site2 };
}
var dirOf = (path11) => path11.slice(0, Math.max(path11.lastIndexOf("/"), 0));
function commonDir(paths) {
  let common;
  for (const p of paths) {
    const segs = dirOf(p).split("/").filter((x) => x !== "");
    if (!common) common = segs;
    else {
      let i2 = 0;
      while (i2 < common.length && i2 < segs.length && common[i2] === segs[i2]) i2++;
      common = common.slice(0, i2);
    }
  }
  return (common ?? []).join("/");
}
function directories(nodes, parent, filePkgs) {
  const pkgFiles = /* @__PURE__ */ new Map();
  for (const [path11, pkgs] of filePkgs) for (const p of pkgs) (pkgFiles.get(p) ?? pkgFiles.set(p, []).get(p)).push(path11);
  const children2 = /* @__PURE__ */ new Map();
  const up = /* @__PURE__ */ new Map();
  const dirId = (d) => d === "" ? REPO_ID : `dir:${d}`;
  const place = (id, dir) => {
    for (let d = dir; d !== ""; d = dirOf(d)) {
      if (!children2.has(d)) children2.set(d, /* @__PURE__ */ new Set());
      if (!up.has(d)) up.set(d, dirOf(d));
    }
    if (dir !== "") children2.get(dir).add(id);
    parent.set(id, dirId(dir));
  };
  for (const id of [...parent.keys()].sort(cmpStr)) {
    if (parent.get(id) !== REPO_ID) continue;
    const n = nodes.get(id);
    if (n?.kind === "package") place(id, commonDir(pkgFiles.get(id) ?? []));
    else if (n?.kind === "file" && n.path !== void 0) place(id, dirOf(n.path));
  }
  for (const [d, p] of up) if (p !== "") children2.get(p).add(dirId(d));
  const depth = (d) => d.split("/").length;
  for (const d of [...children2.keys()].sort((a, b) => depth(b) - depth(a) || cmpStr(a, b))) {
    const kids = children2.get(d);
    if (kids.size !== 1) continue;
    const [only] = kids;
    const p = up.get(d);
    parent.set(only, dirId(p));
    if (only.startsWith("dir:")) up.set(only.slice(4), p);
    if (p !== "") {
      children2.get(p).delete(dirId(d));
      children2.get(p).add(only);
    }
    children2.delete(d);
  }
  for (const d of children2.keys()) {
    const p = up.get(d);
    nodes.set(dirId(d), { id: dirId(d), kind: "directory", name: p === "" ? d : d.slice(p.length + 1) });
    parent.set(dirId(d), dirId(p));
  }
}

// src/core/frontend.ts
function extension(path11) {
  const name2 = path11.slice(path11.lastIndexOf("/") + 1);
  const dot = name2.lastIndexOf(".");
  return dot > 0 ? name2.slice(dot + 1).replace(/[A-Z]/g, (c) => c.toLowerCase()) : void 0;
}

// src/lang/treesitter.ts
var fs6 = __toESM2(require("node:fs"));
var path5 = __toESM2(require("node:path"));
var import_web_tree_sitter = __toESM2(require_tree_sitter2());

// src/root.ts
var fs5 = __toESM2(require("node:fs"));
var path4 = __toESM2(require("node:path"));
var PKG_ROOT = fs5.existsSync(path4.join(__dirname, "grammars")) ? __dirname : path4.resolve(__dirname, "..");

// src/lang/treesitter.ts
var runtime;
var loaded = /* @__PURE__ */ new Map();
var chain = Promise.resolve();
function loadGrammar(file) {
  let l = loaded.get(file);
  if (!l) {
    runtime ??= import_web_tree_sitter.Parser.init({ locateFile: (f, dir) => fs6.existsSync(path5.join(PKG_ROOT, f)) ? path5.join(PKG_ROOT, f) : path5.join(dir, f) });
    const load2 = chain.then(() => runtime).then(() => import_web_tree_sitter.Language.load(path5.join(PKG_ROOT, "grammars", file)));
    chain = load2.catch(() => {
    });
    l = load2;
    loaded.set(file, l);
  }
  return l;
}
var Source = class {
  constructor(text) {
    this.text = text;
    for (let i2 = text.indexOf("\n"); i2 >= 0; i2 = text.indexOf("\n", i2 + 1)) this.starts.push(i2 + 1);
  }
  starts = [0];
  ascii = [];
  col(row2, units) {
    if (this.ascii[row2] === void 0) {
      const end = row2 + 1 < this.starts.length ? this.starts[row2 + 1] : this.text.length;
      this.ascii[row2] = !/[^\x00-\x7f]/.test(this.text.slice(this.starts[row2], end));
    }
    if (this.ascii[row2]) return units;
    const s = this.starts[row2];
    return Buffer.byteLength(this.text.slice(s, s + units), "utf8");
  }
  range(n) {
    return this.span(n, n);
  }
  /** The character index where a range starts, to find the node that starts there. */
  index(r) {
    const s = this.starts[r.start_line] ?? this.text.length;
    const end = r.start_line + 1 < this.starts.length ? this.starts[r.start_line + 1] : this.text.length;
    if (!/[^\x00-\x7f]/.test(this.text.slice(s, end))) return s + r.start_col;
    let bytes = 0, i2 = s;
    while (bytes < r.start_col && i2 < end) {
      const c = this.text.codePointAt(i2);
      bytes += c < 128 ? 1 : c < 2048 ? 2 : c < 65536 ? 3 : 4;
      i2 += c >= 65536 ? 2 : 1;
    }
    return i2;
  }
  /** From the start of `a` to the end of `b`. */
  span(a, b) {
    const s = a.startPosition, e = b.endPosition;
    return { start_line: s.row, start_col: this.col(s.row, s.column), end_line: e.row, end_col: this.col(e.row, e.column) };
  }
};
var children = (n) => n.children.filter((c) => c !== null);
var namedChildren = (n) => n.namedChildren.filter((c) => c !== null);
function walk2(root, visit2) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    visit2(n);
    const cs = children(n);
    for (let i2 = cs.length - 1; i2 >= 0; i2--) stack.push(cs[i2]);
  }
}
var other = (n, src) => {
  const o = { name: src.range(n), text: n.text, form: "other", receiver: "" };
  const inner = negated(n);
  if (inner && /^[\w$@.:>-]+$/.test(inner.text)) {
    let leaf = inner;
    while (leaf.namedChildCount) leaf = namedChildren(leaf).at(-1);
    o.negates = src.range(leaf);
  }
  return o;
};
var BINARY = /* @__PURE__ */ new Set(["binary_expression", "binary", "boolean_operator", "comparison_operator", "conjunction_expression", "disjunction_expression", "equality_expression"]);
function sides(n) {
  const named = namedChildren(n);
  if (n.type === "comparison_operator") return { l: named[0], r: named[1], op: n.childForFieldName("operators")?.type ?? "" };
  const op = n.childForFieldName("operator")?.type ?? children(n).find((c) => !c.isNamed)?.type ?? "";
  return { l: n.childForFieldName("left") ?? named[0], r: n.childForFieldName("right") ?? named[named.length - 1], op };
}
function negated(n) {
  const named = namedChildren(n);
  return named.length === 1 && children(n).some((c) => !c.isNamed && (c.type === "!" || c.type === "not")) ? named[0] : void 0;
}
function equalities(cond, body2, ops, operand12, out2, certain = true) {
  if (cond.type === "parenthesized_expression") {
    const c = namedChildren(cond)[0];
    if (c) equalities(c, body2, ops, operand12, out2, certain);
    return;
  }
  const inner = negated(cond);
  for (const [x, value] of [[cond, "true"], [inner, "false"]]) {
    const o = x && operand12(x);
    if (o?.form !== "name") continue;
    out2.push({ left: o, right: { name: o.name, text: value, form: "literal", receiver: "" }, equal: true, body: body2, certain, truth: true });
    return;
  }
  if (!BINARY.has(cond.type)) return;
  const { l, r, op } = sides(cond);
  if (!l || !r) return;
  if (ops.eq.includes(op) || ops.ne.includes(op)) out2.push({ left: operand12(l), right: operand12(r), equal: ops.eq.includes(op), body: body2, certain });
  else if (op === "&&" || op === "||" || op === "and" || op === "or") {
    const all = op === "&&" || op === "and";
    equalities(l, body2, ops, operand12, out2, certain && all);
    equalities(r, body2, ops, operand12, out2, certain && all);
  }
}
var EXIT = /^(return|throw|raise|break|continue)(_statement|_expression)?$|^jump_expression$/;
var LOGICAL = /* @__PURE__ */ new Set(["&&", "||", "and", "or"]);
function rest(n, body2, src) {
  const parent = n.parent;
  if (!parent || n.childForFieldName("alternative") || children(n).some((c) => c.type === "else" || /else|elif|elsif/.test(c.type))) return void 0;
  const stmts = namedChildren(body2).filter((c) => !c.type.includes("comment"));
  const last = EXIT.test(body2.type) ? body2 : stmts[stmts.length - 1];
  if (!last || !EXIT.test(last.type) || n.endIndex >= parent.endIndex) return void 0;
  const end = src.range(n);
  return { ...src.range(parent), start_line: end.end_line, start_col: end.end_col };
}
function branches(cond, yes, no, ops, operand12, out2) {
  const from = out2.length;
  equalities(cond, yes, ops, operand12, out2);
  let c = cond;
  while (c.type === "parenthesized_expression" && namedChildren(c)[0]) c = namedChildren(c)[0];
  const compound = BINARY.has(c.type) && LOGICAL.has(sides(c).op);
  if (no && out2.length - from === 1 && !compound) out2.push({ ...out2[from], equal: !out2[from].equal, body: no });
}
function guardIf(n, cond, body2, ops, operand12, out2, src) {
  const alt = n.childForFieldName("alternative");
  branches(cond, src.range(body2), alt ? src.range(alt) : rest(n, body2, src), ops, operand12, out2);
}
var SKIP_BACK = /decorator|attribute|annotation|modifier|visibility/;
var PRAGMA = /^(eslint|prettier|ts-|noqa|type:|pylint|nolint|go:|#!|-\*-|@ts|biome|istanbul|c8 |v8 |SPDX|Copyright|License|coding[:=])/i;
var ROOT = /* @__PURE__ */ new Set(["program", "module", "source_file", "translation_unit", "compilation_unit"]);
function docOf(n) {
  let top = n;
  while (top.parent && top.parent.startIndex === top.startIndex && !ROOT.has(top.parent.type)) top = top.parent;
  const lines = [];
  let row2 = top.startPosition.row;
  for (let p = top.previousSibling; p !== null; p = p.previousSibling) {
    if (/comment/.test(p.type)) {
      if (p.endPosition.row < row2 - 1) break;
      lines.unshift(...p.text.split("\n"));
      row2 = p.startPosition.row;
      continue;
    }
    if (!lines.length && SKIP_BACK.test(p.type)) {
      row2 = p.startPosition.row;
      continue;
    }
    break;
  }
  if (!lines.length) {
    const body2 = n.childForFieldName("body") ?? n.childForFieldName("definition")?.childForFieldName("body") ?? namedChildren(n).find((c) => /definition|declaration/.test(c.type))?.childForFieldName("body");
    const first2 = body2 && namedChildren(body2).find((c) => !/comment/.test(c.type));
    const str2 = first2?.type === "expression_statement" ? namedChildren(first2)[0] : void 0;
    if (str2 && /string/.test(str2.type)) lines.push(...str2.text.split("\n"));
  }
  return clean(lines);
}
var MARK_START = /^\s*(\/\*\*<?|\/\*!?|\*\/|\/\/[/!]?|#+|--|r?"""|r?'''|\*)\s?/;
var MARK_END = /\s*(\*\/|"""|''')\s*$/;
function clean(lines) {
  const out2 = [];
  for (const raw of lines) {
    let l = raw.replace(MARK_END, "");
    for (let i2 = 0; i2 < 2; i2++) l = l.replace(MARK_START, "");
    l = l.trim();
    if (!l) {
      if (out2.length) break;
      continue;
    }
    if (!out2.length && PRAGMA.test(l)) return void 0;
    out2.push(l);
  }
  const text = out2.join(" ").replace(/\s+/g, " ").trim();
  return text ? text.length > 400 ? text.slice(0, 399) + "\u2026" : text : void 0;
}
var IF = /^(if_statement|if_expression|if_let_expression|elif_clause|else_if_clause|elsif|elseif_clause|else_if)$/;
var ELSE = /^(else_clause|else_statement|else)$/;
var LOOP = /^(for|while|do|loop|for_in|foreach|for_each|enhanced_for|for_range|repeat|until|for_numeric|for_generic|do_while)_?(statement|expression|loop)?$/;
var SWITCH = /^(switch_statement|switch_expression|match_statement|match_expression|when_expression|select_statement|expression_switch_statement|type_switch_statement|switch)$/;
var CASE = /^(switch_case|switch_default|case_clause|default_clause|match_arm|when_entry|case|communication_case|default_case|expression_case|type_case|switch_section|case_pattern|match_case|switch_rule|switch_block_statement_group)$/;
var CATCH = /^(catch_clause|except_clause|except_group_clause|rescue|rescue_clause|catch_block|catch|finally_clause|on_part|catch_part)$/;
var BLOCK = /block|body|statement_list|compound_statement|suite|consequence|statements|control_structure_body/;
var squash = (s, n = 60) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
};
var unparen = (s) => s.replace(/^\((.*)\)$/s, "$1");
function branch(n, src, out2) {
  if (!n.isNamed) return;
  const t = n.type;
  const field = (...names) => {
    for (const f of names) {
      const c = n.childForFieldName(f);
      if (c) return c;
    }
    return void 0;
  };
  const named = namedChildren(n);
  const blockLike = (c) => BLOCK.test(c.type);
  const comment = (c) => /comment/.test(c.type);
  if (IF.test(t)) {
    const cond = field("condition", "value") ?? named.find((c) => !blockLike(c) && !comment(c));
    if (!cond) return;
    const body2 = field("consequence", "body", "block") ?? named.find((c) => c.id !== cond.id && blockLike(c));
    if (!body2) return;
    out2.push({ kind: "if", text: squash(unparen(cond.text)), range: src.range(n), body: src.range(body2) });
    const alt = field("alternative");
    if (alt && !IF.test(alt.type)) {
      const inner = ELSE.test(alt.type) ? namedChildren(alt).find((c) => !comment(c)) : alt;
      if (inner && !IF.test(inner.type)) out2.push({ kind: "else", text: "", range: src.range(alt), body: src.range(alt) });
    }
  } else if (ELSE.test(t) && n.parent && n.parent.childForFieldName("alternative")?.id !== n.id) {
    const inner = named.find((c) => !comment(c));
    if (inner && !IF.test(inner.type) && /if|match|switch|try|for|while/.test(n.parent.type) && !/for|while|try/.test(n.parent.type)) out2.push({ kind: "else", text: "", range: src.range(n), body: src.range(n) });
  } else if (LOOP.test(t)) {
    const body2 = field("body", "block") ?? [...named].reverse().find(blockLike);
    if (!body2) return;
    const head = n.text.slice(0, body2.startIndex - n.startIndex).replace(/[{:]\s*$/, "").trim();
    out2.push({ kind: "loop", text: squash(head || t.replace(/_.*$/, "")), range: src.range(n), body: src.range(body2) });
  } else if (SWITCH.test(t)) {
    const value = field("value", "condition", "subject") ?? named.find((c) => !blockLike(c) && !CASE.test(c.type) && !comment(c));
    out2.push({ kind: "switch", text: squash(value ? unparen(value.text) : t.replace(/_.*$/, "")), range: src.range(n), body: src.range(n) });
  } else if (CASE.test(t)) {
    const v = field("pattern", "value", "condition") ?? named.find((c) => !blockLike(c) && !comment(c) && c.startPosition.row === n.startPosition.row);
    const isDefault = /default/.test(t) || v?.text === "_" || v?.text === "default";
    out2.push({ kind: "case", text: isDefault || !v ? "otherwise" : squash(v.text, 40), range: src.range(n), body: src.range(n) });
  } else if (CATCH.test(t)) {
    const what = field("parameter", "pattern", "type", "name", "value", "exception");
    out2.push({ kind: "catch", text: /finally/.test(t) ? "finally" : `on error${what ? ` ${squash(what.text, 30)}` : ""}`, range: src.range(n), body: src.range(n) });
  }
}
function symbol(f, src, decl, name2, shape, kind) {
  if (name2) f.symbols.push({ name: name2.text, shape, kind, range: src.range(decl), selection: src.range(name2) });
}
var LAMBDAS = /* @__PURE__ */ new Set([
  "arrow_function",
  "function_expression",
  "function",
  "generator_function",
  "lambda",
  "lambda_expression",
  "lambda_literal",
  "closure_expression",
  "func_literal",
  "anonymous_function",
  "anonymous_function_creation_expression",
  "anonymous_method_expression",
  "function_literal",
  "function_expression_body"
]);
var Grammar = class {
  constructor(file, visit2) {
    this.file = file;
    this.visit = visit2;
  }
  lang;
  /** Facts by source: an index reads each file's twice (its outline, then the graph), and a long-lived
   *  server re-reads the files that did not change. Bounded, so it never holds a repo's history. */
  seen = /* @__PURE__ */ new Map();
  async init() {
    this.lang = await loadGrammar(this.file);
  }
  facts(source) {
    if (!this.lang) throw new Error(`grammar ${this.file} used before init()`);
    const hit = this.seen.get(source);
    if (hit) return hit;
    const p = new import_web_tree_sitter.Parser();
    p.setLanguage(this.lang);
    const f = noFacts();
    const tree = p.parse(source);
    if (tree) {
      const src = new Source(source);
      const starts = /* @__PURE__ */ new Map();
      walk2(tree.rootNode, (n) => {
        if (!starts.has(n.startIndex)) starts.set(n.startIndex, n);
        this.visit(n, src, f);
        if (LAMBDAS.has(n.type)) f.lambdas.push(src.range(n));
        branch(n, src, f.branches);
      });
      for (const sym of f.symbols) {
        const at = starts.get(src.index(sym.range));
        const doc = at && docOf(at);
        if (doc) sym.doc = doc;
      }
      tree.delete();
    }
    p.delete();
    if (this.seen.size >= 4096) this.seen.clear();
    this.seen.set(source, f);
    return f;
  }
};

// src/lang/cpp.ts
var LANGUAGE_ID = "cpp";
var LITERALS = /* @__PURE__ */ new Set(["number_literal", "string_literal", "raw_string_literal", "char_literal", "true", "false", "nullptr", "null"]);
function operand(n, src) {
  if (n.type === "identifier" || n.type === "field_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "field_expression") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("argument")?.text ?? "" };
  }
  if (n.type === "qualified_identifier") {
    const f = n.childForFieldName("name");
    if (f && f.type !== "qualified_identifier") return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("scope")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand(n.namedChild(0), src);
  if (LITERALS.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ = { eq: ["=="], ne: ["!="] };
var ENDS = /* @__PURE__ */ new Set(["break_statement", "return_statement", "continue_statement", "goto_statement"]);
var unclause = (c) => c.type === "condition_clause" ? c.childForFieldName("value") ?? c : c;
function nameOf(d) {
  while (d && (d.type === "pointer_declarator" || d.type === "reference_declarator" || d.type === "array_declarator" || d.type === "parenthesized_declarator")) {
    d = d.childForFieldName("declarator") ?? d.namedChild(0);
  }
  return d?.type === "identifier" || d?.type === "field_identifier" ? d : void 0;
}
function functionDeclarator(d) {
  while (d && d.type !== "function_declarator") d = d.childForFieldName("declarator");
  return d ?? void 0;
}
var isConst = (decl) => namedChildren(decl).some((x) => x.type === "type_qualifier" && (x.text === "const" || x.text === "constexpr"));
function state(n, src, f) {
  const op = (x) => operand(x, src);
  switch (n.type) {
    case "assignment_expression": {
      const l = n.childForFieldName("left"), r = n.childForFieldName("right");
      if (l && r) f.assigns.push({ target: op(l), value: n.childForFieldName("operator")?.type === "=" ? op(r) : other(n, src), init: false });
      break;
    }
    case "update_expression": {
      const a = n.childForFieldName("argument");
      if (a) f.assigns.push({ target: op(a), value: other(n, src), init: false });
      break;
    }
    case "init_declarator": {
      const name2 = nameOf(n.childForFieldName("declarator")), v = n.childForFieldName("value");
      if (!name2 || !v || v.type === "initializer_list") break;
      if (n.parent && isConst(n.parent)) {
        if (op(v).form === "literal") f.consts.push(src.range(name2));
      } else {
        f.assigns.push({ target: op(name2), value: op(v), init: true });
      }
      break;
    }
    case "enumerator": {
      const name2 = n.childForFieldName("name");
      if (name2) f.consts.push(src.range(name2));
      break;
    }
    case "field_declaration": {
      const name2 = nameOf(n.childForFieldName("declarator")), v = n.childForFieldName("default_value");
      if (name2 && v) f.assigns.push({ target: { ...op(name2), receiver: "this" }, value: op(v), init: true });
      break;
    }
    case "field_initializer": {
      const name2 = namedChildren(n).find((x) => x.type === "field_identifier");
      const args2 = namedChildren(n).find((x) => x.type === "argument_list");
      const first2 = args2?.namedChildren.filter((x) => x !== null)[0];
      if (name2 && first2 && args2.namedChildCount === 1) f.assigns.push({ target: { ...op(name2), receiver: "this" }, value: op(first2), init: true });
      break;
    }
    case "if_statement": {
      const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
      if (c && body2) guardIf(n, unclause(c), body2, EQ, op, f.guards, src);
      break;
    }
    case "switch_statement": {
      const c = n.childForFieldName("condition"), body2 = n.childForFieldName("body");
      const subject2 = c && unclause(c);
      if (!subject2 || !body2) break;
      let pending = [], falls = false;
      for (const cs of namedChildren(body2)) {
        if (cs.type !== "case_statement") continue;
        const val = cs.childForFieldName("value");
        if (val) pending.push(val);
        const stmts = namedChildren(cs).filter((x) => x.id !== val?.id && x.type !== "comment");
        if (!stmts.length) continue;
        const range2 = src.span(stmts[0], stmts[stmts.length - 1]);
        for (const x of pending) f.guards.push({ left: op(subject2), right: op(x), equal: true, body: range2, certain: !falls });
        falls = !ENDS.has(stmts[stmts.length - 1].type);
        pending = [];
      }
      break;
    }
  }
}
function params(fd, decl, src, f) {
  const list = fd.childForFieldName("parameters");
  if (!list) return;
  let index2 = 0;
  for (const p of namedChildren(list)) {
    if (p.type !== "parameter_declaration" && p.type !== "optional_parameter_declaration" && p.type !== "variadic_parameter_declaration") continue;
    const name2 = nameOf(p.childForFieldName("declarator"));
    if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: index2, decl });
    index2++;
  }
}
var CPP = new Grammar("tree-sitter-cpp.wasm", (n, src, f) => {
  state(n, src, f);
  if (n.type === "function_definition") {
    const fd = functionDeclarator(n.childForFieldName("declarator"));
    const decl = src.range(n);
    f.decls.push(decl);
    if (fd) params(fd, decl, src, f);
  } else if (n.type === "call_expression" || n.type === "new_expression") {
    let func2 = n.type === "call_expression" ? n.childForFieldName("function") : n.childForFieldName("type");
    if (func2?.type === "template_function") func2 = func2.childForFieldName("name") ?? func2;
    if (!func2) return;
    const callee = func2.type === "field_expression" ? func2.childForFieldName("field") ?? func2 : func2.type === "qualified_identifier" ? func2.childForFieldName("name") ?? func2 : func2;
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    f.calls.push({ callee: src.range(callee), callee_text: func2.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map((x) => operand(x, src)), result_used: n.parent?.type !== "expression_statement" });
  }
});
var Cpp = {
  id: LANGUAGE_ID,
  extensions: ["c", "cc", "cpp", "cxx", "c++", "h", "hh", "hpp", "hxx", "h++", "ipp"],
  editor: { id: "ms-vscode.cpptools", name: "C/C++" },
  declarationsAcrossFiles: true,
  init: () => CPP.init(),
  syntax: () => CPP
};

// src/lang/csharp.ts
var LANGUAGE_ID2 = "csharp";
var LITERALS2 = /* @__PURE__ */ new Set([
  "integer_literal",
  "real_literal",
  "string_literal",
  "verbatim_string_literal",
  "raw_string_literal",
  "character_literal",
  "boolean_literal",
  "null_literal"
]);
function operand2(n, src) {
  if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "member_access_expression" || n.type === "member_binding_expression") {
    const f = n.childForFieldName("name");
    if (f) {
      const recv = n.childForFieldName("expression")?.text ?? n.text.slice(0, n.text.length - f.text.length).replace(/\??\.$/, "");
      return { name: src.range(f), text: n.text, form: "name", receiver: recv };
    }
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand2(n.namedChild(0), src);
  if (LITERALS2.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ2 = { eq: ["=="], ne: ["!="] };
var ENDS2 = /* @__PURE__ */ new Set(["break_statement", "return_statement", "throw_statement", "continue_statement", "goto_statement"]);
function initializer(d) {
  const ns = namedChildren(d).filter((x) => x.type !== "comment");
  return ns.length >= 2 ? ns[ns.length - 1] : void 0;
}
var isConst2 = (decl) => !!decl && namedChildren(decl).some((x) => x.type === "modifier" && x.text === "const");
function declare(n, src, f) {
  const decl = src.range(n);
  f.decls.push(decl);
  const params2 = n.childForFieldName("parameters");
  if (!params2) return;
  namedChildren(params2).filter((p) => p.type === "parameter").forEach((p, index2) => {
    const name2 = p.childForFieldName("name");
    if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: index2, decl });
  });
}
function state2(n, src, f) {
  const op = (x) => operand2(x, src);
  switch (n.type) {
    case "assignment_expression": {
      const l = n.childForFieldName("left"), r = n.childForFieldName("right");
      if (!l || !r) break;
      const plain = n.childForFieldName("operator")?.type === "=";
      f.assigns.push({ target: op(l), value: plain ? op(r) : other(n, src), init: n.parent?.type === "initializer_expression" });
      break;
    }
    case "postfix_unary_expression":
    case "prefix_unary_expression": {
      const inc = n.children.some((c) => c !== null && (c.type === "++" || c.type === "--"));
      const t = namedChildren(n)[0];
      if (inc && t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
      break;
    }
    case "variable_declarator": {
      const name2 = n.childForFieldName("name"), v = initializer(n);
      if (!name2 || !v) break;
      const decl = n.parent?.parent;
      const constant = isConst2(decl);
      if (constant) {
        if (op(v).form === "literal") f.consts.push(src.range(name2));
      } else {
        f.assigns.push({ target: { ...op(name2), receiver: decl?.type === "field_declaration" ? "this" : "" }, value: op(v), init: true });
      }
      break;
    }
    case "enum_member_declaration": {
      const name2 = n.childForFieldName("name");
      if (name2) f.consts.push(src.range(name2));
      break;
    }
    case "property_declaration": {
      const name2 = n.childForFieldName("name"), v = n.childForFieldName("value");
      if (name2 && v) f.assigns.push({ target: { ...op(name2), receiver: "this" }, value: op(v), init: true });
      break;
    }
    case "if_statement": {
      const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
      if (c && body2) guardIf(n, c, body2, EQ2, op, f.guards, src);
      break;
    }
    case "switch_statement": {
      const subject2 = n.childForFieldName("value");
      const body2 = n.childForFieldName("body");
      if (!subject2 || !body2) break;
      const v = subject2.type === "tuple_expression" ? void 0 : subject2;
      if (!v) break;
      let pending = [], falls = false;
      for (const sec of namedChildren(body2)) {
        if (sec.type !== "switch_section") continue;
        const kids = namedChildren(sec).filter((x) => x.type !== "comment");
        const labels = kids.filter((x) => x.type === "constant_pattern");
        const stmts = kids.filter((x) => x.type !== "constant_pattern" && x.type !== "when_clause");
        for (const l of labels) pending.push(l.namedChild(0) ?? l);
        if (!stmts.length) continue;
        const range2 = src.span(stmts[0], stmts[stmts.length - 1]);
        for (const x of pending) f.guards.push({ left: op(v), right: op(x), equal: true, body: range2, certain: !falls });
        falls = !ENDS2.has(stmts[stmts.length - 1].type);
        pending = [];
      }
      break;
    }
  }
}
function typeName(t) {
  if (t.type === "qualified_name") return typeName(t.childForFieldName("name") ?? t);
  if (t.type === "generic_name") return t.namedChild(0) ?? t;
  return t;
}
var CSHARP = new Grammar("tree-sitter-c_sharp.wasm", (n, src, f) => {
  state2(n, src, f);
  switch (n.type) {
    case "method_declaration":
    case "constructor_declaration":
    case "local_function_statement":
    case "operator_declaration":
      declare(n, src, f);
      break;
    case "invocation_expression":
    case "object_creation_expression": {
      const func2 = n.type === "invocation_expression" ? n.childForFieldName("function") : n.childForFieldName("type");
      if (!func2) break;
      const name2 = func2.type === "member_access_expression" || func2.type === "member_binding_expression" ? func2.childForFieldName("name") ?? func2 : n.type === "object_creation_expression" ? typeName(func2) : func2;
      const a = n.childForFieldName("arguments");
      const argNodes = a ? namedChildren(a).filter((x) => x.type === "argument").map((x) => namedChildren(x).filter((c) => c.type !== "name_colon").pop() ?? x) : [];
      let p = n.parent;
      while (p?.type === "await_expression") p = p.parent;
      f.calls.push({ callee: src.range(name2), callee_text: func2.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map((x) => operand2(x, src)), result_used: p !== null && p.type !== "expression_statement" });
      break;
    }
  }
});
var CSharp = {
  id: LANGUAGE_ID2,
  extensions: ["cs"],
  editor: { id: "ms-dotnettools.csharp", name: "C#" },
  init: () => CSHARP.init(),
  syntax: () => CSHARP
};

// src/lang/dart.ts
var LANGUAGE_ID3 = "dart";
var LITERALS3 = /* @__PURE__ */ new Set([
  "decimal_integer_literal",
  "hex_integer_literal",
  "decimal_floating_point_literal",
  "string_literal",
  "true",
  "false",
  "null_literal",
  "symbol_literal"
]);
var ENDS3 = /* @__PURE__ */ new Set(["break_statement", "return_statement", "continue_statement"]);
var isComment = (n) => n.type === "comment" || n.type === "documentation_comment";
var significant = (ns) => ns.filter((n) => !isComment(n));
function member(n) {
  const s = n.type === "selector" ? n.namedChild(0) : n;
  if (s?.type !== "unconditional_assignable_selector" && s?.type !== "conditional_assignable_selector") return void 0;
  return namedChildren(s).find((x) => x.type === "identifier");
}
function otherRun(run2, src) {
  const text = src.text.slice(run2[0].startIndex, run2[run2.length - 1].endIndex);
  return { name: src.span(run2[0], run2[run2.length - 1]), text, form: "other", receiver: "" };
}
function operand3(run2, src) {
  run2 = significant(run2);
  if (!run2.length) throw new Error("empty operand");
  const last = run2[run2.length - 1];
  if (run2.length === 1) {
    const n = run2[0];
    if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
    if (LITERALS3.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
    if (n.type === "assignable_expression" || n.type === "parenthesized_expression") {
      const inner = namedChildren(n);
      if (inner.length) return operand3(inner, src);
    }
  }
  const m = member(last);
  if (m && run2.length > 1) {
    const recv = src.text.slice(run2[0].startIndex, last.startIndex).replace(/\??\.?$/, "");
    return { name: src.range(m), text: src.text.slice(run2[0].startIndex, last.endIndex), form: "name", receiver: recv };
  }
  return otherRun(run2, src);
}
function guards(seq, body2, src, out2, certain = true) {
  seq = significant(seq);
  if (seq.length !== 1) return;
  const n = seq[0];
  if (n.type === "parenthesized_expression") return guards(namedChildren(n), body2, src, out2, certain);
  if (n.type === "logical_and_expression" || n.type === "logical_or_expression") {
    const tok = n.type === "logical_and_expression" ? "&&" : "||";
    const parts2 = split2(n, (c) => c.type === tok);
    for (const p of parts2) guards(p, body2, src, out2, certain && tok === "&&");
  } else if (n.type === "equality_expression") {
    const sides2 = split2(n, (c) => c.type === "equality_operator");
    const op = namedChildren(n).find((c) => c.type === "equality_operator")?.text;
    if (sides2.length === 2 && sides2[0].length && sides2[1].length && (op === "==" || op === "!=")) {
      out2.push({ left: operand3(sides2[0], src), right: operand3(sides2[1], src), equal: op === "==", body: body2, certain });
    }
  }
}
function split2(n, sep) {
  const parts2 = [[]];
  for (const c of n.children) {
    if (!c) continue;
    if (sep(c)) parts2.push([]);
    else if (c.isNamed) parts2[parts2.length - 1].push(c);
  }
  return parts2;
}
var hasChild = (n, type) => !!n && namedChildren(n).some((c) => c.type === type);
function assignment(n, src, f) {
  const kids = n.children.filter((c) => c !== null);
  const li = kids.findIndex((c) => c.id === n.childForFieldName("left")?.id);
  const left = kids[li];
  if (!left) return;
  const right = n.childrenForFieldName("right").filter((c) => c !== null);
  const plain = kids[li + 1]?.text === "=";
  if (!right.length) return;
  f.assigns.push({
    target: operand3(namedChildren(left), src),
    value: plain ? operand3(right, src) : otherRun([n], src),
    init: false
  });
}
function variables(n, src, f) {
  if (n.type === "enum_constant") {
    const name2 = n.childForFieldName("name");
    if (name2) f.consts.push(src.range(name2));
  } else if (n.type === "initialized_variable_definition") {
    const name2 = n.childForFieldName("name"), value = n.childrenForFieldName("value").filter((c) => c !== null);
    if (!name2 || !value.length) return;
    if (hasChild(n, "const_builtin")) {
      if (operand3(value, src).form === "literal") f.consts.push(src.range(name2));
    } else if (!hasChild(n, "final_builtin")) {
      f.assigns.push({ target: operand3([name2], src), value: operand3(value, src), init: true });
    }
  } else if (n.type === "initialized_identifier") {
    const [name2, ...rest2] = namedChildren(n);
    const value = significant(rest2);
    if (name2?.type !== "identifier" || !value.length) return;
    const local = n.parent?.type === "initialized_variable_definition";
    const decl = local ? n.parent : n.parent?.parent;
    if (hasChild(decl, "const_builtin")) {
      if (operand3(value, src).form === "literal") f.consts.push(src.range(name2));
    } else if (!hasChild(decl, "final_builtin")) {
      f.assigns.push({ target: { ...operand3([name2], src), receiver: local ? "" : "this" }, value: operand3(value, src), init: true });
    }
  }
}
function statements(n, src, f) {
  if (n.type === "assignment_expression") assignment(n, src, f);
  else if (n.type === "postfix_expression" || n.type === "unary_expression") {
    const t = namedChildren(n).find((c) => c.type === "assignable_expression");
    if (t && /^(\+\+|--)|(\+\+|--)$/.test(n.text)) f.assigns.push({ target: operand3(namedChildren(t), src), value: otherRun([n], src), init: false });
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
    if (c && body2) guards([c], src.range(body2), src, f.guards);
  } else if (n.type === "switch_statement") {
    const c = n.childForFieldName("condition"), block = n.childForFieldName("body");
    const subject2 = c ? significant(namedChildren(c)) : [];
    if (!subject2.length || !block) return;
    let pending = [], stmts = [], falls = false;
    const flush = () => {
      if (!stmts.length) return;
      const range2 = src.span(stmts[0], stmts[stmts.length - 1]);
      for (const v of pending) f.guards.push({ left: operand3(subject2, src), right: operand3(v, src), equal: true, body: range2, certain: !falls });
      falls = !ENDS3.has(stmts[stmts.length - 1].type);
      pending = [];
      stmts = [];
    };
    for (const k of significant(namedChildren(block))) {
      if (k.type === "switch_label") {
        flush();
        if (hasChild(k, "case_builtin")) pending.push(significant(namedChildren(k).filter((x) => x.type !== "case_builtin")));
      } else stmts.push(k);
    }
    flush();
  }
}
function declare2(n, src, f) {
  const outer = n.parent?.type === "method_signature" ? n.parent : n;
  const body2 = outer.nextNamedSibling;
  const decl = body2?.type === "function_body" ? src.span(outer, body2) : src.range(outer);
  f.decls.push(decl);
  const list = namedChildren(n).find((c) => c.type === "formal_parameter_list");
  if (!list) return;
  let index2 = 0;
  const one = (p) => {
    const name2 = p.childForFieldName("name");
    if (p.type === "formal_parameter" && name2) f.params.push({ name: name2.text, range: src.range(name2), index: index2, decl });
    index2++;
  };
  for (const p of namedChildren(list)) {
    if (p.type === "optional_formal_parameters") {
      if (p.text.startsWith("[")) namedChildren(p).filter((x) => x.type.endsWith("parameter")).forEach(one);
    } else if (p.type.endsWith("parameter")) one(p);
  }
}
function calls(n, src, f) {
  const kids = significant(namedChildren(n));
  for (let i2 = 0; i2 < kids.length; i2++) {
    const start2 = kids[i2];
    if (start2.type !== "identifier" && start2.type !== "this" && start2.type !== "super") continue;
    let j = i2 + 1;
    while (j < kids.length && kids[j].type === "selector") j++;
    for (let k = i2 + 1; k < j; k++) {
      const args2 = namedChildren(kids[k]).find((c) => c.type === "argument_part");
      if (!args2) continue;
      const prev = kids[k - 1];
      const callee = k === i2 + 1 ? start2.type === "identifier" ? start2 : void 0 : member(prev);
      if (!callee) continue;
      const argNodes = namedChildren(namedChildren(args2).find((c) => c.type === "arguments") ?? args2).filter((c) => c.type === "argument");
      const runs = argNodes.map((a) => significant(namedChildren(a))).filter((r) => r.length);
      f.calls.push({
        callee: src.range(callee),
        callee_text: src.text.slice(start2.startIndex, prev.endIndex),
        args: runs.map((r) => src.span(r[0], r[r.length - 1])),
        values: runs.map((r) => operand3(r, src)),
        result_used: !(n.type === "expression_statement" && k === j - 1 && j === kids.length)
      });
    }
    i2 = j - 1;
  }
}
var DART = new Grammar("tree-sitter-dart.wasm", (n, src, f) => {
  variables(n, src, f);
  statements(n, src, f);
  calls(n, src, f);
  if (n.type === "function_signature" || n.type === "constructor_signature") declare2(n, src, f);
  else if (n.type === "new_expression" || n.type === "const_object_expression") {
    const type = namedChildren(n).find((c) => c.type === "type_identifier");
    const args2 = namedChildren(n).find((c) => c.type === "arguments");
    if (!type) return;
    const runs = args2 ? namedChildren(args2).filter((c) => c.type === "argument").map((a) => significant(namedChildren(a))).filter((r) => r.length) : [];
    f.calls.push({
      callee: src.range(type),
      callee_text: type.text,
      args: runs.map((r) => src.span(r[0], r[r.length - 1])),
      values: runs.map((r) => operand3(r, src)),
      result_used: n.parent?.type !== "expression_statement"
    });
  }
});
var Dart = {
  id: LANGUAGE_ID3,
  extensions: ["dart"],
  editor: { id: "Dart-Code.dart-code", name: "Dart and Flutter" },
  init: () => DART.init(),
  syntax: () => DART
};

// src/lang/go.ts
var LANGUAGE_ID4 = "go";
var LITERALS4 = /* @__PURE__ */ new Set([
  "interpreted_string_literal",
  "raw_string_literal",
  "int_literal",
  "float_literal",
  "imaginary_literal",
  "rune_literal",
  "true",
  "false",
  "nil"
]);
function operand4(n, src) {
  if (n.type === "identifier" || n.type === "field_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "selector_expression") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("operand")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand4(n.namedChild(0), src);
  if (n.type === "literal_element" && n.namedChildCount === 1) return operand4(n.namedChild(0), src);
  if (LITERALS4.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ3 = { eq: ["=="], ne: ["!="] };
function caseBody(c, src) {
  const stmts = namedChildren(c).filter((x) => c.childForFieldName("value")?.id !== x.id && x.type !== "comment");
  return stmts.length ? src.span(stmts[0], stmts[stmts.length - 1]) : void 0;
}
function packageName(module2) {
  const segs = module2.split("/");
  let last = segs.pop() ?? module2;
  if (/^v\d+$/.test(last) && segs.length) last = segs.pop();
  return last.replace(/\.v\d+$/, "").replace(/^go-/, "").replace(/-/g, "_");
}
var GO_IMPORTS = {
  path: (callee) => /^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : [],
  local(module2, _from, names) {
    const segs = module2.split("/");
    const start2 = segs[0].includes(".") ? 1 : 0;
    const out2 = [];
    for (let i2 = start2; i2 < segs.length; i2++) out2.push({ files: [segs.slice(i2).join("/") + "/"], names });
    return out2;
  },
  external: (module2, names) => ({ package: module2.split("/")[0].includes(".") ? module2 : module2.split("/").pop(), names })
};
var GO2 = new Grammar("tree-sitter-go.wasm", (n, src, f) => {
  const op = (x) => operand4(x, src);
  if (n.type === "assignment_statement") {
    const l = namedChildren(n.childForFieldName("left")), r = namedChildren(n.childForFieldName("right"));
    const plain = n.childForFieldName("operator")?.type === "=" && l.length === r.length;
    l.forEach((t, i2) => f.assigns.push({ target: op(t), value: plain ? op(r[i2]) : other(r[Math.min(i2, r.length - 1)] ?? n, src), init: false }));
  } else if (n.type === "short_var_declaration") {
    const l = namedChildren(n.childForFieldName("left")), r = namedChildren(n.childForFieldName("right"));
    if (l.length === r.length) l.forEach((t, i2) => f.assigns.push({ target: op(t), value: op(r[i2]), init: true }));
  } else if (n.type === "const_spec") {
    for (const x of n.childrenForFieldName("name")) if (x) f.consts.push(src.range(x)), symbol(f, src, n, x, "term", 8);
  } else if (n.type === "type_spec") {
    const t = n.childForFieldName("type")?.type;
    symbol(f, src, n, n.childForFieldName("name"), "type", t === "interface_type" ? 21 : t === "struct_type" ? 49 : 7);
  } else if (n.type === "field_declaration") {
    for (const x of n.childrenForFieldName("name")) if (x) symbol(f, src, n, x, "term", 15);
  } else if (n.type === "inc_statement" || n.type === "dec_statement") {
    const t = n.namedChild(0);
    if (t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
  } else if (n.type === "var_spec") {
    const vals = n.childForFieldName("value");
    const names = n.childrenForFieldName("name").filter((x) => x !== null);
    for (const x of names) symbol(f, src, n, x, "term", 61);
    const r = vals ? namedChildren(vals) : [];
    if (r.length === names.length) names.forEach((t, i2) => f.assigns.push({ target: op(t), value: op(r[i2]), init: true }));
  } else if (n.type === "keyed_element" && n.parent?.parent?.type === "composite_literal" && n.parent.parent.childForFieldName("type")?.type !== "map_type") {
    const k = n.childForFieldName("key"), v = n.childForFieldName("value");
    if (k && v) f.assigns.push({ target: op(k), value: op(v), init: true });
  } else if (n.type === "import_spec") {
    const name2 = n.childForFieldName("name"), module2 = n.childForFieldName("path")?.text.slice(1, -1);
    if (module2 === void 0 || name2?.type === "blank_identifier" || name2?.type === "dot") return;
    f.imports.push({ local: name2?.text ?? packageName(module2), module: module2 });
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
    if (c && body2) guardIf(n, c, body2, EQ3, op, f.guards, src);
  } else if (n.type === "expression_switch_statement") {
    const v = n.childForFieldName("value");
    for (const c of namedChildren(n)) {
      if (c.type !== "expression_case") continue;
      const body2 = caseBody(c, src), vals = c.childForFieldName("value");
      if (!body2 || !vals) continue;
      for (const x of namedChildren(vals))
        v ? f.guards.push({ left: op(v), right: op(x), equal: true, body: body2, certain: true }) : equalities(x, body2, EQ3, op, f.guards);
    }
  } else if (n.type === "function_declaration" || n.type === "method_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    symbol(f, src, n, n.childForFieldName("name"), "method", n.type === "method_declaration" ? 26 : 17);
    const params2 = n.childForFieldName("parameters");
    if (params2) {
      let idx = 0;
      for (const d of namedChildren(params2)) {
        if (d.type !== "parameter_declaration" && d.type !== "variadic_parameter_declaration") continue;
        let named = 0;
        for (const name2 of d.childrenForFieldName("name")) {
          if (!name2) continue;
          f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
          idx++;
          named++;
        }
        if (named === 0) idx++;
      }
    }
  } else if (n.type === "call_expression") {
    const func2 = n.childForFieldName("function");
    if (!func2) return;
    const callee = func2.type === "selector_expression" ? func2.childForFieldName("field") ?? func2 : func2;
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const args2 = argNodes.map((x) => src.range(x)), values = argNodes.map((x) => operand4(x, src));
    const p = n.parent?.type;
    const used = p !== "expression_statement" && p !== "go_statement" && p !== "defer_statement";
    f.calls.push({ callee: src.range(callee), callee_text: func2.text, args: args2, values, result_used: used });
  }
});
var Go = {
  id: LANGUAGE_ID4,
  headless: true,
  extensions: ["go"],
  editor: { id: "golang.go", name: "Go" },
  imports: GO_IMPORTS,
  init: () => GO2.init(),
  syntax: () => GO2
};

// src/lang/js.ts
var LANGUAGE_ID5 = "javascript";
var FUNCTIONS = /* @__PURE__ */ new Set([
  "function_declaration",
  "generator_function_declaration",
  "function_expression",
  "function",
  "generator_function",
  "arrow_function",
  "method_definition"
]);
function namingDecl(f) {
  if (f.type === "function_declaration" || f.type === "generator_function_declaration" || f.type === "method_definition") return f;
  const p = f.parent;
  if (!p) return void 0;
  const holds2 = (field) => p.childForFieldName(field)?.id === f.id;
  switch (p.type) {
    case "variable_declarator":
    case "public_field_definition":
    case "field_definition":
    case "pair":
      return holds2("value") ? p : void 0;
    case "assignment_expression":
      return holds2("right") ? p : void 0;
    default:
      return void 0;
  }
}
function paramName(n) {
  switch (n.type) {
    case "identifier":
      return n;
    case "assignment_pattern": {
      const l = n.childForFieldName("left");
      return l?.type === "identifier" ? l : void 0;
    }
    case "rest_pattern": {
      const c = n.namedChild(0);
      return c?.type === "identifier" ? c : void 0;
    }
    case "required_parameter":
    case "optional_parameter": {
      const p = n.childForFieldName("pattern");
      return p ? paramName(p) : void 0;
    }
    default:
      return void 0;
  }
}
var LITERALS5 = /* @__PURE__ */ new Set(["string", "number", "true", "false", "null", "undefined"]);
function operand5(n, src) {
  if (n.type === "identifier" || n.type === "property_identifier" || n.type === "private_property_identifier")
    return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "member_expression") {
    const p = n.childForFieldName("property");
    if (p) return { name: src.range(p), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand5(n.namedChild(0), src);
  if (LITERALS5.has(n.type) || n.type === "template_string" && !namedChildren(n).some((x) => x.type === "template_substitution"))
    return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ4 = { eq: ["===", "=="], ne: ["!==", "!="] };
var ENDS4 = /* @__PURE__ */ new Set(["break_statement", "return_statement", "throw_statement", "continue_statement"]);
function state3(n, src, f) {
  const op = (x) => operand5(x, src);
  if (n.type === "assignment_expression") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r) f.assigns.push({ target: op(l), value: op(r), init: false });
  } else if (n.type === "augmented_assignment_expression") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "update_expression") {
    const a = n.childForFieldName("argument");
    if (a) f.assigns.push({ target: op(a), value: other(n, src), init: false });
  } else if (n.type === "lexical_declaration" && n.childForFieldName("kind")?.type === "const") {
    for (const d of namedChildren(n)) {
      const t = d.childForFieldName("name"), v = d.childForFieldName("value");
      if (d.type === "variable_declarator" && t?.type === "identifier" && v && op(v).form === "literal") f.consts.push(src.range(t));
    }
  }
  const isConst3 = n.parent?.type === "lexical_declaration" && n.parent.childForFieldName("kind")?.type === "const";
  if (n.type === "variable_declarator" && !isConst3 || n.type === "field_definition" || n.type === "public_field_definition") {
    const t = n.childForFieldName("name") ?? n.childForFieldName("property"), v = n.childForFieldName("value");
    if (t && v) f.assigns.push({ target: { ...op(t), receiver: n.type === "variable_declarator" ? "" : "this" }, value: op(v), init: true });
  } else if (n.type === "ternary_expression") {
    const c = n.childForFieldName("condition"), yes = n.childForFieldName("consequence"), no = n.childForFieldName("alternative");
    if (c && yes) branches(c, src.range(yes), no ? src.range(no) : void 0, EQ4, op, f.guards);
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
    if (c && body2) guardIf(n, c, body2, EQ4, op, f.guards, src);
  } else if (n.type === "switch_statement") {
    const v = n.childForFieldName("value"), cases = namedChildren(n.childForFieldName("body") ?? n);
    const subject2 = v?.type === "parenthesized_expression" && v.namedChildCount === 1 ? v.namedChild(0) : v;
    if (!subject2) return;
    let pending = [], falls = false;
    for (const c of cases) {
      if (c.type !== "switch_case") continue;
      const val = c.childForFieldName("value");
      if (val) pending.push(val);
      const stmts = c.childrenForFieldName("body").filter((x) => x !== null && x.type !== "comment");
      if (!stmts.length) continue;
      const body2 = src.span(stmts[0], stmts[stmts.length - 1]);
      for (const x of pending) f.guards.push({ left: op(subject2), right: op(x), equal: true, body: body2, certain: !falls });
      falls = !ENDS4.has(stmts[stmts.length - 1].type);
      pending = [];
    }
  }
}
var unquote = (s) => s.type === "string" || s.type === "template_string" ? s.text.slice(1, -1) : s.text;
function imports(n, f) {
  const push = (local, module2, member3) => f.imports.push(member3 === void 0 ? { local, module: module2 } : { local, module: module2, member: member3 });
  if (n.type === "import_statement") {
    const source = n.childForFieldName("source");
    if (!source || children(n).some((c) => c.type === "type")) return;
    const module2 = unquote(source);
    for (const c of namedChildren(n)) {
      if (c.type === "import_require_clause") {
        const id = namedChildren(c).find((x) => x.type === "identifier");
        if (id) push(id.text, module2);
      } else if (c.type === "import_clause") {
        for (const x of namedChildren(c)) {
          if (x.type === "identifier") push(x.text, module2);
          else if (x.type === "namespace_import") {
            const id = namedChildren(x).find((y) => y.type === "identifier");
            if (id) push(id.text, module2);
          } else if (x.type === "named_imports") {
            for (const spec of namedChildren(x)) {
              const name2 = spec.childForFieldName("name"), alias = spec.childForFieldName("alias");
              if (spec.type === "import_specifier" && name2 && !children(spec).some((y) => y.type === "type")) push((alias ?? name2).text, module2, name2.text);
            }
          }
        }
      }
    }
  } else if (n.type === "variable_declarator") {
    const name2 = n.childForFieldName("name"), value = n.childForFieldName("value");
    if (!name2 || value?.type !== "call_expression" || value.childForFieldName("function")?.text !== "require") return;
    const arg = namedChildren(value.childForFieldName("arguments") ?? value)[0];
    if (!arg || arg.type !== "string" && arg.type !== "template_string") return;
    const module2 = unquote(arg);
    if (name2.type === "identifier") push(name2.text, module2);
    else if (name2.type === "object_pattern") {
      for (const x of namedChildren(name2)) {
        if (x.type === "shorthand_property_identifier_pattern") push(x.text, module2, x.text);
        else if (x.type === "pair_pattern") {
          const k = x.childForFieldName("key"), v = x.childForFieldName("value");
          if (k && v?.type === "identifier") push(v.text, module2, k.text);
        }
      }
    }
  }
}
var TYPES = /* @__PURE__ */ new Set(["class_declaration", "class", "abstract_class_declaration", "interface_declaration", "type_alias_declaration", "enum_declaration"]);
function outline2(n, src, f) {
  if (TYPES.has(n.type)) {
    const name2 = n.childForFieldName("name");
    if (name2) symbol(f, src, n.parent?.type === "export_statement" ? n.parent : n, name2, "type", n.type === "interface_declaration" ? 21 : n.type === "enum_declaration" ? 11 : 7);
  } else if (n.type === "enum_assignment" || n.type === "property_identifier" && n.parent?.type === "enum_body") {
    symbol(f, src, n, n.type === "enum_assignment" ? n.childForFieldName("name") : n, "term", 12);
  } else if (FUNCTIONS.has(n.type)) {
    const d = namingDecl(n);
    if (!d) return;
    const name2 = d.type === "pair" ? d.childForFieldName("key") : d.type === "assignment_expression" ? d.childForFieldName("left") : d.childForFieldName("name") ?? d.childForFieldName("property");
    const leaf = name2?.type === "member_expression" ? name2.childForFieldName("property") : name2;
    const inType = d.type === "method_definition" || d.type === "public_field_definition" || d.type === "field_definition";
    const whole = d.parent?.type === "export_statement" ? d.parent : d.type === "variable_declarator" && d.parent?.parent?.type === "export_statement" ? d.parent.parent : d;
    symbol(f, src, whole, leaf, "method", d.type === "method_definition" && leaf?.text === "constructor" ? 9 : inType ? 26 : 17);
  } else if (n.type === "variable_declarator" || n.type === "public_field_definition" || n.type === "field_definition") {
    const name2 = n.childForFieldName("name") ?? n.childForFieldName("property"), value = n.childForFieldName("value");
    if (name2?.type !== "identifier" && name2?.type !== "property_identifier" && name2?.type !== "private_property_identifier") return;
    if (value && FUNCTIONS.has(value.type)) return;
    const isConst3 = n.parent?.type === "lexical_declaration" && n.parent.childForFieldName("kind")?.type === "const";
    symbol(f, src, n, name2, "term", n.type === "variable_declarator" ? isConst3 ? 8 : 61 : 15);
  }
}
function visit(n, src, f) {
  state3(n, src, f);
  imports(n, f);
  outline2(n, src, f);
  if (FUNCTIONS.has(n.type)) {
    const d = namingDecl(n);
    if (d) {
      const decl = src.range(d);
      f.decls.push(decl);
      const params2 = n.childForFieldName("parameters");
      if (params2) {
        namedChildren(params2).filter((x) => x.type !== "comment").forEach((p, index2) => {
          const name2 = paramName(p);
          if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: index2, decl });
        });
      } else {
        const p = n.childForFieldName("parameter");
        if (p) f.params.push({ name: p.text, range: src.range(p), index: 0, decl });
      }
    }
  }
  const func2 = n.type === "call_expression" ? n.childForFieldName("function") : n.type === "new_expression" ? n.childForFieldName("constructor") : null;
  if (func2) {
    const name2 = func2.type === "member_expression" ? func2.childForFieldName("property") ?? func2 : func2;
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const args2 = argNodes.map((x) => src.range(x)), values = argNodes.map((x) => operand5(x, src));
    const used = n.parent !== null && n.parent.type !== "expression_statement";
    f.calls.push({ callee: src.range(name2), callee_text: func2.text, args: args2, values, result_used: used });
  }
}
var JS2 = new Grammar("tree-sitter-javascript.wasm", visit);
var TS = new Grammar("tree-sitter-typescript.wasm", visit);
var TSX = new Grammar("tree-sitter-tsx.wasm", visit);
var NODE_BUILTINS = new Set("assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain events fs http http2 https inspector module net os path perf_hooks process punycode querystring readline repl sea sqlite stream string_decoder sys test timers tls trace_events tty url util v8 vm wasi worker_threads zlib".split(" "));
var EXTS = ["ts", "tsx", "js", "jsx", "mts", "cts", "mjs", "cjs"];
var relative = (m) => m.startsWith("./") || m.startsWith("../") || m === "." || m === "..";
function join6(from, m) {
  const segs = from.split("/").slice(0, -1);
  for (const s of m.split("/")) {
    if (s === "" || s === ".") continue;
    if (s === "..") {
      if (!segs.length) return void 0;
      segs.pop();
    } else segs.push(s);
  }
  return segs.join("/");
}
var GLOBALS = new Map([
  ...[
    "Math",
    "JSON",
    "Object",
    "Array",
    "Map",
    "Set",
    "WeakMap",
    "WeakSet",
    "Promise",
    "Error",
    "TypeError",
    "RangeError",
    "Date",
    "Number",
    "String",
    "Boolean",
    "Symbol",
    "BigInt",
    "RegExp",
    "Reflect",
    "Proxy",
    "Intl",
    "parseInt",
    "parseFloat",
    "isNaN",
    "isFinite",
    "encodeURIComponent",
    "decodeURIComponent",
    "encodeURI",
    "decodeURI",
    "structuredClone",
    "queueMicrotask",
    "setTimeout",
    "setInterval",
    "clearTimeout",
    "clearInterval",
    "fetch",
    "XMLHttpRequest",
    "WebSocket",
    "EventSource",
    "URL",
    "URLSearchParams",
    "TextEncoder",
    "TextDecoder",
    "AbortController",
    "Blob",
    "FormData",
    "Headers",
    "Request",
    "Response",
    "crypto",
    "performance",
    "navigator",
    "document",
    "window",
    "globalThis",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "Int8Array",
    "Uint8Array",
    "Uint8ClampedArray",
    "Int16Array",
    "Uint16Array",
    "Int32Array",
    "Uint32Array",
    "Float32Array",
    "Float64Array",
    "ArrayBuffer",
    "DataView",
    "Atomics",
    "SharedArrayBuffer",
    "alert",
    "console"
  ].map((n) => [n, "builtins"]),
  ...["process", "Buffer", "require", "module", "__dirname", "__filename", "setImmediate", "clearImmediate"].map((n) => [n, "node"])
]);
var JS_IMPORTS = {
  path: (callee) => /^[\w$]+(\.[\w$]+)*$/.test(callee) ? callee.split(".") : [],
  local(module2, from, names) {
    if (!relative(module2)) return [];
    const p = join6(from, module2);
    if (p === void 0) return [];
    const files = [p];
    const m = /^(.*)\.([cm]?js)x?$/.exec(p);
    if (m) files.push(`${m[1]}.${m[2].replace("js", "ts")}`, `${m[1]}.tsx`);
    for (const e of EXTS) files.push(`${p}.${e}`);
    for (const e of EXTS) files.push(`${p}/index.${e}`);
    return [{ files, names }];
  },
  qualified: (path11) => GLOBALS.has(path11[0]) ? { module: `<${GLOBALS.get(path11[0])}>`, names: path11 } : void 0,
  external(module2, names) {
    if (module2 === "<builtins>" || module2 === "<node>") return { package: module2.slice(1, -1), names };
    if (relative(module2) || module2.startsWith("/") || module2.startsWith("#")) return void 0;
    const m = module2.replace(/^node:/, "");
    const segs = m.split("/");
    if (NODE_BUILTINS.has(segs[0])) return { package: "node", names: [`"${m}"`, ...names] };
    const pkg = segs[0].startsWith("@") && segs.length > 1 ? `${segs[0]}/${segs[1]}` : segs[0];
    return { package: pkg, names: pkg === module2 ? names : [`"${module2}"`, ...names] };
  }
};
var Js = {
  id: LANGUAGE_ID5,
  headless: true,
  extensions: ["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"],
  editor: { id: "vscode.typescript-language-features", name: "TypeScript and JavaScript" },
  imports: JS_IMPORTS,
  init: async () => {
    await Promise.all([JS2.init(), TS.init(), TSX.init()]);
  },
  syntax(p) {
    const e = extension(p);
    if (e === "js" || e === "mjs" || e === "cjs" || e === "jsx") return JS2;
    if (e === "ts" || e === "mts" || e === "cts") return TS;
    if (e === "tsx") return TSX;
    return void 0;
  }
};

// src/lang/ruby.ts
var LANGUAGE_ID6 = "ruby";
var NAMES = /* @__PURE__ */ new Set(["identifier", "constant", "instance_variable", "class_variable", "global_variable"]);
var LITERALS6 = /* @__PURE__ */ new Set(["integer", "float", "string", "simple_symbol", "delimited_symbol", "true", "false", "nil"]);
var STATEMENTS = /* @__PURE__ */ new Set(["program", "body_statement", "then", "else", "do_block", "begin", "block_body"]);
function operand6(n, src) {
  if (NAMES.has(n.type)) return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "scope_resolution") {
    const f = n.childForFieldName("name");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("scope")?.text ?? "" };
  }
  if (n.type === "call" && !n.childForFieldName("arguments")) {
    const m = n.childForFieldName("method"), r = n.childForFieldName("receiver");
    if (m && r) return { name: src.range(m), text: n.text, form: "name", receiver: r.text };
  }
  if (LITERALS6.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ5 = { eq: ["==", "==="], ne: ["!="] };
function paramName2(p) {
  if (p.type === "identifier") return p;
  return ["optional_parameter", "splat_parameter", "hash_splat_parameter", "keyword_parameter", "block_parameter"].includes(p.type) ? p.childForFieldName("name") ?? void 0 : void 0;
}
var RUBY = new Grammar("tree-sitter-ruby.wasm", (n, src, f) => {
  const op = (x) => operand6(x, src);
  if (n.type === "assignment") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r && r.type !== "assignment" && r.type !== "right_assignment_list") f.assigns.push({ target: op(l), value: op(r), init: false });
    if (l?.type === "constant") f.consts.push(src.range(l));
  } else if (n.type === "operator_assignment") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "if" || n.type === "elsif") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
    if (c && body2) guardIf(n, c, body2, EQ5, op, f.guards, src);
  } else if (n.type === "method" || n.type === "singleton_method") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params2 = n.childForFieldName("parameters");
    let idx = 0;
    for (const p of params2 ? namedChildren(params2) : []) {
      const name2 = paramName2(p);
      if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
      idx++;
    }
  } else if (n.type === "call") {
    const m = n.childForFieldName("method");
    const a = n.childForFieldName("arguments");
    if (!m || !a && !STATEMENTS.has(n.parent?.type ?? "")) return;
    const r = n.childForFieldName("receiver");
    const target = m.text === "new" && r ? r.type === "scope_resolution" ? r.childForFieldName("name") ?? r : r : m;
    const argNodes = a ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const values = argNodes.map((x) => x.type === "pair" ? x.childForFieldName("value") ?? x : x);
    f.calls.push({ callee: src.range(target), callee_text: r ? `${r.text}.${m.text}` : m.text, args: values.map((x) => src.range(x)), values: values.map(op), result_used: !STATEMENTS.has(n.parent?.type ?? "") });
  }
});
var Ruby = {
  id: LANGUAGE_ID6,
  extensions: ["rb", "rake", "gemspec"],
  editor: { id: "Shopify.ruby-lsp", name: "Ruby LSP" },
  init: () => RUBY.init(),
  syntax: () => RUBY
};

// src/lang/python.ts
var LANGUAGE_ID7 = "python";
var LITERALS7 = /* @__PURE__ */ new Set(["integer", "float", "string", "concatenated_string", "true", "false", "none"]);
function operand7(n, src) {
  if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "attribute") {
    const a = n.childForFieldName("attribute");
    if (a) return { name: src.range(a), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand7(n.namedChild(0), src);
  if (LITERALS7.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ6 = { eq: ["=="], ne: ["!="] };
function paramName3(p) {
  if (p.type === "identifier") return p;
  if (p.type === "default_parameter" || p.type === "typed_default_parameter") return p.childForFieldName("name") ?? void 0;
  if (p.type === "typed_parameter" || p.type === "list_splat_pattern" || p.type === "dictionary_splat_pattern") return namedChildren(p).find((c) => c.type === "identifier");
  return void 0;
}
var PYTHON = new Grammar("tree-sitter-python.wasm", (n, src, f) => {
  const op = (x) => operand7(x, src);
  if (n.type === "import_statement") {
    for (const c of namedChildren(n)) {
      if (c.type === "dotted_name") f.imports.push({ local: c.text.split(".")[0], module: c.text.split(".")[0] });
      else if (c.type === "aliased_import") {
        const name2 = c.childForFieldName("name"), alias = c.childForFieldName("alias");
        if (name2 && alias) f.imports.push({ local: alias.text, module: name2.text });
      }
    }
  } else if (n.type === "import_from_statement") {
    const module2 = n.childForFieldName("module_name")?.text;
    if (module2 === void 0) return;
    for (const c of n.childrenForFieldName("name")) {
      if (!c) continue;
      const name2 = c.type === "aliased_import" ? c.childForFieldName("name") : c, alias = c.type === "aliased_import" ? c.childForFieldName("alias") : null;
      if (name2) f.imports.push({ local: (alias ?? name2).text, module: module2, member: name2.text });
    }
  } else if (n.type === "assignment") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r && l.type !== "pattern_list" && l.type !== "tuple_pattern") f.assigns.push({ target: op(l), value: r.type === "assignment" ? other(r, src) : op(r), init: false });
    if (l?.type === "identifier" && n.parent?.type === "expression_statement") symbol(f, src, n, l, "term", n.parent.parent?.parent?.type === "class_definition" ? 15 : 61);
  } else if (n.type === "augmented_assignment") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "if_statement" || n.type === "elif_clause") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
    if (c && body2) guardIf(n, c, body2, EQ6, op, f.guards, src);
  } else if (n.type === "class_definition") {
    symbol(f, src, n.parent?.type === "decorated_definition" ? n.parent : n, n.childForFieldName("name"), "type", 7);
  } else if (n.type === "function_definition") {
    const decl = src.range(n);
    f.decls.push(decl);
    {
      let up2 = n.parent;
      if (up2?.type === "decorated_definition") up2 = up2.parent;
      const inClass = up2?.type === "block" && up2.parent?.type === "class_definition";
      symbol(f, src, n.parent?.type === "decorated_definition" ? n.parent : n, n.childForFieldName("name"), "method", inClass ? 26 : 17);
    }
    const params2 = n.childForFieldName("parameters");
    if (!params2) return;
    let up = n.parent;
    if (up?.type === "decorated_definition") up = up.parent;
    let idx = up?.type === "block" && up.parent?.type === "class_definition" ? -1 : 0;
    for (const p of namedChildren(params2)) {
      if (p.type === "comment" || p.type === "keyword_separator" || p.type === "positional_separator") continue;
      const name2 = paramName3(p);
      if (idx >= 0 && name2) f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
      idx++;
    }
  } else if (n.type === "call") {
    const func2 = n.childForFieldName("function");
    if (!func2) return;
    const callee = func2.type === "attribute" ? func2.childForFieldName("attribute") ?? func2 : func2;
    const a = n.childForFieldName("arguments");
    const argNodes = a?.type === "argument_list" ? namedChildren(a).filter((x) => x.type !== "comment") : [];
    const values = argNodes.map((x) => x.type === "keyword_argument" ? x.childForFieldName("value") ?? x : x);
    let p = n.parent;
    while (p?.type === "await") p = p.parent;
    f.calls.push({ callee: src.range(callee), callee_text: func2.text, args: values.map((x) => src.range(x)), values: values.map(op), result_used: p?.type !== "expression_statement" });
  }
});
var moduleFiles = (dir, segs) => {
  const p = [dir, ...segs].filter((x) => x !== "").join("/");
  return [`${p}.py`, `${p}/__init__.py`];
};
var PY_IMPORTS = {
  path: (callee) => /^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : [],
  local(module2, from, names) {
    const out2 = [];
    const dots = /^\.*/.exec(module2)[0].length;
    const segs = module2.slice(dots).split(".").filter((x) => x !== "");
    const dirs = [];
    const here = from.split("/").slice(0, -1);
    if (dots) {
      if (dots - 1 > here.length) return [];
      dirs.push(here.slice(0, here.length - (dots - 1)).join("/"));
    } else {
      for (let i2 = here.length; i2 >= 0; i2--) dirs.push(here.slice(0, i2).join("/"));
    }
    for (let k = 0; k <= Math.min(2, names.length - 1); k++)
      for (const d of dirs) if (segs.length + k > 0) out2.push({ files: moduleFiles(d, [...segs, ...names.slice(0, k)]), names: names.slice(k) });
    return out2;
  },
  external(module2, names) {
    if (module2.startsWith(".")) return void 0;
    const [pkg, ...rest2] = module2.split(".");
    return { package: pkg, names: [...rest2, ...names] };
  }
};
var Python = {
  id: LANGUAGE_ID7,
  headless: true,
  extensions: ["py", "pyw"],
  editor: { id: "ms-python.python", name: "Python" },
  imports: PY_IMPORTS,
  init: () => PYTHON.init(),
  syntax: () => PYTHON
};

// src/lang/php.ts
var LANGUAGE_ID8 = "php";
var LITERALS8 = /* @__PURE__ */ new Set(["integer", "float", "string", "encapsed_string", "boolean", "null"]);
function operand8(n, src) {
  if (n.type === "variable_name") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "member_access_expression" || n.type === "nullsafe_member_access_expression") {
    const f = n.childForFieldName("name");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "class_constant_access_expression" || n.type === "scoped_property_access_expression") {
    const parts2 = namedChildren(n);
    const last = parts2[parts2.length - 1];
    if (parts2.length >= 2) return { name: src.range(last), text: n.text, form: "name", receiver: parts2[0].text };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand8(n.namedChild(0), src);
  if (LITERALS8.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ7 = { eq: ["==", "==="], ne: ["!=", "!==", "<>"] };
var argValue = (a) => namedChildren(a).pop() ?? a;
var PHP = new Grammar("tree-sitter-php.wasm", (n, src, f) => {
  const op = (x) => operand8(x, src);
  if (n.type === "assignment_expression") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r) f.assigns.push({ target: op(l), value: op(r), init: false });
  } else if (n.type === "augmented_assignment_expression") {
    const l = n.childForFieldName("left");
    if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
  } else if (n.type === "update_expression") {
    const t = namedChildren(n)[0];
    if (t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
  } else if (n.type === "property_element") {
    const name2 = n.childForFieldName("name"), v = n.childForFieldName("default_value");
    if (name2 && v) f.assigns.push({ target: op(name2), value: op(v), init: true });
  } else if (n.type === "const_element") {
    const name2 = namedChildren(n).find((c) => c.type === "name");
    if (name2) f.consts.push(src.range(name2));
  } else if (n.type === "enum_case") {
    const name2 = n.childForFieldName("name");
    if (name2) f.consts.push(src.range(name2));
  } else if (n.type === "if_statement" || n.type === "else_if_clause") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("body");
    if (c && body2) guardIf(n, c, body2, EQ7, op, f.guards, src);
  } else if (n.type === "function_definition" || n.type === "method_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    const params2 = n.childForFieldName("parameters");
    let idx = 0;
    for (const p of params2 ? namedChildren(params2) : []) {
      if (p.type !== "simple_parameter" && p.type !== "variadic_parameter" && p.type !== "property_promotion_parameter") continue;
      const name2 = p.childForFieldName("name");
      if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
      idx++;
    }
  } else if (n.type === "function_call_expression" || n.type === "member_call_expression" || n.type === "nullsafe_member_call_expression" || n.type === "scoped_call_expression" || n.type === "object_creation_expression") {
    const isNew = n.type === "object_creation_expression";
    const callee = isNew ? namedChildren(n).find((c) => c.type === "name" || c.type === "qualified_name") : n.childForFieldName(n.type === "function_call_expression" ? "function" : "name");
    if (!callee) return;
    const a = n.childForFieldName("arguments") ?? namedChildren(n).find((c) => c.type === "arguments");
    const argNodes = a ? namedChildren(a).filter((x) => x.type === "argument").map(argValue) : [];
    const name2 = callee.type === "qualified_name" ? namedChildren(callee).pop() ?? callee : callee;
    const recv = n.childForFieldName("object") ?? n.childForFieldName("scope");
    f.calls.push({ callee: src.range(name2), callee_text: recv ? `${recv.text}.${callee.text}` : callee.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: n.parent?.type !== "expression_statement" });
  }
});
var Php = {
  id: LANGUAGE_ID8,
  extensions: ["php", "phtml"],
  editor: { id: "bmewburn.vscode-intelephense-client", name: "PHP Intelephense" },
  init: () => PHP.init(),
  syntax: () => PHP
};

// src/lang/kotlin.ts
var LANGUAGE_ID9 = "kotlin";
var LITERALS9 = /* @__PURE__ */ new Set(["integer_literal", "long_literal", "real_literal", "string_literal", "character_literal", "boolean_literal", "null_literal"]);
var STATEMENTS2 = /* @__PURE__ */ new Set(["statements", "control_structure_body"]);
var first = (n, type) => namedChildren(n).find((c) => c.type === type);
function member2(n) {
  const suffix = namedChildren(n).filter((c) => c.type === "navigation_suffix").pop();
  const name2 = suffix && first(suffix, "simple_identifier");
  return name2 ? { name: name2, receiver: namedChildren(n)[0].text } : void 0;
}
function operand9(n, src) {
  if (n.type === "simple_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "navigation_expression" || n.type === "directly_assignable_expression") {
    const m = member2(n);
    if (m) return { name: src.range(m.name), text: n.text, form: "name", receiver: m.receiver };
    if (n.type === "directly_assignable_expression" && n.namedChildCount === 1) return operand9(n.namedChild(0), src);
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand9(n.namedChild(0), src);
  if (LITERALS9.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ8 = { eq: ["==", "==="], ne: ["!=", "!=="] };
var KT_IMPORTS = {
  path: (callee) => /^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : [],
  local(module2, from, names) {
    const here = from.split("/").slice(0, -1);
    const out2 = [];
    for (let i2 = here.length; i2 >= 0; i2--) {
      const dir = [...here.slice(0, i2), ...module2.split(".")].join("/");
      out2.push({ files: [`${dir}/${names[0]}.kt`, `${dir}/`], names });
    }
    return out2;
  },
  external: (module2, names) => ({ package: module2, names })
};
var KOTLIN = new Grammar("tree-sitter-kotlin.wasm", (n, src, f) => {
  const op = (x) => operand9(x, src);
  if (n.type === "assignment") {
    const parts2 = namedChildren(n);
    const plain = n.children.some((c) => c !== null && !c.isNamed && c.type === "=");
    if (parts2.length >= 2) f.assigns.push({ target: op(parts2[0]), value: plain ? op(parts2[parts2.length - 1]) : other(n, src), init: false });
  } else if (n.type === "class_declaration" || n.type === "object_declaration") {
    symbol(f, src, n, first(n, "type_identifier"), "type", /\binterface\b/.test(n.text.slice(0, 40)) ? 21 : 7);
  } else if (n.type === "companion_object") {
    symbol(f, src, n, first(n, "type_identifier"), "type", 7);
  } else if (n.type === "property_declaration") {
    const v = first(n, "variable_declaration");
    const name2 = v && first(v, "simple_identifier");
    symbol(f, src, n, name2, "term", n.parent?.type === "class_body" ? 15 : 61);
    const parts2 = namedChildren(n);
    const init3 = parts2.length > 2 ? parts2[parts2.length - 1] : void 0;
    if (name2 && init3 && init3.type !== "variable_declaration" && init3.type !== "binding_pattern_kind") f.assigns.push({ target: op(name2), value: op(init3), init: true });
    if (name2 && /\bconst\b/.test(first(n, "modifiers")?.text ?? "")) f.consts.push(src.range(name2));
  } else if (n.type === "enum_entry") {
    const name2 = first(n, "simple_identifier");
    if (name2) f.consts.push(src.range(name2));
    symbol(f, src, n, name2, "term", 12);
  } else if (n.type === "if_expression") {
    const c = namedChildren(n)[0], body2 = first(n, "control_structure_body");
    if (c && body2 && c !== body2) guardIf(n, c, body2, EQ8, op, f.guards, src);
  } else if (n.type === "when_expression") {
    const subject2 = first(n, "when_subject")?.namedChild(0);
    if (!subject2) return;
    for (const e of namedChildren(n)) {
      if (e.type !== "when_entry") continue;
      const body2 = first(e, "control_structure_body");
      if (!body2) continue;
      for (const c of namedChildren(e).filter((x) => x.type === "when_condition")) {
        const v = c.namedChild(0);
        if (v) f.guards.push({ left: op(subject2), right: op(v), equal: true, body: src.range(body2), certain: true });
      }
    }
  } else if (n.type === "function_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    symbol(f, src, n, first(n, "simple_identifier"), "method", n.parent?.type === "class_body" ? 26 : 17);
    const params2 = first(n, "function_value_parameters");
    let idx = 0;
    for (const p of params2 ? namedChildren(params2) : []) {
      if (p.type !== "parameter") continue;
      const name2 = first(p, "simple_identifier");
      if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
      idx++;
    }
  } else if (n.type === "import_header") {
    const id = first(n, "identifier"), alias = first(n, "import_alias");
    const segs = id ? namedChildren(id).map((c) => c.text) : [];
    if (segs.length < 2 || first(n, "wildcard_import")) return;
    const aliasName = alias ? namedChildren(alias)[0]?.text : void 0;
    f.imports.push({ local: aliasName ?? segs[segs.length - 1], module: segs.slice(0, -1).join("."), member: segs[segs.length - 1] });
  } else if (n.type === "call_expression") {
    const func2 = namedChildren(n)[0];
    const suffix = first(n, "call_suffix");
    if (!func2) return;
    const callee = func2.type === "navigation_expression" ? member2(func2)?.name ?? func2 : func2;
    const args2 = suffix ? first(suffix, "value_arguments") : void 0;
    const argNodes = args2 ? namedChildren(args2).filter((x) => x.type === "value_argument").map((x) => namedChildren(x).pop() ?? x) : [];
    f.calls.push({ callee: src.range(callee), callee_text: func2.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: !STATEMENTS2.has(n.parent?.type ?? "") });
  }
});
var Kotlin = {
  id: LANGUAGE_ID9,
  headless: true,
  imports: KT_IMPORTS,
  extensions: ["kt", "kts"],
  editor: { id: "fwcd.kotlin", name: "Kotlin" },
  init: () => KOTLIN.init(),
  syntax: () => KOTLIN
};

// src/lang/java.ts
var LANGUAGE_ID10 = "java";
var LITERALS10 = /* @__PURE__ */ new Set([
  "decimal_integer_literal",
  "hex_integer_literal",
  "octal_integer_literal",
  "binary_integer_literal",
  "decimal_floating_point_literal",
  "hex_floating_point_literal",
  "string_literal",
  "character_literal",
  "true",
  "false",
  "null_literal"
]);
function operand10(n, src) {
  if (n.type === "identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "field_access") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("object")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand10(n.namedChild(0), src);
  if (LITERALS10.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ9 = { eq: ["=="], ne: ["!="] };
var ENDS5 = /* @__PURE__ */ new Set(["break_statement", "return_statement", "continue_statement", "throw_statement", "yield_statement"]);
var COMMENTS = /* @__PURE__ */ new Set(["line_comment", "block_comment"]);
function typeName2(t) {
  if (t.type === "scoped_type_identifier") return typeName2(namedChildren(t).pop() ?? t);
  if (t.type === "generic_type") return typeName2(t.namedChild(0) ?? t);
  return t;
}
var JAVA_IMPORTS = {
  path: (callee) => /^\w+(\.\w+)*$/.test(callee) ? callee.split(".") : [],
  local(module2, from, names) {
    const here = from.split("/").slice(0, -1);
    const out2 = [];
    for (let i2 = here.length; i2 >= 0; i2--) out2.push({ files: [[...here.slice(0, i2), ...module2.split("."), `${names[0]}.java`].join("/")], names });
    return out2;
  },
  external: (module2, names) => ({ package: module2, names })
};
var JAVA = new Grammar("tree-sitter-java.wasm", (n, src, f) => {
  const op = (x) => operand10(x, src);
  if (n.type === "assignment_expression") {
    const l = n.childForFieldName("left"), r = n.childForFieldName("right");
    if (l && r) f.assigns.push({ target: op(l), value: n.childForFieldName("operator")?.type === "=" ? op(r) : other(n, src), init: false });
  } else if (n.type === "update_expression") {
    const t = namedChildren(n)[0];
    if (t) f.assigns.push({ target: op(t), value: other(n, src), init: false });
  } else if (n.type === "variable_declarator") {
    const name2 = n.childForFieldName("name"), v = n.childForFieldName("value");
    if (name2 && v && v.type !== "array_initializer") f.assigns.push({ target: op(name2), value: op(v), init: true });
    const decl = n.parent;
    if (name2 && decl?.type === "field_declaration" && namedChildren(decl).some((c) => c.type === "modifiers" && /\bfinal\b/.test(c.text))) f.consts.push(src.range(name2));
    if (decl?.type === "field_declaration") symbol(f, src, n, name2, "term", 15);
  } else if (n.type === "enum_constant") {
    const name2 = n.childForFieldName("name");
    if (name2) f.consts.push(src.range(name2));
    symbol(f, src, n, name2, "term", 12);
  } else if (n.type === "class_declaration" || n.type === "interface_declaration" || n.type === "enum_declaration" || n.type === "record_declaration" || n.type === "annotation_type_declaration") {
    symbol(f, src, n, n.childForFieldName("name"), "type", n.type === "interface_declaration" ? 21 : n.type === "enum_declaration" ? 11 : 7);
  } else if (n.type === "if_statement") {
    const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
    if (c && body2) guardIf(n, c, body2, EQ9, op, f.guards, src);
  } else if (n.type === "switch_expression" || n.type === "switch_statement") {
    const c = n.childForFieldName("condition"), block = n.childForFieldName("body");
    const subject2 = c && (c.type === "parenthesized_expression" ? c.namedChild(0) : c);
    if (!subject2 || !block) return;
    let pending = [], falls = false;
    for (const g of namedChildren(block)) {
      if (g.type !== "switch_block_statement_group" && g.type !== "switch_rule") continue;
      const labels = namedChildren(g).filter((x) => x.type === "switch_label");
      const stmts = namedChildren(g).filter((x) => x.type !== "switch_label" && !COMMENTS.has(x.type));
      for (const l of labels) pending.push(...namedChildren(l));
      if (!stmts.length) continue;
      const body2 = src.span(stmts[0], stmts[stmts.length - 1]);
      for (const v of pending) f.guards.push({ left: op(subject2), right: op(v), equal: true, body: body2, certain: !falls });
      falls = g.type === "switch_block_statement_group" && !ENDS5.has(stmts[stmts.length - 1].type);
      pending = [];
    }
  } else if (n.type === "method_declaration" || n.type === "constructor_declaration") {
    const decl = src.range(n);
    f.decls.push(decl);
    symbol(f, src, n, n.childForFieldName("name"), "method", n.type === "constructor_declaration" ? 9 : 26);
    const params2 = n.childForFieldName("parameters");
    let idx = 0;
    for (const p of params2 ? namedChildren(params2) : []) {
      const name2 = p.type === "formal_parameter" ? p.childForFieldName("name") : p.type === "spread_parameter" ? namedChildren(p).find((c) => c.type === "variable_declarator")?.childForFieldName("name") : null;
      if (name2) f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
      if (p.type === "formal_parameter" || p.type === "spread_parameter") idx++;
    }
  } else if (n.type === "import_declaration") {
    const id = namedChildren(n).find((c) => c.type === "scoped_identifier");
    const scope = id?.childForFieldName("scope"), name2 = id?.childForFieldName("name");
    if (scope && name2 && !namedChildren(n).some((c) => c.type === "asterisk")) f.imports.push({ local: name2.text, module: scope.text, member: name2.text });
  } else if (n.type === "method_invocation" || n.type === "object_creation_expression") {
    const isNew = n.type === "object_creation_expression";
    const t = isNew ? n.childForFieldName("type") : n.childForFieldName("name");
    if (!t) return;
    const callee = isNew ? typeName2(t) : t;
    const obj2 = isNew ? null : n.childForFieldName("object");
    const a = n.childForFieldName("arguments");
    const argNodes = a ? namedChildren(a).filter((x) => !COMMENTS.has(x.type)) : [];
    f.calls.push({ callee: src.range(callee), callee_text: obj2 ? `${obj2.text}.${t.text}` : t.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: n.parent?.type !== "expression_statement" });
  }
});
var Java = {
  id: LANGUAGE_ID10,
  headless: true,
  imports: JAVA_IMPORTS,
  extensions: ["java"],
  editor: { id: "redhat.java", name: "Language Support for Java" },
  init: () => JAVA.init(),
  syntax: () => JAVA
};

// src/lang/rust.ts
var LANGUAGE_ID11 = "rust";
var LITERALS11 = /* @__PURE__ */ new Set(["integer_literal", "float_literal", "string_literal", "raw_string_literal", "char_literal", "boolean_literal", "negative_literal"]);
function operand11(n, src) {
  if (n.type === "identifier" || n.type === "field_identifier") return { name: src.range(n), text: n.text, form: "name", receiver: "" };
  if (n.type === "field_expression") {
    const f = n.childForFieldName("field");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("value")?.text ?? "" };
  }
  if (n.type === "scoped_identifier") {
    const f = n.childForFieldName("name");
    if (f) return { name: src.range(f), text: n.text, form: "name", receiver: n.childForFieldName("path")?.text ?? "" };
  }
  if (n.type === "parenthesized_expression" && n.namedChildCount === 1) return operand11(n.namedChild(0), src);
  if (LITERALS11.has(n.type)) return { name: src.range(n), text: n.text, form: "literal", receiver: "" };
  return other(n, src);
}
var EQ10 = { eq: ["=="], ne: ["!="] };
function alternatives(p) {
  if (p.type === "or_pattern") return namedChildren(p).flatMap(alternatives);
  return [p];
}
function useTree(n, prefix2, out2) {
  switch (n.type) {
    case "identifier":
    case "crate":
    case "super":
    case "self":
      if (n.type === "self" && prefix2.length) out2.push({ local: prefix2[prefix2.length - 1], path: prefix2 });
      else out2.push({ local: n.text, path: [...prefix2, n.text] });
      break;
    case "scoped_identifier": {
      const path11 = n.childForFieldName("path"), name2 = n.childForFieldName("name");
      if (name2) useTree(name2, path11 ? [...prefix2, ...path11.text.split("::")] : prefix2, out2);
      break;
    }
    case "scoped_use_list": {
      const path11 = n.childForFieldName("path"), list = n.childForFieldName("list");
      const pre = path11 ? [...prefix2, ...path11.text.split("::")] : prefix2;
      for (const c of list ? namedChildren(list) : []) useTree(c, pre, out2);
      break;
    }
    case "use_list":
      for (const c of namedChildren(n)) useTree(c, prefix2, out2);
      break;
    case "use_as_clause": {
      const path11 = n.childForFieldName("path"), alias = n.childForFieldName("alias");
      if (path11 && alias) out2.push({ local: alias.text, path: [...prefix2, ...path11.text.split("::")] });
      break;
    }
    default:
      break;
  }
}
var RS_IMPORTS = {
  path: (callee) => /^\w+(::\w+)*$/.test(callee) ? callee.split("::") : [],
  local(module2, from, names) {
    const segs = module2.split("::");
    const file = from.split("/");
    const base = file.pop();
    const own = /^(mod|lib|main)\.rs$/.test(base) ? file : [...file, base.replace(/\.rs$/, "")];
    let dir, rest2 = segs.slice(1);
    if (segs[0] === "crate") {
      const src = file.lastIndexOf("src");
      dir = src >= 0 ? file.slice(0, src + 1) : [];
    } else if (segs[0] === "self") dir = own;
    else if (segs[0] === "super") dir = own.slice(0, -1);
    else {
      dir = own;
      rest2 = segs;
    }
    const out2 = [];
    for (let k = 0; k <= Math.min(2, names.length - 1); k++) {
      const p = [...dir, ...rest2, ...names.slice(0, k)].join("/");
      if (!rest2.length && k === 0) out2.push({ files: [dir.length ? `${dir.join("/")}/` : ""].filter((x) => x !== ""), names });
      else out2.push({ files: [`${p}.rs`, `${p}/mod.rs`], names: names.slice(k) });
    }
    return out2;
  },
  external(module2, names) {
    const segs = module2.split("::");
    if (segs[0] === "crate" || segs[0] === "self" || segs[0] === "super") return void 0;
    const all = [...segs.slice(1), ...names];
    const kept = all.filter((x, i2) => i2 === all.length - 1 || /^[A-Z]/.test(x));
    return { package: segs[0], names: kept };
  },
  qualified: (path11) => path11.length >= 2 && /^[a-z_]\w*$/.test(path11[0]) ? { module: path11[0], names: path11.slice(1) } : void 0
};
var RUST = new Grammar("tree-sitter-rust.wasm", (n, src, f) => {
  const op = (x) => operand11(x, src);
  switch (n.type) {
    case "assignment_expression": {
      const l = n.childForFieldName("left"), r = n.childForFieldName("right");
      if (l && r) f.assigns.push({ target: op(l), value: op(r), init: false });
      break;
    }
    case "compound_assignment_expr": {
      const l = n.childForFieldName("left");
      if (l) f.assigns.push({ target: op(l), value: other(n, src), init: false });
      break;
    }
    case "let_declaration": {
      const p = n.childForFieldName("pattern"), v = n.childForFieldName("value");
      if (p?.type === "identifier" && v) f.assigns.push({ target: op(p), value: op(v), init: true });
      break;
    }
    case "const_item":
    case "static_item": {
      const name2 = n.childForFieldName("name"), v = n.childForFieldName("value");
      if (name2 && v && n.type === "const_item" && op(v).form === "literal") f.consts.push(src.range(name2));
      symbol(f, src, n, name2, "term", n.type === "const_item" ? 8 : 61);
      break;
    }
    case "field_initializer": {
      const k = n.childForFieldName("field"), v = n.childForFieldName("value");
      if (k && v) f.assigns.push({ target: op(k), value: op(v), init: true });
      break;
    }
    case "if_expression": {
      const c = n.childForFieldName("condition"), body2 = n.childForFieldName("consequence");
      if (c && body2) guardIf(n, c, body2, EQ10, op, f.guards, src);
      break;
    }
    case "match_expression": {
      const v = n.childForFieldName("value");
      const arms = namedChildren(n.childForFieldName("body") ?? n).filter((x) => x.type === "match_arm");
      if (!v) break;
      for (const arm of arms) {
        const mp = arm.childForFieldName("pattern"), body2 = arm.childForFieldName("value");
        const pat = mp?.namedChild(0);
        if (!mp || !pat || !body2) continue;
        const cond = mp.childForFieldName("condition");
        for (const alt of alternatives(pat)) {
          if (alt.type === "_" || alt.type === "identifier" && alt.text === "_") continue;
          f.guards.push({ left: op(v), right: op(alt), equal: true, body: src.range(body2), certain: true });
        }
        if (cond) equalities(cond, src.range(body2), EQ10, op, f.guards);
      }
      break;
    }
    case "function_item":
    case "function_signature_item": {
      const decl = src.range(n);
      f.decls.push(decl);
      symbol(f, src, n, n.childForFieldName("name"), "method", /^(impl|trait)_item$/.test(n.parent?.parent?.type ?? "") ? 26 : 17);
      const params2 = n.childForFieldName("parameters");
      if (!params2) break;
      let idx = 0;
      for (const d of namedChildren(params2)) {
        if (d.type !== "parameter") continue;
        const name2 = d.childForFieldName("pattern");
        if (name2?.type === "identifier") f.params.push({ name: name2.text, range: src.range(name2), index: idx, decl });
        idx++;
      }
      break;
    }
    case "struct_item":
    case "enum_item":
    case "trait_item":
    case "union_item":
    case "type_item":
      symbol(f, src, n, n.childForFieldName("name"), "type", n.type === "enum_item" ? 11 : n.type === "trait_item" ? 21 : n.type === "struct_item" ? 49 : 7);
      break;
    case "impl_item": {
      const t = n.childForFieldName("type");
      const name2 = t?.type === "generic_type" ? t.childForFieldName("type") : t;
      symbol(f, src, n, name2, "type", 7);
      break;
    }
    case "mod_item":
      symbol(f, src, n, n.childForFieldName("name"), "namespace", 29);
      break;
    case "enum_variant":
      symbol(f, src, n, n.childForFieldName("name"), "term", 12);
      break;
    case "field_declaration":
      symbol(f, src, n, n.childForFieldName("name"), "term", 15);
      break;
    case "use_declaration": {
      const arg = n.childForFieldName("argument");
      const bound = [];
      if (arg) useTree(arg, [], bound);
      for (const b of bound) {
        if (b.path.length < 2) f.imports.push({ local: b.local, module: b.path[0] });
        else f.imports.push({ local: b.local, module: b.path.slice(0, -1).join("::"), member: b.path[b.path.length - 1] });
      }
      break;
    }
    case "call_expression": {
      let func2 = n.childForFieldName("function");
      if (func2?.type === "generic_function") func2 = func2.childForFieldName("function");
      if (!func2) break;
      const callee = func2.type === "field_expression" ? func2.childForFieldName("field") ?? func2 : func2.type === "scoped_identifier" ? func2.childForFieldName("name") ?? func2 : func2;
      const a = n.childForFieldName("arguments");
      const argNodes = a ? namedChildren(a).filter((x) => x.type !== "line_comment" && x.type !== "block_comment") : [];
      const used = n.parent?.type !== "expression_statement";
      f.calls.push({ callee: src.range(callee), callee_text: func2.text, args: argNodes.map((x) => src.range(x)), values: argNodes.map(op), result_used: used });
      break;
    }
  }
});
var Rust = {
  id: LANGUAGE_ID11,
  headless: true,
  imports: RS_IMPORTS,
  extensions: ["rs"],
  editor: { id: "rust-lang.rust-analyzer", name: "Rust Analyzer" },
  init: () => RUST.init(),
  syntax: () => RUST
};

// src/engine.ts
var FRONTENDS = [Go, Js, Rust, CSharp, Cpp, Dart, Python, Java, Kotlin, Php, Ruby];
var LOCKFILES = ["Cargo.lock", "go.sum", "package-lock.json", "pnpm-lock.yaml", "poetry.lock", "uv.lock", "yarn.lock"];
var VERSION = JSON.parse(fs7.readFileSync(path6.join(PKG_ROOT, "package.json"), "utf8")).version;
var ready = /* @__PURE__ */ new Map();
var init2 = (ids) => Promise.all(FRONTENDS.filter((f) => !ids || ids.includes(f.id)).map((f) => ready.get(f.id) ?? ready.set(f.id, f.init()).get(f.id))).then(() => {
});
var NOT_CODE = new Set("md markdown mdx txt rst adoc json jsonc json5 yaml yml toml ini cfg conf properties env xml xsd xsl xslt svg html htm css scss sass less csv tsv lock log sum mod map snap diff patch png jpg jpeg gif ico webp bmp tiff pdf zip gz tgz tar bz2 xz 7z rar woff woff2 ttf otf eot mp3 mp4 mov avi wav wasm bin exe dll so dylib class jar war o a obj lib pyc node vsix ipynb".split(" "));
var genericExt = (p) => {
  const e = extension(p);
  return e !== void 0 && !owner(p) && !NOT_CODE.has(e) ? e : void 0;
};
var isFile = (p) => fs7.statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
var strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
function readUtf8(p) {
  try {
    return strict.decode(fs7.readFileSync(p));
  } catch {
    return void 0;
  }
}
function header(repo, lockfiles, indexer) {
  return { tool: TOOL_NAME, tool_version: VERSION, schema_version: SCHEMA_VERSION, indexer, lockfile_hash: lockfileHash(repo, lockfiles), commit: commit(repo) };
}
function commit(repo) {
  const r = (0, import_node_child_process.spawnSync)("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}
function lockfileHash(repo, explicit) {
  const names = (explicit.length ? [...explicit] : LOCKFILES.filter((n) => isFile(path6.join(repo, n)))).sort(cmpStr);
  const parts2 = [];
  for (const n of names) {
    let bytes;
    try {
      bytes = fs7.readFileSync(path6.join(repo, n));
    } catch {
      bytes = Buffer.alloc(0);
    }
    parts2.push(Buffer.from(n), Buffer.from([0]), bytes, Buffer.from([0]));
  }
  return sha256Hex(Buffer.concat(parts2));
}
var safeRel = (p) => !path6.isAbsolute(p) && !p.split(/[\\/]/).includes("..");
var owner = (p) => {
  const e = extension(p);
  return e === void 0 ? void 0 : FRONTENDS.find((f) => f.extensions.includes(e));
};
function fileCounts(repo, files = listFiles(repo)) {
  const counts = /* @__PURE__ */ new Map();
  let other2 = 0;
  for (const p of files) {
    const f = owner(p);
    if (f) counts.set(f.id, (counts.get(f.id) ?? 0) + 1);
    else other2++;
  }
  return [counts, other2];
}
function generated(repo, paths) {
  if (!paths.length) return /* @__PURE__ */ new Set();
  const r = (0, import_node_child_process.spawnSync)("git", ["-C", repo, "check-attr", "-z", "--stdin", "linguist-generated", "linguist-vendored"], { input: paths.join("\0") + "\0", maxBuffer: 1 << 28 });
  const out2 = /* @__PURE__ */ new Set();
  if (r.status !== 0) return out2;
  const f = r.stdout.toString("utf8").split("\0");
  for (let i2 = 0; i2 + 2 < f.length; i2 += 3) if (f[i2 + 2] === "set" || f[i2 + 2] === "true") out2.add(f[i2]);
  return out2;
}
var pinned;
function listFiles(repo) {
  if (pinned?.repo === repo) return pinned.files;
  const git = (0, import_node_child_process.spawnSync)("git", ["-C", repo, "ls-files", "-z", "--cached", "--others", "--exclude-standard"], { maxBuffer: 1 << 30 });
  if (git.status === 0) {
    const all = git.stdout.toString("utf8").split("\0").filter((p) => p !== "");
    const skip = generated(repo, all);
    return skip.size ? all.filter((p) => !skip.has(p)) : all;
  }
  const out2 = [];
  const walk3 = (d) => {
    let entries2;
    try {
      entries2 = fs7.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries2) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = path6.join(d, e.name);
      if (fs7.statSync(p, { throwIfNoEntry: false })?.isDirectory()) walk3(p);
      else out2.push(path6.relative(repo, p).replace(/\\/g, "/"));
    }
  };
  walk3(repo);
  return out2;
}
function scan(repo) {
  const [counts, other2] = fileCounts(repo);
  const languages = [];
  for (const f of FRONTENDS) {
    const files = counts.get(f.id) ?? 0;
    if (files > 0) languages.push({ files, id: f.id, editor: f.editor });
  }
  const byExt = /* @__PURE__ */ new Map();
  for (const p of listFiles(repo)) {
    const e = genericExt(p);
    if (e !== void 0) byExt.set(e, (byExt.get(e) ?? 0) + 1);
  }
  const generic = [...byExt].map(([ext, files]) => ({ ext, files })).sort((a, b) => cmpStr(a.ext, b.ext));
  return { languages, generic, other_files: other2 - generic.reduce((n, g) => n + g.files, 0) };
}
function sourceFiles(repo, lang) {
  return listFiles(repo).filter((p) => owner(p)?.id === lang).sort(cmpStr);
}
async function index(repo, results, lockfiles = [], indexer = `${BRIDGE_TOOL.name} ${BRIDGE_TOOL.version}`) {
  await init2(results.flatMap((r) => "index" in r ? [r.lang] : []));
  const indexes = results.flatMap((r) => "index" in r ? [r.index] : []);
  const unindexed = results.filter((r) => "error" in r).flatMap((r) => sourceFiles(repo, r.lang).map((path11) => ({ path: path11, reason: r.error })));
  const g = makeGraph(repo, merge2(indexes), unindexed);
  writeCache(repo, header(repo, lockfiles, indexer), g);
  return g;
}
function headlessLanguages(repo) {
  return scan(repo).languages.map((l) => ({ id: l.id, files: l.files, indexed: !!FRONTENDS.find((f) => f.id === l.id).headless }));
}
function sourcesStamp(repo) {
  const parts2 = [VERSION, commit(repo), lockfileHash(repo, [])];
  for (const p of listFiles(repo).sort(cmpStr)) {
    const st = fs7.statSync(path6.join(repo, p), { throwIfNoEntry: false });
    parts2.push(`${p}\0${st?.size ?? -1}\0${st?.mtimeMs ?? -1}`);
  }
  return sha256Hex(parts2.join("\n"));
}
async function indexHeadless(repo, lockfiles = [], report = () => {
}) {
  pinned = { repo, files: listFiles(repo) };
  try {
    return await indexPinned(repo, lockfiles, report);
  } finally {
    pinned = void 0;
  }
}
async function indexPinned(repo, lockfiles, report) {
  const s = scan(repo);
  await init2(s.languages.filter((l) => FRONTENDS.find((f) => f.id === l.id)?.headless).map((l) => l.id));
  const results = [];
  const languages = [];
  for (const l of s.languages) {
    const fe = FRONTENDS.find((f) => f.id === l.id);
    languages.push({ id: l.id, files: l.files, indexed: !!fe.headless });
    if (!fe.headless) {
      results.push({ lang: l.id, error: `No headless indexer for ${l.editor.name}; open the repo in VS Code with the Hesperus extension to index it.` });
      continue;
    }
    report(`Indexing ${l.files.toLocaleString()} ${l.editor.name} files\u2026`);
    results.push({ lang: l.id, index: await headlessIndex(repo, fe, sourceFiles(repo, l.id)) });
  }
  const graph = await index(repo, results, lockfiles, `${HEADLESS_TOOL.name} ${HEADLESS_TOOL.version}`);
  return { graph, languages };
}
function makeGraph(repo, index2, unindexed = []) {
  const tree = new Set(listFiles(repo));
  const documents = index2.documents.filter((d) => safeRel(d.relative_path) && tree.has(d.relative_path));
  return build2({
    index: { ...index2, documents },
    readSource: (p) => safeRel(p) ? readUtf8(path6.join(repo, p)) : void 0,
    syntaxFor: (_lang, p) => owner(p)?.syntax(p),
    importsFor: (_lang, p) => owner(p)?.imports,
    unindexed
  });
}

// src/core/flow.ts
function outgoing(g) {
  const out2 = /* @__PURE__ */ new Map();
  for (const e of g.edges) {
    if (e.kind !== "call" || !e.site) continue;
    (out2.get(e.from) ?? out2.set(e.from, []).get(e.from)).push(e);
  }
  for (const list of out2.values()) list.sort((a, b) => a.site.range.start_line - b.site.range.start_line || a.site.range.start_col - b.site.range.start_col);
  return out2;
}
var MAX_DEPTH = 6;
function entries(g, inp) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const out2 = outgoing(g);
  const called = /* @__PURE__ */ new Set();
  for (const e of g.edges) if (e.kind === "call" && isCallable(byId.get(e.from)?.kind ?? "repo")) called.add(e.to);
  const reach = (id) => {
    const seen = /* @__PURE__ */ new Set([id]);
    const stack = [id];
    while (stack.length) {
      for (const e of out2.get(stack.pop()) ?? []) {
        const t = byId.get(e.to);
        if (t && isCallable(t.kind) && t.path && !seen.has(e.to)) seen.add(e.to), stack.push(e.to);
      }
    }
    return seen.size - 1;
  };
  const cls = classifyGraph(g, inp.extra);
  const shown = (e) => {
    const t = byId.get(e.to);
    return !!t && (isCallable(t.kind) && !!t.path || cls.has(e.to));
  };
  const list = [];
  for (const n of g.nodes) {
    if (!n.path) continue;
    const calls2 = out2.get(n.id) ?? [];
    if (isCallable(n.kind)) {
      if (called.has(n.id) || !calls2.some(shown)) continue;
      list.push({ id: n.id, name: n.name, doc: n.doc, path: n.path, line: (n.range?.start_line ?? 0) + 1, kind: n.kind, reach: reach(n.id), steps: calls2.filter(shown).length });
    } else if (n.kind === "file" && calls2.some(shown)) {
      list.push({ id: n.id, name: `${n.name} (on load)`, path: n.path, line: 1, kind: "file", reach: reach(n.id), steps: calls2.filter(shown).length });
    }
  }
  const built = (p) => GENERATED.test(p) ? 1 : 0;
  return list.sort((a, b) => built(a.path) - built(b.path) || b.reach - a.reach || cmpStr(a.path, b.path) || a.line - b.line);
}
var GENERATED = /(^|\/)(dist|build|out|target|vendor|node_modules|__pycache__|\.generated)\/|\.min\.[cm]?js$|\.bundle\.[cm]?js$|\.pb\.go$|_pb2\.py$/;
function flow(g, entryId, open, inp) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const root = byId.get(entryId);
  if (!root?.path) return void 0;
  const out2 = outgoing(g);
  const cls = classifyGraph(g, inp.extra);
  const cache = /* @__PURE__ */ new Map();
  const factsOf = (path11) => {
    if (!cache.has(path11)) {
      const text = inp.readSource(path11), syn = inp.syntaxFor(path11);
      cache.set(path11, text !== void 0 && syn ? syn.facts(text) : void 0);
    }
    return cache.get(path11);
  };
  const branchesIn = (path11, ident) => {
    const f = factsOf(path11);
    if (!f) return [];
    if (!ident) return f.branches;
    let body2;
    for (const d of [...f.decls, ...f.lambdas]) if (contains(d, ident) && (!body2 || contains(body2, d))) body2 = d;
    return body2 ? f.branches.filter((b) => contains(body2, b.range)) : [];
  };
  let flagged = 0;
  const stepsOf = (fn, prefix2, depth, chain2) => {
    const calls2 = out2.get(fn.id) ?? [];
    const branches2 = fn.path ? branchesIn(fn.path, fn.range) : [];
    const items = [];
    for (const e of calls2) {
      const t = byId.get(e.to);
      if (!t || e.to === fn.id) continue;
      if (isCallable(t.kind) && t.path || cls.has(e.to)) items.push({ at: e.site.range, call: e });
    }
    if (!items.length) return [];
    for (const b of branches2) items.push({ at: b.range, branch: b });
    const before2 = (a, b) => a.start_line - b.start_line || a.start_col - b.start_col || b.end_line - a.end_line || b.end_col - a.end_col;
    items.sort((a, b) => before2(a.at, b.at));
    const kids = /* @__PURE__ */ new Map();
    const stack = [];
    for (const it of items) {
      while (stack.length && !contains(stack[stack.length - 1].at, it.at)) stack.pop();
      const parent = stack[stack.length - 1];
      (kids.get(parent) ?? kids.set(parent, []).get(parent)).push(it);
      if (it.branch) stack.push(it);
    }
    const line = (r) => r.start_line + 1;
    const build3 = (list) => {
      const steps2 = [];
      for (const it of list) {
        if (it.call) {
          const e = it.call, t = byId.get(e.to);
          const last = steps2[steps2.length - 1];
          if (last && (last.kind === "call" || last.kind === "boundary") && last.target === e.to) {
            last.count++;
            last.may = last.may && e.provenance !== "resolved";
            continue;
          }
          const may = e.provenance !== "resolved";
          const id = `${prefix2}${e.site.range.start_line}:${e.site.range.start_col}`;
          const c = cls.get(e.to);
          if (c) {
            const f = inp.flags?.get(`${fn.id}\0${e.to}`);
            if (f) flagged++;
            const name2 = t.name.startsWith(c.module) || !c.module ? t.name : `${c.module} ${t.name}`;
            steps2.push({ kind: "boundary", id, in: fn.path, target: e.to, boundary: c.boundary, name: name2, line: line(e.site.range), count: 1, may, ...f ? { flag: f.severity, notes: f.notes } : {} });
          } else {
            const step = { kind: "call", id, in: fn.path, target: e.to, name: t.name, doc: t.doc, path: t.path, line: line(e.site.range), count: 1, may };
            if (open.has(id)) {
              if (depth >= MAX_DEPTH || chain2.has(e.to)) step.cut = true;
              else {
                const inner = stepsOf(t, `${id}/`, depth + 1, /* @__PURE__ */ new Set([...chain2, e.to]));
                if (inner.length) step.steps = inner;
                else step.empty = true;
              }
            }
            steps2.push(step);
          }
        } else if (it.branch) {
          const b = it.branch, inner = kids.get(it) ?? [];
          const id = `${prefix2}@${b.range.start_line}:${b.range.start_col}`;
          if (b.kind === "if") {
            const yes = build3(inner.filter((x) => contains(b.body, x.at)));
            const no = build3(inner.filter((x) => !contains(b.body, x.at)).flatMap((x) => x.branch?.kind === "else" ? kids.get(x) ?? [] : [x]));
            if (yes.length || no.length) steps2.push({ kind: "if", id, in: fn.path, text: b.text, line: line(b.range), yes, no });
          } else if (b.kind === "else") {
            steps2.push(...build3(inner));
          } else if (b.kind === "loop") {
            const body2 = build3(inner);
            if (body2.length) steps2.push({ kind: "loop", id, in: fn.path, text: b.text, line: line(b.range), body: body2 });
          } else if (b.kind === "switch") {
            const cases = [];
            const loose = [];
            for (const x of inner) {
              if (x.branch?.kind === "case") {
                const body2 = build3(kids.get(x) ?? []);
                if (body2.length) cases.push({ text: x.branch.text, line: line(x.at), body: body2 });
              } else loose.push(x);
            }
            if (cases.length) steps2.push({ kind: "switch", id, in: fn.path, text: b.text, line: line(b.range), cases });
            steps2.push(...build3(loose));
          } else if (b.kind === "case") {
            steps2.push(...build3(inner));
          } else if (b.kind === "catch") {
            const body2 = build3(inner);
            if (body2.length) steps2.push({ kind: "catch", id, in: fn.path, text: b.text, line: line(b.range), body: body2 });
          }
        }
      }
      return steps2;
    };
    return build3(kids.get(void 0) ?? []);
  };
  const steps = stepsOf(root, "", 0, /* @__PURE__ */ new Set([root.id]));
  const entry = root.kind === "file" ? { id: root.id, name: `${root.name} (on load)`, path: root.path, line: 1, kind: "file", reach: 0, steps: steps.length } : { id: root.id, name: root.name, doc: root.doc, path: root.path, line: (root.range?.start_line ?? 0) + 1, kind: isCallable(root.kind) ? root.kind : "function", reach: 0, steps: steps.length };
  return { entry, steps, flagged };
}
function firstSentence(doc, max = 90) {
  if (!doc) return void 0;
  const m = /^(.*?[.!?])(\s|$)/.exec(doc);
  const s = (m ? m[1] : doc).trim();
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}
function flowText(f) {
  const lines = [`\u25B6 ${f.entry.name}${f.entry.doc ? `  \u2014 ${firstSentence(f.entry.doc)}` : ""}  (${f.entry.path}:${f.entry.line})`];
  const times = (n) => n > 1 ? ` \xD7${n}` : "";
  const walk3 = (steps, pad) => {
    for (const s of steps) {
      if (s.kind === "call") {
        lines.push(`${pad}\u25AD ${s.name}${times(s.count)}${s.may ? " (may)" : ""}${s.doc ? `  \u2014 ${firstSentence(s.doc)}` : ""}  ${s.path ?? ""}`);
        if (s.steps) walk3(s.steps, pad + "   ");
        else if (s.empty) lines.push(`${pad}   (nothing further the chart shows)`);
        else if (s.cut) lines.push(`${pad}   (deeper than the chart follows)`);
      } else if (s.kind === "boundary") lines.push(`${pad}\u2B1A ${s.name}${times(s.count)}  [${BOUNDARY_INFO[s.boundary].label}]${s.flag ? `  ${s.flag.toUpperCase()}: ${(s.notes ?? []).join("; ")}` : ""}`);
      else if (s.kind === "if") {
        lines.push(`${pad}\u25C7 ${s.text}?`);
        if (s.yes.length) lines.push(`${pad}\u2502 yes:`), walk3(s.yes, pad + "\u2502  ");
        if (s.no.length) lines.push(`${pad}\u2502 no:`), walk3(s.no, pad + "\u2502  ");
      } else if (s.kind === "loop") lines.push(`${pad}\u21BB ${s.text}`), walk3(s.body, pad + "\u2502  ");
      else if (s.kind === "switch") {
        lines.push(`${pad}\u25C7 ${s.text}`);
        for (const c of s.cases) lines.push(`${pad}\u2502 ${c.text}:`), walk3(c.body, pad + "\u2502  ");
      } else if (s.kind === "catch") lines.push(`${pad}\u26A0 ${s.text}`), walk3(s.body, pad + "\u2502  ");
    }
  };
  walk3(f.steps, "   ");
  return lines.join("\n") + "\n";
}

// src/shelf.ts
var SINK = /* @__PURE__ */ new Set(["boundary", "external", "external_package"]);
var GAP_X = 2;
var GAP_ROW = 1;
var GAP_LAYER = 2;
var INSET_X = 2;
var INSET_TOP = 2;
var INSET_BOTTOM = 1;
var MIN_W2 = 6;
function leafSize(b, max) {
  const w = 1 + (b.expandable ? 2 : 0) + (b.flag ? 2 : 0) + b.node.name.length + 1;
  return { w: Math.max(MIN_W2, Math.min(max, w)), h: b.flag ? 2 : 1 };
}
function shelf(laid, columns) {
  const byId = new Map(laid.boxes.map((b) => [b.id, b]));
  const kids = /* @__PURE__ */ new Map();
  for (const b of laid.boxes) (kids.get(b.parent) ?? kids.set(b.parent, []).get(b.parent)).push(b);
  const lift = (id, p) => {
    for (let x = id; x !== void 0; x = byId.get(x)?.parent) if (byId.get(x)?.parent === p) return x;
    return void 0;
  };
  const rects = /* @__PURE__ */ new Map();
  const lay = (p, width2) => {
    const children2 = [...kids.get(p) ?? []].sort((a, b) => cmpStr(a.id, b.id));
    if (!children2.length) return { w: 0, h: 0 };
    const inner = Math.max(MIN_W2, width2);
    const size2 = /* @__PURE__ */ new Map();
    for (const c of children2) {
      if (c.container) {
        const s = lay(c.id, inner - 2 * INSET_X);
        const title = 2 + (c.flag ? 2 : 0) + c.node.name.length + 2;
        size2.set(c.id, { w: Math.min(inner, Math.max(MIN_W2, s.w + 2 * INSET_X, title)), h: s.h + INSET_TOP + INSET_BOTTOM });
      } else size2.set(c.id, leafSize(c, inner));
    }
    const ids = children2.map((c) => c.id);
    const out2 = new Map(ids.map((id) => [id, /* @__PURE__ */ new Set()]));
    const touched = /* @__PURE__ */ new Set();
    for (const w2 of laid.wires) {
      const a = lift(w2.from, p), b = lift(w2.to, p);
      if (a === void 0 || b === void 0 || a === b) continue;
      out2.get(a).add(b);
      touched.add(a);
      touched.add(b);
    }
    const sink = (id) => SINK.has(byId.get(id).node.kind);
    const layer = /* @__PURE__ */ new Map();
    const onStack = /* @__PURE__ */ new Set();
    const visit2 = (id) => {
      if (layer.has(id)) return layer.get(id);
      onStack.add(id);
      let depth = 0;
      for (const to of [...out2.get(id)].sort(cmpStr)) if (!onStack.has(to) && !sink(to)) depth = Math.max(depth, visit2(to) + 1);
      onStack.delete(id);
      layer.set(id, depth);
      return depth;
    };
    for (const id of ids) if (!sink(id)) visit2(id);
    const deepest = Math.max(0, ...[...layer.values()]);
    const row2 = (id) => {
      if (sink(id)) return deepest + 2;
      if (!touched.has(id)) return deepest + 1;
      return deepest - layer.get(id);
    };
    const layers2 = /* @__PURE__ */ new Map();
    for (const id of ids) (layers2.get(row2(id)) ?? layers2.set(row2(id), []).get(row2(id))).push(id);
    const local = /* @__PURE__ */ new Map();
    const into = new Map(ids.map((id) => [id, /* @__PURE__ */ new Set()]));
    for (const [a, bs] of out2) for (const b of bs) into.get(b).add(a);
    let y = 0, w = 0;
    for (const key of [...layers2.keys()].sort((a, b) => a - b)) {
      const order = layers2.get(key);
      const mid = (id) => {
        const xs = [...into.get(id)].map((a) => local.get(a)).filter((r) => !!r).map((r) => r.x + r.w / 2);
        return xs.length ? xs.reduce((s, x2) => s + x2, 0) / xs.length : Infinity;
      };
      const keyed = order.map((id) => ({ id, mid: mid(id) })).sort((a, b) => a.mid - b.mid || cmpStr(a.id, b.id));
      if (y > 0) y += GAP_LAYER;
      let x = 0, rowH = 0;
      for (const { id } of keyed) {
        const s = size2.get(id);
        if (x > 0 && x + s.w > inner) {
          x = 0;
          y += rowH + GAP_ROW;
          rowH = 0;
        }
        local.set(id, { x, y, w: s.w, h: s.h });
        x += s.w + GAP_X;
        rowH = Math.max(rowH, s.h);
        w = Math.max(w, x - GAP_X);
      }
      y += rowH;
    }
    for (const [id, r] of local) rects.set(id, r);
    return { w, h: y };
  };
  const top = lay(void 0, columns);
  const done = /* @__PURE__ */ new Set();
  const place = (id) => {
    if (done.has(id)) return;
    const b = byId.get(id);
    if (b.parent !== void 0) place(b.parent);
    if (b.parent !== void 0) {
      const r = rects.get(id), pr = rects.get(b.parent);
      rects.set(id, { x: pr.x + INSET_X + r.x, y: pr.y + INSET_TOP + r.y, w: r.w, h: r.h });
    }
    done.add(id);
  };
  for (const b of laid.boxes) place(b.id);
  return { rects, width: top.w, height: top.h };
}

// src/review.ts
var import_node_child_process2 = require("node:child_process");
var fs8 = __toESM2(require("node:fs"));
var path7 = __toESM2(require("node:path"));
function gitHead(repo) {
  const r = (0, import_node_child_process2.spawnSync)("git", ["-C", repo, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}
function readPolicy(repo) {
  const p = path7.join(repo, POLICY_FILE);
  return parsePolicy(fs8.existsSync(p) ? fs8.readFileSync(p, "utf8") : void 0);
}
var baselinePath = (repo) => path7.join(repo, CACHE_DIR, BASELINE_FILE);
function readBaseline(repo) {
  try {
    return parseBaseline(fs8.readFileSync(baselinePath(repo), "utf8"));
  } catch {
    return void 0;
  }
}
function writeBaseline(repo, b) {
  fs8.mkdirSync(path7.join(repo, CACHE_DIR), { recursive: true });
  fs8.writeFileSync(baselinePath(repo), baselineToJson(b));
}
function writeReport(repo, g, r, stale) {
  fs8.mkdirSync(path7.join(repo, CACHE_DIR), { recursive: true });
  fs8.writeFileSync(path7.join(repo, CACHE_DIR, REPORT_FILE), reportToJson(g, r, stale));
}
var STARTER_POLICY = pretty({
  $comment: 'Boundaries: database, network, ai, cloud, messaging, filesystem, process, environment. Example rule: {"paths": ["src/core/**"], "deny": ["network", "database"], "reason": "core stays pure"}',
  boundaries: {},
  rules: [],
  review: { crossings: "warning", dependencies: "info" }
});

// src/svg.ts
var KIND = {
  directory: "#b58900",
  package: "#6c71c4",
  file: "#268bd2",
  type: "#cb4b16",
  function: "#6c71c4",
  method: "#6c71c4",
  field: "#268bd2",
  variable: "#268bd2",
  state: "#2aa198",
  event: "#2aa198",
  boundary: "#dc322f",
  external_package: "#839496",
  external: "#839496",
  unresolved: "#93a1a1"
};
var SEV = { error: "#dc322f", warning: "#b58900", info: "#268bd2" };
var esc3 = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function box(b, focus) {
  const kc = KIND[b.node.kind] ?? "#657b83";
  const flag = b.flag ? SEV[b.flag.severity] : void 0;
  const stroke = b.id === focus ? "#d33682" : flag ?? kc, width2 = b.id === focus ? 3 : flag ? 2 : b.node.kind === "boundary" ? 1.5 : 1;
  const fill = b.container ? `${kc}14` : "#ffffff";
  const dash = b.node.kind === "external" || b.node.kind === "external_package" ? ' stroke-dasharray="3 2"' : "";
  const notes = [b.node.name, ...b.flag?.notes ?? []].join("\n");
  const name2 = esc3(b.node.name.length > 34 ? b.node.name.slice(0, 33) + "\u2026" : b.node.name);
  const text = b.container ? `<text x="${b.x + 8}" y="${b.y + 14}" font-size="11" font-weight="600" fill="${kc}">${name2}</text>` : `<text x="${b.x + 8}" y="${b.y + b.h / 2 + 4}" font-size="11" fill="#333">${name2}</text>`;
  const ext = (b.ext ?? []).slice(0, 3).map((s, i2) => `<text x="${b.x + 8}" y="${b.y + b.h - 4 - i2 * 12}" font-size="9" fill="#888">\u2192 ${esc3(s.name)}</text>`).reverse().join("");
  return `<g><title>${esc3(notes)}</title><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="${width2}"${dash}/>${text}${b.container ? "" : ext}</g>`;
}
function wire(w) {
  const flag = w.flag ? SEV[w.flag.severity] : void 0;
  const may = w.rollups.every((r) => r.resolved === 0);
  const stroke = flag ?? (may ? "#93a1a1" : "#586e75");
  const pts = w.points.map((p) => `${p.x},${p.y}`).join(" ");
  const end = w.points[w.points.length - 1], prev = w.points[w.points.length - 2] ?? end;
  const dx = Math.sign(end.x - prev.x), dy = Math.sign(end.y - prev.y);
  const head = `${end.x},${end.y} ${end.x - 6 * dx - 3 * dy},${end.y - 6 * dy + 3 * dx} ${end.x - 6 * dx + 3 * dy},${end.y - 6 * dy - 3 * dx}`;
  const weight = Math.min(3, 1 + Math.log2(Math.max(1, w.rollups.reduce((n, r) => n + r.weight, 0))) / 2);
  const title = w.flag ? `<title>${esc3(w.flag.notes.join("\n"))}</title>` : "";
  return `<g>${title}<polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="${flag ? weight + 1 : weight}" stroke-opacity="${flag ? 0.9 : 0.55}"${may ? ' stroke-dasharray="6 3"' : ""}/><polygon points="${head}" fill="${stroke}" fill-opacity=".9"/></g>`;
}
function toSvg(laid, focus) {
  const boxes = [...laid.boxes].sort((a, b) => Number(b.container) - Number(a.container));
  const w = Math.ceil(laid.width) + 16, h = Math.ceil(laid.height) + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="-8 -8 ${w} ${h}" font-family="system-ui, sans-serif"><rect x="-8" y="-8" width="${w}" height="${h}" fill="#fdfdfd"/>` + boxes.map((b) => box(b, focus)).join("") + laid.wires.map(wire).join("") + "</svg>";
}

// src/service.ts
var VIEW_FILE = "view.svg";
var BOXES_FILE = "view.json";
var CELL_W = 6.6;
var CELL_H = 13;
var col = (x) => Math.round(x / CELL_W);
var row = (y) => Math.round(y / CELL_H);
var PANE_COLUMNS = 60;
var PANE_NODES = 40;
function hasCache(repo) {
  try {
    readHeader(repo);
    return true;
  } catch {
    return false;
  }
}
var stampFile = (repo) => path8.join(repo, CACHE_DIR, "sources");
async function load(repo, index2 = false, report) {
  let indexed;
  if (index2 || !hasCache(repo)) {
    const stamp = sourcesStamp(repo);
    let last = "";
    try {
      if (hasCache(repo)) last = fs9.readFileSync(stampFile(repo), "utf8");
    } catch {
    }
    if (stamp === last) indexed = headlessLanguages(repo);
    else {
      indexed = (await indexHeadless(repo, [], report)).languages;
      fs9.writeFileSync(stampFile(repo), stamp);
    }
  }
  const h = readHeader(repo);
  const graph = readShards(repo);
  const policy = readPolicy(repo);
  const head = gitHead(repo);
  const stale = h.commit !== head ? `graph built at ${h.commit.slice(0, 12)}, HEAD is ${head.slice(0, 12)}; run \`hesperus index\` or \`hesperus check --index\`` : void 0;
  return { graph, policy, baseline: readBaseline(repo), stale, indexed };
}
function check(repo, l) {
  const r = lint(l.graph, l.policy, l.baseline);
  if (!l.baseline) {
    writeBaseline(repo, snapshot(l.graph, l.policy, gitHead(repo)));
    l.baseline = readBaseline(repo);
  }
  writeReport(repo, l.graph, r, l.stale);
  return r;
}
var checkJson = (l, r) => reportToJson(l.graph, r, l.stale);
function diffJson(l, r) {
  const byId = new Map(l.graph.nodes.map((n) => [n.id, n]));
  const name2 = (id) => byId.get(id)?.name ?? id;
  const fresh = r.findings.filter((f) => f.rule !== "boundary-denied");
  return pretty({
    ...l.stale ? { stale: l.stale } : {},
    since: l.baseline?.commit ?? "unknown",
    added: fresh.map((f) => ({ rule: f.rule, boundary: f.boundary, message: f.message, local: name2(f.local), external: name2(f.external), ...site(f), key: f.key })),
    removed: r.removed,
    denied: r.findings.filter((f) => f.rule === "boundary-denied").map((f) => ({ boundary: f.boundary, message: f.message, local: name2(f.local), ...site(f) }))
  });
}
var site = (f) => f.path ? { path: f.path, line: (f.range?.start_line ?? 0) + 1, column: (f.range?.start_col ?? 0) + 1 } : {};
function boundariesJson(l, r, only) {
  const byId = new Map(l.graph.nodes.map((n) => [n.id, n]));
  const name2 = (id) => byId.get(id)?.name ?? id;
  const out2 = {};
  for (const b of BOUNDARIES) {
    if (only && b !== only) continue;
    const cs = r.crossings.filter((c) => c.boundary === b);
    if (!cs.length) continue;
    const pkgs = /* @__PURE__ */ new Map();
    for (const c of cs) (pkgs.get(c.package) ?? pkgs.set(c.package, []).get(c.package)).push(c);
    out2[b] = {
      label: BOUNDARY_INFO[b].label,
      packages: Object.fromEntries([...pkgs].map(([p, list]) => [p, list.map((c) => ({ dir: c.dir, local: name2(c.local), external: name2(c.external), provenance: c.provenance, basis: c.basis, ...site(c.site ?? {}) }))]))
    };
  }
  return pretty(out2);
}
function acceptKeys(repo, l, keys) {
  const now = snapshot(l.graph, l.policy, gitHead(repo));
  const b = keys?.length ? accept(l.baseline ? { ...l.baseline, commit: now.commit } : { ...now, crossings: [], packages: [] }, keys) : now;
  writeBaseline(repo, b);
  l.baseline = b;
  return b.crossings.length;
}
function callsJson(l, query) {
  const q = query.toLowerCase();
  const byId = new Map(l.graph.nodes.map((n) => [n.id, n]));
  const hits = l.graph.nodes.filter((n) => (n.kind === "function" || n.kind === "method" || n.kind === "type" || n.kind === "external") && n.name.toLowerCase().includes(q)).slice(0, 20);
  const describe = (id) => {
    const n = byId.get(id);
    return n ? `${n.name}${n.path ? ` (${n.path}:${(n.range?.start_line ?? 0) + 1})` : n.kind === "external" ? " (outside the repo)" : ""}` : id;
  };
  return pretty(hits.map((n) => ({
    name: n.name,
    kind: n.kind,
    path: n.path,
    line: n.range ? n.range.start_line + 1 : void 0,
    callers: l.graph.edges.filter((e) => e.kind === "call" && e.to === n.id).map((e) => `${describe(e.from)}${e.provenance === "resolved" ? "" : ` [${e.provenance}]`}`),
    callees: l.graph.edges.filter((e) => e.kind === "call" && e.from === n.id).map((e) => `${describe(e.to)}${e.provenance === "resolved" ? "" : ` [${e.provenance}]`}`)
  })));
}
async function drawSvg(repo, l, r, ask) {
  const laid = await boundaryPicture(l.graph, l.policy, r, ask?.portrait ? PANE_NODES : void 0, ask?.open);
  const ids = new Set(laid.boxes.map((b) => b.id));
  const focus = ask?.focus !== void 0 && ids.has(ask.focus) ? ask.focus : void 0;
  const svg = toSvg(laid, focus);
  const open = new Set(laid.open);
  const par = parents(laid.graph);
  const byId = new Map(laid.graph.nodes.map((n) => [n.id, n]));
  const up = (x) => isGroup(x) ? x.slice(5, x.lastIndexOf("#")) : par.get(x);
  const under = (id) => {
    for (let p = up(id); p !== void 0; p = up(p)) if (open.has(p)) return { under: p };
    return {};
  };
  const opened = laid.open.map((id) => {
    const n = byId.get(id);
    return { id, name: n?.name ?? id.slice(id.lastIndexOf("#") + 1), kind: n?.kind ?? "group", ...under(id) };
  });
  const tall = ask?.portrait ? shelf(laid, Math.max(20, ask.columns ?? PANE_COLUMNS)) : void 0;
  const cell = (b) => tall?.rects.get(b.id) ?? { x: col(b.x), y: row(b.y), w: Math.max(1, col(b.x + b.w) - col(b.x)), h: Math.max(1, row(b.y + b.h) - row(b.y)) };
  const boxes = [...laid.boxes].map((b) => ({ b, c: cell(b) })).sort((a, b) => a.c.y - b.c.y || a.c.x - b.c.x).map(({ b, c }) => ({
    id: b.id,
    name: b.node.name,
    kind: b.node.kind,
    ...b.parent && ids.has(b.parent) ? { parent: b.parent } : {},
    ...under(b.id),
    container: b.container,
    expandable: b.expandable,
    open: open.has(b.id),
    ...c,
    ...b.node.path ? { path: b.node.path } : {},
    ...b.node.range ? { line: b.node.range.start_line + 1 } : {},
    ...b.flag ? { severity: b.flag.severity, notes: b.flag.notes } : {}
  }));
  const wires = laid.wires.map((w) => ({
    from: w.from,
    to: w.to,
    points: tall ? [] : w.points.map((p) => ({ x: col(p.x), y: row(p.y) })),
    may: w.rollups.every((r2) => r2.resolved === 0),
    ...w.flag ? { severity: w.flag.severity } : {}
  }));
  const extent = tall ? { width: tall.width, height: tall.height } : { width: col(laid.width) + 1, height: row(laid.height) + 1 };
  const json = { open: opened, ...focus ? { focus } : {}, boxes, wires, ...extent, omitted: laid.omitted };
  fs9.mkdirSync(path8.join(repo, CACHE_DIR), { recursive: true });
  fs9.writeFileSync(path8.join(repo, CACHE_DIR, VIEW_FILE), svg);
  fs9.writeFileSync(path8.join(repo, CACHE_DIR, BOXES_FILE), JSON.stringify(json));
  return svg;
}
async function flowInputs(repo, l, r) {
  const langs = /* @__PURE__ */ new Set();
  for (const n of l.graph.nodes) if (n.path && (n.kind === "function" || n.kind === "method" || n.kind === "file")) {
    const f = owner(n.path);
    if (f) langs.add(f.id);
  }
  await init2([...langs]);
  const flags2 = /* @__PURE__ */ new Map();
  for (const f of r?.findings ?? []) {
    const k = `${f.local}\0${f.external}`;
    const x = flags2.get(k);
    if (x) x.notes.push(f.message);
    else flags2.set(k, { severity: f.severity, notes: [f.message] });
  }
  return {
    readSource: (p) => {
      try {
        return fs9.readFileSync(path8.join(repo, p), "utf8");
      } catch {
        return void 0;
      }
    },
    syntaxFor: (p) => owner(p)?.syntax(p),
    extra: l.policy.boundaries,
    flags: flags2
  };
}
async function flowOf(repo, l, r, pick, open = []) {
  const inp = await flowInputs(repo, l, r);
  const all = entries(l.graph, inp);
  let entry = pick === void 0 ? all[0] : all.find((e) => e.id === pick);
  if (!entry && pick !== void 0) {
    const q = pick.toLowerCase();
    entry = all.find((e) => e.name.toLowerCase() === q) ?? all.find((e) => e.name.toLowerCase().includes(q) || e.path.toLowerCase().includes(q));
    if (!entry) {
      const n = l.graph.nodes.find((x) => x.id === pick) ?? l.graph.nodes.find((x) => x.path && (x.kind === "function" || x.kind === "method") && x.name.toLowerCase() === q);
      if (n) return { entries: all, flow: flow(l.graph, n.id, new Set(open), inp) };
    }
  }
  return { entries: all, flow: entry ? flow(l.graph, entry.id, new Set(open), inp) : void 0 };
}
async function flowTextOf(repo, l, r, pick, open, depth = 0) {
  const { entries: all, flow: f } = await flowOf(repo, l, r, pick, open);
  if (!f) return pick === void 0 ? "No entry point found: nothing in the repo calls into it, or nothing is indexed.\n" : `No entry or function matches "${pick}". Entries: ${all.slice(0, 20).map((e) => e.name).join(", ")}
`;
  const opened = depth > 0 ? deepen(l, r, f, depth, repo, open) : Promise.resolve(f);
  const out2 = await opened;
  const head = pick === void 0 && all.length > 1 ? `Entry points (${all.length}): ${all.slice(0, 12).map((e) => `${e.name} [${e.reach}]`).join(", ")}${all.length > 12 ? ", \u2026" : ""}

` : "";
  return head + flowText(out2);
}
async function deepen(l, r, f, depth, repo, open = []) {
  const ids = new Set(open);
  let cur = f;
  for (let d = 0; d < depth; d++) {
    let more = false;
    const walk3 = (steps) => {
      for (const s of steps) {
        if (s.kind === "call") {
          if (!ids.has(s.id)) ids.add(s.id), more = true;
          if (s.steps) walk3(s.steps);
        } else if (s.kind === "if") walk3(s.yes), walk3(s.no);
        else if (s.kind === "loop" || s.kind === "catch") walk3(s.body);
        else if (s.kind === "switch") for (const c of s.cases) walk3(c.body);
      }
    };
    walk3(cur.steps);
    if (!more) break;
    cur = (await flowOf(repo, l, r, f.entry.id, ids)).flow ?? cur;
  }
  return cur;
}
var isBoundary = (s) => BOUNDARIES.includes(s);

// src/mcp.ts
var DIR = { dir: { type: "string", description: "Repo root; defaults to the server's repo." } };
var READS = { readOnlyHint: true, openWorldHint: false };
var WRITES = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
var INDEX = { index: { type: "boolean", description: "Re-index from source first (a few seconds; the graph may be stale otherwise)." } };
async function serve(repo) {
  const loaded2 = /* @__PURE__ */ new Map();
  const at = (a) => path9.resolve(repo, typeof a.dir === "string" ? a.dir : ".");
  const get = async (a) => {
    const d = at(a);
    if (a.index === true || !loaded2.has(d)) loaded2.set(d, await load(d, a.index === true));
    return [d, loaded2.get(d)];
  };
  const maps = /* @__PURE__ */ new Map();
  const tools = [
    {
      name: "hesperus_index",
      title: "Index the repo",
      annotations: WRITES,
      description: "Rebuild the repo's graph from source (no editor needed). Run after editing files, before the other tools.",
      inputSchema: { type: "object", properties: DIR },
      run: async (a) => {
        const d = at(a);
        const l = await load(d, true);
        loaded2.set(d, l);
        return `Indexed: ${l.graph.nodes.length} nodes, ${l.graph.edges.length} edges. ${(l.indexed ?? []).map((x) => `${x.id}: ${x.files} files${x.indexed ? "" : " (not indexed)"}`).join("; ")}`;
      }
    },
    {
      name: "hesperus_check",
      title: "Lint boundary crossings",
      annotations: READS,
      description: "Lint the repo's boundary crossings (database, network, AI, cloud, queues, filesystem, processes, environment) against hesperus.json and the accepted baseline. Errors are policy violations; warnings and info are crossings and dependencies not yet reviewed.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        return checkJson(l, check(d, l));
      }
    },
    {
      name: "hesperus_diff",
      title: "Changes since the last review",
      annotations: READS,
      description: "What changed since the last accepted review: boundary crossings and dependencies added or removed, and any crossing the policy denies.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX } },
      run: async (a) => {
        const [d, l] = await get(a);
        return diffJson(l, check(d, l));
      }
    },
    {
      name: "hesperus_boundaries",
      title: "List boundary crossings",
      annotations: READS,
      description: "Every call that leaves the repo, grouped by boundary and package, with the function and file:line that makes it.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, boundary: { type: "string", enum: ["database", "network", "ai", "cloud", "messaging", "filesystem", "process", "environment"] } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return boundariesJson(l, check(d, l), typeof a.boundary === "string" && isBoundary(a.boundary) ? a.boundary : void 0);
      }
    },
    {
      name: "hesperus_calls",
      title: "Find callers and callees",
      annotations: READS,
      description: "Callers and callees of the functions or types whose name contains the query, with file:line and how sure each edge is.",
      inputSchema: { type: "object", properties: { ...DIR, ...INDEX, name: { type: "string" } }, required: ["name"] },
      run: async (a) => callsJson((await get(a))[1], String(a.name ?? ""))
    },
    {
      name: "hesperus_flow",
      title: "What the program does, top down",
      annotations: READS,
      description: "The program as a flow chart in text: from an entry point (the one that drives the most code, or `entry`), the steps it takes in order, each named by its function and the comment above it, the decisions between them with their conditions, loops, and every call that leaves the repo as a terminal with its boundary. Resolved from the code, nothing inferred. Without `entry`, also lists the entry points.",
      inputSchema: { type: "object", properties: {
        ...DIR,
        ...INDEX,
        entry: { type: "string", description: "A function or file to start from, by name or graph id." },
        depth: { type: "number", description: "Open calls this many levels down (default 1, at most 6)." }
      } },
      run: async (a) => {
        const [d, l] = await get(a);
        return flowTextOf(d, l, check(d, l), typeof a.entry === "string" ? a.entry : void 0, [], Math.min(6, Math.max(0, typeof a.depth === "number" ? a.depth : 1)));
      }
    },
    {
      name: "hesperus_accept",
      title: "Accept crossings as reviewed",
      annotations: WRITES,
      description: "Mark crossings as reviewed so they stop being reported as new: the given finding keys, or all current crossings when none are given. Use only when the person has reviewed them.",
      inputSchema: { type: "object", properties: { ...DIR, keys: { type: "array", items: { type: "string" } } } },
      run: async (a) => {
        const [d, l] = await get(a);
        return `Accepted; ${acceptKeys(d, l, Array.isArray(a.keys) ? a.keys.map(String) : void 0)} crossings in the baseline.`;
      }
    },
    {
      name: "hesperus_svg",
      title: "Draw the boundary overview",
      annotations: WRITES,
      description: "Draw the boundary overview to .hesperus/view.svg (the repo with each boundary as a box on the right, findings in red and amber) and return its path. With `columns`, laid out top to bottom for a tall pane that many cells wide, its boxes and wires in cells written to .hesperus/view.json beside it.",
      inputSchema: { type: "object", properties: {
        ...DIR,
        ...INDEX,
        columns: { type: "number", description: "Lay the picture out for a tall pane this many cells wide." },
        open: { type: "array", items: { type: "string" }, description: "Box ids to open in place of the overview's." },
        focus: { type: "string", description: "A box id to outline." }
      } },
      run: async (a) => {
        const [d, l] = await get(a);
        const ask = {
          ...Array.isArray(a.open) ? { open: a.open.map(String) } : {},
          ...typeof a.focus === "string" ? { focus: a.focus } : {},
          ...typeof a.columns === "number" ? { portrait: true, columns: a.columns } : {}
        };
        await drawSvg(d, l, check(d, l), ask);
        return path9.join(d, ".hesperus", "view.svg");
      }
    },
    {
      name: "hesperus_map",
      title: "Show the boundary map",
      annotations: READS,
      description: "Show the boundary map as an interactive graph (pan, zoom, open and close boxes, go to source) where the host draws MCP Apps; elsewhere, a one-line summary. Without arguments it shows the overview.",
      inputSchema: { type: "object", properties: {
        ...DIR,
        ...INDEX,
        toggle: { type: "string", description: "A box id to open or close." },
        open: { type: "array", items: { type: "string" }, description: "Box ids to open." },
        close: { type: "array", items: { type: "string" }, description: "Box ids to close, with everything open inside them." },
        reset: { type: "boolean", description: "Back to the overview." }
      } },
      _meta: { ui: { resourceUri: MAP_URI }, "ui/resourceUri": MAP_URI },
      run: async (a) => {
        const [d, l] = await get(a);
        const r = check(d, l);
        let open = a.reset === true ? void 0 : maps.get(d);
        const asks = typeof a.toggle === "string" || Array.isArray(a.open) || Array.isArray(a.close);
        if (asks) {
          open ??= new Set((await boundaryPicture(l.graph, l.policy, r)).open);
          const par = parents(l.graph);
          const up = (x) => isGroup(x) ? x.slice(5, x.lastIndexOf("#")) : par.get(x);
          const close = (c) => {
            open.delete(c);
            for (const x of [...open]) for (let p = up(x); p !== void 0; p = up(p)) if (p === c) open.delete(x);
          };
          if (typeof a.toggle === "string") open.has(a.toggle) ? close(a.toggle) : open.add(a.toggle);
          for (const id of Array.isArray(a.open) ? a.open.map(String) : []) open.add(id);
          for (const id of Array.isArray(a.close) ? a.close.map(String) : []) close(id);
        }
        const { graph: _, open: now, ...layout2 } = await boundaryPicture(l.graph, l.policy, r, void 0, open);
        maps.set(d, new Set(now));
        const flagged = layout2.boxes.filter((b) => b.flag).length;
        return { text: `Boundary map of ${path9.basename(d)}: ${layout2.boxes.length} boxes, ${layout2.wires.length} wires, ${flagged} flagged.`, structuredContent: { layout: layout2 } };
      }
    },
    {
      name: "hesperus_open",
      title: "Open a box's source",
      annotations: READS,
      description: "Open the source of a box of the boundary map in the editor (VS Code's `code -g` when installed, else the system's opener).",
      inputSchema: { type: "object", properties: { ...DIR, id: { type: "string" } }, required: ["id"] },
      run: async (a) => {
        const [d, l] = await get(a);
        const n = l.graph.nodes.find((x) => x.id === a.id);
        if (!n?.path) return `No source for ${String(a.id)}.`;
        const at2 = `${n.path}:${(n.range?.start_line ?? 0) + 1}`;
        for (const [cmd, ...args2] of [["code", "-g", at2], [process.platform === "darwin" ? "open" : "xdg-open", n.path]])
          if ((0, import_node_child_process3.spawnSync)(cmd, args2, { cwd: d, timeout: 15e3 }).status === 0) return `Opened ${at2}.`;
        return `Nothing here opens ${n.path}.`;
      }
    }
  ];
  const resources = [
    { uri: "hesperus://report", name: "Latest lint report", mimeType: "application/json", read: async () => {
      const [d, l] = await get({});
      return checkJson(l, check(d, l));
    } },
    { uri: "hesperus://view.svg", name: "Boundary overview", mimeType: "image/svg+xml", read: async () => {
      const [d, l] = await get({});
      return drawSvg(d, l, check(d, l));
    } },
    { uri: MAP_URI, name: "Boundary map", mimeType: MAP_MIME, _meta: { ui: { csp: MAP_CSP, prefersBorder: true } }, read: async () => mapHtml() }
  ];
  const out2 = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  const reply = (id, result) => out2({ jsonrpc: "2.0", id, result });
  const fail3 = (id, code, message) => out2({ jsonrpc: "2.0", id, error: { code, message } });
  const handle2 = async (m) => {
    const { id, method, params: params2 = {} } = m;
    const notification = id === void 0;
    try {
      switch (method) {
        case "initialize":
          return reply(id, {
            protocolVersion: typeof params2.protocolVersion === "string" ? params2.protocolVersion : "2025-03-26",
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: "hesperus", version: VERSION },
            instructions: "Hesperus maps what this repo reaches outside itself. Call hesperus_index after editing, then hesperus_diff to see what your changes added; hesperus_check for the full lint; hesperus_calls to see who calls a function; hesperus_flow for what the program does, step by step from an entry point."
          });
        case "ping":
          return reply(id, {});
        case "tools/list":
          return reply(id, { tools: tools.map(({ name: name2, title, description, annotations, inputSchema, _meta }) => ({ name: name2, title, description, inputSchema, annotations: { title, ...annotations }, ..._meta ? { _meta } : {} })) });
        case "tools/call": {
          const t = tools.find((x) => x.name === params2.name);
          if (!t) return fail3(id, -32602, `unknown tool ${String(params2.name)}`);
          try {
            const answer = await t.run(params2.arguments ?? {});
            if (typeof answer === "string") return reply(id, { content: [{ type: "text", text: answer }] });
            return reply(id, { content: [{ type: "text", text: answer.text }], structuredContent: answer.structuredContent });
          } catch (e) {
            return reply(id, { content: [{ type: "text", text: `hesperus: ${e.message}` }], isError: true });
          }
        }
        case "resources/list":
          return reply(id, { resources: resources.map(({ uri, name: name2, mimeType }) => ({ uri, name: name2, mimeType })) });
        case "resources/read": {
          const r = resources.find((x) => x.uri === params2.uri);
          if (!r) return fail3(id, -32602, `unknown resource ${String(params2.uri)}`);
          return reply(id, { contents: [{ uri: r.uri, mimeType: r.mimeType, text: await r.read(), ..."_meta" in r ? { _meta: r._meta } : {} }] });
        }
        default:
          if (!notification) fail3(id, -32601, `unknown method ${String(method)}`);
      }
    } catch (e) {
      if (!notification) fail3(id, -32603, e.message);
    }
  };
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let chain2 = Promise.resolve();
  for await (const line of rl) {
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      fail3(null, -32700, "parse error");
      continue;
    }
    chain2 = chain2.then(() => handle2(msg));
  }
  await chain2;
}

// src/cli.ts
var USAGE = `usage: hesperus <command> [dir] [options]

  index [dir]            build the graph from syntax alone (no editor needed) into <dir>/${CACHE_DIR}/
  check [dir]            lint boundary crossings against <dir>/${POLICY_FILE} and the accepted baseline
    --index              re-index first (done anyway when there is no graph yet)
    --json               print the report as JSON
    --svg                also draw the boundary overview to <dir>/${CACHE_DIR}/${VIEW_FILE}
    --accept             accept every current crossing as reviewed, then exit 0
    --max-warnings N     exit 1 when there are more than N warnings (default: no limit)
  svg [dir]              draw the boundary overview to <dir>/${CACHE_DIR}/${VIEW_FILE}, its boxes to ${BOXES_FILE}
    --view FILE          draw the boxes FILE (- for stdin) opens instead, {"open": [ids], "focus": id}; also check --svg
    --portrait [N]       lay the boxes of ${BOXES_FILE} out for a tall pane N columns wide (default 60); also check --svg
  flow [dir]             what the program does, top down: the steps from an entry point, with its decisions and what it reaches
    --entry NAME         start from this function or file (default: the entry that drives the most code)
    --depth N            open calls N levels down (default 1)
  mcp [dir]              serve the repo to an agent over MCP on stdin/stdout

Boundaries: database, network, AI, cloud, queues, filesystem, processes, environment.
Exit status: 0 clean, 1 findings over the limit or any error, 2 no graph or bad input.`;
async function main(argv) {
  const flags2 = /* @__PURE__ */ new Set(), args2 = [];
  let maxWarnings = Infinity, viewFile, columns, entry, depth = 1;
  for (let i2 = 0; i2 < argv.length; i2++) {
    if (argv[i2] === "--max-warnings") maxWarnings = Number(argv[++i2]);
    else if (argv[i2] === "--entry") entry = argv[++i2];
    else if (argv[i2] === "--depth") depth = Number(argv[++i2]);
    else if (argv[i2] === "--view") viewFile = argv[++i2];
    else if (argv[i2] === "--portrait") {
      flags2.add("--portrait");
      if (/^\d+$/.test(argv[i2 + 1] ?? "")) columns = Number(argv[++i2]);
    } else if (argv[i2].startsWith("--")) flags2.add(argv[i2]);
    else args2.push(argv[i2]);
  }
  const flag = (f) => flags2.has(f);
  const cmd = args2[0];
  if (!["index", "check", "svg", "flow", "mcp"].includes(cmd) || Number.isNaN(depth) || args2.length > 2 || flag("--help") || Number.isNaN(maxWarnings) || argv.includes("--view") && !viewFile) {
    console.error(USAGE);
    return 2;
  }
  const repo = path10.resolve(args2[1] ?? ".");
  if (cmd === "mcp") {
    await serve(repo);
    return 0;
  }
  try {
    const l = await load(repo, cmd === "index" || flag("--index"), (s) => console.error(`hesperus: ${s}`));
    if (l.indexed) {
      for (const lang of l.indexed) console.error(`hesperus: ${lang.id}: ${lang.files} files${lang.indexed ? "" : " (not indexed: no headless support)"}`);
      console.error(`hesperus: ${l.graph.nodes.length} nodes, ${l.graph.edges.length} edges.`);
    }
    if (cmd === "index") return 0;
    if (flag("--accept")) {
      console.log(`hesperus: accepted ${acceptKeys(repo, l)} crossings.`);
      return 0;
    }
    const r = check(repo, l);
    if (cmd === "flow") {
      process.stdout.write(await flowTextOf(repo, l, r, entry, [], depth));
      return 0;
    }
    if (cmd === "svg" || flag("--svg")) {
      const ask = viewFile === void 0 ? {} : JSON.parse(fs10.readFileSync(viewFile === "-" ? 0 : path10.resolve(viewFile), "utf8"));
      if (flag("--portrait")) {
        ask.portrait = true;
        if (columns !== void 0) ask.columns = columns;
      }
      await drawSvg(repo, l, r, ask);
      console.error(`hesperus: drew ${path10.join(CACHE_DIR, VIEW_FILE)}`);
      if (cmd === "svg") return 0;
    }
    if (flag("--json")) process.stdout.write(checkJson(l, r));
    else {
      if (l.stale) console.error(`hesperus: stale: ${l.stale}`);
      for (const f of r.findings) {
        const at = f.path ? `${f.path}:${(f.range?.start_line ?? 0) + 1}:${(f.range?.start_col ?? 0) + 1}` : "-";
        console.log(`${at}  ${f.severity}  ${f.message}  [${f.rule}]`);
      }
      for (const k of r.removed) console.log(`-  info  No longer crossing: ${k}  [removed]`);
      const totals = Object.entries(r.counts).map(([b, n]) => `${BOUNDARY_INFO[b].label} ${n.out + n.in}`).join(", ");
      console.log(`
${r.findings.length} findings. Crossings: ${totals || "none"}.`);
    }
    const errors = r.findings.filter((f) => f.severity === "error").length;
    const warnings = r.findings.filter((f) => f.severity === "warning").length;
    return errors || warnings > maxWarnings ? 1 : 0;
  } catch (e) {
    console.error(`hesperus: ${e.message}`);
    return 2;
  }
}
main(process.argv.slice(2)).then((code) => process.exitCode = code);
