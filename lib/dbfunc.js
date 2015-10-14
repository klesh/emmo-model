

/** db.select('User', { field: { 'total': df.count() });
 *  db.select('User', { field: [ db.abs('age') ] })
 *  db.select('User', { field: [ { db.atan2('a', 'b') } ] })
 *  db.select('User', { field: { index: db.position('permission', 2) } })
 */
function DbFunc() {
  
}

DbFunc.prototype.toSql = function() {

}
