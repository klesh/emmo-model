"use strict";
/* jshint node: true */

var _ = require('lodash');
var Expression = require('./expression.js');

/**
 * Query builder
 * @constructor
 */
function Builder(em, entityName) {
  this.entityName = entityName;
  this.em = em;
  this.agent = em.agent;
  this.entity = em.entities[entityName];
  if (this.entity === undefined)
    throw new Error(entityName + ' does not exists.');
}

Builder.prototype.tableName = function(entityName) {
  var entity = this.em.entities[entityName];
  if (entity === undefined)
    throw new Error(entityName + ' does not exists.');
  return entity.tableName;
};
    
Builder.prototype.property = function(propertyName) {
  var property = this.entity.properties[propertyName];
  if (property === undefined)
    throw new Error(this.entityName + '.' + propertyName + " doesn't exists.");
  else if (property.virtual)
    throw new Error(this.entityName + '.' + propertyName + " is virtual.");
  return property;
};

Builder.prototype.columnName = function(propertyName) {
  return this.property(propertyName).columnName;
};

Builder.prototype.comma = function() {
  this.sql += ',';
};

Builder.prototype.equals = function() {
  this.sql += '=';
};

Builder.prototype.quote = function(resource) {
  if (resource.indexOf('.') > 0) {
    var resources = resource.split('.');
    var entity = this.em.entities[resources[0]];
    if (entity === undefined)
      throw new Error('Entity ' + resources[0] + ' does not exists.');
    var tableName = entity.tableName;
    var property = entity.properties[resources[1]];
    if (property === undefined)
      throw new Error('Entity ' + resources[0] + ' does not contains ' + resources[1] + ' property.');
    var columnName = property.columnName;
    return this.agent.quote(tableName) + '.' + this.agent.quote(columnName);
  } else {
    var p = this.entity.properties[resource];
    return this.agent.quote(p !== undefined ? p.columnName : resource);
  }
};

Builder.prototype.value = function(value) {
  var ph = this.agent.placehold(this.values.length);
  this.values.push(value);
  return ph;
};

Builder.prototype.element = function(element) {
  if (element instanceof Expression) {
    return element.evaluate(this);
  }
  return this.value(element);
};

Builder.prototype.begin = function(piece) {
  this.sql = piece;
  this.values = [];
  return this;
};

Builder.prototype.append = function(piece) {
  if (!this.bracketFlag) this.sql += ' ';
  this.sql += piece;
  return this;
};

Builder.prototype.bracket = function() {
  this.sql += this.bracketFlag ? ')' : ' (';
  this.bracketFlag = ! this.bracketFlag;
};

Builder.prototype.appendTable = function() {
  return this.append(this.agent.quote(this.entity.tableName));
};

Builder.prototype.appendColumn = function(name) {
  return this.append(this.agent.quote(this.columnName(name)));
};

Builder.prototype.appendColumns = function(names) {
  for (var i = 0, j = names.length; i < j; i++) {
    if (i > 0) this.comma();
    this.appendColumn(names[i]);
  }
  return this;
};

Builder.prototype.appendValue = function(value) {
  return this.append(this.value(value));
};

Builder.prototype.appendValues = function(values) {
  for (var i = 0, j = values.length; i < j; i++) {
    if (i > 0) this.comma();
    this.appendValue(values[i]);
  }
  return this;
};

Builder.prototype.appendAssignments = function(data) {
  var first = true;
  for (var key in data) {
    if (data.hasOwnProperty(key) === false)
      continue;
    
    if (first === false) this.comma();
    first = false;
    this.appendColumn(key);
    this.equals();
    this.appendElement(data[key]);
  }
  return this;
};

Builder.prototype.appendElement = function(element) {
  this.sql += this.element(element);
  return this;
};

Builder.prototype.appendWhere = function(where) {
  if (_.isEmpty(where))
    return '';
  
  var conditions = this.conditions(where);
  if (conditions) {
    this.append('WHERE');
    this.append(conditions);
  }
};

