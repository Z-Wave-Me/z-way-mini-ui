/*
 *   jquery.triggerpath.js - jquery plugin to bind updates of an object and
 *   trigger interface updates upon value update.
 *   
 *   Copyright (C) 2010 Poltorak Serguei
 *
 *   This code made use of jQuery selector extension by James Padolsey
 *   available under unknown license at
 *   http://james.padolsey.com/javascript/extending-jquerys-selector-capabilities/
 *
 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.
 *
 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.
 *
 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
*/

/*
 *   I. Init
 *
 *   Select the variable you would like to track:
 *
 *    var tracked = { foo: {bar: [{goo: "lalala"}]}, moo: {hoo: {loo: "lololo"}}};
 *    $.triggerPath.init(tracked);
 *
 *
 *   II. Bind
 *
 *   To bind changes of foo.bar[*].goo, goo.[(1|2|3)].boo and moo.*.loo (* is a wildcard, (1|2|3) - is 1 or 2 or 3) do:
 *
 *    $(selector).bindPath('foo.bar[*].goo,goo.[(1|2|3)].boo,moo.*.loo', function(obj, path, arg1, arg2) {
 *       $(this).html(path + ': ' + obj.toString() + ' (' + arg1 + ', ' +  arg2 + ')');
 *    }, arg1, arg2);
 *
 *    or
 *
 *    $(selector).bindPathNoEval('foo.bar[*].goo', updFunc);
 *   
 *   Note that bindPath() will also execute handler function immediately after binding. This can be used
 *   to initialize the value of element. If you only need to execute handler on future updates, use bindPathNoEval().
 *   For example one can write the following code (bindPath would make an infinite loop in that place):
 *
 *    function renderInterface() { ...; $(selector).bindPathNoEval(path, renderInterface, arg, ...); ...};
 *
 *   One can also attach a function to a path without assigning it to a DOM element:
 *
 *    $.triggerPath.bindPathNoEval('path', func);
 *   
 *   This will create a new hidden DOM element <triggerpath> under body and attach the trigger to it. $.triggerPath.bindPath function does not exist.
 *
 *
 *   III. Update
 *
 *   To the binding do:
 *
 *    $.triggerPath.update('moo.hoo.loo');
 *
 *
 *   IV. Remove binding
 *
 *    $(element).unbindPath();
 *
 *   Can be used to remove binding. Bindings are deleted automaticlally upon the elemenet deletion.
 *
 *
 *   V. Note!
 *
 *   First parameter obj passed to the handler is the updated object (for example tracked.moo.hoo.loo or
 *   tracked["moo"]["hoo"]["loo"] if you prefer). Note, that it can equal null at initial run of handler from bindPath()
 *   if a regular expression is given instead of a precise path or more than one path is given (separated by ,).
 *   Then called from triggerPath.update() this variable would always point to an existing non-null object.
 *
 *   Parameter path will store the path that triggered the event (in our example 'moo.hoo.loo'). Like with obj parameter,
 *   this can also have meaningless value at the initial call from bindPath: it can be equal to the string you passed to bindPath()
 *
 *
 *   VI. Note!
 *
 *   Do not attach bindPath to window element [ $(window).bindPath(...) ], since jQuery does never return window object as a result of selector.
 *
 *
 *   VII. Note!
 *
 *   Try to use as much as possible exact paths. For example, instead of goo.[(1|2|3)].boo user goo.[1].boo,goo.[2].boo,goo.[3].boo.
 *   The former will use regular expression, while the latter will be much faster since it uses three checks for equality.
 *
 */

