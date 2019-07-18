"use strict";
/* jshint node: true */

var util = require('util');

/**
 * Serializable object, contain only database relevant information
 *
 * @typedef Column
 * @type {object}
 * @property {string}                   columnName
 * @property {string}                   type
 * @property {number}                   [length]
 * @property {boolean}                  [primaryKey=false]
 * @property {any}                      [defaultValue]
 * @property {boolean}                  [autoIncrement=false]
 * @property {bollean}                  [allowNull=true]
 *
 */

/**
 * @typedef PrimaryKey
 * @type {object}
 * @property {string}                   name
 * @property {string[]}                 columns           columnNames
 */

/**
 * @typedef Index
 * @type {object}
 * @property {string}                   name
 * @property {boolean}                  unique
 * @property {object.<string, string>}  columns           columnName vs sorting
 */

/**
 * @typedef ForeignKey
 * @type {object}
 * @property {string}                   name
 * @property {string[]}                 columns           columnNames
 * @property {string}                   refer             target entityName
 * @property {string}                   [onDelete]
 * @property {string}                   [onUpdate]
 */

/**
 * Serializable object, contain only database relevant information
 *
 * @typedef Table
 * @type {object}
 * @property {string}                   tableName
 * @property {Column[]}                 columns
 * @property {PrimaryKey}               primaryKey
 * @property {Index[]}                  indexes
 * @property {ForeignKey[]}             foreignKeys
 */

/**
 * Convert entities to tables
 *
 * @function
 */
function purify(entities) {
  var tables = {};

  for (const entityName in entities) {
    const entity = entities[entityName];
    var table = {
      tableName: entity.tableName,
      columns: {},
      primaryKey: {
        name: 'PK_' + entity.tableName,
        columns: []
      },
      indexes: [],
      foreignKeys: [],
      tableOptions: entity.tableOptions
    };

    if (entity.tableOptions.indexes)
      table.indexes = table.indexes.concat(entity.tableOptions.indexes);

    for (const propertyName in entity.properties) {
      const property = entity.properties[propertyName];
      if (!property.columnName)
        return;

      if (typeof(property.type) !== 'string')
        throw new Error(util.format("%s.%s.type is missing, please define one", entityName, propertyName));

      // pick up basic columns definition
      const column = {};
      for (const p of [
        'columnName', 'type', 'length', 'primaryKey', 'defaultValue', 'autoIncrement', 'allowNull', 'unsigned', 'decimals'
      ]) {
        column[p] = property[p];
      }

      // pick up primary key
      if (column.primaryKey)
        table.primaryKey.columns.push(column.columnName);

      // pick up index
      if (property.index || property.unique) {
        var index = null, sorting = property.desc ? 'DESC' : 'ASC';

        if (typeof(property.index) === 'string') {
          // with a specified index name
          index = table.indexes.find(i => i.name === property.index);
          if (!index) {
            // create one if not exists
            index = {
              name: property.index,
              unique: !!property.unique,
              columns: { }
            };
            index.columns[property.columnName] = sorting;
            table.indexes.push(index);
          } else {
            // add new column to index
            index.unique |= !!property.unique;
            index.columns[property.columnName] = sorting;
          }
        } else {
          // single column index
          var columns = { };
          columns[property.columnName] = sorting;
          table.indexes.push({
            name: util.format('IX_%s_%s', table.tableName, property.columnName),
            unique: !!property.unique,
            columns: columns
          });
        }
      }

      // pick up foreign key
      if (typeof(property.refer) === 'string') {
        var name = property.referName || util.format('FK_%s_%s', property.refer, table.tableName);
        if (name === true) name = util.format('FK_%s_%s_%s', property.refer, table.tableName, property.columnName);
        var foreignKey = table.foreignKeys.find(fk => fk.name === name);
        if (!foreignKey) {
          foreignKey = {
            name: name,
            columns: [property.columnName],
            refer: property.refer
          };
          table.foreignKeys.push(foreignKey);
        } else  {
          foreignKey.columns.push(property.columnName);
        }

        if (property.hasOwnProperty('onDelete')) {
          if (typeof(property.onDelete) !== 'string')
            throw new Error(util.format("%s.%s.onDelete must be a string", entityName, propertyName));

          foreignKey.onDelete = property.onDelete.toUpperCase();
        }
        if (property.hasOwnProperty('onUpdate')) {
          if (typeof(property.onUpdate) !== 'string')
            throw new Error(util.format("%s.%s.onUpdate must be a string", entityName, propertyName));

          foreignKey.onUpdate = property.onDelete.toUpperCase();
        }
      }

      // add to table
      table.columns[propertyName] = column;
    };

    if (table.primaryKey.columns.length === 0)
      throw new Error(util.format("%s has no primary key!", entityName));

    tables[entityName] = table;
  };
  return tables;
}

module.exports = purify;
