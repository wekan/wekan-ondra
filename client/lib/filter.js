// Filtered view manager
// We define local filter objects for each different type of field (SetFilter,
// RangeFilter, dateFilter, etc.). We then define a global `Filter` object whose
// goal is to filter complete documents by using the local filters for each
// fields.
function showFilterSidebar() {
  Sidebar.setView('filter');
}

// Use a "set" filter for a field that is a set of documents uniquely
// identified. For instance `{ labels: ['labelA', 'labelC', 'labelD'] }`.
// use "subField" for searching inside object Fields.
// For instance '{ 'customFields._id': ['field1','field2']} (subField would be: _id)
class SetFilter {
  constructor(subField = '') {
    this._dep = new Tracker.Dependency();
    this._selectedElements = [];
    this.subField = subField;
  }

  isSelected(val) {
    this._dep.depend();
    return this._selectedElements.indexOf(val) > -1;
  }

  add(val) {
    if (this._indexOfVal(val) === -1) {
      this._selectedElements.push(val);
      this._dep.changed();
      showFilterSidebar();
    }
  }

  remove(val) {
    const indexOfVal = this._indexOfVal(val);
    if (this._indexOfVal(val) !== -1) {
      this._selectedElements.splice(indexOfVal, 1);
      this._dep.changed();
    }
  }

  toggle(val) {
    if (this._indexOfVal(val) === -1) {
      this.add(val);
    } else {
      this.remove(val);
    }
  }

  reset() {
    this._selectedElements = [];
    this._dep.changed();
  }

  _indexOfVal(val) {
    return this._selectedElements.indexOf(val);
  }

  _isActive() {
    this._dep.depend();
    return this._selectedElements.length !== 0;
  }

  _getMongoSelector() {
    this._dep.depend();
    return {
      $in: this._selectedElements,
    };
  }

  _getEmptySelector() {
    this._dep.depend();
    let includeEmpty = false;
    this._selectedElements.forEach(el => {
      if (el === undefined) {
        includeEmpty = true;
      }
    });
    return includeEmpty
      ? {
          $eq: [],
        }
      : null;
  }
}

// Advanced filter forms a MongoSelector from a users String.
// Build by: Ignatz 19.05.2018 (github feuerball11)
class AdvancedFilter {
  constructor() {
    this._dep = new Tracker.Dependency();
    this._filter = '';
    this._lastValide = {};
  }

  set(str) {
    this._filter = str;
    this._dep.changed();
  }

  reset() {
    this._filter = '';
    this._lastValide = {};
    this._dep.changed();
  }

  _isActive() {
    this._dep.depend();
    return this._filter !== '';
  }

  _filterToCommands() {
    const commands = [];
    let current = '';
    let string = false;
    let regex = false;
    let wasString = false;
    let ignore = false;
    for (let i = 0; i < this._filter.length; i++) {
      const char = this._filter.charAt(i);
      if (ignore) {
        ignore = false;
        current += char;
        continue;
      }
      if (char === '/') {
        string = !string;
        if (string) regex = true;
        current += char;
        continue;
      }
      // eslint-disable-next-line quotes
      if (char === "'") {
        string = !string;
        if (string) wasString = true;
        continue;
      }
      if (char === '\\' && !string) {
        ignore = true;
        continue;
      }
      if (char === ' ' && !string) {
        commands.push({
          cmd: current,
          string: wasString,
          regex,
        });
        wasString = false;
        current = '';
        continue;
      }
      current += char;
    }
    if (current !== '') {
      commands.push({
        cmd: current,
        string: wasString,
        regex,
      });
    }
    return commands;
  }

  _fieldNameToId(field) {
    const found = CustomFields.findOne({
      name: field,
    });
    return found._id;
  }

  _fieldValueToId(field, value) {
    const found = CustomFields.findOne({
      name: field,
    });
    if (
      found.settings.dropdownItems &&
      found.settings.dropdownItems.length > 0
    ) {
      for (let i = 0; i < found.settings.dropdownItems.length; i++) {
        if (found.settings.dropdownItems[i].name === value) {
          return found.settings.dropdownItems[i]._id;
        }
      }
    }
    return value;
  }

  _arrayToSelector(commands) {
    try {
      //let changed = false;
      this._processSubCommands(commands);
    } catch (e) {
      return this._lastValide;
    }
    this._lastValide = {
      $or: commands,
    };
    return {
      $or: commands,
    };
  }

