import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export function createUiLoader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(filename);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = {exports:{}}; cache.set(filename,module);
    const source = ts.transpileModule(fs.readFileSync(filename,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
    const localRequire = spec => {
      if (spec in overrides) return overrides[spec];
      if (spec.startsWith('@/') || spec.startsWith('.')) {
        const base = spec.startsWith('@/') ? path.resolve(spec.slice(2)) : path.resolve(path.dirname(filename),spec);
        const target = [base,base+'.ts',base+'.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile());
        if (!target) throw new Error('Missing test dependency: '+base);
        return load(target);
      }
      return require(spec);
    };
    vm.runInThisContext('(function(require,module,exports){'+source+'\n})',{filename})(localRequire,module,module.exports);
    return module.exports;
  }
  return load;
}
