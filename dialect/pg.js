var base = require('./base.js');

exports.quote = function(name) {
  return '"' + name + '"';
};

exports.columnType = function(columnDef) {
  if (columnDef.autoIncrement)
    return columnDef.type == 'int' ? 'serial' : 'bigserial';

  return base.columnType(columnDef);
};
