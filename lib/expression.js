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
function Expression(expr) {
  this.expr = expr;
  this.isOperator = _.isFunction(expr);
  this.suffixes = [];
}

/**
 * Return formatted SQL clause, and push params to values list
 *
 * @returns {string}   SQL statment
 */
Expression.prototype.evaluate = function(process) {
  var sql = this.isOperator ? this.expr(process) : this.expr;
  var j = this.suffixes.length;
  if (j) {
    for (var i = 0; i < j; i++) {
      sql += this.suffixes[i](process);
    }
  }
  return sql;
};

function op(sign, value) {
  this.suffixes.push(function(process) {
    return sign + process(value);
  });
  return this;
}

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
