var _ = require('lodash');
var SqlGenerator = require('./lib/sql-generator.js');

function EmmoModel(options) {
  this.tables = {};
  this.creationSql = {};
  _.extend(this, {
    dialect: 'pg'
  }, options);
}

EmmoModel.prototype.define = function(name, definition) {
  this.tables[name] = definition;
  this.creationSql = {};
};

EmmoModel.prototype.getCreationSql = function(dialect) {
  dialect = dialect || this.dialect;
  if (!this.creationSql.hasOwnProperty(dialect)) {
    this.creationSql[dialect] = this.generateCreationSql(dialect);
  }
  return this.creationSql[dialect];
};

EmmoModel.prototype.generateCreationSql = function(dialect) {
  var self = this;
  var agent = require('dialect/' + dialect);
  var sqlGen = new SqlGenerator(agent);
  return sqlGen.database(this.tables);
  _.forOwn(self.tables, function(tableDef, tableName) {
  });
};

/* tableDef = {
 *  columnName: columnDef
 * }
 */
EmmoModel.prototype.generateColumns = function(tableDef) {
  var self = this;
  var sql = [];
  _.forOwn(tableDef, function(columnDef, columnName) {
    sql.push('  ' +  self.generateColumn(columnDef));
  });
  return sql.join('\n');
};

EmmoModel.prototype.generateColumn = function(columnDef) {
  
};

module.exports = new EmmoModel();
module.exports.new = function(options) {
  return new EmmoModel(options);
};
