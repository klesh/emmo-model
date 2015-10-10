var _ = require('lodash');
var validator = require('validator');
var Promise2 = require('bluebird');
var moment = require('moment');

var numberTypes = [ 'int', 'integer', 'smallint', 'bigint', 'decimal', 'numeric', 'float', 'real', 'money', 'single', 'double' ];
var timestampTypes = [ 'datetime', 'timestamp', 'timestamptz' ];

function createModel(em, modelDef) {

  // model constructor
  function Model(data) {
    _.extend(this, data);
  }

  // validate instance
  Model.validate = function(inst, propertyNames) {
    if (!propertyNames) {
      propertyNames = modelDef.columnNames;
    } else if (_.isString(propertyNames)) {
      propertyNames = [ propertyNames ];
    }

    return Promise2.each(propertyNames, function(propertyName) {
      return Model.validateProperty(inst, propertyName);
    });
  };

  // convert property value to appropriate type and validate
  Model.validateProperty = function(inst, propertyName) {
    if (!inst) throw new Error('inst can not be null or undefined');
    var columnDef = modelDef.columns[propertyName];
    if (!columnDef) throw new Error('ECOLNOTFOUND');
    var propertyValue = inst[propertyName];

    var type = columnDef.type;
    if (_.isString(propertyValue)) {
      if (numberTypes.indexOf(type) >= 0) {
        propertyValue = Number(propertyValue);
        if (isNaN(propertyValue))
          return Promise2.reject(new TypeError(propertyName));
      } else if (timestampTypes.indexOf(type) >= 0) {
        propertyValue = moment(propertyValue, em.timestampFormat);
      } else if (type === 'date') {
        propertyValue = moment(propertyValue, em.dateFormat);
      } else if (type === 'time') {
        propertyValue = moment(propertyValue, em.timeFormat);
      }
    }
    if (em.autoTrim && type === 'string')
      propertyValue = _.trim(propertyValue);

    inst[propertyName] = propertyValue;
    return Model.validateValue(propertyName, propertyValue);
  };

  Model.validateValue = function(propertyName, propertyValue) {
    var columnDef = modelDef.columns[propertyName];
    if (!columnDef) throw new Error('ECOLNOTFOUND');
    var isValid = validateValue(columnDef, propertyValue);
    if (!isValid) {
      var err = new Error('EINVALID');
      err.propertyName = propertyName;
      err.description = err.message = columnDef.message || 'Invalid';
      return Promise2.reject(err);
    }
    return Promise2.resolve();
  };

  function validateValue(columnDef, propertyValue) {
    if (columnDef.allowNull === false) {
      if (propertyValue === null || propertyValue === undefined)
        return false;
      if (columnDef.type === 'string' && propertyValue === '') 
        return false;
    }
    if (columnDef.length) {
      if (propertyValue && propertyValue.length > columnDef.length)
        return false;
    }
    return true;
  }

  Model.prototype._definition = modelDef;

  Model.prototype.validate = function(propertyNames) {
    return Model.validate(this, propertyNames);
  };

  return Model;
}

module.exports = createModel;
