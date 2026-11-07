import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { defineConfig } from 'vitest/config';
const product = JSON.parse(
  readFileSync(new URL('./product.json', import.meta.url)),
);
// Restricted Windows hosts may reject subprocess stdio pipes used by esbuild.
// Opt-in verification fallback; normal development continues to use esbuild.
const constrained = process.env.CANVAS_NO_SUBPROCESS === '1';
export default defineConfig({
  define: constrained ? {} : { __PRODUCT_NAME__: JSON.stringify(product.name) },
  clearScreen: false,
  resolve: { preserveSymlinks: constrained },
  esbuild: constrained ? false : undefined,
  plugins: constrained
    ? [
        {
          name: 'in-process-typescript',
          enforce: 'pre',
          transform(code, id) {
            code = code
              .replaceAll('__PRODUCT_NAME__', JSON.stringify(product.name))
              .replaceAll('process.env.NODE_ENV', '"production"')
              .replaceAll('import.meta.env?.DEV', 'false')
              .replaceAll('import.meta.env.DEV', 'false')
              .replaceAll('import.meta.hot', 'undefined');
            if (!/\.tsx?$/.test(id)) return { code, map: null };
            return {
              code: ts.transpileModule(code, {
                compilerOptions: {
                  target: ts.ScriptTarget.ES2022,
                  module: ts.ModuleKind.ESNext,
                  jsx: ts.JsxEmit.ReactJSX,
                  sourceMap: true,
                },
                fileName: id,
              }).outputText,
              map: null,
            };
          },
        },
      ]
    : [],
  build: { minify: constrained ? false : 'esbuild' },
  test: { include: ['src/**/*.test.ts'], environment: 'node', pool: 'threads' },
});