Builder.prototype.conditions = function(conditions) {
  var self = this;

  if (_.isArray(conditions)) {
    return '(' + conditions.map(function(e) { 
      return self.conditions(e);
    }).join(' OR ') + ')';
  } else if (_.isObject(conditions)) {
    return '(' + _.map(conditions, function(e, k) {
      var left = k, right = e;
      if (k[0] === '_') {
        /**
         * @example
         * // deal with LEFT PART is a Expression
         * having: { _A: [ em.count(), em.gt(1) ] }
         *   => HAVING COUNT(*) > 1
         */
        left = e[0];
        right = e[1];
      } else if (k[0] === '$') {
        /**
         * @example
         * // deal with OR in AND
         * where: { $A: [ { age: 22 }, { age: em.gt(33) } ], departmentId: 2 }
         *   => WHERE ( age = 22 OR age > 23 ) AND departmentId = 2
         */
        return self.conditions(e);
      }
      var script = '';

      if (left instanceof Expression)
        script += left.evaluate(self);
      else
        script += self.field(left, false);
        //script += self.agent.quote(self.columnName(left));

      if (_.isArray(right) && right.length === 1)
        right = right[0];

      if (_.isArray(right)) {
        /**
         * @example
         * where: { id: [ 1, 2, 3 ] }
         */
        script += self.agent.comparators.in(right)(self);
      } else if (right instanceof Expression) {
        /**
         * @example
         * where: { updatedAt: em.gt(em.o('logonAt')) }
         *   => updatedAt > logonAt
         *
         * where: { updatedAt: em.o('logonAt') }
         *   => updatedAt = logonAt
         *
         * where: { id: em.not(em.in([ 1, 2, 3 ])) }
         */
        if (right.type !== 'comparator')
          script += '=';
        script += right.evaluate(self);
      } else {
        /**
         * @example
         * where: { id: 1 }
         *   => id = 1
         * where: { roleId: null }
         *   => roleId IS NULL
         * where: { roleId: em.not(null) }
         *   => roleId IS NOT NULL
         */
        if (right === null || right === undefined)
          script += ' IS NULL';
        else
          script += '=' + self.value(right);
      }
      return script;
    }).join(' AND ') + ')';
  }

  if (conditions)
    throw new Error('Unknown type of conditions.');
};

Builder.prototype.end = function() {
  this.sql += this.agent.separator;
  return this;
};

Builder.prototype.insert = function(data) {
  var b = this;
  var keys = _.intersection(_.keys(data), this.entity.updatableNames);
  var values = keys.map(k => data[k]);
  b.begin('INSERT INTO');
  b.appendTable();
  b.bracket();
  b.appendColumns(keys);
  b.bracket();
  b.append('VALUES');
  b.bracket();
  b.appendValues(values);
  b.bracket();
  return b.end();
};

Builder.prototype.update = function(data, where) {
  var b = this;
  data = _.pick(data, this.entity.updatableNames);
  b.begin('UPDATE');
  b.appendTable();
  b.append('SET');
  b.appendAssignments(data);
  b.appendWhere(where);
  return b.end();
};

Builder.prototype.delete = function(where) {
  var b = this;
  b.begin('DELETE FROM');
  b.appendTable();
  b.appendWhere(where);
  return b.end();
};

Builder.prototype.appendAs = function(alias) {
  this.append('AS');
  this.append(this.agent.quote(alias));
  return this;
};

Builder.prototype.field = function(field, alias) {
  if (!_.isString(field))
    throw new Error('field is not a string : ' + field);
  // TODO: take care of * sign


  var sql, property;

  if (field.indexOf('.') > 0) {
    // d.title => "d"."title"
    // { department: 'd.title' } => "d"."title" AS "department"
    // Department.title => "Departments"."title"
    var fields = field.split('.');
    var table = fields[0], column = fields[1];

    var join = this.joins[table];
   
    if (join === undefined)
      throw new Error(fields[0] + ' table does not exists.');

    var entity = this.em.entities[join.entity];
    if (entity === undefined)
      throw new Error(join.entity + ' does not exists, JOIN fail');

    if (table === join.entity) {
      sql = this.agent.quote(entity.tableName);
    } else {
      sql = this.agent.quote(table);
    }

    if (column === '*')
      return sql + '.' + column;

    property = entity.properties[column];
    if (property === undefined)
      throw new Error(table + ' does not contains property ' + fields[1] + ' , JOIN fail');

    sql += '.' + this.agent.quote(property.columnName);

    field = fields[1];
  } else {
    // 'id' => "id"
    // "passwordHash" => "password" AS "passwordHash"
    // join without alias : "id" => "Users"."id"
    // join without alias : "*" => "Users".*
    // join with alias 'u': "id" => "u"."id"
    if (field === '*')
      return this.as + '.' + field;
      
    property = this.property(field);
    sql = this.agent.quote(property.columnName);

    if (this.as)
      sql = this.as + '.' + sql;
  }

  if (alias !== false && property.columnName !== field)
    sql += ' AS ' + this.agent.quote(field);

  return sql;
};

Builder.prototype.appendFields = function(fields) {
  if (_.isString(fields)) {
    this.append(this.field(fields));
  } else if (_.isArray(fields)) {
    for (var i = 0, j = fields.length; i < j; i++) {
      if (i > 0) this.comma();
      this.appendFields(fields[i]);
      //this.append(this.field(fields[i]));
    }
  } else if (fields instanceof Expression) {
    // em.count => COUNT(*)
    this.append(fields.evaluate(this));
  } else if (_.isObject(fields)) {
    var first = true;
    for (var key in fields) {
      if (first === false) this.comma();
      first = false;
      var value = fields[key];
      if (value instanceof Expression)
        // { total: em.count() } => COUNT(*) AS "total"
        this.append(value.evaluate(this));
      else
        // { userId: "id" }
        this.append(this.field(value, false));
      this.append('AS');
      this.append(this.agent.quote(key));
    }
  } else {
    throw new Error('Unknown type of field.');
  }
};

