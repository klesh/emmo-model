var util = require('util');
var _ = require('lodash');

// auto increment column statement;
exports.autoIncrement = '';
// separator between sql statement;
exports.separator = ';';

// quote resource name
exports.quote = function(name) {
  return name;
};

/* columnNames = ['column1Name', 'column2Name'];
 * return: '"column1Name", "column2Name"'
 */
exports.joinColumns = function(columnNames) {
  return columnNames.map(this.quote).join(', ');
};

/* columnOrders = {
 *   column1Name: 'ASC',
 *   column2Name: 'DESC'
 * }
 * 
 * return: '"column1Name" ASC, "column2Name" DESC'
 */
exports.joinOrderedColumns = function(columnOrders) {
  i
  var self = this;
  var script = [];
  _.forOwn(columnOrders, function(order, columnName) {
    script.push(self.quote(columnName) + ' ' + order);
  });
  return script.join(', ');
};


// return column type statement
exports.columnType = function(columnDef) {
  if (columnDef.type == 'string')
    return columnDef.length ?  util.format('varchar(%d)', columnDef.length) : 'text';

  return columnDef.type;
};
