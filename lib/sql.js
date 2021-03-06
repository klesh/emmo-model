var util = require('util');
const {union, intersection, isEmpty, findKey, omit, clone, each, deepEqual} = require('./functions.js');

module.exports = {
  // generate initial create sql script
  initialScript: function(dialect, definition) {
    var agent = require('../dialect/' + dialect + '.js');
    var script = [];
    for (const modelName in definition) {
      script.push(agent.createModel(definition[modelName]));
    }
    for (const modelName in definition) {
      const modelDef = definition[modelName];
      for (const foreignKeyInfo of modelDef.foreignKeys) {
        var referTable = getReferTable(definition, modelDef.tableName, foreignKeyInfo);
        script.push(agent.createForeignKey(modelDef.tableName, referTable, foreignKeyInfo));
      }
    }
    return script.join('\n');
  },
  // generate migration sql script between two definition.
  migrateScript: function(dialect, oldDef, newDef) {
    var agent = require('../dialect/' + dialect + '.js');
    var script = [], deferedScript = [];

    var deleted = {};

    var findOldModel = function(name, def) { return findModel(oldDef, name, def); };
    var findNewModel = function(name, def) { return findModel(newDef, name, def); };
    var tryFindDeletedModel = function(modelDef) {
      if (isEmpty(deleted)) return;
      var similarTableName = findKey(deleted, function(def) { return keysDiffIndex(def.columns, modelDef.columns) < 0.2; });
      if (similarTableName) {
        var found = { name: similarTableName, definition: deleted[similarTableName] };
        delete deleted[similarTableName];
        return found;
      }
    };

    // compare model definition
    var compareModel = function(oldModelDef, newModelDef) {
      if (oldModelDef.tableName !== newModelDef.tableName)
        script.push(agent.renameTable(oldModelDef.tableName, newModelDef.tableName));

      var tableName = newModelDef.tableName;
      var deletedColumns = {}, oldNewCols = {};
      for (const columnName in oldModelDef.columns) {
        const columnDef = oldModelDef.columns[columnName];
        if (!newModelDef.columns.hasOwnProperty(columnName))
          deletedColumns[columnName] = columnDef;
      }

      // compare primary key
      if (isEqual(oldModelDef.primaryKey, newModelDef.primaryKey)) {
        if (!oldModelDef.primaryKey && newModelDef.primaryKey)
          deferedScript.push(agent.createPrimaryKey(tableName, newModelDef.primaryKey));
        else if (oldModelDef.primaryKey && !newModelDef.primaryKey)
          script.push(agent.dropPrimaryKey(tableName, oldModelDef.primaryKey));
        else if (!isColumnsEqual(oldModelDef.primaryKey.columns, newModelDef.primaryKey.columns)) {
          script.push(agent.dropPrimaryKey(tableName, oldModelDef.primaryKey));
          deferedScript.push(agent.createPrimaryKey(tableName, newModelDef.primaryKey, newModelDef));
        }
        /*
        else if (oldModelDef.primaryKey.name != newModelDef.primaryKey.name)
          script.push(agent.renameConstraint(tableName, oldModelDef.primaryKey.name, newModelDef.primaryKey.name));
          */
      }

      for (const columnName in newModelDef.columns) {
        const columnDef = newModelDef.columns[columnName];
        var oldColumnDef = oldModelDef.columns[columnName];
        if (oldColumnDef) {
          if (!isEqual(oldColumnDef, columnDef)) {
            if (oldColumnDef.columnName != columnDef.columnName)
              script.push(agent.renameColumn(tableName, oldColumnDef.columnName, columnDef.columnName, columnDef));
            var oldType = agent.columnType(oldColumnDef);
            var newType = agent.columnType(columnDef);
            if (oldType != newType)
              script.push(agent.changeColumnType(tableName, columnDef.columnName, columnDef));
            if (oldColumnDef.defaultValue != columnDef.defaultValue)
              script.push(agent.changeColumnDefaultValue(tableName, columnDef.columnName, columnDef));
            if (oldColumnDef.allowNull != columnDef.allowNull)
              script.push(agent.changeAllowNull(tableName, columnDef.columnName, columnDef));
          }
        } else {
          var similarColName = findKey(deletedColumns, omit(columnDef, ['columnName']));
          if (similarColName) {
            var similarCol = deletedColumns[similarColName];
            script.push(agent.renameColumn(tableName, similarCol.columnName, columnDef.columnName, columnDef));
            oldNewCols[similarColName] = columnName;
            delete deletedColumns[similarColName];
          } else {
            script.push(agent.addColumn(tableName, columnName, columnDef));
          }
        }
      };

      function isColumnsEqual(oldColumns, newColumns) {
        oldColumns = clone(oldColumns);
        var isArray = Array.isArray(oldColumns);
        each(oldColumns, function(value, key) {
          var oldColName = isArray ? value : key;
          var newColName = oldNewCols[oldColName];
          if (newColName) {
            if (isArray) {
              oldColumns[key] = newColName;
            } else {
              oldColumns[newColName] = value;
              delete oldColumns[oldColName];
            }
          }
        });
        return deepEqual(oldColumns, newColumns);
      }

      // compare indexes
      var found = [];
      each(oldModelDef.indexes, function(oldIndexInfo) {
        var newIndexInfo = newModelDef.indexes.find(function(idx) {
          return idx.unique == oldIndexInfo.unique && isColumnsEqual(oldIndexInfo.columns, idx.columns);
        });
        if (newIndexInfo) {
          if (newIndexInfo.name != oldIndexInfo.name)
            script.push(agent.renameIndex(oldIndexInfo.name, newIndexInfo.name, tableName));
          found.push(newIndexInfo.name);
        } else {
          script.push(agent.dropIndex(tableName, oldIndexInfo.name));
        }
      });
      each(newModelDef.indexes, function(newIndexInfo) {
        if (found.indexOf(newIndexInfo.name) < 0)
          deferedScript.push(agent.createIndex(tableName, newIndexInfo));
      });

      // compare foreign keys
      found = [];
      each(oldModelDef.foreignKeys, function(oldForeignKeyInfo) {
        var newForeignKeyInfo = newModelDef.foreignKeys.find(function(fk) {
          return oldForeignKeyInfo.refer == fk.refer &&
            oldForeignKeyInfo.onDelete == fk.onDelete &&
            oldForeignKeyInfo.onUpdate == fk.onUpdate &&
            isColumnsEqual(oldForeignKeyInfo.columns, fk.columns);
        });
        if (newForeignKeyInfo) {
          if (newForeignKeyInfo.name != oldForeignKeyInfo.name)
            script.push(agent.renameConstraint(tableName, oldForeignKeyInfo.name, newForeignKeyInfo.name));
          found.push(newForeignKeyInfo.name);
        } else {
          script.push(agent.dropConstraint(tableName, oldForeignKeyInfo.name));
        }
      });
      each(newModelDef.foreignKeys, function(newForeignKeyInfo) {
        if (found.indexOf(newForeignKeyInfo.name) < 0)
          deferedScript.push(agent.createForeignKey(tableName,
                                                    getReferTable(newDef, tableName, newForeignKeyInfo),
                                                    newForeignKeyInfo));
      });

      each(deletedColumns, function(def, name) {
        deferedScript.push(agent.dropColumn(tableName, def.columnName));
      });
    };

    // find out deleted model
    each(oldDef, function(oldModelDef, oldModelName) {
       if (!findNewModel(oldModelName, oldModelDef))
         deleted[oldModelName] = oldModelDef;
    });

    // find out renamed model/table and created model
   each(newDef, function(newModelDef, newModelName) {
      var oldEntry = findOldModel(newModelName, newModelDef);
      if (oldEntry) {
        compareModel(oldEntry.definition, newModelDef);
      } else {
        var similar = tryFindDeletedModel(newModelDef); // try find out renamed model.
        if (similar) {
          if (similar.definition.tableName != newModelDef.tableName) {
            script.push(agent.renameTable(similar.definition.tableName, newModelDef.tableName));
            each(oldDef, function(omd) { // rename refered name as well
              each(omd.foreignKeys, function(fkInfo) {
                if (fkInfo.refer == similar.name)
                  fkInfo.refer = newModelName;
              });
            });
          }
          compareModel(similar.definition, newModelDef); // find match, run comparing.
        } else {
          script.push(agent.createModel(newModelDef)); // or create new
          each(newModelDef.foreignKeys, function(foreignKeyInfo) {
            deferedScript.push(agent.createForeignKey(newModelDef.tableName,
                                                     getReferTable(newDef, newModelDef.tableName, foreignKeyInfo),
                                                     foreignKeyInfo));
          });
        }
      }
    });

    // delete
    each(deleted, function(oldDef, oldName) {
//      each(modelDef.foreignKeys, function(foreignKeyInfo) {
//        script.push(agent.dropConstraint(foreignKeyInfo.name));
//      });
      script.push(agent.dropTable(oldDef.tableName));
    });

    return [
      script.join('\n'),
      '/***** PLACE YOUR CUSTOMIZE SCRIPT HERE *****/',
      '',
      '/******** END YOUR CUSTOMIZE SCRIPT *********/',
      deferedScript.join('\n')
    ].join('\n');
  }
};

