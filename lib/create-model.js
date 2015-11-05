var _ = require('lodash');
var util = require('util');
var validator = require('validator');
var Promise2 = require('bluebird');
var moment = require('moment');
var Session = require('./session.js');

var numberTypes = [ 'int', 'integer', 'smallint', 'bigint', 'decimal', 'numeric', 'float', 'real', 'money', 'single', 'double' ];
var timestampTypes = [ 'datetime', 'timestamp', 'timestamptz' ];
var allValidators = _.keys(validator).filter(fn => _.startsWith(fn, 'is') || [ 'contains', 'matches', 'equals' ].indexOf(fn) >= 0);

function createModel(em, modelName, modelDef) {
  // model constructor
  function Model(data) {
    _.extend(this, data);
  }

  function getColumn(name) {
    var columnDef = modelDef.columns[name];
    if (!columnDef) throw new Error('ECOLNOTFOUND:' + name);
    return columnDef;
  }

  Model.fix = function(data, names) {
    names = names || _.intersection(modelDef.columnNames, _.keys(data));
    return Promise2.each(names, function(name) {
      return Model.fixProperty(data, name);
    });
  };

  Model.fixProperty = function(data, name) {
    return Model.fixValue(name, data[name]).then(function(fixed) {
      data[name] = fixed;
    });
  };

  Model.fixValue = function(name, value) {
    var columnDef = getColumn(name);
    var type = columnDef.type;

    if (_.isString(value)) {
      if (numberTypes.indexOf(type) >= 0) {
        value = Number(value);
        if (isNaN(value))
          return Promise2.reject(new TypeError(name));
      } else if (timestampTypes.indexOf(type) >= 0) {
        value = moment(value, em.timestampFormat);
      } else if (type === 'date') {
        value = moment(value, em.dateFormat);
      } else if (type === 'time') {
        value = moment(value, em.timeFormat);
      }
    }
    if (em.autoTrim && type === 'string')
      value = _.trim(value);

    return Promise2.resolve(value);
  };
 
  // validate instance
  Model.validate = function(data, names) {
    if (names === true || data[modelDef.autoIncrementColumnName] > 0) { // validate only inst keys ( as in update mode )
      names = _.intersection(modelDef.columnNames, _.keys(data));
    } else if (!names) { // validate all properties ( as in insert mode )
      names = modelDef.columnNames;
    } else if (_.isString(names)) { // validate specific property
      names = [ names ];
    }

    return Promise2.each(names, function(name) {
      return Model.validateProperty(data, name);
    });
  };

  // convert property value to appropriate type and validate
  Model.validateProperty = function(data, name) {
    if (!data) throw new Error('inst can not be null or undefined');
    return Model.fixProperty(data, name).then(function() {
      return Model.validateValue(name, data[name]);
    });
  };

  Model.validateValue = function(name, value) {
    var columnDef = getColumn(name);
    var isValid = validateValue(columnDef, value);
    if (!isValid) {
      var err = new Error('EINVALID');
      err.code = 'EINVALID';
      err.propertyName = name;
      err.description = columnDef.message || 'Invalid';
      return Promise2.reject(err);
    }
    return Promise2.resolve();
  };

  function validateValue(columnDef, value) {
    // basic check
    if (columnDef.allowNull === false) {
      if (value === null || value === undefined)
        return false;
      if (columnDef.type === 'string' && value === '') 
        return false;
    }
    if (columnDef.length) {
      if (value && value.length > columnDef.length)
        return false;
    }
    // run validators one by one
    var isValid = true;
    if (!columnDef._validators) {
      columnDef._validatorNames = _.intersection(allValidators, _.keys(columnDef));
    }
    _.each(columnDef._validatorNames, function(validatorName) {
      var validatorFunc = validator[validatorName];
      var args = columnDef[validatorName];
      if (args === true) 
        args = [];
      else if (!_.isArray(args)) 
        args = [ args ];
      else
        args = _.clone(args);
      args.unshift(value);
      isValid = validatorFunc.apply(validator, args);
      if (!isValid) return false;
    });
    return isValid;
  }

  // validate and then insert/update
  Model.saveIn = function(database, data, forceUpdate) {
    var isUpdate = forceUpdate || data[modelDef.autoIncrementColumnName] > 0;
    return Model.validate(data, isUpdate)
    .tap(function() {
      var listener = Model[ isUpdate ? 'beforeUpdate' : 'beforeInsert' ];
      if (_.isFunction(listener))
        return listener(data);
    })
    .then(function() {
      return Model[ isUpdate ? 'updateIn' : 'insertIn' ](database, data);
    })
    .tap(function() {
      var listener = Model[ isUpdate ? 'afterUpdate' : 'afterInsert' ];
      if (_.isFunction(listener))
        return listener(data);
    });
  };

  Model.save = _.partial(Model.saveIn, null);

  // validate and then update specific cell's value
  Model.cellIn = function(database, field, value, pkvalue) {
    var pks = modelDef.primaryKeys, self = this;

    if (!pks || pks.length !== 1)
      throw new Error(modelName + ' has no primary key');
    if (!field || !_.isString(field))
      return Promise2.reject(new Error('field is required and must be a string type'));
    if (pkvalue === undefined)
      return Promise2.reject(new Error('primary key value is required'));
    if (field === modelDef.autoIncrementColumnName)
      return Promise2.reject(new Error('autoIncrement column could not be updated'));

    return Model.validateValue(field, value)
    .tap(function() {
      if (_.isFunction(Model.onCell))
        return Model.onCell(field, value, pkvalue);
    })
    .then(function() {
      var sql = util.format('UPDATE %s SET %s = $1 WHERE %s = $2' + em.agent.separator, 
                             em.agent.quote(em.normalized[modelName].tableName),
                             em.agent.quote(field),
                             em.agent.quote(pks[0]));
      return em.scope(database || em.database, function(db) {
        return db.query(sql, [ value, pkvalue ]).then(function(rows) { return rows.affectedRows; });
      });
    })
    .tap(function() {
      if (_.isFunction(Model.afterCell)) {
        return Model.afterCell(field, value, pkvalue);
      }
    });
  };

  Model.cell = _.partial(Model.cellIn, null);

  // bind session instance method as static methods db.find(modelName, 1)  => Model.find(1)
  _.each(_.keys(Session.prototype), function(method) {
    Model[method + 'In'] = function() {
      var args = _.toArray(arguments);
      var database = args[0];
      args[0] = modelName;
      return em.scope(database, function(db) {
        return db[method].apply(db, args);
      });
    };
    Model[method] = function() {
      var args = _.toArray(arguments);
      args.unshift(modelName);
      return em.scope(function(db) {
        return db[method].apply(db, args);
      });
    };
  });

  Model.prototype._definition = modelDef;

  Model.prototype.validate = function(names) {
    if (names === undefined) {
      names = modelDef.autoIncrementColumnName && this[modelDef.autoIncrementColumnName] > 0;
    }
    return Model.validate(this, names);
  };

  Model.prototype.fix = function(names) {
    return Model.fix(this, names);
  };

  return Model;
}

module.exports = createModel;