/**
 * @typedef Joins
 * @type {object}
 * @property {string}     entity
 * @property {string}     type
 * @property {string}     [to]
 */
Builder.prototype.join = function(join) {
  if (_.isString(join)) {
    this.joins[join] = {
      entity: join,
      type: 'LEFT OUTER'
    };
  } else if (_.isObject(join)) {
    for (var key in join) {
      var value = join[key];
      if (_.isObject(value)) {
        this.joins[value.as] = {
          entity: key,
          type: value.type || 'LEFT OUTER',
          to: value.to
        };
      } else if (_.isString(value)) {
        this.joins[key] = {
          entity: value,
          type: 'LEFT OUTER'
        };
      } else {
        throw new Error('Unknow join value: ' + value.toString());
      }
    }
  } else if (_.isArray(join)) {
    for (var i = 0, j = join.length; i < j; i++) {
      this.join(join[i]);
    }
  } else {
    throw new Error('Unknown type of join');
  }
};

Builder.prototype.findForeignKey = function(entity, refer) {
  var fk = [];
  for (var key in entity.properties) {
    var p = entity.properties[key];
    if (p.refer === refer)
      fk.push(p);
  }
  return fk.length > 0 ? fk : null;
};

Builder.prototype.appendJoin = function() {
  if (!this.joins)
    return;

  for (var alias in this.joins) {
    var join = this.joins[alias];
    
    var entity = this.em.entities[join.entity];
    if (entity === undefined)
      throw new Error(join.entity + ' does not exists, JOIN FAIL.');

    this.append(join.type);
    this.append('JOIN');
    var as = this.agent.quote(entity.tableName);
    this.append(as);
    if (alias != join.entity) {
      as = this.agent.quote(alias);
      this.append(as);
    } else {
      as = this.agent.quote(entity.tableName);
    }
    this.append('ON');
    this.bracket();

    var toName, to;
    if (join.to) {
      var joinTo = this.joins[join.to];
      toName = joinTo.entity;
      to = this.em.entities[toName];
    } else {
      toName = this.entityName;
      to = this.entity;
    }
    if (to === undefined)
      throw new Error('join.to does not exists: ' + join.to);

    var l = as, r = join.to || this.as;
    var pk = entity.primaryKeyNames;
    var fk = join.on;
    if (fk === undefined) {
      fk = this.findForeignKey(to, join.entity);
      if (fk === null) {
        pk = to.primaryKeyNames;
        fk = this.findForeignKey(entity, toName);
        entity = to;
        var tmp = l;
        l = r;
        r = tmp;
      }
      if (pk.length != fk.length) 
        throw new Error((join.to || this.entityName) + ' has multiple refer to ' + join.entity + ', please set ON condition');
    }
    for (var i = 0, j = pk.length; i < j; i++) {
      if (i > 0) this.comma();
      this.append(l + '.' + this.agent.quote(entity.properties[pk[i]].columnName));
      this.equals();
      this.append(r + '.' + this.agent.quote(fk[i].columnName));
    }
    this.bracket();
  }
};

Builder.prototype.appendOrder = function(order) {
  if (_.isString(order)) {
    this.append(this.field(order, false));
  } else if (_.isArray(order)) {
    for (var i = 0, j = order.length; i < j; i++) {
      if (i > 0) this.comma();
      this.append(this.field(order[i], false));
    }
  } else if (_.isObject(order)) {
    var first = true;
    for (var key in order) {
      if (first === false)
        this.comma();
      else
        first = false;

      this.append(this.field(key, false));

      if (order[key].toUpperCase() == 'DESC')
        this.append('DESC');
    }
  }

  return this;
};

Builder.prototype.select = function(options) {
  options = options || {};

  // prepare joins object because it will be used by select/where ...
  if (options.join !== undefined) {
    this.as = this.agent.quote(options.as || this.entity.tableName);
    this.joins = {};
    this.join(options.join); // normalize
  } else {
    delete this.as;
    delete this.joins;
  }

  var b = this;
  b.begin('SELECT');
  if (options.field && options.field !== '*') {
    b.appendFields(options.field);
  } else {
    b.append(this.as ? this.as + '.*' : '*');
  }
  b.append('FROM');
  b.appendTable();
  if (options.as)
    b.append(this.agent.quote(options.as));
  b.appendJoin();
  b.appendWhere(options.where);
  if (options.order) {
    b.append('ORDER BY');
    b.appendOrder(options.order);
  }
  if (options.groupby)
    b.append('GROUP BY').append(this.field(options.groupby, false));
  if (options.having) {
    var having = this.conditions(options.having);
    if (having)
      b.append('HAVING').append(having);
  }
  if (options.offset > 0) {
    this.sql = this.agent.offset(this.sql, this.value(options.offset));
  }
  if (options.limit > 0) {
    this.sql = this.agent.limit(this.sql, this.value(options.limit));
  }


  b.end();
  return this;
};

module.exports = Builder;
