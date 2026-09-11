// Request-local accounting from Cloudflare's own metadata. This writes no telemetry to D1.
export function meterDatabase(db) {
  const stats={rowsRead:0,rowsWritten:0,queries:0},originals=new WeakMap();
  function count(result){stats.queries++;stats.rowsRead+=Number(result?.meta?.rows_read)||0;stats.rowsWritten+=Number(result?.meta?.rows_written)||0;return result;}
  function wrap(statement){
    const result={
      bind(...args){return wrap(statement.bind(...args))},
      async all(){return count(await statement.all())},
      async run(){return count(await statement.run())},
      async first(column){const response=count(await statement.all());const row=response.results?.[0] || null;return column===undefined?row:row?.[column] ?? null},
      async raw(options){return statement.raw(options)},
    };
    originals.set(result,statement);return result;
  }
  return {stats,DB:new Proxy(db,{get(target,key){
    if(key==='prepare')return sql=>wrap(target.prepare(sql));
    if(key==='batch')return async statements=>(await target.batch(statements.map(s=>originals.get(s)||s))).map(count);
    const value=target[key];return typeof value==='function'?value.bind(target):value;
  }})};
}
