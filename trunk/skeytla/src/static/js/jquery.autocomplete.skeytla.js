/*
 * jQuery Autocomplete plugin 1.1
 *
 * Copyright (c) 2009 Jörn Zaefferer
 *
 * Dual licensed under the MIT and GPL licenses:
 *   http://www.opensource.org/licenses/mit-license.php
 *   http://www.gnu.org/licenses/gpl.html
 *
 * Revision: $Id: jquery.autocomplete.js 15 2009-08-22 10:30:27Z joern.zaefferer $
 * 
 * Modifications to the original version 1.1 from http://bassistance.de/jquery-plugins/jquery-plugin-autocomplete/
 * by Björn Þór Jónsson - bangsi@bthj.is
 */

;(function($) {
	
$.fn.extend({
	autocomplete: function(urlOrData, options) {
		var isUrl = typeof urlOrData == "string";
		options = $.extend({}, $.Autocompleter.defaults, {
			url: isUrl ? urlOrData : null,
			data: isUrl ? null : urlOrData,
			delay: isUrl ? $.Autocompleter.defaults.delay : 10,
			max: options && !options.scroll ? 10 : 150
		}, options);
		
		// if highlight is set to false, replace it with a do-nothing function
		options.highlight = options.highlight || function(value) { return value; };
		
		// if the formatMatch option is not specified, then use formatItem for backwards compatibility
		options.formatMatch = options.formatMatch || options.formatItem;
		
		return this.each(function() {
			new $.Autocompleter(this, options);
		});
	},
	result: function(handler) {
		return this.bind("result", handler);
	},
	search: function(handler) {
		return this.trigger("search", [handler]);
	},
	flushCache: function() {
		return this.trigger("flushCache");
	},
	setOptions: function(options){
		return this.trigger("setOptions", [options]);
	},
	unautocomplete: function() {
		return this.trigger("unautocomplete");
	}
});

$.Autocompleter = function(input, options) {

	var KEY = {
		UP: 38,
		DOWN: 40,
		DEL: 46,
		TAB: 9,
		RETURN: 13,
		ESC: 27,
		COMMA: 188,
		PAGEUP: 33,
		PAGEDOWN: 34,
		BACKSPACE: 8
	};

	// Create $ object for input element
	var $input = $(input).attr("autocomplete", "off").addClass(options.inputClass);

	var timeout;
	var previousValue = "";
	var cache = $.Autocompleter.Cache(options);
	var hasFocus = 0;
	var lastKeyPressCode;
	var config = {
		mouseDownOnSelect: false
	};
	var select = $.Autocompleter.Select(options, input, selectCurrent, config);
	
	var blockSubmit;

	
	// prevent form submit in opera when selecting with return key
	$.browser.opera && $(input.form).bind("submit.autocomplete", function() {
		if (blockSubmit) {
			blockSubmit = false;
			return false;
		}
	});
	
	$input.keyup( function(){
		clearTimeout(timeout);
		timeout = setTimeout(onChange, options.delay);
	});
	
	// only opera doesn't trigger keydown multiple times while pressed, others don't work with keypress at all
	$input.bind(($.browser.opera ? "keypress" : "keydown") + ".autocomplete", function(event) {
		// a keypress means the input has focus
		// avoids issue where input had focus before the autocomplete was applied
		hasFocus = 1;
		// track last key pressed
		lastKeyPressCode = event.keyCode;
		switch(event.keyCode) {
		
			case KEY.UP:
				if ( select.visible() ) {
					event.preventDefault();
					select.prev();
				} else {
					onChange(0, true);
				}
				break;
				
			case KEY.DOWN:
				if ( select.visible() ) {
					event.preventDefault();
					select.next();
				} else {
					onChange(0, true);
				}
				break;
				
			case KEY.PAGEUP:
				event.preventDefault();
				if ( select.visible() ) {
					select.pageUp();
				} else {
					onChange(0, true);
				}
				break;
				
			case KEY.PAGEDOWN:
				event.preventDefault();
				if ( select.visible() ) {
					select.pageDown();
				} else {
					onChange(0, true);
				}
				break;
			
			// matches also semicolon
			case options.multiple && $.trim(options.multipleSeparator) == "," && KEY.COMMA:
			case KEY.TAB:
			case KEY.RETURN:
				if( selectCurrent() ) {
					// stop default to prevent a form submit, Opera needs special handling
					event.preventDefault();
					blockSubmit = true;
					return false;
				}
				break;
				
			case KEY.ESC:
				select.hide();
				break;
		}
	}).focus(function(){
		// track whether the field has focus, we shouldn't process any
		// results if the field no longer has focus
		hasFocus++;
	}).blur(function() {
		hasFocus = 0;
		if (!config.mouseDownOnSelect) {
			hideResults();
		}
	}).click(function() {
		// show select when clicking in a focused field
		if ( hasFocus++ > 1 && !select.visible() ) {
			onChange(0, true);
		}
	}).bind("search", function() {
		// TODO why not just specifying both arguments?
		var fn = (arguments.length > 1) ? arguments[1] : null;
		function findValueCallback(q, data) {
			var result;
			if( data && data.length ) {
				for (var i=0; i < data.length; i++) {
					if( data[i].result.toLowerCase() == q.toLowerCase() ) {
						result = data[i];
						break;
					}
				}
			}
			if( typeof fn == "function" ) fn(result);
			else $input.trigger("result", result && [result.data, result.value]);
		}
		$.each(trimWords($input.val()), function(i, value) {
			request(value, findValueCallback, findValueCallback); // TODO bthj: when is this called?  ever?
		});
	}).bind("flushCache", function() {
		cache.flush();
	}).bind("setOptions", function() {
		$.extend(options, arguments[1]);
		// if we've updated the data, repopulate
		if ( "data" in arguments[1] )
			cache.populate();
	}).bind("unautocomplete", function() {
		select.unbind();
		$input.unbind();
		$(input.form).unbind(".autocomplete");
	});
	
	
	function selectCurrent() {
		var selected = select.selected();
		if( !selected )
			return false;
		
		var v = selected.result;
		previousValue = v;
		
		if( options.skeytla ) {
			var currentText = $input.val();
			if( skeytlaMatchAtCursor ) {
				var scrollTop = $input.scrollTop();
				var scrollLeft = $input.scrollLeft();
				var beforeMatch = currentText.substring( 0, skeytlaMatchAtCursor.startIndex );
				var afterMatch = currentText.substring( skeytlaMatchAtCursor.endIndex );
				var caretPosition = beforeMatch.length + v.length;  // set cursor at the end of newly inserted word
				v = beforeMatch + v + afterMatch;
				skeytlaMatchAtCursor = null;
			} else { // TODO test: should not happen?
				v = currentText;
			}
		} else if ( options.multiple ) {
			var words = trimWords($input.val());
			if ( words.length > 1 ) {
				var seperator = options.multipleSeparator.length;
				var cursorAt = $(input).selection().start;
				var wordAt, progress = 0;
				$.each(words, function(i, word) {
					progress += word.length;
					if (cursorAt <= progress) {
						wordAt = i;
						return false;
					}
					progress += seperator;
				});
				words[wordAt] = v;
				// TODO this should set the cursor to the right position, but it gets overriden somewhere
				//$.Autocompleter.Selection(input, progress + seperator, progress + seperator);
				v = words.join( options.multipleSeparator );
			}
			v += options.multipleSeparator;
		}
		
		$input.val(v);
		if( caretPosition ) {
			$(input).caret(caretPosition, caretPosition);   //jCaret plugin: http://cloudgen.w0ng.hk/jquery/caret.php
			$input.scrollTop( scrollTop );
			$input.scrollLeft( scrollLeft );
		}
		hideResultsNow();
		$input.trigger("result", [selected.data, selected.value]);
		return true;
	}
	
	function onChange(crap, skipPrevCheck) {

		if( lastKeyPressCode == KEY.DEL ) {
			select.hide();
			return;
		}
		
		var currentValue = $input.val();
		
		if ( !skipPrevCheck && currentValue == previousValue )
			return;
		
		previousValue = currentValue;
		
		if( options.skeytla ) {
			var doSearch = false;
			var searchValues = getSkeytlaSearchValues( currentValue );
			if( searchValues !== null ) {
				if( searchValues.beginSearchWord !== null 
						/* && searchValues.beginSearchWord >= options.minChars */ ) {
					doSearch = true;
					if( !options.matchCase ) searchValues.beginSearchWord = searchValues.beginSearchWord.toLowerCase();
				}
				if( searchValues.endSearchWord !== null 
						/* && searchValues.endSearchWord >= options.minChars */ ) {
					doSearch = true;
					if( !options.matchCase ) searchValues.endSearchWord = searchValues.endSearchWord.toLowerCase();
				}
			}
			if( doSearch ) {
				$input.addClass(options.loadingClass);
				request(searchValues, receiveData, hideResultsNow);
			} else {
				stopLoading();
				select.hide();
			}			
		} else {
			currentValue = lastWord(currentValue);
			if ( currentValue.length >= options.minChars) {
				$input.addClass(options.loadingClass);
				if (!options.matchCase)
					currentValue = currentValue.toLowerCase();
				request(currentValue, receiveData, hideResultsNow);
			} else {
				stopLoading();
				select.hide();
			}	
		}
	};
	
	var reSkeytlaMatch = /^@.*$|^.*@$/;
	var reSkeytlaMatchBeginning = /^@[^@]*$/;
	var reSkeytlaMatchEnding = /^[^@]*@$/;
	var skeytlaMatchAtCursor = null;
	function getSkeytlaSearchValues( text ) {
		var searchValues = null;
		var words = trimWords(text);
		$.each( words, function() {
			if( isSkeytlaMatchWord(this) ) {
				skeytlaMatchAtCursor = getSkeytlaMatchAtCursor( text, this );
				if( skeytlaMatchAtCursor !== null ) {
					searchValues = getSkeytlaSearchValuesFromMatch( this, skeytlaMatchAtCursor );	
				}
			}
		});
		return searchValues;
	}
	
	function isSkeytlaMatchWord( value ) {
		var isSkeytla = false;
		if( value.length > 1 ) {
			isSkeytla = value.match( reSkeytlaMatch ) ? true : false; // like @qwer, poiuy@, @sssd@qfadf@ or @sssdqfadf@
		}
		return isSkeytla;
	}
	
	function getSkeytlaMatchAtCursor( text, word ) {
		var skeytlaMatch = null;		
		var cursorAt = $(input).selection().start;
		//var cursorAt = $(input).caret().end;
		if( $.browser.msie ) {
			cursorAt = adjustCaretPositionForMsie( cursorAt );
			//the $(input).selection().start call above moves the cursor in a 
			//non-ie-multiline-friendly way, so here a quick hack that may be done more robustly; 
			//this seems OK for a few lines but fails with longer texts in everyone's favorite browser
			$(input).selection(cursorAt, cursorAt); 
		}
		var startIndex = -1;
		do {
			startIndex = text.indexOf( word, startIndex + 1 );
			var endIndex = startIndex + word.length;
			if( startIndex > -1 && startIndex < cursorAt && cursorAt <= endIndex ) {
				skeytlaMatch = { startIndex: startIndex, endIndex: endIndex };
			}
		} while( skeytlaMatch === null && startIndex > -1 );
		return skeytlaMatch;
	}
	
	function adjustCaretPositionForMsie( caretPos ) { // as seen in a comment at http://weblogs.asp.net/skillet/archive/2005/03/24/395838.aspx#523214
		var lineBreakCount = 0;
		var lineBreaks = $(input).val().match(/\n/g);
		if( lineBreaks != null ) lineBreakCount = lineBreaks.length;
		return caretPos - lineBreakCount;
	}
	
	function getSkeytlaSearchValuesFromMatch( word, boundaries ) {
		var beginSearchWord = "";
		var endSearchWord = "";
		if( word.match( reSkeytlaMatchBeginning ) ) { // like @asdflkj
			beginSearchWord = word.substring( 1, word.length );
		} else if( word.match( reSkeytlaMatchEnding ) ) { // like sssdfadf@
			endSearchWord = word.substring( 0, word.length - 1 );
			// it may be useful to move the cursor to the start of match and it may just be an annoyance:
			// $(input).caret( boundaries.startIndex, boundaries.startIndex );
		} else { // @sssd@qfadf@ - or @sssdqfadf@ in which case it's treated as a beginSearch
			$.each( word.split("@"), function() {
				if( this.length > 0 ) {
					if( !beginSearchWord ) {
						beginSearchWord = this;
					} else {
						endSearchWord = this;
					}
				}
			});
		}
		return { beginSearchWord: beginSearchWord, endSearchWord: endSearchWord };
	}
	
	
	function trimWords(value) {
		if (!value)
			return [""];
		if (!options.multiple && !options.skeytla)
			return [$.trim(value)];
		return $.map(value.split(options.multipleSeparator), function(word) {
			return $.trim(value).length ? $.trim(word) : null;
		});
	}
	
	function lastWord(value) {
		if ( !options.multiple )
			return value;
		var words = trimWords(value);
		if (words.length == 1) 
			return words[0];
		var cursorAt = $(input).selection().start;
		if (cursorAt == value.length) {
			words = trimWords(value);
		} else {
			words = trimWords(value.replace(value.substring(cursorAt), ""));
		}
		return words[words.length - 1];
	}
	
	// fills in the input box w/the first match (assumed to be the best match)
	// q: the term entered
	// sValue: the first matching result
	function autoFill(q, sValue){
		// autofill in the complete box w/the first match as long as the user hasn't entered in more data
		// if the last user key pressed was backspace, don't autofill
		if( options.autoFill && (lastWord($input.val()).toLowerCase() == q.toLowerCase()) && lastKeyPressCode != KEY.BACKSPACE ) {
			// fill in the value (keep the case the user has typed)
			$input.val($input.val() + sValue.substring(lastWord(previousValue).length));
			// select the portion of the value not typed by the user (so the next character will erase)
			$(input).selection(previousValue.length, previousValue.length + sValue.length);
		}
	};

	function hideResults() {
		clearTimeout(timeout);
		timeout = setTimeout(hideResultsNow, 200);
	};

	function hideResultsNow() {
		var wasVisible = select.visible();
		select.hide();
		clearTimeout(timeout);
		stopLoading();
		if (options.mustMatch) {
			// call search and run callback
			$input.search(
				function (result){
					// if no value found, clear the input box
					if( !result ) {
						if (options.multiple) {
							var words = trimWords($input.val()).slice(0, -1);
							$input.val( words.join(options.multipleSeparator) + (words.length ? options.multipleSeparator : "") );
						}
						else {
							$input.val( "" );
							$input.trigger("result", null);
						}
					}
				}
			);
		}
	};

	function receiveData(q, data) {
		if ( data && data.length && hasFocus ) {
			stopLoading();
			select.display(data, q);
			autoFill(q, data[0].value);
			select.show();
		} else {
			hideResultsNow();
		}
	};

	function request(term, success, failure) {
		if( options.skeytla ) {
			var termKey = term.beginSearchWord + ";" + term.endSearchWord;
		} else {
			var termKey = term;
		}
		var data = cache.load( termKey );
		// recieve the cached data
		if (data && data.length) {
			success(term, data);
		// if an AJAX url has been supplied, try loading the data now
		} else if( (typeof options.url == "string") && (options.url.length > 0) ){
			
			var extraParams = {
				timestamp: +new Date()
			};
			$.each(options.extraParams, function(key, param) {
				extraParams[key] = typeof param == "function" ? param() : param;
			});
			
			if( options.skeytla ) {
				var searchParams = { u: term.beginSearchWord, e: term.endSearchWord };
			} else {
				var searchParams = { q: lastWord(term) };
			}
			
			$.ajax({
				// try to leverage ajaxQueue plugin to abort previous requests
				mode: "abort",
				// limit abortion to this input
				port: "autocomplete" + input.name,
				dataType: options.dataType,
				url: options.url,
				data: $.extend({
					limit: options.max
				}, searchParams, extraParams),
				success: function(data) {
					var parsed = options.parse && options.parse(data) || parse(data);
					cache.add(termKey, parsed);
					success(term, parsed);
				}
			});
		} else {
			// if we have a failure, we need to empty the list -- this prevents the the [TAB] key from selecting the last successful match
			select.emptyList();
			failure(term);
		}
	};
	
	function parse(data) {
		var parsed = [];
		var rows = data.split("\n");
		for (var i=0; i < rows.length; i++) {
			var row = $.trim(rows[i]);
			if (row) {
				row = row.split("|");
				parsed[parsed.length] = {
					data: row,
					value: row[0],
					result: options.formatResult && options.formatResult(row, row[0]) || row[0]
				};
			}
		}
		return parsed;
	};

	function stopLoading() {
		$input.removeClass(options.loadingClass);
	};

};

$.Autocompleter.defaults = {
	inputClass: "ac_input",
	resultsClass: "ac_results",
	loadingClass: "ac_loading",
	minChars: 1,
	delay: 400,
	matchCase: false,
	matchSubset: true,
	matchContains: false,
	cacheLength: 10,
	max: 10,
	mustMatch: false,
	extraParams: {},
	selectFirst: true,
	formatItem: function(row) { return row[0]; },
	formatMatch: null,
	autoFill: false,
	width: 0,
	multiple: false,
	multipleSeparator: ", ",
	skeytla: false,
	skeytlaBubbleId: "#bubble",
	skeytlaBubbleContentsId: "#popup-contents",
	skeytlaBubbleMinHeight: 42,
	skeytlaStemUrl: "/stem",
	skeytlaBinIdUrlPrefix: "http://bin.arnastofnun.is/leit.php?id=",
	skeytlaAjaxSpinnerPath: "/static/img/ajax-loader.gif",
	highlight: function(value, term) {
		if( this.skeytla ) {
			if( term.beginSearchWord ) {
				value = value.replace(
						new RegExp("^(?![^&;]+;)(?!<[^<>]*)(" 
								+ term.beginSearchWord.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") 
								+ ")(?![^<>]*>)(?![^&;]+;)", "gi"), 
						"<strong>$1</strong>");
			}
			if( term.endSearchWord ) {
				value = value.replace(
						new RegExp("(?![^&;]+;)(?!<[^<>]*)(" 
								+ term.endSearchWord.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") 
								+ ")(?![^<>]*>)(?![^&;]+;)$", "gi"), 
						"<strong>$1</strong>");				
			}
			return value;
		} else {
			return value.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + term.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
		}
	},
    scroll: true,
    scrollHeight: 180
};

$.Autocompleter.Cache = function(options) {

	var data = {};
	var length = 0;
	
	function matchSubset(s, sub) {
		if (!options.matchCase) 
			s = s.toLowerCase();
		var i = s.indexOf(sub);
		if (options.matchContains == "word"){
			i = s.toLowerCase().search("\\b" + sub.toLowerCase());
		}
		if (i == -1) return false;
		return i == 0 || options.matchContains;
	};
	
	function add(q, value) {
		if (length > options.cacheLength){
			flush();
		}
		if (!data[q]){ 
			length++;
		}
		data[q] = value;
	}
	
	function populate(){
		if( !options.data ) return false;
		// track the matches
		var stMatchSets = {},
			nullData = 0;

		// no url was specified, we need to adjust the cache length to make sure it fits the local data store
		if( !options.url ) options.cacheLength = 1;
		
		// track all options for minChars = 0
		stMatchSets[""] = [];
		
		// loop through the array and create a lookup structure
		for ( var i = 0, ol = options.data.length; i < ol; i++ ) {
			var rawValue = options.data[i];
			// if rawValue is a string, make an array otherwise just reference the array
			rawValue = (typeof rawValue == "string") ? [rawValue] : rawValue;
			
			var value = options.formatMatch(rawValue, i+1, options.data.length);
			if ( value === false )
				continue;
				
			var firstChar = value.charAt(0).toLowerCase();
			// if no lookup array for this character exists, look it up now
			if( !stMatchSets[firstChar] ) 
				stMatchSets[firstChar] = [];

			// if the match is a string
			var row = {
				value: value,
				data: rawValue,
				result: options.formatResult && options.formatResult(rawValue) || value
			};
			
			// push the current match into the set list
			stMatchSets[firstChar].push(row);

			// keep track of minChars zero items
			if ( nullData++ < options.max ) {
				stMatchSets[""].push(row);
			}
		};

		// add the data items to the cache
		$.each(stMatchSets, function(i, value) {
			// increase the cache size
			options.cacheLength++;
			// add to the cache
			add(i, value);
		});
	}
	
	// populate any existing data
	setTimeout(populate, 25);
	
	function flush(){
		data = {};
		length = 0;
	}
	
	return {
		flush: flush,
		add: add,
		populate: populate,
		load: function(q) {
			if (!options.cacheLength || !length)
				return null;
			/* 
			 * if dealing w/local data and matchContains than we must make sure
			 * to loop through all the data collections looking for matches
			 */
			if( !options.url && options.matchContains ){
				// track all matches
				var csub = [];
				// loop through all the data grids for matches
				for( var k in data ){
					// don't search through the stMatchSets[""] (minChars: 0) cache
					// this prevents duplicates
					if( k.length > 0 ){
						var c = data[k];
						$.each(c, function(i, x) {
							// if we've got a match, add it to the array
							if (matchSubset(x.value, q)) {
								csub.push(x);
							}
						});
					}
				}				
				return csub;
			} else 
			// if the exact item exists, use it
			if (data[q]){
				return data[q];
			} else
			if (options.matchSubset) {
				for (var i = q.length - 1; i >= options.minChars; i--) {
					var c = data[q.substr(0, i)];
					if (c) {
						var csub = [];
						$.each(c, function(i, x) {
							if (matchSubset(x.value, q)) {
								csub[csub.length] = x;
							}
						});
						return csub;
					}
				}
			}
			return null;
		}
	};
};

$.Autocompleter.Select = function (options, input, select, config) {
	var CLASSES = {
		ACTIVE: "ac_over"
	};
	
	var listItems,
		active = -1,
		data,
		term = "",
		needsInit = true,
		element,
		list;
	
	if( options.skeytla ) {
		var stemBubble = $.Autocompleter.StemInfoBubble( options, this );
	}
	
	// Create results
	function init() {
		if (!needsInit)
			return;
		element = $("<div/>")
		.hide()
		.addClass(options.resultsClass)
		.css("position", "absolute")
		.appendTo(document.body);
	
		list = $("<ul/>").appendTo(element).mouseover( function(event) {
			if(target(event).nodeName && target(event).nodeName.toUpperCase() == 'LI') {
	            active = $("li", list).removeClass(CLASSES.ACTIVE).index(target(event));
			    $(target(event)).addClass(CLASSES.ACTIVE);
			    if( options.skeytla && isVisible() ) {
			    	stemBubble.showStems( getCurrent() );
	            }
	        }
		}).click(function(event) {
			$(target(event)).addClass(CLASSES.ACTIVE);
			select();
			// TODO provide option to avoid setting focus again after selection? useful for cleanup-on-focus
			input.focus();
			return false;
		}).mousedown(function() {
			config.mouseDownOnSelect = true;
		}).mouseup(function() {
			config.mouseDownOnSelect = false;
		});
		
		if( options.width > 0 )
			element.css("width", options.width);
			
		needsInit = false;
	} 
	
	function target(event) {
		var element = event.target;
		while(element && element.tagName != "LI")
			element = element.parentNode;
		// more fun with IE, sometimes event.target is empty, just ignore it then
		if(!element)
			return [];
		return element;
	}

	function moveSelect(step) {
		listItems.slice(active, active + 1).removeClass(CLASSES.ACTIVE);
		movePosition(step);
        var activeItem = listItems.slice(active, active + 1).addClass(CLASSES.ACTIVE);
        if(options.scroll) {
            var offset = 0;
            listItems.slice(0, active).each(function() {
				offset += this.offsetHeight;
			});
            if((offset + activeItem[0].offsetHeight - list.scrollTop()) > list[0].clientHeight) {
                list.scrollTop(offset + activeItem[0].offsetHeight - list.innerHeight());
            } else if(offset < list.scrollTop()) {
                list.scrollTop(offset);
            }
        }
        if( options.skeytla && isVisible() ) {
        	stemBubble.showStems( getCurrent() );
        }
	};
	
	function movePosition(step) {
		active += step;
		if (active < 0) {
			active = listItems.size() - 1;
		} else if (active >= listItems.size()) {
			active = 0;
		}
	}
	
	function limitNumberOfItems(available) {
		return options.max && options.max < available
			? options.max
			: available;
	}
	
	function fillList() {
		list.empty();
		var max = limitNumberOfItems(data.length);
		for (var i=0; i < max; i++) {
			if (!data[i])
				continue;
			var formatted = options.formatItem(data[i].data, i+1, max, data[i].value, term);
			if ( formatted === false )
				continue;
			var li = $("<li/>").html( options.highlight(formatted, term) ).addClass(i%2 == 0 ? "ac_even" : "ac_odd").appendTo(list)[0];
			$.data(li, "ac_data", data[i]);
		}
		listItems = list.find("li");
		if ( options.selectFirst ) {
			listItems.slice(0, 1).addClass(CLASSES.ACTIVE);
			active = 0;
		}
		// apply bgiframe if available
		if ( $.fn.bgiframe )
			list.bgiframe();
	}
	
	function getCurrent() {
		return isVisible() && (listItems.filter("." + CLASSES.ACTIVE)[0] || options.selectFirst && listItems[0]);
	}
	
	function isVisible() {
		return element && element.is(":visible");		
	}
	
	return {
		display: function(d, q) {
			init();
			data = d;
			term = q;
			fillList();
		},
		next: function() {
			moveSelect(1);
		},
		prev: function() {
			moveSelect(-1);
		},
		pageUp: function() {
			if (active != 0 && active - 8 < 0) {
				moveSelect( -active );
			} else {
				moveSelect(-8);
			}
		},
		pageDown: function() {
			if (active != listItems.size() - 1 && active + 8 > listItems.size()) {
				moveSelect( listItems.size() - 1 - active );
			} else {
				moveSelect(8);
			}
		},
		hide: function() {
			element && element.hide();
			listItems && listItems.removeClass(CLASSES.ACTIVE);
			active = -1;
			if( options.skeytla ) {
				stemBubble.hideStems();
			}
		},
		visible : function() {
			return isVisible();
		},
		current: function() {
			return getCurrent();
		},
		show: function() {
			var offset = $(input).offset();
			element.css({
				width: typeof options.width == "string" || options.width > 0 ? options.width : $(input).width(),
				top: offset.top + input.offsetHeight,
				left: offset.left
			}).show();
            if(options.scroll) {
                list.scrollTop(0);
                list.css({
					maxHeight: options.scrollHeight,
					overflow: 'auto'
				});
				
                if($.browser.msie && typeof document.body.style.maxHeight === "undefined") {
					var listHeight = 0;
					listItems.each(function() {
						listHeight += this.offsetHeight;
					});
					var scrollbarsVisible = listHeight > options.scrollHeight;
                    list.css('height', scrollbarsVisible ? options.scrollHeight : listHeight );
					if (!scrollbarsVisible) {
						// IE doesn't recalculate width when scrollbar disappears
						listItems.width( list.width() - parseInt(listItems.css("padding-left")) - parseInt(listItems.css("padding-right")) );
					}
                }
                
            }
            if( options.skeytla ) {
            	stemBubble.showStems( getCurrent() );
            }
		},
		selected: function() {
			var selected = listItems && listItems.filter("." + CLASSES.ACTIVE).removeClass(CLASSES.ACTIVE);
			return selected && selected.length && $.data(selected[0], "ac_data");
		},
		emptyList: function (){
			list && list.empty();
		},
		unbind: function() {
			element && element.remove();
		}
	};
};

$.Autocompleter.StemInfoBubble = function( options, mySelect ) {
	
	var stemTimeout;
	var stemCache = $.Autocompleter.Cache( $.extend(options, {matchSubset: false}) );
	var currrentConjElem;
	var visible = false;
	var bubble = $( options.skeytlaBubbleId );
	var bubbleContents = $( options.skeytlaBubbleContentsId );
	var ajaxSpinner = $("<img/>").attr("src", options.skeytlaAjaxSpinnerPath);
	
	function showStemsFromConjugation() {
		clearTimeout(stemTimeout);
		stemTimeout = setTimeout(getStemsFromConjugation, options.delay);
	}
	function getStemsFromConjugation() {
		var conjugation = currrentConjElem.text();
		if( conjugation !== undefined ) {
			bubbleContents.fadeOut("fast").empty();
			var json = stemCache.load( conjugation );
			if( json && json.length ) {
				renderDataToBubble( json );
				placeBubbleAtCurrent();
			} else {
				//bubbleContents.empty();
				//bubbleContents.append( ajaxSpinner );
				$.getJSON(
						options.skeytlaStemUrl, 
						{ b: conjugation, timestamp: +new Date() }, 
						function(json){
							stemCache.add( conjugation, json );
							renderDataToBubble( json );
							placeBubbleAtCurrent();
						}
				);
			}
		}
	}
	
	function renderDataToBubble( json ) {
		bubbleContents.append( "<ul>" );
		$.each( json, function(i, item) {
			bubbleContents.append( 
				"<li><strong><a href='" + options.skeytlaBinIdUrlPrefix + item.id +"' target='_blank'>"
				+ item.uppflettiord +"</a></strong> - " 
				+ getOrdflokkurExpanded(item.ordflokkur) + "</li>" );
		});
		bubbleContents.append( "</ul>" );
		bubbleContents.fadeIn("fast");
	}
	
	function getOrdflokkurExpanded( ordflokkur ) {
		switch( ordflokkur ) {
		case "kvk":
			return "Kvenkynsnafnorð";
		case "kk":
			return "Karlkynsnafnorð";
		case "hk":
			return "Hvorugkynsnafnorð";
		case "so":
			return "Sagnorð";
		case "lo":
			return "Lýsingarorð";
		case "ao":
			return "Atviksorð";
		case "fn":
			return "Fornafn";
		default:
			return ordflokkur;
		}
	}
	
	function placeBubbleAtCurrent() {
		var extraHeightDelta = (bubble.height()/2) - 10;
		bubble.animate({
			left:currrentConjElem.offset().left + currrentConjElem.width() + 35,
			top:currrentConjElem.offset().top - extraHeightDelta 
		}, "linear", function() {
			if( !visible ) {
				bubble.fadeIn("fast");
				visible = true;
			}
		});
	}
	
	function hideStemsFromConjugation() {
		clearTimeout(stemTimeout);
		bubble.hide();
		bubble.css('display', 'none');
		visible = false;
		clearTimeout(stemTimeout); // double tap!
	}
	
	return {
		showStems: function( current ) {
			currrentConjElem = $( current );
			showStemsFromConjugation();
		},
		hideStems: function() {
			hideStemsFromConjugation();
		}
	};
};

$.fn.selection = function(start, end) {
	if (start !== undefined) {
		return this.each(function() {
			if( this.createTextRange ){
				var selRange = this.createTextRange();
				if (end === undefined || start == end) {
					selRange.move("character", start);
					selRange.select();
				} else {
					selRange.collapse(true);
					selRange.moveStart("character", start);
					selRange.moveEnd("character", end);
					selRange.select();
				}
			} else if( this.setSelectionRange ){
				this.setSelectionRange(start, end);
			} else if( this.selectionStart ){
				this.selectionStart = start;
				this.selectionEnd = end;
			}
		});
	}
	var field = this[0];
	if ( field.createTextRange ) {
		var range = document.selection.createRange(),
			orig = field.value,
			teststring = "<->",
			textLength = range.text.length;
		range.text = teststring;
		var caretAt = field.value.indexOf(teststring);
		field.value = orig;
		this.selection(caretAt, caretAt + textLength);
		return {
			start: caretAt,
			end: caretAt + textLength
		}
	} else if( field.selectionStart !== undefined ){
		return {
			start: field.selectionStart,
			end: field.selectionEnd
		}
	}
};

})(jQuery);
