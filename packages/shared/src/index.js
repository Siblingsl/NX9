"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePerfTier = exports.PERF = exports.validateLink = exports.socketsCompatible = exports.resolveAccepts = exports.resolveEmits = exports.SOCKET_LABELS = exports.SOCKET_COLORS = exports.SOCKET_REGISTRY = exports.lookupBlock = exports.BLOCK_GROUPS = exports.BLOCK_CATALOG = void 0;
var block_catalog_1 = require("./catalog/block-catalog");
Object.defineProperty(exports, "BLOCK_CATALOG", { enumerable: true, get: function () { return block_catalog_1.BLOCK_CATALOG; } });
Object.defineProperty(exports, "BLOCK_GROUPS", { enumerable: true, get: function () { return block_catalog_1.BLOCK_GROUPS; } });
Object.defineProperty(exports, "lookupBlock", { enumerable: true, get: function () { return block_catalog_1.lookupBlock; } });
var socket_registry_1 = require("./catalog/socket-registry");
Object.defineProperty(exports, "SOCKET_REGISTRY", { enumerable: true, get: function () { return socket_registry_1.SOCKET_REGISTRY; } });
Object.defineProperty(exports, "SOCKET_COLORS", { enumerable: true, get: function () { return socket_registry_1.SOCKET_COLORS; } });
Object.defineProperty(exports, "SOCKET_LABELS", { enumerable: true, get: function () { return socket_registry_1.SOCKET_LABELS; } });
Object.defineProperty(exports, "resolveEmits", { enumerable: true, get: function () { return socket_registry_1.resolveEmits; } });
Object.defineProperty(exports, "resolveAccepts", { enumerable: true, get: function () { return socket_registry_1.resolveAccepts; } });
Object.defineProperty(exports, "socketsCompatible", { enumerable: true, get: function () { return socket_registry_1.socketsCompatible; } });
Object.defineProperty(exports, "validateLink", { enumerable: true, get: function () { return socket_registry_1.validateLink; } });
var perf_thresholds_1 = require("./constants/perf-thresholds");
Object.defineProperty(exports, "PERF", { enumerable: true, get: function () { return perf_thresholds_1.PERF; } });
Object.defineProperty(exports, "resolvePerfTier", { enumerable: true, get: function () { return perf_thresholds_1.resolvePerfTier; } });
//# sourceMappingURL=index.js.map