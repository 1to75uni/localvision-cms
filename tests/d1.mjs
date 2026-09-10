import {DatabaseSync} from 'node:sqlite';
export function database() {
  const sqlite=new DatabaseSync(':memory:');const history=[];
  const DB={history,sqlite,prepare(sql){
    const params=[];
    const statement={bind(...args){params.push(...args);return statement;},
      async run(){history.push(sql);const result=sqlite.prepare(sql).run(...params);return {success:true,meta:{changes:Number(result.changes)}};},
      async all(){history.push(sql);return {success:true,results:sqlite.prepare(sql).all(...params)};},
      async first(){history.push(sql);return sqlite.prepare(sql).get(...params) || null;}}
    return statement;
  },async batch(statements){sqlite.exec('BEGIN');try{const rows=[];for(const s of statements)rows.push(await s.run());sqlite.exec('COMMIT');return rows;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  return {DB};
}
