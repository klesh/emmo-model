"use strict";
/* jshint node: true */

var util = require('util');
var _ = require('lodash');
var moment = require('moment');

/**
 * This provoides common methods used for dialect implementation,
 *
 * @mixin
 */
var DialectAgent = {
  /**
   * must be assigned in dialect implemtation, like 'postgres' for postgres, 'master' for MSSQL
   * @type {string}
   */
  defaultDatabase: '',

  /**
   * either assign a proper value for this field or implement `column` method
   * @type {string}
   */
  autoIncrement: 'AUTO_INCREMENT',

  /**
   * indicate auto increment must be with primary key definition.
   */
  autoPrimarykey: false,

  /**
   * in case of some weird database have different one
   * @type {string}
   */
  separator: ';',

  /**
   * return parameter placeholder mark for SQL statement base on index
   *
   * @param {number} index   parameter position, 0 base
   * @return {string}
   */
  placehold: function(index) {
    return '?';
  },

  /**
   * Wrap Standard INSERT statement for dialect, like RETURNING id for postgres
   */
  wrapInsertSql: function(sql, builder) {
    return sql;
  },

  /**
   * Some database may need to run another query to get the last inserted id on same connection.
   */
  getInsertId: function(insertResult, connection) {
    throw new Error('getInsertId need to be implemented in dialect');
  },

  /**
   * Transform SQL statement to a OFFSET/SKIP manner
   *
   * @param {string} sql
   * @param {string} placehold
   * @returns {string}
   */
  offset: function(sql, placehold) {
    return sql + ' OFFSET ' + placehold;
  },

  /**
   * Transform SQL statement to a LIMIT/TOP manner
   *
   * @param {string} sql
   * @param {string} placehold
   * @returns {string}
   */
  limit: function(sql, placehold) {
    return sql + ' LIMIT ' + placehold;
  },

  /**
   * should be implemented in dialect implementation.
   *
   * @param {any}    dialectResult   returned by dialect query method
   * @returns {Result}
   */
  result: function(dialectResult) {
    return dialectResult;
  },

  /**
   * quote a database object, like table, column
   *
   * @param {string} name
   * @returns {string}
   */
  quote: function(name) {
    return name;
  },

  /**
   * quote a plain text
   *
   * @param {string} text
   * @returns {string}
  quoteString: function(text) {
    if (text === null || text === undefined) return 'NULL';
    if (text === '') return '';
    return util.format("'%s'", text.replace(/'/g, "''"));
  },
   */

  /**
   * convert date string to moment
   *
   * @param {string}    text        which returned by database
   * @param {Property}  proeprty    property definition
   */
  convertDate: function(text, property) {
    return text ? moment(text) : null;
  },

  /**
   * quote and join column names, like ['col1', 'col2'] to  "col1", "col2"
   *
   * @param {string[]} columNames
   * @returns {string}
   */
  joinColumns: function(columnNames) {
    return columnNames.map(this.quote).join(', ');
  },

  /**
   * quote and join column names with sorting order seperated by ,
   * (from) { col1: 'ASC', col2: 'DESC' }
   * ( to ) "col1" ASC, "col2" DESC
   *
   * @param {{column: string, order: string}} orderedColumns
   * @returns {string}
   */
  joinOrderedColumns: function(orderedColumns) {
    var self = this;
    var script = [];
    _.forOwn(orderedColumns, function(order, columnName) {
      script.push(self.quote(columnName) + ' ' + order);
    });
    return script.join(', ');
  },

  /**
   * return sql type statement
   * (from) { type: 'int', autoIncrement: true }
   * ( to ) serial
   *
   * @param {Column} columnDef
   * @returns {string}
   */
  columnType: function(columnDef) {
    switch (columnDef.type) {
      case 'string':
        return columnDef.length ?  util.format('varchar(%d)', columnDef.length) : 'text';
      case 'decimal':
      case 'real':
      case 'double':
      case 'float':
      case 'numeric':
        if (columnDef.length === null)
          return columnDef.type;

        var length = columnDef.length || 10;
        var decimals = columnDef.decimals >= 0 ? columnDef.decimals : 2;
        return columnDef.type + '(' + length + ',' + decimals + ')';
      default:
        return columnDef.type;
    }
  },

  /* return sql columns statement
   * (from) { id: { type: 'int' }, name: { type: 'string', length: 50 } }
   * ( to )   "id" int,\n  "name" varchar(50)
   *
   * @param {Column[]} columnDef
   * @return {string}
   */
  columns: function(columnsDef) {
    var self = this;
    var script = [];
    _.forOwn(columnsDef, function(columnDef, columnName) {
      script.push(util.format('  %s %s', self.quote(columnDef.columnName), self.column(columnDef)));
    });
    return script.join(',\n');
  },

  /* return column definition statement
   * (from) {type: 'int', allowNull: false, defaultVaue: '0'}
   * ( to ) int NOT NULL DEFAULT 0
   *
   * @param {Column} columnDef
   * @returns {string}
   */
  column: function(columnDef) {
    var script = [];
    script.push(this.columnType(columnDef));

    if (columnDef.allowNull === false)
      script.push('NOT NULL');

    if (columnDef.defaultValue !== undefined)
      script.push(util.format('DEFAULT %s', columnDef.defaultValue));

    if (columnDef.autoIncrement && this.autoIncrement) {
      script.push(this.autoIncrement);

      if (this.autoPrimaryKey)
        script.push(this.autoPrimaryKey);
    }

    return script.join(' ');
  },
  createDatabase: function(database) {
    return util.format('CREATE DATABASE %s', this.quote(database)) + this.separator;
  },
  dropDatabase: function(database) {
    return util.format('DROP DATABASE IF EXISTS %s', this.quote(database)) + this.separator;
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
    script.push(this.createTable(modelDef.tableName, modelDef.columns, modelDef));
    script.push(this.createPrimaryKey(modelDef.tableName, modelDef.primaryKey, modelDef));

    _.forEach(modelDef.indexes, function(indexInfo) {
      script.push(this.createIndex(modelDef.tableName, indexInfo, modelDef));
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
  changeColumnDefaultValue: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s ALTER COLUMN %s %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      columnDef.defaultValue === null || columnDef.defaultValue === undefined ? 'DROP DEFAULT' : 'SET DEFAULT ' + columnDef.defaultValue) + this.separator;
  },
  changeAllowNull: function(tableName, columnName, columnDef) {
    return util.format('ALTER TABLE %s ALTER COLUMN %s',
                      this.quote(tableName),
                      this.quote(columnName),
                      columnDef.allowNull === false ? 'SET NOT NULL' : 'DROP NOT NULL') + this.separator;
  },
  createPrimaryKey: function(tableName, primaryKeysInfo) {
    return util.format('ALTER TABLE %s ADD CONSTRAINT %s PRIMARY KEY (%s)',
                      this.quote(tableName),
                      this.quote(primaryKeysInfo.name),
                      this.joinColumns(primaryKeysInfo.columns)) + this.separator;
  },
  dropPrimaryKey: function(tableName, primaryKeysInfo) {
    return this.dropConstraint(tableName, primaryKeysInfo.name);
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
                             this.joinColumns(referTableInfo.primaryKey.columns))];

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
  },
  // all functions will be attached to EmmolaModel instance.
  functions: {
    /**
     * refer to a table/column/alias
     *
     * @param {string} resource
     */
    o: function(resource) {
      return function(builder) {
        return builder.quote(resource);
      };
    },
    /**
     * sql count function
     *
     * @param {string|number}  [column]
     * @param {boolean}        [distinct]
     * @returns {string}
     */
    count: function(column, distinct) {

      var tmp = column * 1;
      if (!isNaN(tmp)) // column is a number
        return util.format('COUNT(%d)', tmp);

      if (column) {
        return function(builder) {
          return util.format(distinct ? 'COUNT(DISTINCT %s)' : 'COUNT(%s)', builder.quote(column));
        };
      }

      return 'COUNT(*)';
    },

    /**
     * sql distinct function
     *
     * @param {string} column
     * @returns {string}
     */
    distinct: function(columns) {
      if (!_.isArray(columns))
        columns = [columns];
      return function(builder) {
        return 'DISTINCT ' + columns.map(c => builder.quote(c));
      };
    },

    /**
     * sql avg function
     *
     * @param {string} column
     * @returns {string}
     */
    avg: function(column) {
      return function(builder) {
        return 'AVG(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql first function
     *
     * @param {string} column
     * @returns {string}
     */
    first: function(column) {
      return function(builder) {
        return 'FIRST(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql last function
     *
     * @param {string} column
     * @returns {string}
     */
    last: function(column) {
      return function(builder) {
        return 'LAST(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql max function
     *
     * @param {string} column
     * @returns {string}
     */
    max: function(column) {
      return function(builder) {
        return 'MAX(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql min function
     *
     * @param {string} column
     * @returns {string}
     */
    min: function(column) {
      return function(builder) {
        return 'MIN(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql sum function
     *
     * @param {string} column
     * @returns {string}
     */
    sum: function(column) {
      return function(builder) {
        return 'SUM(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql ucase function
     *
     * @param {string} column
     * @returns {string}
     */
    ucase: function(column) {
      return function(builder) {
        return 'UCASE(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql lcase function
     *
     * @param {string} column
     * @returns {string}
     */
    lcase: function(column) {
      return function(builder) {
        return 'LCASE(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql mid function
     *
     * @param {string} column
     * @param {number} start
     * @param {number} [length]
     * @returns {string}
     */
    mid: function(column, start, length) {
      return function(builder) {
        return util.format(length ? "MID(%s, %d, %d)" : "MID(%s, %d)", builder.quote(column), start, length);
      };
    },

    /**
     * sql len function
     *
     * @param {string} column
     * @returns {string}
     */
    len: function(column) {
      return function(builder) {
        return 'LEN(' + builder.quote(column) + ')';
      };
    },

    /**
     * sql round function
     * @param {string} column
     * @param {number} precision
     * @returns {string}
     */
    round: function(column, precision) {
      return function(builder) {
        return 'ROUND(' + builder.quote(column) + ', ' + precision + ')';
      };
    },

    /**
     * sql now function
     * @returns {string}
     */
    now: function() {
      return function(builder) {
        return 'NOW()';
      }
    },

    /**
     * sql format function
     *
     * @param {string} resouce
     * @param {string} format
     * @returns {string}
     */
    format: function(resource, format) {
      return function(builder) {
        return 'FORMAT(' + builder.quote(resource) + ',' + builder.value(format) + ')';
      };
    },

     /**
     * COALESCE function
     */
    coalesce: function() {
      var args = _.toArray(arguments);
      if (args.length < 2)
        throw new Error('colalesce requires at least tow arguments');
      return function(builder) {
        return 'COALESCE(' + args.map(a => builder.field(a)).join(', ') + ')';
      }
    },

    fallback: function(column, defaultValue) {
      return function(builder) {
        return 'COALESCE(' + builder.field(column) + ', ' + builder.value(defaultValue) + ')';
      }
    }
  },

  comparators: {

    // here are some operator, use this.functions.FUNCNAME if you need to reuse other functions.

    /**
     * @param {string} str  text to search
     * @param {string} pos  'start', 'end', 'any'(default)
     * @returns {function}
     */
    like: function like(str, type) {
      return function(builder) {
        var esc = '';
        if (str.indexOf('%') >= 0) {
          esc = " ESCAPE '\\'";
          str = str.replace(/%/g, '\\%');
        }
        if (type === 'start')
          str += '%';
        else if (type == 'end')
          str = '%' + str;
        else
          str = '%' + str + '%';
        return ' LIKE ' + builder.value(str) + esc;
      };
    },

    /**
     * @param {string} str
     * @returns {function}
     */
    startsWith: function(str) {
      return this.like(str, 'start');
    },

    /**
     * @param {string} str
     * @returns {function}
     */
    endsWith: function(str) {
      return this.like(str, 'end');
    },

    /**
     * @param {array} array
     * @returns {function}
     */
    in: function(array) {
      array = arguments.length > 1 ? _.toArray(arguments) : array;
      return function(builder) {
        var sql = ' IN (';
        for (var i = 0, j = array.length; i < j; i++) {
          if (i > 0) sql += ',';
          sql += builder.value(array[i]);
        }
        return sql + ')';
      };
    },

    /**
     * @param {null|Expression} value
     * @returns {function}
     */
    not: function(value) {
      return function(builder) {
        if (value === null || value === undefined)
          return ' IS NOT NULL';
        var sql = ' NOT';
        // NOT operator is special!
        return sql + builder.element(value);
      };
    },

    /**
     * @param {any} value
     * @returns {function}
     */
    neq: function(value) {
      return function(builder) {
        return '<>' + builder.element(value);
      };
    },
    /**
     * @param {any} value
     * @returns {function}
     */
    gt: function(value) {
      return function(builder) {
        return '>' + builder.element(value);
      };
    },

    /**
     * @param {any} value
     * @returns {function}
     */
    lt: function(value) {
      return function(builder) {
        return '<' + builder.element(value);
      };
    },

    /**
     * @param {any} value
     * @returns {function}
     */
    gte: function(value) {
      return function(builder) {
        return '>=' + builder.element(value);
      };
    },

    /**
     * @param {any} value
     * @returns {function}
     */
    lte: function(value) {
      return function(builder) {
        return '<=' + builder.element(value);
      };
    },

    /**
     * start and end are included.
     *
     * @param {any} start
     * @param {any} end
     * @returns {function}
     */
    between: function(start, end) {
      return function(builder) {
        return ' BETWEEN ' + builder.element(start) + ' AND ' + builder.element(end);
      };
    }
  }
};

module.exports = DialectAgent;
