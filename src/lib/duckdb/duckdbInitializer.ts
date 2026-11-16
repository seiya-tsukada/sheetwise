import * as duckdb from '@duckdb/duckdb-wasm';
import mvpWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import ehWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

let dbInstance: duckdb.AsyncDuckDB | null = null;
let workerInstance: Worker | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/**
 * DuckDB-Wasm（シングルスレッド、EH版／非対応ブラウザはMVP版）をローカルアセットから初期化する
 * CDNへの外部通信は一切行わない
 */
export async function getOrInitDuckDB(): Promise<duckdb.AsyncDuckDB> {
  if (dbInstance) {
    return dbInstance;
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    try {
      const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
        mvp: {
          mainModule: mvpWasmUrl,
          mainWorker: mvpWorkerUrl,
        },
        // Wasm例外処理に対応したブラウザではEH版を使う（シングルスレッド、COIは使用しない）。
        // MVP版はC++例外を捕捉できず、SQLエラーが "_setThrew is not defined" に化けてしまう。
        eh: {
          mainModule: ehWasmUrl,
          mainWorker: ehWorkerUrl,
        },
      };

      const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
      if (!bundle.mainWorker) {
        throw new Error('DuckDB-Wasm のローカルWorkerアセットを解決できませんでした。');
      }

      const worker = new Worker(bundle.mainWorker);
      workerInstance = worker;

      const logger = new duckdb.VoidLogger();
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      // SUM(BIGINT) の HUGEINT や DECIMAL 列は Arrow の Decimal になり、
      // JS側でスケールが失われるため数値（double）として受け取る
      await db.open({ query: { castDecimalToDouble: true } });
      dbInstance = db;
      return db;
    } catch (error) {
      initPromise = null;
      if (workerInstance) {
        workerInstance.terminate();
        workerInstance = null;
      }
      throw error;
    }
  })();

  return initPromise;
}

/**
 * DuckDBインスタンスとWorkerを明示的に破棄する
 */
export async function terminateDuckDB(): Promise<void> {
  if (dbInstance) {
    try {
      await dbInstance.terminate();
    } catch {
      // ignore cleanup errors
    }
    dbInstance = null;
  }
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }
  initPromise = null;
}
