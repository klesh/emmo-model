var util = require('util');
var _ = require('lodash');
var dialectBase = require('../dialect/base.js');

/* 
 * definition = {
 *   modelName: {
 *     talbeName: modelNamePlural,
 *     columns: columnsDef
 *     primaryKeys: primaryKeysInfo,
 *     foreignKeys: [ foreignKeyInfo ]
 *     indexes: [ indexInfo ]
 *   },
 *   ...
 * }
 */
function SqlGenerator(dialect, definition) {
  _.extend(this, dialectBase, require('../dialect/' + dialect));
  this.definition = definition;
}

SqlGenerator.prototype.createDatabase = function() {
  var self = this;
  var script = [];
  _.forOwn(this.definition, function(modelDef, modelName) {
    script.push(self.createTable(modelDef.tableName, modelDef.columns));
    script.push(self.createPrimaryKeys(modelDef.tableName, modelDef.primaryKeys));
    script.push(self.createIndexes(modelDef.tableName, modelDef.indexes));
  });
  _.forOwn(this.definition, function(modelDef, modelName) {
    script.push(self.createForeignKeys(modelDef.tableName, modelDef.foreignKeys));
  });
  return script.join('\n');
};

SqlGenerator.prototype.createTable = function(tableName, columnsDef) {
  return util.format('CREATE TABLE %s (\n%s\n)', 
                     this.quote(tableName), 
                     this.columns(columnsDef)) + this.separator;
};

/* columnsDef = {
 *   col1Name: col1Def,
 *   col2Name: col2Def
 * }
 *
 * return: '
 *   columnName1 dbType NOT NULL,
 *   columnName2 dbType DEFAULT now()
 * '
 */
SqlGenerator.prototype.columns = function(columnsDef) {
  var self = this;
  var script = [];
  _.forOwn(columnsDef, function(columnDef, columnName) {
    script.push(util.format('  %s %s', self.quote(columnName), self.column(columnDef)));
  });

  return script.join(',\n');
};

/* columnDef = { 
 *   type: 'string|text|int|bigint|money|float|jsonb|bool', 
 *   length: int, 
 *   primaryKey: bool(false),
 *   autoIncrement: bool(false),
 *   allowNull: bool(true),
 *   defaultValue: string,
 *   refer: string(tableName),
 *   unique: bool string(indexName),
 *   index: bool string(indexName),
 *   descIndex: bool(false) 
 * }
 *
 * return: 'dbType NOT NULL DEFAULT now() AUTO_INCREMENT'
 */

SqlGenerator.prototype.column = function(columnDef) {
  var script = [];
  script.push(this.columnType(columnDef));
  
  if (columnDef.allowNull === false) 
    script.push('NOT NULL');

  if (columnDef.defaultValue !== undefined)
    script.push(util.format('DEFAULT %s', columnDef.defaultValue));

  if (columnDef.autoIncrement && this.autoIncrement)
    script.push(this.autoIncrement);

  return script.join(' ');
};

/*
 * primaryKeysInfo = {
 *   name: 'primaryKeysName',
 *   columns: ['columnName1', 'columnName2']
 * }
 *
 * return: 'ALTER TABLE "table1Name" ADD CONSTRAINT "primarykeyName" PRIMAKRY KEY ("column1Name");'
 */
SqlGenerator.prototype.createPrimaryKeys = function(tableName, primaryKeysInfo) {
  return util.format('ALTER TABLE %s ADD CONSTRAINT %s PRIMARY KEY (%s)',
                    this.quote(tableName),
                    this.quote(primaryKeysInfo.name),
                    this.joinColumns(primaryKeysInfo.columns)) + this.separator;
};

SqlGenerator.prototype.createIndexes = function(tableName, indexInfos) {
  var self = this;
  var script = _.map(indexInfos, function(indexInfo) { 
    return self.createIndex(tableName, indexInfo);
  });
  return script.join('\n');
};

/*
 * indexInfo = {
 *   name: indexName,
 *   columns: {column1Name: 'ASC', column2Name: 'DESC'},
 *   unique: false
 * }
 *
 * return: 'CREATE UNIQUE INDEX ON "table1Name" ("column1Name" ASC, "column2Name" DESC);'
 */
SqlGenerator.prototype.createIndex = function(tableName, indexInfo) {
  var script = ['CREATE'];
  if (indexInfo.unique)
    script.push('UNIQUE');
  script.push('INDEX');
  script.push(this.quote(indexInfo.name));
  script.push('ON');
  script.push(this.quote(tableName));
  script.push(util.format('(%s)', this.joinOrderedColumns(indexInfo.columns)));
  return script.join(' ') + this.separator;
};

SqlGenerator.prototype.createForeignKeys = function(tableName, foreignKeyInfos) {
  var self = this;
  var script = _.map(foreignKeyInfos, function(indexInfo) { 
    return self.createForeignKey(tableName, indexInfo);
  });
  return script.join('\n');
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
SqlGenerator.prototype.createForeignKey = function(tableName, foreignKeyInfo) {
  // ensure refer table
  if (!this.definition.hasOwnProperty(foreignKeyInfo.refer))
    throw new Error(util.format('Table %s refered by %s does not exists', 
                                foreignKeyInfo.refer, 
                                tableName));

  // check if keys are matched
  var referTableInfo = this.definition[foreignKeyInfo.refer];
  if (referTableInfo.primaryKeys.columns.length != foreignKeyInfo.columns.length)
    throw new Error(util.format('Table %s foreign key %s does not match %s primary key %s',
                               tableName,
                               foreignKeyInfo.columns.join(','),
                               foreignKeyInfo.refer,
                               referTableInfo.primaryKeys.columns.join(',')));

  var script = [util.format('ALTER TABLE %s ADD CONSTRAINT %s FOREIGN KEY (%s) REFERENCES %s (%s)',
                           this.quote(tableName),
                           this.quote(foreignKeyInfo.name),
                           this.joinColumns(foreignKeyInfo.columns),
                           this.quote(referTableInfo.tableName),
                           this.joinColumns(referTableInfo.primaryKeys.columns))];

  if (foreignKeyInfo.onDelete)
    script.push(util.format('ON DELETE %s', foreignKeyInfo.onDelete));

  if (foreignKeyInfo.onUpdate)
    script.push(util.format('ON UPDATE %s', foreignKeyInfo.onUpdate));

  return script.join(' ') + this.separator;
};

module.exports = SqlGenerator;
