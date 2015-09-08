var _ = require('lodash');
var base = require('./base.js');

_.extend(module.exports, base, {
  quote: function(name) {
    return '"' + name + '"';
  },
  columnType: function(columnDef) {
    if (columnDef.autoIncrement)
      return columnDef.type == 'int' ? 'serial' : 'bigserial';

    return base.columnType(columnDef);
  }
});
