var _ = require('lodash');

/**
 * SQL operator/function wrapper
 *   1. when expr is string, this string will be put in SQL honestly
 *   2. when expr is function, it will be call with two arguments:
 *        agent(dialect implementation), 
 *        values(sql query params list), 
 *        and expect a legal SQL statement to be returned, along with values list is added if needed
 *  
 * @constructor
 * @param {string|function}  expr
 */
function Expression(expr, em, type) {
  this.em = em;
  this.expr = expr;
  this.type = type;
  this.isFunction = _.isFunction(expr);
  this.suffixes = [];
}

/**
 * Return formatted SQL clause, and push params to values list
 *
 * @returns {string}   SQL statment
 */
Expression.prototype.evaluate = function(builder) {
  var sql = this.isFunction ? this.expr(builder) : this.expr;
  var j = this.suffixes.length;
  if (j > 0) {
    for (var i = 0; i < j; i++) {
      sql += this.suffixes[i](builder);
    }
  }
  return sql;
};

function op(sign, value) {
  this.suffixes.push(function(builder) {
    return sign + builder.element(value);
  });
  return this;
}


/**
 * String concatenation
 *
 * @param {...Expression|string}  value
 * @returns {Expression}
 */
Expression.prototype.concate = function(value) {
  var concator = em.agent.stringConcatenate;
  if (_.isString(concator)) {
    // scenario 1, simple concatenate operator
    this.suffixes.push(function(builder) {
      return concator + builder.element(value);
    });
  } else if (_.isFunction(concator)) {
    // scenario 2, having function instead of operator 
    this.suffixes.push(concator.apply(em.agent, arguments));
  }
  return this;
};

/**
 * Append a mathematical + operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.plus = _.partial(op, '+');


/**
 * Append a mathematical - operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.subtract = _.partial(op, '-');

/**
 * Append a mathematical * operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.multiply = _.partial(op, '*');

/**
 * Append a mathematical / operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.multiply = _.partial(op, '/');

/**
 * Append a mathematical % operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.multiply = _.partial(op, '%');

/**
 * Append a mathematical | operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.or = _.partial(op, '|');

/**
 * Append a mathematical & operation
 *
 * @param {any}  value
 * @returns {Expression}
 */
Expression.prototype.and = _.partial(op, '&');

module.exports = Expression;
