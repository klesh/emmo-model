var util = require('util');
var _ = require('lodash');


module.exports = {
  // create table whit primary key and indexes;
  createTable: function(agent, modelDef, modelName) {
  
  },

  // generate initial create sql script
  initialScript: function(dialect, definition) {
    var agent = require('../dialect/' + dialect + '.js');
    var script = [];
    _.forOwn(definition, function(modelDef, modelName) {
      script.push(agent.createModel(modelDef));
    });
    _.forOwn(definition, function(modelDef, modelName) {
      _.forEach(modelDef.foreignKeys, function(foreignKeyInfo) {
        var referTable = getReferTable(definition, modelDef.tableName, foreignKeyInfo);
        script.push(agent.createForeignKey(modelDef.tableName, referTable, foreignKeyInfo));
      });
    });
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
      if (_.isEmpty(deleted)) return;
      var similarTableName = _.findKey(deleted, function(def) { return keysDiffIndex(def.columns, modelDef.columns) < 0.2; });
      if (similarTableName) {
        var found = { name: similarTableName, definition: deleted[similarTableName] };
        delete deleted[similarTableName];
        return found;
      }
    };

    // compare model definition
    var compareModel = function(oldModelDef, newModelDef) {
      var tableName = newModelDef.options.tableName;
      var deletedColumns = {};
      _.forOwn(oldModelDef.columns, function(columnDef, columnName) {
        if (!newModelDef.columns.hasOwnProperty(columnName))
          deletedColumns[columnName] = columnDef;
      });
      _.forOwn(newModelDef.columns, function(columnDef, columnName) {
        var oldColumnDef = oldModelDef.columns[columnName];
        if (oldColumnDef) {
          if (!_.isEqual(oldColumnDef, columnDef)) {
            var oldType = agent.columnType(oldColumnDef);
            var newType = agent.columnType(columnDef);
            if (oldType != newType)
              script.push(agent.changeColumnType(tableName, columnName, columnDef));
            if (oldColumnDef.defaultValue != columnDef.defaultValue)
              script.push(agent.changeColumnDefaultValue(tableName, columnName, columnDef));
          }
        } else {
          var similarColName = _.findKey(deletedColumns, columnDef);
          if (similarColName) {
            script.push(agent.renameColumn(tableName, similarColName, columnName));
            delete deletedColumns[similarColName];
          }
          else
            script.push(agent.addColumn(tableName, columnName, columnDef));
        }
      });
      if (!_.isEqual(oldModelDef.primaryKeys, newModelDef.primaryKeys)) {
        if (!oldModelDef.primaryKeys && newModelDef.primaryKeys)
          deferedScript.push(agent.createPrimaryKeys(tableName, newModelDef.primaryKeys));
        else if (oldModelDef.primaryKeys && !newModelDef.primaryKeys)
          script.push(agent.dropConstraint(tableName, oldModelDef.primaryKeys.name));
        else if (oldModelDef.primaryKeys.name != newModelDef.primaryKeys.name)
          script.push(agent.renameConstraint(tableName, oldModelDef.primaryKeys.name, newModelDef.primaryKeys.name));
        else if (!_.isEqual(oldModelDef.primaryKeys.columns, newModelDef.columns)) {
          script.push(agent.dropConstraint(tableName, oldModelDef.primaryKeys.name));
          deferedScript.push(agent.createPrimaryKeys(tableName, newModelDef.primaryKeys));
        }
      }
      _.forOwn(deletedColumns, function(def, name) {
        deferedScript.push(agent.dropColumn(tableName, name));
      });
    };

    // find out deleted model
    _.forOwn(oldDef, function(oldModelDef, oldModelName) {
       if (!findNewModel(oldModelName, oldModelDef))
         deleted[oldModelName] = oldModelDef;
    });

    // find out renamed model/table and created model
    _.forOwn(newDef, function(newModelDef, newModelName) {
      var oldEntry = findOldModel(newModelName, newModelDef);
      if (oldEntry) {
        compareModel(oldEntry.definition, newModelDef);
      } else {
        var similar = tryFindDeletedModel(newModelDef); // try find out renamed model.
        if (similar) {
          if (similar.definition.options.tableName != newModelDef.options.tableName)
          script.push(agent.renameTable(similar.definition.options.tableName, newModelDef.options.tableName));
          compareModel(similar.definition, newModelDef); // find match, run comparing.
        } else {
          script.push(agent.createModel(newModelDef)); // or create new
        }
      }
    });

    // delete
    _.forEach(deleted, function(oldDef, oldName) {
//      _.forEach(modelDef.foreignKeys, function(foreignKeyInfo) {
//        script.push(agent.dropConstraint(foreignKeyInfo.name));
//      });
      script.push(agent.dropTable(oldDef.options.tableName));
    });

    return [
      script.join('\n'),
      '/***** PLACE YOUR CUSTOMIZE SCRIPT HER *****/',
      '',
      '/******** END YOUR CUSTOMIZE SCRIPT ********/',
      deferedScript.join('\n')
    ].join('\n');
  }
};

// return entry as { name: modelName, definition: modelDefiniton }
function findModel(definition, name, def) {
  var found;
  _.forOwn(definition, function(modelDef, modelName) {
    if (modelName == name || modelDef.options.tableName == def.options.tableName) {
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
  if (referTableInfo.primaryKeys.columns.length != foreignKeyInfo.columns.length)
    throw new Error(util.format('Table %s foreign key %s does not match %s primary key %s',
                               tableName,
                               foreignKeyInfo.columns.join(','),
                               foreignKeyInfo.refer,
                               referTableInfo.primaryKeys.columns.join(',')));
  return referTableInfo;
}

/* compare to definition.
 */
function diff(oldDef, newDef, isRename) {
  var result = {
    created: {},
    deleted: {},
    renamed: {},
    changed: []
  };

  // find out deleted
  _.forOwn(oldDef, function(def, name) {
    if (!newDef.hasOwnProperty(name))
      result.deleted[name] = def;
  });

  if (_.isEmpty(result.deleted))
    delete result.deleted;

  // find out created / update
  _.forOwn(newDef, function(def, name) {
    if (!oldDef.hasOwnProperty(name)) {
      var isRenamed = false;
      if (result.deleted) { // might be rename situation.
        _.forOwn(result.deleted, function(subOldDef, subOldName) {
          if (isRename(subOldName, subOldDef, name, def)) {
            isRenamed = true;
            result.renamed[subOldName] = name;
            delete result.deleted[subOldName];
            if (!_.isEqual(subOldDef, def))
              result.changed.push({name: name, oldDef: subOldDef, newDef: def});
            return false;
          }
        });
      }
      if (!isRenamed)
        result.created[name] = def;
    } else {
      if (!_.isEqual(oldDef[name], def))
        result.changed.push({name: name, oldDef: oldDef[name], newDef: def});
    }
  });

  if (_.isEmpty(result.created))
    delete result.created;

  if (_.isEmpty(result.renamed))
    delete result.renamed;

  if (_.isEmpty(result.changed))
    delete result.changed;

  if (_.isEmpty(result)) // nothing changed
    return null;

  return result;
}

// calculate keys difference index. 0.00~1.00
function keysDiffIndex(obj1, obj2) {
  var keys1 = _.keys(obj1);
  var keys2 = _.keys(obj2);
  var total = Math.max(keys1.length, keys2.length);
  var difference = _.difference(keys1, keys2);
  var index = Number(difference.length) / Number(total);
  return index;
}

