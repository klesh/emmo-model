var i = require('i')();
var _ = require('lodash');
var util = require('util');

// to convert user definition to standard internal definiton.


/* definition = {
 *   'model1Name': {
 *     columns: {
 *       'column1Name': { 
 *         type: 'string|int|timestamp...', 
 *         length: int, 
 *         allowNull: bool(true), 
 *         defaultValue: ''
 *         primaryKey: bool(false),
 *         unique: bool(false),
 *         index: string|bool,
 *         desc: bool(true), 
 *         refer: 'foreignTableName',
 *         onDelete: 'CASCADE|SET NULL',
 *         onUpdate: 'CASACDE|SET NULL'
 *       }
 *     },
 *     options: {
 *       tableName: model1NamePluralize
 *     }
 *   }
 * } 
 *
 */

module.exports = function(definition) {
   var normalized = {};
  _.forOwn(definition, function(modelDef, modelName) {

    var norm = {
      tableName: modelDef.options.tableName || i.pluralize(modelName),
      columns: {},
      primaryKeys: {},
      indexes: [],
      foreignKeys: []
    };
    
    norm.primaryKeys.name = 'PK_' + norm.tableName;
    norm.primaryKeys.columns = [];

    _.forOwn(modelDef.columns, function(columnDef, columnName) {
      // check given definition is correct or not.
      function asset(name, type, required) {
        var value = columnDef[name];
        if (value) {
          var actualType = typeof(value);
          if (actualType !== type) {
            throw new Error(util.format("%s.%s.%s should be %s type but given %s", modelName, columnName, type, actualType));
          }
        } else if (required) {
          throw new Error(util.format("%s.%s.%s is required", modelName, columnName, name));
        }
        return !!value;
      }

      // normalize columns definition
      var normCol = _.pick(columnDef, [
        'type', 'length', 'primaryKey', 'allowNull', 'defaultValue', 'autoIncrement', 'desc'
      ]);
      norm.columns[columnName] = normCol;
      normCol.allowNull = normCol.allowNull !== false;
      normCol.desc = normCol.desc !== false;


      // pick up primary key
      if (columnDef.primaryKey)
        norm.primaryKeys.columns.push(columnName);

      asset('type', 'string', true);

      // normalize index
      if (columnDef.index || columnDef.unique) {
        var index, sorting = normCol.desc ? 'DESC' : 'ASC';

        if (_.isString(columnDef.index)) {
          index = _.find(norm.indexes, 'name', columnDef.index);
          if (!index) {
            index = { 
              name: columnDef.index,
              unique: columnDef.unique,
              columns: { }
            };
            index.columns[columnName] = sorting;
            norm.indexes.push(index);
          } else {
            index.unique |= columnDef.unique;
            index.columns[columnName] = sorting;
          }
        } else {
          var columns = { };
          columns[columnName] = sorting;
          norm.indexes.push({
            name: util.format('IX_%s_%s', norm.tableName, columnName),
            unique: columnDef.unique,
            columns: columns
          });          
        }
      }

      // nomarlize foreign key
      if (asset('refer', 'string')) {
        var name = columnDef.referName || util.format('FK_%s_%s', columnDef.refer, norm.tableName); 
        if (name === true) name = util.format('FK_%s_%s_%s', columnDef.refer, norm.tableName, columnName);
        var foreignKey = _.find(norm.foreignKeys, 'name', name);
        if (!foreignKey) {
          foreignKey = {
            name: name,
            columns: [columnName],
            refer: columnDef.refer
          };
          norm.foreignKeys.push(foreignKey);
        } else  {
          foreignKey.columns.push(columnName);
        }

        if (asset('onDelete', 'string')) {
          foreignKey.onDelete = columnDef.onDelete.toUpperCase();
        }

        if (asset('onUpdate', 'string')) {
          foreignKey.onUpdate = columnDef.onDelete.toUpperCase();
        }
      }
    });
    
    if (norm.primaryKeys.columns.length === 0)
      delete norm.primaryKeys;
    normalized[modelName] = norm;
  });
  return normalized;
};