  _processSubCommands(commands) {
    const subcommands = [];
    let level = 0;
    let start = -1;
    for (let i = 0; i < commands.length; i++) {
      if (commands[i].cmd) {
        switch (commands[i].cmd) {
          case '(': {
            level++;
            if (start === -1) start = i;
            continue;
          }
          case ')': {
            level--;
            commands.splice(i, 1);
            i--;
            continue;
          }
          default: {
            if (level > 0) {
              subcommands.push(commands[i]);
              commands.splice(i, 1);
              i--;
              continue;
            }
          }
        }
      }
    }
    if (start !== -1) {
      this._processSubCommands(subcommands);
      if (subcommands.length === 1) commands.splice(start, 0, subcommands[0]);
      else commands.splice(start, 0, subcommands);
    }
    this._processConditions(commands);
    this._processLogicalOperators(commands);
  }

  _processConditions(commands) {
    for (let i = 0; i < commands.length; i++) {
      if (!commands[i].string && commands[i].cmd) {
        switch (commands[i].cmd) {
          case '=':
          case '==':
          case '===': {
            const field = commands[i - 1].cmd;
            const str = commands[i + 1].cmd;
            if (commands[i + 1].regex) {
              const match = str.match(new RegExp('^/(.*?)/([gimy]*)$'));
              let regex = null;
              if (match.length > 2) regex = new RegExp(match[1], match[2]);
              else regex = new RegExp(match[1]);
              commands[i] = {
                'customFields._id': this._fieldNameToId(field),
                'customFields.value': regex,
              };
            } else {
              commands[i] = {
                'customFields._id': this._fieldNameToId(field),
                'customFields.value': {
                  $in: [this._fieldValueToId(field, str), parseInt(str, 10)],
                },
              };
            }
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case '!=':
          case '!==': {
            const field = commands[i - 1].cmd;
            const str = commands[i + 1].cmd;
            if (commands[i + 1].regex) {
              const match = str.match(new RegExp('^/(.*?)/([gimy]*)$'));
              let regex = null;
              if (match.length > 2) regex = new RegExp(match[1], match[2]);
              else regex = new RegExp(match[1]);
              commands[i] = {
                'customFields._id': this._fieldNameToId(field),
                'customFields.value': {
                  $not: regex,
                },
              };
            } else {
              commands[i] = {
                'customFields._id': this._fieldNameToId(field),
                'customFields.value': {
                  $not: {
                    $in: [this._fieldValueToId(field, str), parseInt(str, 10)],
                  },
                },
              };
            }
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case '>':
          case 'gt':
          case 'Gt':
          case 'GT': {
            const field = commands[i - 1].cmd;
            const str = commands[i + 1].cmd;
            commands[i] = {
              'customFields._id': this._fieldNameToId(field),
              'customFields.value': {
                $gt: parseInt(str, 10),
              },
            };
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case '>=':
          case '>==':
          case 'gte':
          case 'Gte':
          case 'GTE': {
            const field = commands[i - 1].cmd;
            const str = commands[i + 1].cmd;
            commands[i] = {
              'customFields._id': this._fieldNameToId(field),
              'customFields.value': {
                $gte: parseInt(str, 10),
              },
            };
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case '<':
          case 'lt':
          case 'Lt':
          case 'LT': {
            const field = commands[i - 1].cmd;
            const str = commands[i + 1].cmd;
            commands[i] = {
              'customFields._id': this._fieldNameToId(field),
              'customFields.value': {
                $lt: parseInt(str, 10),
              },
            };
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case '<=':
          case '<==':
          case 'lte':
          case 'Lte':
          case 'LTE': {
            const field = commands[i - 1].cmd;
            const str = commands[i + 1].cmd;
            commands[i] = {
              'customFields._id': this._fieldNameToId(field),
              'customFields.value': {
                $lte: parseInt(str, 10),
              },
            };
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
        }
      }
    }
  }

  _processLogicalOperators(commands) {
    for (let i = 0; i < commands.length; i++) {
      if (!commands[i].string && commands[i].cmd) {
        switch (commands[i].cmd) {
          case 'or':
          case 'Or':
          case 'OR':
          case '|':
          case '||': {
            const op1 = commands[i - 1];
            const op2 = commands[i + 1];
            commands[i] = {
              $or: [op1, op2],
            };
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case 'and':
          case 'And':
          case 'AND':
          case '&':
          case '&&': {
            const op1 = commands[i - 1];
            const op2 = commands[i + 1];
            commands[i] = {
              $and: [op1, op2],
            };
            commands.splice(i - 1, 1);
            commands.splice(i, 1);
            //changed = true;
            i--;
            break;
          }
          case 'not':
          case 'Not':
          case 'NOT':
          case '!': {
            const op1 = commands[i + 1];
            commands[i] = {
              $not: op1,
            };
            commands.splice(i + 1, 1);
            //changed = true;
            i--;
            break;
          }
        }
      }
    }
  }

  _getMongoSelector() {
    this._dep.depend();
    const commands = this._filterToCommands();
    return this._arrayToSelector(commands);
  }
  getRegexSelector() {
    // generate a regex for filter list
    this._dep.depend();
    return new RegExp(
      `^.*${this._filter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*$`,
      'i',
    );
  }
}

// The global Filter object.
// XXX It would be possible to re-write this object more elegantly, and removing
// the need to provide a list of `_fields`. We also should move methods into the
// object prototype.
Filter = {
  // XXX I would like to rename this field into `labels` to be consistent with
  // the rest of the schema, but we need to set some migrations architecture
  // before changing the schema.
  labelIds: new SetFilter(),
  members: new SetFilter(),
  assignees: new SetFilter(),
  archive: new SetFilter(),
  hideEmpty: new SetFilter(),
  customFields: new SetFilter('_id'),
  advanced: new AdvancedFilter(),
  lists: new AdvancedFilter(), // we need the ability to filter list by name as well

  _fields: [
    'labelIds',
    'members',
    'assignees',
    'archive',
    'hideEmpty',
    'customFields',
  ],

  // We don't filter cards that have been added after the last filter change. To
  // implement this we keep the id of these cards in this `_exceptions` fields
  // and use a `$or` condition in the mongo selector we return.
  _exceptions: [],
  _exceptionsDep: new Tracker.Dependency(),

  isActive() {
    return (
      _.any(this._fields, fieldName => {
        return this[fieldName]._isActive();
      }) ||
      this.advanced._isActive() ||
      this.lists._isActive()
    );
  },

  _getMongoSelector() {
    if (!this.isActive()) return {};

    const filterSelector = {};
    const emptySelector = {};
    let includeEmptySelectors = false;
    this._fields.forEach(fieldName => {
      const filter = this[fieldName];
      if (filter._isActive()) {
        if (filter.subField !== '') {
          filterSelector[
            `${fieldName}.${filter.subField}`
          ] = filter._getMongoSelector();
        } else {
          filterSelector[fieldName] = filter._getMongoSelector();
        }
        emptySelector[fieldName] = filter._getEmptySelector();
        if (emptySelector[fieldName] !== null) {
          includeEmptySelectors = true;
        }
      }
    });

    const exceptionsSelector = {
      _id: {
        $in: this._exceptions,
      },
    };
    this._exceptionsDep.depend();

    const selectors = [exceptionsSelector];

    if (
      _.any(this._fields, fieldName => {
        return this[fieldName]._isActive();
      })
    )
      selectors.push(filterSelector);
    if (includeEmptySelectors) selectors.push(emptySelector);
    if (this.advanced._isActive())
      selectors.push(this.advanced._getMongoSelector());

    return {
      $or: selectors,
    };
  },

  mongoSelector(additionalSelector) {
    const filterSelector = this._getMongoSelector();
    if (_.isUndefined(additionalSelector)) return filterSelector;
    else
      return {
        $and: [filterSelector, additionalSelector],
      };
  },

  reset() {
    this._fields.forEach(fieldName => {
      const filter = this[fieldName];
      filter.reset();
    });
    this.lists.reset();
    this.advanced.reset();
    this.resetExceptions();
  },

  addException(_id) {
    if (this.isActive()) {
      this._exceptions.push(_id);
      this._exceptionsDep.changed();
      Tracker.flush();
    }
  },

  resetExceptions() {
    this._exceptions = [];
    this._exceptionsDep.changed();
  },
};

Blaze.registerHelper('Filter', Filter);
