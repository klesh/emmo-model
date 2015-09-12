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
 *         allowNull: bool, 
 *         defaultValue: ''
 *         primaryKey: bool(false),
 *         unique: bool(false),
 *         index: string|bool,
 *         descIndex: bool(false), 
 *         refer: 'foreignTableName',
 *         onDelete: 'CASCADE|SET NULL',
 *         onUpdate: 'CASACDE|SET NULL',
 *         validate: { isEmail: bool, max: int, min: int }
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
      // normalize columns definition
      norm.columns[columnName] = _.pick(columnDef, [
        'type', 'length', 'primaryKey', 'allowNull', 'defaultValue', 'autoIncrement'
      ]);

      // pick up primary key
      if (columnDef.primaryKey)
        norm.primaryKeys.columns.push(columnName);

      // normalize index
      if (columnDef.index || columnDef.unique) {
        var index, sorting = columnDef.descIndex ? 'DESC' : 'ASC';

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
      if (columnDef.refer) {
        var foreignKey = _.find(norm.foreignKeys, 'refer', columnDef.refer);
        if (!foreignKey) {
          foreignKey = {
            name: util.format('FK_%s_%s', norm.tableName, columnName),
            columns: [columnName],
            refer: columnDef.refer
          };
          norm.foreignKeys.push(foreignKey);
        } else  {
          foreignKey.columns.push(columnName);
        }

        if (columnDef.onDelete)
          foreignKey.onDelete = columnDef.onDelete.toUpperCase();

        if (columnDef.onUpdate)
          foreignKey.onUpdate = columnDef.onUpdate.toUpperCase();
      }
    });
    
    if (norm.primaryKeys.columns.length === 0)
      delete norm.primaryKeys;
    normalized[modelName] = norm;
  });
  return normalized;
};