// return entry as { name: modelName, definition: modelDefiniton }
function findModel(definition, name, def) {
  var found;
  each(definition, function(modelDef, modelName) {
    if (modelName == name || modelDef.tableName == def.tableName) {
      found = { name: modelName, definition: modelDef };
      return false;
    }
  });
  return found;
}

/*
 * foreignKeyInfo = {
 *   name: 'foreignKeyName',
 *   columns: ['columnName1', 'columnName2'],
 *   refer: 'foreignTableName',
 *   onDelete: 'CASCADE|SET NULL',
 *   onUpload: 'CASCADE|SET NULL'
 * }
 */
function getReferTable(definition, tableName, foreignKeyInfo) {
  // ensure refer table
  if (!definition.hasOwnProperty(foreignKeyInfo.refer))
    throw new Error(util.format('Table %s refered by %s does not exists',
                                foreignKeyInfo.refer,
                                tableName));

  // check if keys are matched
  var referTableInfo = definition[foreignKeyInfo.refer];
  if (referTableInfo.primaryKey.columns.length != foreignKeyInfo.columns.length)
    throw new Error(util.format('Table %s foreign key %s does not match %s primary key %s',
                               tableName,
                               foreignKeyInfo.columns.join(','),
                               foreignKeyInfo.refer,
                               referTableInfo.primaryKey.columns.join(',')));
  return referTableInfo;
}

// calculate keys difference index. 0.00~1.00
function keysDiffIndex(obj1, obj2) {
  var keys1 = Object.keys(obj1);
  var keys2 = Object.keys(obj2);
  const i = intersection(keys1, keys2);
  var total = Math.max(keys1.length, keys2.length);
  return Number(i.length) / Number(total);
}