(function($) {
	var DEBUG = 0;

	$.fn.extend({
		// Binds changes selected by path (string ou reg.exp.) to the function fn and pass it additional arguments. Runs triggerPath.update after binding to initialize the element
		bindPath: function(path, fn /* arg1, arg2,.. */) {
			if (typeof(path) === 'string' && (typeof(fn) === 'function' || typeof(fn) === 'undefined' || fn === null)) {
				if (typeof(fn) !== 'function')
					fn = null;
				var args = arguments;
				return this.each(function() {
					$.triggerPath.bind(this, path, fn, true, Array.prototype.slice.call(args,2));
				});
			} else
				$.error('Method bind of jQuery.triggerPath requires a string path and a function handler');
		},
		// Binds changes selected by path (string ou reg.exp.) to the function fn and pass it additional arguments.
		bindPathNoEval: function(path, fn /* arg1, arg2,.. */) {
			if (typeof(path) === 'string' && (typeof(fn) === 'function' || typeof(fn) === 'undefined' || fn === null)) {
				if (typeof(fn) !== 'function')
					fn = null;
				var arg = arguments;
				return this.each(function() {
					$.triggerPath.bind(this, path, fn, false, Array.prototype.slice.call(arg,2));
				});
			} else
				$.error('Method bind of jQuery.triggerPath requires a string path and a function handler');
		},
		// Removes binding
		unbindPath: function() {
			return this.each(function() {
				$.triggerPath.unbind(this);
			});
		}
	});

	$.extend({
		triggerPath: {
			obj: null,

			dataKey: 'jQuery.triggerPath',
			
			bindedElements: [],

			unique_seed: 0, // for unique number for bindPath win no DOM object
			
			debug: function(enable) {
				DEBUG = enable;
			},

			// converts .a[b].c["d"]['e'].f.h into a.b.c.d.e.f.h
			dotPath: function(str) {
				return str.replace(/\[([^\[\]]+)\]/g, ".$1").replace(/("|')/g, '').replace(/^\.(.*)/, "$1"); // " // - just for joe editor to work properly with syntax hilight
			},

			// converts . -> \. and * -> [^\.]*
			dotPathToRegExp: function(str) {
				return str.replace(/\./g, "\\.").replace(/\*/g, "[^\\.]*");
			},

			// Bind an elemet to a path and execute function upon update of path
			bind: function(element, paths, fn, doEvaluate, args) {
				var dotPaths = [];
				var paths_arr = paths.split(',')
				for (var path_index in paths_arr) {
					var path = paths_arr[path_index];
					dotPaths.push({
						path: this.dotPath(path),
						regExp: this.dotPathToRegExp(this.dotPath(path)),
						isRegExp: (path.search('\\*') != -1 || path.search('\\|') != -1)
					});
					if (DEBUG) console.log("**bind " + path + ":", args);
				};
				$(element).data(this.dataKey, { paths: dotPaths, fn: fn, args: args });

				// Remove previous binds for this element
				var toRemove = [];
				for (var i in this.bindedElements)
				        if (this.bindedElements[i] == element)
                                                toRemove.push(i);
                                var j = 0;
                                for (var ii in toRemove) {
					var i = toRemove[ii];
                                        if (this.bindedElements.splice(i-j, 1) != []) // remove element from array
                                                j++; // shift indices if removed
				}

				this.bindedElements.push(element);
				if (doEvaluate) {
					var args_ext = $.extend(true, [], args);
					args_ext.unshift(this.descendObj(this.obj, dotPaths), (dotPaths.length > 1) ? paths : dotPaths[0].path);
					fn.apply(element, args_ext);
				}
			},

			// Unbind a binding
			unbind: function(element) {
				$(element).removeData(this.dataKey);
			},
			
			// return obj[a][b][c]...
			// if paths contains more than one path or all of them are reg exp, null will be returned
			descendObj: function(dobj, paths) {
				if (dobj === null)
					return null;
				if (typeof(paths) == "object") {
					if (paths.length > 1 || paths.length == 0)
						return null;
				} else
					paths = [{path: paths}];
				for (var path_index in paths) {
					var path = paths[path_index];
					var dobj_ = dobj;
					var pe_arr = path.path.split('.');
					for (var pe in pe_arr) {
						dobj_ = dobj_[pe_arr[pe]];
						if (dobj_ === undefined) {
							break;
						}
					}
					if (dobj_ !== undefined)
						return dobj_;
				};
				return null;
			},
			
			// Updates all elemets that are bound to a path. Search in context or in the whole tree
			update: function(path, context) {
				if (!this.obj) return;
				
				if (DEBUG) console.log("**chg " + path); // very slow
				if (typeof(path) === 'string') {
					var dotPath = this.dotPath(path);
					var dobj = this.descendObj(this.obj, dotPath);
					var toRemove = [];
					for (var i in this.bindedElements) {
						var el = this.bindedElements[i];
						var el_data = $(el).data(this.dataKey);
						if (el_data) {
							for (var el_path_index in el_data.paths) {
								var el_path = el_data.paths[el_path_index];
								if ((el_path.isRegExp && (new RegExp('^(' + el_path.regExp + ')$')).test(dotPath)) || (!el_path.isRegExp && el_path.path === dotPath)) {
									var args_ext = $.extend(true, [], el_data.args);
									args_ext.unshift(dobj, path); // we pass as parameters path with custom argument list
									if (DEBUG) console.log("**upd " + el_path.path + ":", el_data.args, el);
									try {
										el_data.fn.apply(el, args_ext);
									} catch (err) {
										console.log("exception in triggerPath event: " + err);
									}
								}
							}	
						} else {
						        toRemove.push(i);
						};
					};

					var j = 0;
					for (var ii in toRemove) {
						var i = toRemove[ii];
						var el = this.bindedElements[i];
						if (!$(el).data(this.dataKey)) // check that element has still no data
							if (this.bindedElements.splice(i-j, 1) != []) // remove element from array
								j++; // shift indices if removed
					}
				} else
					$.error('Method update of jQuery.triggerPath requires a path');
			},
			
			init: function(obj) {
				this.obj = obj;	
			},

			bindPathNoEval: function(path, fn /* arg1, arg2,.. */) {
				if (typeof(path) === 'string' && (typeof(fn) === 'function' || typeof(fn) === 'undefined' || fn === null)) {
					if (typeof(fn) !== 'function')
						fn = null;
					var args = arguments;
					$.triggerPath.bind($('<triggerpath id="' + (++this.unique_seed) + '"></triggerpath>').hide().appendTo('body').get(0), path, fn, false, Array.prototype.slice.call(args,2));
				} else
					$.error('Method bind of jQuery.triggerPath requires a string path and a function handler');
			}
		}
	});
})(jQuery);


/*
 *   jQuery selector extension by James Padolsey
 *   See http://james.padolsey.com/javascript/extending-jquerys-selector-capabilities/
 *   Probably non-GPL code
*/

// Wrap in self-invoking anonymous function:
(function($) {
 
	// Extend jQuery's native ':'
	$.extend($.expr[':'],{
 
		// New method, "data"
		data: function(a,i,m) {
 
			var e = $(a).get(0), keyVal;
 
			// m[3] refers to value inside parenthesis (if existing) e.g. :data(___)
			if(!m[3]) {
 
				// Loop through properties of element object, find any jquery references:
				for (var x in e) { if((/jQuery\d+/).test(x)) { return true; } }
 
			} else {
 
				// Split into array (name,value):
				keyVal = m[3].split('=');
 
				// If a value is specified:
				if (keyVal[1]) {
 
					// Test for regex syntax and test against it:
					if((/^\/.+\/([mig]+)?$/).test(keyVal[1])) {
						return (new RegExp(
							 keyVal[1].substr(1,keyVal[1].lastIndexOf('/')-1),
							 keyVal[1].substr(keyVal[1].lastIndexOf('/')+1))
						  ).test($(a).data(keyVal[0]));
					} else {
						// Test key against value:
						return $(a).data(keyVal[0]) == keyVal[1];
					}
 
				} else {
 
					// Test if element has data property:
					if($(a).data(keyVal[0])) {
						return true;
					} else {
						// If it doesn't remove data (this is to account for what seems
						// to be a bug in jQuery):
						$(a).removeData(keyVal[0]);
						return false;
					}
 
				}
			}
 
			// Strict compliance:
			return false;
 
		}
 
	});
})(jQuery);
