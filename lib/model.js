"use strict";
/* jshint node: true */

var _ = require('lodash');
var util = require('util');
var P = require('bluebird');
var moment = require('moment');
var Session = require('./session.js');

const cuMethods = ['insert', 'insertIn', 'update', 'updateIn', 'refresh', 'refreshIn'];

// to build a Model dynamically
module.exports = function(em, entityName, entity) {
  /**
   * @example
   * var user = new User({ nick: 'foo', age: 22 });
   *
   * @param {object} data
   * @constructor
   */
  function Model(data) {
    Model.assign(this, data);
  }

  /**
   * Create a error for type convertion/validation 
   *
   * @callback Model~newErr
   * @param {string}    code          error code
   * @param {string}    [name]        property name
   * @param {Property}  [property]    property definition
   */
  function newErr(code, name, property) {
    var message;

    switch (code) {
      case 'E_DATA_EMPTY':
        message = 'Input data can not be a empty object';
        break;
      case 'E_TYPE_ERROR':
        message = 'Illegal input value for ' + entityName + '.' + name;
        break;
      case 'E_VALIDATION_FAIL':
        message = property.message || ('Validation fail : ' + entityName + '.' + name);
        break;
    }
    var error = code === 'E_TYPE_ERROR' ? new TypeError(message) : new Error(message);
    error.code = code;
    error.description = message;
    error.property = name;
    return error;
  }

  /**
   * Assign specified properties of source object to target object, and convert value
   * to proper type base on Model defintion.
   *
   * @param {object}  target
   * @param {object}  source
   * @param {bollean} input     indicate source object is user input
   * @param {newErr}  err       customize error
   * @private
   */
  Model.assign = function(target, source, input, err) {
    err = err || newErr;
    var properties = _.keys(source);
    if (input) properties = _.intersection(entity.inputableNames);

    for (var i = 0, j = properties.length; i < j; i++) {
      var name = properties[i];
      var value = source[name];
      var property = entity.properties[name];
      if (property) {
        var type = property.type;
        
        if (_.isString(value)) {
          switch (type) {
            case 'string':
              if (property.autoTrim !== false) {
                value = _.trim(value);
                if (property.autoTrim === 'length' && property.length > 0 && value.length > property.length)
                  value = value.substring(0, property.length);
              }
              break;
            case 'boolean':
              value = !!value;
              break;
            case 'int':
            case 'integer':
            case 'smallint':
            case 'bigint':
            case 'decimal':
            case 'numeric':
            case 'float':
            case 'real':
            case 'money':
            case 'single':
            case 'double':
              value *= 1;
              if (isNaN(value))
                throw err('E_TYPE_ERROR', name, property);
              break;
            case 'date':
            case 'time':
            case 'datetime':
            case 'timestamp':
            case 'timestamptz':
              value = input ? moment(value, property.dateFormat || 'ISO8601') : em.agent.convertDate(value, property);
              if (!value.isValid())
                throw err('E_TYPE_ERROR', name, property);
              break;
            default:
              throw new Error(util.format("Shoo, unknow type %s of %s.%s", type, entityName, name));
          }

        }
      }
      target[name] = value;
    }
    return target;
  };

  /**
   * Validate current instance
   *
   * @param {string}    method    validate purpose: update/insert/refresh(In)
   * @param {newErr}    err       customize err instance
   */
  Model.prototype.validate = function(method, err) {
    err = err || newErr;
    // run validation
    var thisKeys = _.keys(this);
    var shareKeys = _.intersection(thisKeys, entity.propertyNames); 

    if (_.isEmpty(shareKeys)) // make sure this is not a empty object
      return P.reject(err('E_DATA_EMPTY'));

    var validateKeys;
    if (_.startsWith(method, 'insert')) {
      validateKeys = _.union(entity.requiredNames, shareKeys);
    } else {
      validateKeys = _.union(entity.primaryKeyNames, shareKeys);
    }

    for (var i = 0, j = validateKeys.length; i < j; i++) {
      var name = validateKeys[i];
      var value = this[name];
      var property = entity.properties[name];

      var required = property.allowNull === false || property.autoIncrement;
      var notValue = value === null || value === undefined || value === '';

      var invalid = required && notValue;
      if (!invalid) {
        for (var n = 0, m = property.validators.length; n < m; n++) {
          var validator = property.validators[n];
          if (validator.call(this, value) === false) {
            invalid = true;
            break;
          }
        }
      }

      if (invalid) 
        return P.reject(err('E_VALIDATION_FAIL', name, property));
    }
    return P.resolve(this);
  };


  /**
   * This will be called while convertion/validation were done successfully,
   *  and right before saving to database, you can return a Promise to perform
   *  asynchronize work or a rejection to stop the process.
   *
   * @callback Model~beforeInputSave
   * @param {Model} model
   * @return {Promise|undefined}
   */
  /**
   * @typedef InputOptions
   * @type {object}
   * @property {object}                   data            input data
   * @property {Model-beforeInputSave}    [before]        interceptor
   * @property {string}                   method          insert/update/refresh(In)
   * @property {Model~newErr}             [newErr]        customize error
   */
  /**
   * Accept user input data(like post from browser), convert data type and run validation,
   *  then insert into database
   *   1. a new Model instance will be created, and properties in data will be copied
   *      base accordingly.
   *   2. all input=false properties will be ignored.
   *   3. for method=insert(In), only updatable properties will be copied and validated
   *   4. for other method, all primary key properties will be copied and validated as well
   *   5. if convertion/validation fail, a TypeError/Error with code/description properties
   *      will be shipped with rejection. you can customize that err by pass Model~newErr
   *      callback
   *   6. if you need to perform some operations before saving, pass the before parameters
   *      as Model~beforeInputSave callback
   *
   * @param {InputOptions}  options
   * @return {Promise<Model>}
   * @exception {TypeError}
   */
  Model.input = function(options) {
    if (!_.isObject(options)) 
      throw new Error('options must be an object');
    if (!_.isObject(options.data))
      throw new Error('options.data must be an object');
    if (options.method && cuMethods.indexOf(options.method) < 0)
      throw new Error('options.method must be one of ' + cuMethods.join('/'));

    var err = options.newErr || newErr;

    if (_.isEmpty(options.data))
      return P.reject(err('E_DATA_EMPTY'));
      
    var inst = new Model();

    // convert data types
    try {
      Model.assign(inst, options.data, true, options.newErr);
    } catch(e) {
      if (e instanceof TypeError) {
        return P.reject(e);
      }
      throw e;
    }

    return inst.validate(options.method, err).then(function() {
      if (_.isFunction(options.before))
        return options.before(inst);
    }).then(function() {
      return Model[options.method](inst);
    });
  };

  // bind session instance method as static methods db.find(modelName, 1)  => Model.find(1)
  var modelFuncRe = /^function \(entityName[,|\)]/;
  _.each(Session.prototype, function(func, method) {
    var modelBinding = modelFuncRe.test(func.toString());
    Model[method + 'In'] = function() {
      var args = _.toArray(arguments);
      var database = args[0];
      if (modelBinding)
        args[0] = entityName;
      return em.scope(database, function(db) {
        return db[method].apply(db, args);
      });
    };
    Model[method] = function() {
      var args = _.toArray(arguments);
      if (modelBinding)
        args.unshift(entityName);
      return em.scope(function(db) {
        return db[method].apply(db, args);
      });
    };
  });

  /**
   * Model's definition
   */
  Model.prototype._entity = entity;

  /**
   * Model's name
   */
  Model.prototype._name = entityName;

  return Model;
};
