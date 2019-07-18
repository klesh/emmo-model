"use strict";
/* jshint node: true */

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
    if (data)
      Model.assign(this, data);
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
    err = err || em.newModelErr;
    var properties = Object.keys(source);
    if (input) properties = properties.filter(p => entity.inputableName.includes(p));

    for (var i = 0, j = properties.length; i < j; i++) {
      var name = properties[i];
      var value = source[name];
      var property = entity.properties[name];
      if (property) {
        var type = property.type;
        var invalid = false;

        if (typeof(value) === 'string') {
          switch (type) {
            case 'string':
              if (property.autoTrim !== false) {
                value = value.trim();
                if (property.autoTrim === 'length' && property.length > 0 && value.length > property.length)
                  value = value.substring(0, property.length);
              }
              break;
            case 'boolean':
              value = !!value;
              break;
            case 'tinyint':
            case 'smallint':
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
              invalid = isNaN(value);
              break;
            case 'date':
            case 'time':
            case 'datetime':
            case 'timestamp':
            case 'timestamptz':
              if (value) {
                value = input ? moment(value, property.dateFormat) : em.agent.convertDate(value, property);
                invalid = value.isValid() === false;
                value = value._d;
              } else {
                value = null;
              }
              break;
            default:
              throw new Error(util.format("Shoo, unknow type %s of %s.%s", type, entityName, name));
          }
          if (invalid)
            throw err('E_TYPE_ERROR', {
              entityName: entityName,
              entity: entity,
              propertyName: name,
              property: property,
              reason: type
            });
        }
      }
      target[name] = value;
    }
    return target;
  };

  /**
   * Validate current instance
   *
   * @param {string}    method    validate purpose: update/insert
   * @param {newErr}    err       customize err instance
   */
  Model.prototype.validate = function(method, err) {
    err = err || em.newModelErr;
    // run validation
    var thisKeys = Object.keys(this);
    var shareKeys = thisKeys.filter(k => entity.propertyNames.includes(k));

    if (Object.getOwnPropertyNames(shareKeys).length === 0) // make sure this is not a empty object
      return P.reject(err('E_DATA_EMPTY'));

    if (method === 'upsert') {
      if (!entity.autoIncrementName)
        throw new Error('Validate for upsert requires Entity has a autoIncrement column');

      method = this[entity.autoIncrementName] ? 'update' : 'insert';
    }

    const union = (a, b) => {
      const u = [];
      const p = z => {
        for (const i of z) {
          if (!u.includes(i))
            u.push(i);
        }
      }
      p(a); p(b);
      return u;
    }
    var validateKeys;
    if (method === 'insert') {
      validateKeys = union(entity.requiredNames, shareKeys);
    } else if (method === 'update') {
      validateKeys = union(entity.primaryKeyNames, shareKeys);
    } else if (method === 'refresh') {
      validateKeys = shareKeys;
    } else {
      throw new Error('Validate method can only be insert/update/refresh/upsert, but got ' + method);
    }

    for (var i = 0, j = validateKeys.length; i < j; i++) {
      var name = validateKeys[i];
      var value = this[name];
      var property = entity.properties[name];
      var reason;

      var required = (property.allowNull === false && (property.defaultValue === null || property.defaultValue === undefined)) || (method === 'update' && property.autoIncrement);
      var notValue = value === null || value === undefined || value === '';

      var invalid = required && notValue;
      if (invalid) {
        reason = 'allowNull';
      } else if (!notValue) {
        for (var n = 0, m = property.validators.length; n < m; n++) {
          var validator = property.validators[n];
          if (validator.call(this, value) === false) {
            reason =  validator.reason || validator.name;
            invalid = true;
            break;
          }
        }
      }

      if (invalid) {
        var e = err('E_VALIDATION_FAIL', {
          entityName: entityName,
          entity: entity,
          propertyName: name,
          property: property,
          reason: reason
        });
        e.isOperational = true;
        return P.reject(e);
      }
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
   * @property {string}                   method          insert/update/refresh(In)
   * @property {Model~newErr}             [newErr]        customize error
   */
  /**
   * Accept user input data(like post from browser), convert data type and run validation,
   *   1. a new Model instance will be created, and properties in data will be copied
   *      base accordingly.
   *   2. all input=false properties will be ignored.
   *   3. for method=insert, only updatable properties will be copied and validated
   *   4. for other method, all primary key properties will be copied and validated as well
   *   5. if convertion/validation fail, a TypeError/Error with code/description properties
   *      will be shipped with rejection. you can customize that err by pass Model~newErr
   *      callback
   *
   * @param {InputOptions}  options
   * @return {Promise<Model>}
   */
  Model.input = function(inputData, validateMethod, newErr) {
    if (typeof(inputData) !== 'object' || !inputData)
      throw new Error('inputData must be an object');

    var err = newErr || em.newModelErr;

    if (Object.getOwnPropertyNames(inputData).length === 0)
      return P.reject(err('E_DATA_EMPTY'));

    var inst = new Model();

    // convert data types
    try {
      Model.assign(inst, inputData, true, err);
    } catch(e) {
      if (e.code === 'E_TYPE_ERROR') {
        e.isOperational = true;
        return P.reject(e);
      }
      throw e;
    }

    return inst.validate(validateMethod, err);
  };

  // bind session instance method as static methods db.find(modelName, 1)  => Model.find(1)
  var modelFuncRe = /^function\s*\(entityName[,|\)]/;
  for (const method in Session.prototype) {
    func = Session.prototype[method];
    var modelBinding = modelFuncRe.test(func.toString());
    Model[method + 'In'] = function() {
      var args = Array.from(arguments);
      var database = args[0];
      if (modelBinding)
        args[0] = entityName;
      return em.scope(database, function(db) {
        return db[method].apply(db, args);
      });
    };
    Model[method] = function() {
      var args = Array.from(arguments);
      if (modelBinding)
        args.unshift(entityName);
      return em.scope(function(db) {
        return db[method].apply(db, args);
      });
    };
  };

  /**
   * Model's definition
   */
  Model.$entity = entity;

  /**
   * Model's name
   */
  Model.$name = entityName;

  return Model;
};
