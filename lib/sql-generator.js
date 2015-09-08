var util = require('util');
var _ = require('lodash');


module.exports = {
  // generate initial create sql script
  initialScript: function(dialect, definition) {
    var agent = require('../dialect/' + dialect + '.js');
    var script = [];
    _.forOwn(definition, function(modelDef, modelName) {
      script.push(agent.createTable(modelDef.tableName, modelDef.columns));
      script.push(agent.createPrimaryKeys(modelDef.tableName, modelDef.primaryKeys));
      _.forEach(modelDef.indexes, function(indexInfo) {
        script.push(agent.createIndex(modelDef.tableName, indexInfo));
      });
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
    var tableDiff = diff(oldDef, newDef, function(tOldName, tOldDef, tNewName, tNewDef) {
      return keysDiffIndex(tOldDef, tNewDef) < 0.2; // differences less than 20%
    });

    if (!tableDiff)
      return '';

    var script = [];

    if (tableDiff.created) {
      _.forOwn(tableDiff.created, function(tableDef, tableName) {
        script.push(agent.createTable(tableName, tableDef));
      });
    }

    if (tableDiff.renamed) {
      _.forOwn(tableDiff.renamed, function(newName, oldName) {
        script.push(agent.renameTable(oldName, newName));
      });
    }

    if (tableDiff.changed) {
      _.forEach(agent.changed, function(change) {
        
      });
    }

    if (tableDiff.deleted) {
      _.forOwn(tableDiff.deleted, function(tableDef, tableName) {
        script.push(agent.dropTable(tableName));
      });
    }

    return script.join('\n');
  }
};

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
  return difference.length / total;
}

