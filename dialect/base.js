var util = require('util');
var _ = require('lodash');

// all comments asssume using pg dialect
module.exports = {
  // default database name, for creating/droping database
  defaultDatabase: '',
  // auto increment column statement;
  autoIncrement: '',
  // separator between sql statement;
  separator: ';', 
  // quote resource name,
  quote: function(name) {
    return name;
  },
  // quote and join column names separated by ,
  // ['col1', 'col2'] to  '"col1", "col2"'
  joinColumns: function(columnNames) {
    return columnNames.map(this.quote).join(', ');
  },
  /* quote and join column names with sorting order seperated by ,
   * (from) { col1: 'ASC', col2: 'DESC' }
   * ( to ) "col1" ASC, "col2" DESC
   */
  joinOrderedColumns: function(orderedColumns) {
    var self = this;
    var script = [];
    _.forOwn(orderedColumns, function(order, columnName) {
      script.push(self.quote(columnName) + ' ' + order);
    });
    return script.join(', ');
  },
  /* return type statement
   * (from) { type: 'int', autoIncrement: true } 
   * ( to ) serial
   */
  columnType: function(columnDef) {
    if (columnDef.type == 'string')
      return columnDef.length ?  util.format('varchar(%d)', columnDef.length) : 'text';

    return columnDef.type;
  },
  /* return columns statement
   * (from) { id: { type: 'int' }, name: { type: 'string', length: 50 } } 
   * ( to )   "id" int,\n  "name" varchar(50)
   */
  columns: function(columnsDef) {
    var self = this;
    var script = [];
    _.forOwn(columnsDef, function(columnDef, columnName) {
      script.push(util.format('  %s %s', self.quote(columnName), self.column(columnDef)));
    });
    return script.join(',\n');
  },
  /* return column definition statement
   * (from) {type: 'int', allowNull: false, defaultVaue: '0'}
   * ( to ) int NOT NULL DEFAULT 0
   */
  column: function(columnDef) {
    var script = [];
    script.push(this.columnType(columnDef));
    
    if (columnDef.allowNull === false) 
      script.push('NOT NULL');

    if (columnDef.defaultValue !== undefined)
      script.push(util.format('DEFAULT %s', columnDef.defaultValue));

    if (columnDef.autoIncrement && this.autoIncrement)
      script.push(this.autoIncrement);

    return script.join(' ');
  },
  createDatabase: function(database) {
    return util.format('CREATE DATABASE %s', this.quote(database)) + this.separator;
  },
  dropDatabase: function(database) {
    var quotedName = this.quote(database);
    return util.format('SELECT pg_terminate_backend(pg_stat_activity.pid) FROM pg_stat_activity WHERE pg_stat_activity.datname = %s AND pid <> pg_backend_pid();\nDROP DATABASE %s', quotedName, quotedName);
  },
  /*  modelDef = {
   *    tableName: 'tableName',
   *    columns: {
   *      id: { type: 'int', ... }
   *      ,,,
   *    }
   *    primaryKeys: {...}
   *    indexes: []
   *    foreignKeys: []
   *  }
   */
  createModel: function(modelDef) {
    var script = [];
    script.push(this.createTable(modelDef.tableName, modelDef.columns));
    script.push(this.createPrimaryKeys(modelDef.tableName, modelDef.primaryKeys));
    _.forEach(modelDef.indexes, function(indexInfo) {
      script.push(this.createIndex(modelDef.tableName, indexInfo));
    }, this);
    return script.join('\n');
  },
  /* return create table statement 
   * (from) tableName: 'Users', 
   *        tableDef: { 
   *          name: {type: 'string', length: 50, primaryKey: true, allowNull: false}, 
   *          password: {type: 'string', length: 40}
   *        }
   * ( to ) CREATE TABLE "Users" (
   *          name varchar(50) NOT NULL,
   *          password varchar(40)
   *        );
   */
  createTable: function(tableName, tableDef) {
    return util.format('CREATE TABLE %s (\n%s\n)', 
                       this.quote(tableName), 
                       this.columns(tableDef)) + this.separator;
  },
  /* return rename table statement
   */
  renameTable: function(oldName, newName) {
    return util.format('ALTER TABLE %s RENAME TO %s', 
                      this.quote(oldName),
                      this.quote(newName)) + this.separator;
  },
  dropTable: function(tableName) {
    return util.format('DROP TABLE %s', 
                      this.quote(tableName)) + this.separator;
  },
  addColumn: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s ADD COLUMN %s %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      this.column(columnDef)) + this.separator;
  },
  renameColumn: function(tableName, oldName, newName) {
    return util.format('ALTER TABLE %s RENAME COLUMN %s TO %s',
                      this.quote(tableName),
                      this.quote(oldName),
                      this.quote(newName)) + this.separator;
  },
  dropColumn: function(tableName, columnName) {
    return util.format('ALTER TABLE %s DROP COLUMN %s',
                      this.quote(tableName),
                      this.quote(columnName)) + this.separator;
  },
  changeColumnType: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s ALTER COLUMN %s TYPE %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      this.columnType(columnDef)) + this.separator;
  },
  changeColumnDefault: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s ALTER COLUMN %s %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      columnDef.defaultValue === null || columnDef.defaultValue === undefined ? 'DROP DEFAULT' : 'SET DEFAULT ' + columnDef.defaultValue);
  },
  createPrimaryKeys: function(tableName, primaryKeysInfo) {
    return util.format('ALTER TABLE %s ADD CONSTRAINT %s PRIMARY KEY (%s)',
                      this.quote(tableName),
                      this.quote(primaryKeysInfo.name),
                      this.joinColumns(primaryKeysInfo.columns)) + this.separator;
  },
  createIndex: function(tableName, indexInfo) {
    var script = ['CREATE'];
    if (indexInfo.unique)
      script.push('UNIQUE');
    script.push('INDEX');
    script.push(this.quote(indexInfo.name));
    script.push('ON');
    script.push(this.quote(tableName));
    script.push(util.format('(%s)', this.joinOrderedColumns(indexInfo.columns)));
    return script.join(' ') + this.separator;
  },
  renameIndex: function(oldName, newName) {
    return util.format('ALTER INDEX %s RENAME To %s',
                      this.quote(oldName),
                      this.quote(newName)) + this.separator;
  },
  dropIndex: function(tableName, name) {
    return util.format('DROP INDEX %s',
                      this.quote(name)) + this.separator;
  },
  createForeignKey: function(tableName, referTableInfo, foreignKeyInfo) {
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
  },
  renameConstraint: function(tableName, oldName, newName) {
   return util.format('ALTER TABLE %s RENAME CONSTRAINT %s TO %s',
                      this.quote(tableName),
                      this.quote(oldName),
                      this.quote(newName)) + this.separator;
  },
  dropConstraint: function(tableName, name) {
    return util.format('ALTER TABLE %s DROP CONSTRAINT %s',
                      this.quote(tableName),
                      this.quote(name)) + this.separator;
  }
};
