var _ = require('lodash');
var moment = require('moment');

var numericTypes = ['int', 'bigint', 'float', 'money'];

function createModel(modelDef) {

  function Model(data) {
    _.extend(this, data);
    this.rectify();
  }

  Model.prototype._definition = modelDef;

  Model.prototype.validate = function( ) {
  
  };

  Model.prototype.rectify = function() {
    var self = this;
    _.each(this._definition.columns, function(columnDef, columnName) {
      if (self.hasOwnProperty(columnName))
        self[columnName] = Model.rectify(columnName, self[columnName]);
    });
  };

  Model.rectify = function(propertyName, propertyValue) {
    var propertyDef = modelDef.columns[propertyName];
    if (numericTypes.indexOf(propertyDef.type))
      return propertyValue * 1;
    return propertyValue;
  };

  Model.create = function(data) {
    return new Model(data);
  };
}
