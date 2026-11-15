// Node test hooks: stub Vite-only `?url` asset imports (DuckDB-Wasm bundles)
// so service modules can be imported under `node --test`.
import { register } from 'node:module';

const hooks = `
  const isAsset = (s) => s.includes('?url') || /\\.wasm($|\\?)/.test(s);
  export async function resolve(specifier, context, next) {
    if (isAsset(specifier)) {
      return { url: 'stub-asset:' + encodeURIComponent(specifier), shortCircuit: true };
    }
    return next(specifier, context);
  }
  export async function load(url, context, next) {
    if (url.startsWith('stub-asset:') || isAsset(url)) {
      return {
        format: 'module',
        source: 'export default ' + JSON.stringify(url),
        shortCircuit: true,
      };
    }
    return next(url, context);
  }
`;

register('data:text/javascript,' + encodeURIComponent(hooks));
