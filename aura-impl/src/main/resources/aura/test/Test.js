/*
 * Copyright (C) 2013 salesforce.com, inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/*jslint evil:true, sub:true */

var Test = function(){
    //#include aura.test.Test_private

    /**
     * Utility functions for component testing, accessible using $A.test.
     * @constructor
     */
    var Test = {
        /**
         * Asynchronously wait for a condition before continuing with the next
         * stage of the test case.  The wait condition is checked after the
         * current test stage is completed but before the next stage is started.
         *
         * @description <p>Example:</p>
         * <code>aura.test.addWaitFor("i was updated", function(){<br/>
         *   return element.textContent;}, function(){alert("the wait is over"});</code>
         *
         * @param {Object} expected
         *             The value to compare against. If expected is a function,
         *             it will evaluate it before comparison.
         * @param {Object} testFunction
         *             A function to evaluate and compare against expected.
         * @param {Function} callback
         *             Invoked after the comparison evaluates to true
         */
        addWaitFor : function(expected, testFunction, callback){
        	aura.test.addWaitForWithFailureMessage(expected, testFunction, null, callback);
        },

        /**
         * Asynchronously wait for an action to complete before continuing with the next
         * stage of the test case.  The wait condition is checked after the
         * current test stage is completed but before the next stage is started.
         *
         * @description <p>Example:</p>
         * <code>aura.test.addWaitForAction(true, "myActionName", function() {alert("My Action Completed");});</code>
         *
         * @param {Object} success true if the action should succeed.
         * @param {Object} actionName the name of the action from createAction or markForCompletion
         * @param {Function} callback Invoked after the action completes
         */
        addWaitForAction : function(success, actionName, callback) {
            var theAction = actionName;

            if ($A.util.isUndefinedOrNull(priv.completed[theAction])) {
                aura.test.fail("Unregistered name "+theAction);
            }
            aura.test.addWaitForWithFailureMessage(true,  function() {
                    if (aura.test.isActionComplete(theAction)) {
                        if (aura.test.isActionSuccessfullyComplete(theAction) !== success) {
                            aura.test.fail("Action "+theAction+" did not complete with success = "+success);
                        }
                        return true;
                    }
                    return false;
                }, null, callback);
        },
        
        /**
         * Asynchronously wait for a condition before continuing with the next
         * stage of the test case.  The wait condition is checked after the
         * current test stage is completed but before the next stage is started.
         *
         * @description <p>Example:</p>
         * <code>aura.test.addWaitForWithFailureMessage("i was updated", function(){<br/>
         *   return element.textContent;},"Failure Message", function(){alert("the wait is over"});</code>
         *
         * @param {Object} expected
         *             The value to compare against. If expected is a function,
         *             it will evaluate it before comparison.
         * @param {Object} testFunction
         *             A function to evaluate and compare against expected.
         * @param {String} failureMessage
         *			The message that is returned if the condition is not true
         * @param {Function} callback
         *             Invoked after the comparison evaluates to true
         */
        addWaitForWithFailureMessage : function(expected, testFunction, failureMessage, callback){
            if (!$A.util.isFunction(testFunction)) {
                throw new Error("addWaitFor expects a function to evaluate for comparison, but got: " + testFunction);
            }
            if (callback && !$A.util.isFunction(callback)) {
                throw new Error("addWaitFor expects a function for callback, but got: " + callback);
            }
            priv.waits.push({ expected:expected, actual:testFunction, callback:callback , failureMessage:failureMessage});
        },

        /**
         * Block requests from being sent to the server.
         *
         * This routine can be used to artificially force actions to be held on the client to be sent to
         * the server at a later date. It can be used to simulate delays in processing (or rapid action
         * queueing on the client).
         */
        blockRequests : function () {
            $A.clientService["priv"].foreground.inFlight += $A.clientService["priv"].foreground.max;
            $A.clientService["priv"].background.inFlight += $A.clientService["priv"].background.max;
        },

        /**
         * Release requests to be sent to the server.
         *
         * This must be called after blockRequests, otherwise it may result in unknown consequences.
         */
        releaseRequests : function () {
            $A.run(function() {
                    $A.clientService["priv"].foreground.inFlight -= $A.clientService["priv"].foreground.max;
                    $A.clientService["priv"].background.inFlight -= $A.clientService["priv"].background.max;
                });
        },

        /**
         * Get total count of foreground and background requests sent to the server.
         * 
         * This routine can be used to get a before and after count on server requests to attempt to verify
         * we are only sending the necessary amount of requests.
         */
        getSentRequestCount : function () {
            return $A.clientService["priv"].foreground.sent + $A.clientService["priv"].background.sent;
        },

        /**
         * Add a cleanup function that is run on teardown.
         *
         * @param {Function} cleanupFunction the function to run on teardown.
         */
        addCleanup : function(cleanupFunction) {
            priv.cleanups.push(cleanupFunction);
        },
        
        /**
         * Get an instance of an action based on the specified parameters and callback function.
         *
         * @param {Component} component
         *           The Component on which to search for the action
         * @param {String} name
         *           The name of the action from the component's perspective (e.g. "c.doSomething")
         * @param {Object} params
         *           The parameters to pass to the action
         * @param {Function} callback
         *           The callback function to execute for the action, or if not a function a name for the action
         * @returns {Action} An instance of the action
         */
        getAction:function(component, name, params, callback){
            var action = component.get(name);
            if (params) {
                action.setParams(params);
            }
            if (callback) {
                if ($A.util.isFunction(callback)) {
                    action.setCallback(component, callback);
                } else {
                    aura.test.markForCompletion(action, callback);
                }
            }
            return action;
        },

        /**
         * Run a set of actions as a transaction.
         *
         * This is a wrapper around runActions allowing a test to safely run a set of actions as a
         * single transaction with a callback.
         *
         * @param {Array} actions a list of actions to run.
         * @param {Object} scope the scope for the callback.
         * @param {Function} callback the callback
         */
        runActionsAsTransaction: function(actions, scope, callback) {
            $A.assert(!$A.services.client.inAuraLoop(), "runActionsAsTransaction called from inside Aura call stack");
            $A.run(function() { $A.services.client.runActions(actions, scope, callback); });
        },

        /**
         * Enqueue an action, ensuring that it is safely inside an aura call.
         * 
         * @param {Action} action
         *          The action to enqueue.
         * @param {Boolean} background
         *          Set to true to run the action in the background, otherwise the value of action.isBackground() is used.
         */
        enqueueAction: function(action, background) {
            $A.run(function() { $A.enqueueAction(action, background); });
        },

        /**
         * Get an instance of a server action that is not available to the component.
         * @description <p>Example:</p>
         * <code>$A.test.getExternalAction(cmp, "aura://ComponentController/ACTION$getComponent",<br/> 
         * 			{name:"aura:text", attributes:{value:"valuable"}},<br/>
         * 			function(action){alert(action.getReturnValue().attributes.values.value)})</code>
         * 
         * @param {Component} component
         *            The scope to run the action with, even if the action is not visible to it
         * @param {String} descriptor
         *            The descriptor for the action - e.g. java://my.own.Controller/ACTION$doIt
         * @param {Object} params
         *            The parameters to pass to the action, as a Map (name:value)
         * @param {Object} returnType
         *            The return type descriptor for the action, e.g. java://java.lang.String
         * @param {Function} callback
         *            An optional callback to execute with the component as the scope
         * @returns {Action} an instance of the action
         */
        getExternalAction : function(component, descriptor, params, returnType, callback) {
            var paramDefs = [];
            for (var k in params) {
                if (k === 'length' || !params.hasOwnProperty(k)) {
                    continue;
                }
                paramDefs.push({"name":k});
            }
            var def = new ActionDef({
            	"name" : descriptor,
            	"descriptor" : descriptor,
            	"actionType" : "SERVER",
            	"params" : paramDefs,
            	"returnType" : returnType
            });
            var action = def.newInstance(component);
            action.setParams(params);
            if (callback) {
                action.setCallback(component, callback);
            }
            return action;
        },

        /**
         * Clear out component configs returned by an action.
         *
         * This must be called within the action callback. It fails if no components are
         * cleared.
         *
         * @param {Action} action
         *      The action to clear.
         */
        clearAndAssertComponentConfigs : function(a) {
            if ($A.getContext().clearComponentConfigs(a.getId()) === 0) {
                aura.test.fail("No component configs were cleared for "+a.getStorageKey());
            }
        },

        /**
         * Peek if there are any pending server actions.
         *
         * @returns {Boolean} Returns true if there are pending server actions, or false otherwise.
         */
        isActionPending : function() {
            return !$A.clientService.idle();
        },

        /**
         * Mark an action so we can tell when it is complete.
         *
         * This sets the callback on the action to mark the action complete.
         * The action passed in may have a callback set previously, if so, that
         * callback will be called before the action is set as complete.
         *
         * @param {Action} action The action to modify
         * @param {String} name The name to use (must be unique)
         */
        markForCompletion : function(action, name) {
            if (!$A.util.isUndefinedOrNull(priv.completed[name])) {
                $A.test.fail("Duplicate name "+name);
            }
            var myName = name;
            priv.completed[myName] = "INCOMPLETE";
            action.wrapCallback(priv, function(a) {
                if (a.getState() === "SUCCESS") {
                    priv.completed[myName] = "SUCCESS";
                } else {
                    priv.completed[myName] = "FAILURE";
                }
            });
        },

        /**
         * Check to see if an action is complete.
         *
         * If you have previously called <code>markForCompletion</code> this
         * will check that the callback has been called (and thus
         * that the action is complete). It does not check for
         * success/failure.
         * 
         * @param {String} name
         *          The name of the action to check for completion
         * @returns {Boolean} true if action has completed, false otherwise.
         */
        isActionComplete : function(name) {
            if ($A.util.isUndefinedOrNull(priv.completed[name])) {
                $A.test.fail("Unregistered name "+name);
            }
            return priv.completed[name] !== "INCOMPLETE";
        },

        /**
         * Check to see if an action was successful
         *
         * If you have previously called <code>markForCompletion</code> this
         * will check that the callback has been called with a
         * successful completion code.
         * 
         * @param {String} name 
         *          The name of the action to check for success
         * @returns {Boolean} true if action has completed successfully, false otherwise.
         */
        isActionSuccessfullyComplete : function(name) {
            if ($A.util.isUndefinedOrNull(priv.completed[name])) {
                $A.test.fail("Unregistered name "+name);
            }
            return priv.completed[name] === "SUCCESS";
        },

        /**
         * Check to see if an action is complete.
         *
         * If you have previously called <code>markForCompletion</code> this
         * will check that the callback has been called (and thus
         * that the action is complete). It does not check for
         * success/failure.
         * 
         * @param {String} name
         *          The name of the Action to check.
         */
        clearComplete : function(name) {
            if ($A.util.isUndefinedOrNull(priv.completed[name])) {
                aura.test.fail("Unregistered name "+name);
            }
            delete priv.completed[name];
        },
        
        /**
         * Invoke a server action.  At the end of current test case stage, the
         * test will wait for any actions to complete before continuing to the
         * next stage of the test case.
         * @param {Action} action
         *            The action to invoke
         * @param {Boolean} doImmediate
         *             If set to true, the request will be sent immediately, otherwise
         *             the action will be handled as any other Action and may
         *             be queued behind prior requests.
         */
        callServerAction : function(action, doImmediate){
            if(priv.inProgress === 0){
                return;
            }
            //Increment 'inProgress' to indicate that a asynchronous call is going to be initiated, selenium will
            //wait till 'inProgress' comes down to 0 which indicates all asynchronous calls were complete
            priv.inProgress++;
            var actions = $A.util.isArray(action) ? action : [action];
            var cmp = $A.getRoot();
            try{
                if (!!doImmediate){
                    var requestConfig = {
                        "url": $A["clientService"]["priv"].host + '/aura',
                        "method": 'POST',
                        "scope" : cmp,
                        "callback" :function(response){
                            var msg = $A["clientService"]["priv"].checkAndDecodeResponse(response);
                            if ($A.util.isUndefinedOrNull(msg)) {
                                for ( var k = 0; k < actions.length; k++) {
                                    logError("Unable to execute action", actions[k]);
                                }
                            }
                            var serverActions = msg["actions"];
                            for (var i = 0; i < serverActions.length; i++) {
                                for ( var j = 0; j < serverActions[i]["error"].length; j++) {
                                    logError("Error during action", serverActions[i]["error"][j]);
                                }
                            }
                            priv.inProgress--;
                        },
                        "params" : {
                            "message": $A.util.json.encode({"actions" : actions}),
                            "aura.token" : $A["clientService"]["priv"].token,
                            "aura.context" : $A.getContext().encodeForServer(),
                            "aura.num" : 0
                        }
                    };
                    $A.util.transport.request(requestConfig);
                } else {
                    $A.clientService.runActions(actions, cmp , function(msg){
                        for(var i=0;i<msg["errors"].length;i++){
                            logError("Error during action", msg["errors"][i]);
                        }
                        priv.inProgress--;
                    });
                }
            }catch(e){
                // If trying to runAction() fails with an error, catch that error, signal that the attempt to run
                // server action was complete and throw error.
                priv.inProgress--;
                throw e;
            }
        },

        /**
         * Invoke a callback after the provided condition evaluates to truthy,
         * checking on the condition every specified interval.
         * Truthy values can refer to a non-empty String, a non-zero number, a non-empty array, an object, or an expression evaluating to true.
         * @param {Function} conditionFunction
         *             The function to evaluate
         * @param {Function} callback
         *             The callback function to run if conditionFunction evaluates to truthy
         * @param {Number} intervalInMs
         *             The number of milliseconds between each evaluation of conditionFunction
         */
        runAfterIf : function(conditionFunction, callback, intervalInMs){
            if(priv.inProgress === 0){
                return;
            }
            try{
                if(conditionFunction()){
                    if(callback){
                       callback();
                    }
                }else{
                    priv.inProgress++;
                    if(!intervalInMs){
                        intervalInMs = 500;
                    }
                    setTimeout(function(){
                            aura.test.runAfterIf(conditionFunction, callback);
                            priv.inProgress--;
                        },intervalInMs);
                    return;
                }
            }catch(e){
                logError("Error in runAfterIf", e);
            }
        },

        /**
         * Set test to timeout in a period of miliseconds from now.
         * @param {Number} timeoutMsec
         *             The number of milliseconds from the current time when the test should
         *             timeout
         */
        setTestTimeout : function(timeoutMsec){
            priv.timeoutTime = new Date().getTime() + timeoutMsec;
        },

        /**
         * Return whether the test is finished.
         * @returns {Boolean}
         *             Returns true if the test has completed, or false otherwise.
         */
        isComplete : function(){
            return priv.inProgress === 0;
        },

        /**
         * Get the list of errors seen by the test, not including any errors
         * handled explicitly by the framework.
         * @returns {string} Returns an empty string if no errors are seen, else a json
         *             encoded list of errors
         */
        getErrors : function(){
            if (priv.errors.length > 0){
                return aura.util.json.encode(priv.errors);
            } else {
                return "";
            }
        },

        /**
         * Essentially a toString method, except strings are enclosed with
         * double quotations.  Returns a string even for undefined/null value.
         * @param {Object} value
         *             The value that will be converted to a String
         * @returns {String}
         *              The value that is returned as a String type
         */
        print : function(value) {
            if (value === undefined) {
                return "undefined";
            } else if (value === null) {
                return "null";
            } else if ("string" == typeof value) {
                return '"' + value + '"';
            } else {
                return value.toString();
            }
        },

        /**
         * Internally used error function to log an error for a given test.
         *
         * @param {Object or String} e the error object or message.
         * @private
         */
        auraError : function(e) {
            if (!priv.putMessage(priv.preErrors, priv.expectedErrors, e)) {
                $A.test.fail(e);
            }
        },

        /**
         * Tell the test that we expect an error. Test will fail if expected error
         * is not received.
         *
         * @param {String} e The error message that we expect.
         */
        expectAuraError : function(e) {
            priv.expectMessage(priv.preErrors, priv.expectedErrors, e);
        },

        /**
         * Internally used warning function to log a warning for a given test.
         *
         * @param {String} w The warning message.
         * @private
         */
        auraWarning : function(w) {
            if (!priv.putMessage(priv.preWarnings, priv.expectedWarnings, w)) {
            	if(priv.failOnWarning) {
            		$A.test.fail("Unexpected warning: "+w);
            	}
                $A.log("Unexpected warning: "+w);
                return false;
            }
            return true;
        },

        /**
         * Tell the test that we expect a warning. If this function is called and the
         * test does not receive the expected warning, the test will fail.
         *
         * @param {String} w the warning message that we expect.
         */
        expectAuraWarning : function(w) {
            priv.expectMessage(priv.preWarnings, priv.expectedWarnings, w);
        },

        /**
         * Assert that if(condition) check evaluates to true.
         * @description A truthy value refers to an Object, a string, a non-zero number, a non-empty array, or true.
         * <p>Example:</p>
         * Positive: assertTruthy("helloWorld"),
         * Negative: assertTruthy(null)
         * 
         * @param {Object} condition
         *              The condition to evaluate
         * @param {String} assertMessage
         *              The message that is returned if the condition is not true
         */
        assertTruthy : function(condition, assertMessage) {
            if (!condition) {
                if (assertMessage) {
                    assertMessage += " : "+condition;
                } else {
                    assertMessage = "Assertion Failure: expected {Truthy}, but Actual : {" + condition + "}";
                }
                throw new Error(assertMessage);
            }
        },
        /**
         * Assert that the current component HTML is Accessibility compliant.
         * 
         * @description Calls the checkAccessibilty method to verify certain tags are accessible.
         * 
         * @param {String} errorMessage
         *          The message that is returned if the condition is not false
         * @throws {Error} Throws Error containing concatenated string representation of all
         *                 accessibility errors found
         */
        assertAccessible : function() {
            var res = aura.devToolService.checkAccessibility();
            if (res !== "") {
                throw new Error(res);
            }
        },

         /**
         * Assert that the if(condition) check evaluates to false.
         * @param {Object} condition
         * 				The condition to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the condition is not false
         * @description A falsey value refers to zero, an empty string, null, undefined, or false.
         * <p>Example:</p>
         * Negative: <code>assertFalsy("helloWorld")</code>,
         * Postive: <code>assertFalsy(null)</code>
         */
        assertFalsy : function(condition, assertMessage) {
            if (condition) {
                if (assertMessage) {
                    assertMessage += " : "+condition;
                } else {
                    assertMessage = "Assertion Failure: expected {Falsy}, but Actual : {" + condition + "}";
                }
                throw new Error(assertMessage);
            }
        },

         /**
         * Assert that if(condition) check evaluates to true.
         * @param {Object} condition
         * 				The condition to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the condition is not true
         * @description
         * Positive: assert("helloWorld"),
         * Negative: assert(null)
         */
        assert : function(condition, assertMessage) {
            aura.test.assertTruthy(condition, assertMessage);
        },

        /**
         * Assert that the two values provided are equal.
         * @param {Object} arg1
         * 				The argument to evaluate against arg2
         * @param {Object} arg2
         * 				The argument to evaluate against arg1
         * @param {String} assertMessage
         * 				The message that is returned if the two values are not equal
         */
        assertEquals : function(arg1, arg2, assertMessage){
            if(arg1!==arg2){
                if(!assertMessage){
                    assertMessage = "Values not equal";
                }
                assertMessage += "\nExpected: {"+arg1 +"} but Actual: {"+arg2+"}";
                if(typeof arg1 !== typeof arg2){
                    assertMessage += "\n. Type Mismatch.";
                }
                throw new Error(assertMessage);
            }
        },

        /**
         * Assert that the two string values provided are equal ignoring whitespace.
         *
         * This is important when checking constructed strings, as browsers may handle them differently.
         *
         * @param {string} arg1
         * 				The argument to evaluate against arg2
         * @param {string} arg2
         * 				The argument to evaluate against arg1
         * @param {String} assertMessage
         * 				The message that is returned if the two values are not equal
         */
        assertEqualsIgnoreWhitespace : function(arg1, arg2, assertMessage){
            if (arg1 === arg2) {
                return;
            }
            var arg1s = arg1.replace(/\s+/gm,' ').replace(/^ | $/gm,'');
            var arg2s = arg2.replace(/\s+/gm,' ').replace(/^ | $/gm,'');
            if(arg1s!==arg2s){
                if(!assertMessage){
                    assertMessage = "Values not equal";
                }
                assertMessage += "\nExpected: {"+arg1 +"} but Actual: {"+arg2+"}";
                if(typeof arg1 !== typeof arg2){
                    assertMessage += "\n. Type Mismatch.";
                }
                throw new Error(assertMessage);
            }
        },

        /**
         * Assert that the a string starts with another.
         * @param {Object} start 
         * 				The start string.
         * @param {Object} full
         * 				The string that is expected to start with the start string
         * @param {String} assertMessage
         * 				The message that is returned if the two values are not equal
         */
        assertStartsWith : function(start, full, assertMessage){
            if(full.indexOf(start) !== 0){
                if(!assertMessage){
                    assertMessage = "StartsWith: ";
                }
                var fullStart = full;
                if (fullStart.length > start.length+20) {
                    fullStart = fullStart.substring(0, start.length+20);
                }
                assertMessage += "\nExpected: {"+start +"} but Actual: {"+fullStart+"}";
                throw new Error(assertMessage);
            }
        },

        /**
         * Complement of assertEquals, throws Error if arg1===arg2.
         * @param {Object} arg1
         * 				The argument to evaluate against arg2
         * @param {Object} arg2
         * 				The argument to evaluate against arg1
         * @param {String} assertMessage
         * 				The message that is returned if the two values are equal
         */
        assertNotEquals: function(arg1, arg2, assertMessage) {
            if (arg1 === arg2) {
                if (!assertMessage) {
                    assertMessage = "Values are equal (via ===)";
                }
                assertMessage += "\nValue is: {" + arg1 + "}";
                throw new Error(assertMessage);
            }
        },

        /**
         * Assert that the value is not undefined.
         * @param {Object} arg1 
         * 				The argument to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if arg1 is undefined
         */
        assertDefined: function(arg1, assertMessage) {
            if (!assertMessage) {
                assertMessage = "Value is undefined";
            }
            $A.test.assertNotEquals(undefined, arg1, assertMessage);
        },

        /**
         * Assert that the condition === true.
         * @param {Boolean} condition
         * 				The condition to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the condition !==true
         */
        assertTrue : function(condition, assertMessage){
            if(!assertMessage){
                assertMessage = "Expected: {True}, but Actual: {False} ";
            }
            aura.test.assertEquals(true,condition,assertMessage);
        },

        /**
         * Assert that the condition === false.
         * @param {Boolean} condition
         * 				The condition to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the condition !==false
         */
        assertFalse :function(condition, assertMessage){
            if(!assertMessage){
                assertMessage = "Expected: {False}, but Actual: {True} ";
            }
            aura.test.assertEquals(false,condition,assertMessage);
        },

        /**
         * Assert that the value passed in is undefined.
         * @param {Object} arg1
         * 				The argument to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the argument is not undefined
         */
        assertUndefined : function(arg1, assertMessage){
            if(!assertMessage){
                assertMessage = "Assertion failure, Expected: {undefined}, but Actual: {"+arg1+"} ";
            }
            aura.test.assertTrue($A.util.isUndefined(arg1),assertMessage);
        },
        /**
         * Assert that the value passed in is not undefined or null.
         * @param {Object} arg1
         * 				The argument to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the argument is not undefined or null
         */
        assertNotUndefinedOrNull : function(arg1, assertMessage){
            if(!assertMessage){
                assertMessage = "Assertion failure, Expected: {undefined or null}, but Actual: {"+arg1+"} ";
            }
            aura.test.assertTrue(!$A.util.isUndefinedOrNull(arg1),assertMessage);
        },
         /**
         * Assert that the value passed in is either undefined or null.
         * @param {Object} arg1
         * 				The argument to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the argument is not undefined or null
         */
        assertUndefinedOrNull : function(arg1, assertMessage){
            if(!assertMessage){
                assertMessage = "Assertion failure, Expected: {undefined or null}, but Actual: {"+arg1+"} ";
            }
            aura.test.assertTrue($A.util.isUndefinedOrNull(arg1),assertMessage);
        },
        

         /**
         * Assert that value === null.
         * @param {Object} arg1
         * 				The argument to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the value !==null
         */
        assertNull : function(arg1, assertMessage){
            if(!assertMessage){
                assertMessage = "Assertion failure, Expected: {null}, but Actual: {"+arg1+"} ";
            }
            aura.test.assertTrue(arg1===null,assertMessage);
        },

        /**
         * Assert that value !== null.
         * @param {Object} arg1
         * 				The argument to evaluate
         * @param {String} assertMessage
         * 				The message that is returned if the value is null
         */
        assertNotNull : function(arg1, assertMessage){
        	if(!assertMessage){
                assertMessage = "Assertion failure, Expected: {non-null}, but Actual:{"+arg1+"}";
            }
            aura.test.assertTrue(arg1!==null,assertMessage);
        },

        /**
         * Throw an Error, making a test fail with the specified message.
         * @param {String} assertMessage
         *             Defaults to "Assertion failure", if assertMessage is not provided
         * @throws {Error}
         *             Throws error with a message
         */
        fail : function(assertMessage){
            if(assertMessage){
                throw new Error(assertMessage);
            }else{
                throw new Error("Assertion failure");
            }
        },

        /**
         * Get an object's prototype.
         * @param {Object} instance
         * 				The instance of the object
         * @returns {Object}
         * 				The prototype of the specified object
         */
        getPrototype : function(instance){
            return (instance && (Object.getPrototypeOf && Object.getPrototypeOf(instance))) || instance.__proto || instance.constructor.prototype;
        },

        /**
         * Replace a function on an object with a restorable override.
         * @param {Object} instance
         * 				The instance of the object
         * @param {String} name
         * 				The name of the function to be replaced
         * @param {Function} newFunction
         * 				The new function that replaces originalFunction
         * @returns {Function}
         *             The override (newFunction) with an added "restore"
         *             function that, when invoked, will restore originalFunction
         *             on instance
         * @throws {Error}
         *             Throws an error if instance does not have originalFunction as a property
         */
        overrideFunction : function(instance, name, newFunction){
            var originalFunction = instance[name];
            if(!originalFunction) {
                throw new Error("Did not find the specified function '" + name + "' on the given object!");
            }
            
            instance[name] = newFunction;
            
            // Now lets see if there is a corresponding private (obfuscated) version that we also need to mock
            var nonExportedFunctionName;
            for (var key in instance) {
                var f;
                try {
                    f = instance[key];
                } catch (e) {
                    // IE: Handle "Unspecified error" for properties like "fileCreatedDate"
                    continue;
                }
            	if (key !== name && f === originalFunction) { 
            		nonExportedFunctionName = key;
                    instance[key] = newFunction;
            		break; 
            	} 
        	}
            
            var override = newFunction;
            override.originalInstance = instance;
            override.originalFunction = originalFunction;
            override.nonExportedFunctionName = nonExportedFunctionName;
            
            override["restore"] = function(){
            	override.originalInstance[name] = override.originalFunction;
            	
            	if (override.nonExportedFunctionName) {
            		override.originalInstance[override.nonExportedFunctionName] = override.originalFunction;
            	}
            };

            // if we're overriding an override, update it's pointer to restore to us
            if(originalFunction.originalInstance){
                originalFunction.originalInstance = override;
            }

            return override;
        },

        /**
         * Add a handler function to an existing object's function.
         * The handler may be attached before or after the target function.
         * If attached after (postProcess === true), the handler will be
         * invoked with the original function's return value followed by
         * the original arguments.  If attached before (postProcess !== true),
         * the handler will be invoked with just the original arguments.
         * @param {Object} instance
         * 				The instance of the object
         * @param {String} name
         * 				The name of the function whose arguments are applied to the handler
         * @param {Function} newFunction
         * 				The target function to attach the handler to
         * @param {Boolean} postProcess
         *             Set to true if the handler will be called after the target function
         *             or false if the handler will be called before originalFunction
         * @returns {Function}
         *             The override of originalFunction, which has a "restore"
         *             function that, when invoked, will restore originalFunction
         *             on instance
         */
        addFunctionHandler : function(instance, name, newFunction, postProcess){
            var handler = newFunction;
            var originalFunction = instance[name];
            return $A.test.overrideFunction(instance, name, postProcess ?
                function(){
                    handler.apply(this, originalFunction.apply(this, arguments), arguments);
                } :
                function(){
                    handler.apply(this, arguments);
                    originalFunction.apply(this, arguments);
                }
            );
        },

        /**
         * Get a DOM node's outerHTML.
         * @param {Node} node
         * 				The node to get outer HTML from
         * @returns {String}
         * 				The outer HTML
         */
        getOuterHtml : function(node) {
            return node.outerHTML || (function(n){
                var div = document.createElement('div');
                div.appendChild(n.cloneNode(true));
                var h = div.innerHTML;
                div = null;
                return h;
            })(node);
        },

        /**
         * Get the text content of a DOM node. Tries <code>innerText</code> followed by
         * <code>textContext</code>, followed by <code>nodeValue</code> to take browser differences into account.
         * @param {Node} node
         * 				The node to get the text content from
         * @returns {String}
         * 				The text content of the specified DOM node
         */
        getText : function(node) {
            return $A.util.getText(node);
        },

        /**
         * Get the textContent of all elements rendered by this component.
         * @param {Component} component
         * 				The component to get the text content from
         * @returns {String}
         * 				The text content of the specified component
         */
        getTextByComponent : function(component){
            var ret = "";
            if(component){
                var elements = component.getElements();
                if(elements){
                    //If the component has only one element
                    var ele = elements["element"];
                    if(ele && ele.nodeType !== 8/*COMMENT*/){
                        return aura.test.getText(ele);
                    }
                    //If the component has an array of elements
                    for(var i=0;elements[i];i++){
                        if(elements[i].nodeType !== 8/*COMMENT*/){
                            ret += aura.test.getText(elements[i]);
                        }
                    }
                }
            }
            return ret;
        },

        /**
         * Get the current value for a style for a DOMElement.
         *
         * @param {DOMElement} elem
         * 				The element to get the CSS property value from
         * @param {String} Style
         * 				The property name to retrieve
         * @returns {String}
         * 				The CSS property value of the specified DOMElement
         */
        getStyle : function(elem, style){
        	var val = "";
            if(document.defaultView && document.defaultView.getComputedStyle){
                val = document.defaultView.getComputedStyle(elem, "").getPropertyValue(style);
            }
            else if(elem.currentStyle){
                style = style.replace(/\-(\w)/g, function (s, ch){
                    return ch.toUpperCase();
                });
                val = elem.currentStyle[style];
            }
            return val;
        },

        /**
         * Filter out comment nodes from a list of nodes.
         * @param {Array|Object} nodes
         * 				The list of nodes to filter
         * @returns {Array}
         * 				The list of nodes without comment nodes
         */
        getNonCommentNodes : function(nodes){
            var ret = [];
            if($A.util.isObject(nodes)){
                for(var i in nodes){
                    if(nodes[i].nodeType && nodes[i].nodeType !== 8) {
                        ret.push(nodes[i]);
                    }
                }
            }else{
                for(var j = 0; j < nodes.length; j++){
                    if(8 !== nodes[j].nodeType) {
                        ret.push(nodes[j]);
                    }
                }
            }
            return ret;
        },

        /**
         * Check if a node has been "deleted" by Aura.
         * @param {Node} node
         * 				The node to check
         * @returns {Boolean}
         * 				Returns true if the specified node has been deleted, or false otherwise
         */
        isNodeDeleted : function(node){
            if (!node.parentNode){
                return true;
            }
            var div = document.createElement("div");
            document.documentElement.appendChild(div);
            aura.util.removeElement(div);
            return node.parentNode === div.parentNode;
        },

        /**
         * Return a node list and pass each argument as a separate parameter.
         * @returns {Array}
         * 				The list of nodes contained in the document node
         */
        select : function() {
            return document.querySelectorAll.apply(document, arguments);
        },

        /**
         * Check if a string contains another string.
         * @param {String} testString
         *             The string to check
         * @param {String} targetString
         *             The string to look for within testString
         * @returns {Boolean}
         * 				Return true if testString contains targetString, or false otherwise
         */
        contains : function(testString, targetString){
            if (!$A.util.isUndefinedOrNull(testString)) {
                return (testString.indexOf(targetString) != -1);
            }
            return false;
        },
        
        /**
         * Returns a reference to the object that is currently designated as the active element in the document.
         * 
         * @returns {DOMElement} The current active element.
         */
        getActiveElement : function(){
            return document.activeElement;
        },

        /**
         * Returns the inner text of the current active element in the document.
         * 
         * @returns {String} The text of the current active DOM element.
         */
        getActiveElementText : function(){
        	return $A.test.getText(document.activeElement);
        },

        /**
         * Used by getElementsByClassNameCustom for IE7
         * @private
         */	
        walkTheDOM: function (node, func) {
          func(node);
          node = node.firstChild;
          while (node) {
            aura.test.walkTheDOM(node, func);
            node = node.nextSibling;
          }
        },

        /**
         * custom util to get element by class name for IE7
         * @private
         */
        getElementsByClassNameCustom: function (className, parentElement) {
            var results = [];
            
            if($A.util.isUndefinedOrNull(parentElement)){
        	parentElement = document.body;
            }
            
            aura.test.walkTheDOM(parentElement, function(node) {
                var a, c = node.className,
                    i;
                if (c) {
                    a = c.split(' ');
                    for (i = 0; i < a.length; i++) {
                        if (a[i] === className) {
                            results.push(node);
                            break;
                        }
                    }
                }
            });
            return results;
        },

        /**
         * Gets the first element on the page starting from parentElement, that has the specified class name.
         * @param {Object} parentElement DOM element that we want to start at.
         * @param {String} classname The CSS class name.
         * @returns {Object} The first element denoting the class, or null if none is found.
         */
        findChildWithClassName : function(parentElement, className){
            var results = aura.test.getElementsByClassNameCustom(className, parentElement);
            if (results && results.length > 0) {
                return results;
            }
            return null;
        },

        /**
         * Gets the first element on the page that have the specified class name.
         * @param {String} classname The CSS class name.
         * @returns {Object} The element denoting the class, or null if none is found.
         */
         getElementByClass : function(classname){
             var ret;

             if(document.getElementsByClassName){
                 ret = document.getElementsByClassName(classname);
             }

             else if(document.querySelectorAll){
                 ret = document.querySelectorAll("." + classname);
             } else {
                 ret = aura.test.getElementsByClassNameCustom(classname);
             }
             
             if (ret && ret.length > 0) {
                 return ret;
             }
             return null;
         },

        /**
         * Given an HTML element and an eventName, fire the corresponding DOM event. Code adapted from a stack overflow
         * question's answer.
         * @param {Object} element The HTML element whose corresponding DOM event is to be fired
         * @param {String} eventName Initializes the given event that bubbles up through the event chain
         */
        fireDomEvent: function (element, eventName) {
            var event;
            if (document.createEvent) {
                event = document.createEvent("HTMLEvents");
                event.initEvent(eventName, true, true);
            } else {
                event = document.createEventObject();
                event.eventType = eventName;
            }

            if (document.createEvent) {
                element.dispatchEvent(event);
            } else {
                element.fireEvent("on" + event.eventType, event);
            }
        },

        /**
         * Checks if an element supports Touch events. Otherwise, issue a click on the element.
         * 
         * @param {HTMLElement} element
         *          The element to click or fire touch event on.
         */
        clickOrTouch: function (element) {
            if($A.util.supportsTouchEvents()){
                var ts = document.createEvent('TouchEvent');
                ts.initTouchEvent('touchstart');
                var te = document.createEvent('TouchEvent');
                te.initTouchEvent('touchend');
                element.dispatchEvent(ts);
                element.dispatchEvent(te);
            } else {
                if ($A.util.isUndefinedOrNull(element.click)) {
                    // manually fire event
                    $A.test.fireDomEvent(element, "click");
                } else {
                    element.click();
                }
            }
        },

        /**
         * Checks if the specified node is a text node.
         * @param {Node} node 
         *          The node to check
         * @returns {Boolean} true if node is text node.
         */
        isInstanceOfText: function(node){
            if(window.Text){
                return node instanceof window.Text;
            }
            return node.nodeType == 3;
        },

        /**
         * Checks if the specified element is an anchor element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is an anchor element.
         */
        isInstanceOfAnchorElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLAnchorElement, "a");
        },

        /**
         * Checks if the specified element is an input element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is an input element.
         */
        isInstanceOfInputElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLInputElement, "input");
        },

        /**
         * Checks if the specified element is a list element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is a list element.
         */
        isInstanceOfLiElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLLiElement, "li");
        },

        /**
         * Checks if the specified element is a paragraph element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is a paragraph element.
         */
        isInstanceOfParagraphElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLParagraphElement, "p");
        },

        /**
         * Checks if the specified element is a button element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is a button element.
         */
        isInstanceOfButtonElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLButtonElement, "button");
        },

        /**
         * Checks if the specified element is an image element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is an image element.
         */
        isInstanceOfImageElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLImageElement, "img");
        },

        /**
         * Checks if the specified element is a div element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is a div element.
         */
        isInstanceOfDivElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLDivElement, "div");
        },
        
        /**
         * Checks if the specified element is a span element.
         * @param {HTMLElement} element The element to check
         * @returns {Boolean} true if element is a span element.
         */
        isInstanceOfSpanElement: function(element){
            return aura.test.isInstanceOf(element, window.HTMLSpanElement, "span");
        },

        /**
         * Checks if the specified element is an instance of another element.
         * 
         * @param {HTMLElement} element
         *          The element to check
         * @param {HTMLElement} elementType
         *          Checks element against elementType
         * @param {String} tag
         *          Check element.tagName against tag
         * @returns {Boolean} true if element is of type elementType. Or if elementType
         *                    is undefined, check element is of type ELEMENT_NODE and
         *                    it's tagName is equal to tag
         */
        isInstanceOf: function(element, elementType, tag){
            if(elementType){
                return element instanceof elementType;
            }
            return element.nodeType == 1 && element.tagName.toLowerCase() == tag;
        },

        /**
         * Returns set of keys on passed in Object.
         * 
         * @param {Object} obj
         *          Object to retrieve set of keys from.
         */
        objectKeys:function(obj){
            if (Object.keys) {
                return Object.keys(obj);
            } else {
                var result = [];
                for(var name in obj) {
                    if (obj.hasOwnProperty(name)){
                        result.push(name);
                    }
                }
                return result;
            }
        },
        

        /**
         * Return attributeValue of an element
         * @param {HTMLElement} element The element from which to retrieve data.
         * @param {String} attributeName The name of attribute to look up on element.
         */
        getElementAttributeValue : function(element,attributeName){
        	return $A.util.getElementAttributeValue(element, attributeName);
        },

        /**
         * Add an event handler. If component is specified, the handler will be applied to component events. If
         * component is not specified, the handler will be applied to application events.
         *
         * @param {String}
         *            eventName The registered name, for component events; the descriptor name for application events.
         * @param {Function}
         *            handler The function handler, which should expect the event as input.
         * @param {Component}
         *            component The component to add the handler on.
         */
        addEventHandler : function(eventName, handler, component) {
            if ($A.util.isUndefinedOrNull(component)) {
                // application event handler
                $A.eventService.addHandler({
                    'event' : eventName,
                    'globalId' : 'TESTHANDLER' + eventName,
                    'handler' : handler
                });

            } else {
                // component event handler
                // mock a ValueProvider that returns a synthetic action
                component.addHandler(eventName, {
                    getValue : function() {
                        return {
                            run : handler,
                            runDeprecated : handler
                        };
                    }
                }, 'TESTHANDLER'); // expression is irrelevant
            }
        },

        // Used by tests to modify framework source to trigger JS last mod update
        /** @ignore */
        dummyFunction : function(){
            return '@@@TOKEN@@@';
        },

        getAppCacheEvents: function() {
            return priv.appCacheEvents;
        },

        /**
         * Extract the error message from Aura error div(the grey error message on the page)
         * 
         * @returns {String} The text of the Aura error
         */
        getAuraErrorMessage: function(){
            return $A.test.getText($A.util.getElement("auraErrorMessage"));
        }
    };

    //#include aura.test.Test_export
    return Test;
};
