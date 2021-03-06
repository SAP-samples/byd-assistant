/**
 * This code implements an integration of SAP Business by Design with Amazon Echo
 * It is a fork from the B1 Assistant - A SAP Business One Integration with Amazon Echo 
 * See at: (https://github.com/B1SA/b1Assistant/)
 * 
 * For instrunctions, changelog and License please check the GitHub Repository
 * - https://github.com/Ralphive/byDAssistant
 * 
 */

var g_hdbServer = process.env.SMB_SERVER;
var g_hdbPort = process.env.SMB_PORT;
var g_hdbService = process.env.SMB_PATH;

const MESSAGE = require("./lib/messageParser")
var   LANG = "";

exports.handler = function (event, context) {
    try {
        LANG = event.request.locale?event.request.locale:process.env.LANG;

        if (event.session.new) {
            onSessionStarted({
                requestId: event.request.requestId
            }, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        //context.fail("Exception: " + e);
        console.log('exception: ' + e.message);
    }
};

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId +
        ", sessionId=" + session.sessionId);
}

/**
 * Called when the user launches the skill without specifying what they want.
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId +
        ", sessionId=" + session.sessionId);

    // Dispatch to skill's launch.
    getWelcomeResponse(callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {

    console.log(intentRequest);
    var intent = intentRequest.intent;
    intentName = extractValue('PreviousIntent', intent, session);

    console.log('CURRENT Itent is ' + intent.name);
    console.log('PREVIOUS intent was ' + intentName);

    if ("AMAZON.StopIntent" === intent.name ||
        "AMAZON.CancelIntent" === intent.name) {
        handleSessionEndRequest(callback);
    }

    if (intentName === null) {
        intentName = intent.name;
    }

    // Dispatch to your skill's intent handlers
    switch (intentName) {
        case "SayHello":
            sayHello(intent, session, callback);
            break;

        case "SalesInfo":
            getSalesInfo(intent, session, callback);
            break;

        case "MakePurchase":
            postPurchase(intent, session, callback);
            break;

        case "AMAZON.HelpIntent":
            getHelpResponse(callback);
            break;

        default:
            throw "Invalid intent";
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId +
        ", sessionId=" + session.sessionId);
    // Add cleanup logic here
}

// --------------- Functions that control the skill's behavior -----------------------
function getWelcomeResponse(callback) {
    var sessionAttributes = {};
    const message = MESSAGE.welcome(LANG)
    var shouldEndSession = false;
  
    callback(
      sessionAttributes,
      buildSpeechletResponse(
        message.title,
        message.output,
        message.reprompt,
        shouldEndSession
      )
    );
  }

function getHelpResponse(callback) {
    var sessionAttributes = {};
    const message = MESSAGE.help(LANG);
    var shouldEndSession = false;
  
    callback(
      sessionAttributes,
      buildSpeechletResponse(
        message.title,
        message.output,
        message.reprompt,
        shouldEndSession
      )
    );
  }

function handleSessionEndRequest(callback) {
    var cardTitle = "Session Ended";
    //var speechOutput = "Thank you for using B1 Assistant. Have a nice day!";
    var speechOutput = "Okay.";

    // Setting this to true ends the session and exits the skill.
    var shouldEndSession = true;

    callback({}, buildSpeechletResponse(cardTitle, speechOutput, null, shouldEndSession));
}


/**
 * BYD Interactions
 */
function getSalesInfo(intent, session, callback) {

    //Default
    var repromptText = null;
    var sessionAttributes = {};
    var shouldEndSession = false;
    var speechOutput = "";

    var SalesQuarter = extractValue('SalesQuarter', intent, session)
    var SalesYear = formatYear(extractValue('SalesYear', intent, session))


    sessionAttributes = handleSessionAttributes(sessionAttributes, 'SalesQuarter', SalesQuarter);
    sessionAttributes = handleSessionAttributes(sessionAttributes, 'SalesYear', SalesYear);

    var b1Quarter = formatQuarter(SalesQuarter);
    var oDataEndpoint = "/SalesOrderCollection"
    var oDataFilter = '$select=NetAmount,NetAmountCurrencyCode,DateTime&$filter=' +
        'DateTime' + op('ge') + beginQuarter(b1Quarter, SalesYear) + op('and') +
        'DateTime' + op('le') + endQuarter(b1Quarter, SalesYear);

    //Avoid unescaped characters
    oDataFilter = oDataFilter.replace(/ /g, "%20");

    console.log('OdataFilter = ' + oDataFilter);

    getCall(
        oDataEndpoint, // Endpoint
        "?$format=json&" + oDataFilter, //Filter

        function (response) {
            console.log("response is " + response);
            response = response.d.results;

            var messageParams = {"%YEAR%": SalesYear,"%QUARTER%":SalesQuarter}
            var message;

            if (response.length == 0) {
                message = MESSAGE.noSales(LANG, messageParams)
            } else {
                var totalSales = 0;
                for (var i = 0; i < response.length; i++) {
                    totalSales += Math.round(response[i].NetAmount, 2);
                }
                messageParams["%AMOUNT%"] = totalSales
                messageParams["%CURRENCY%"] = response[0].NetAmountCurrencyCode
                message = MESSAGE.sales(LANG, messageParams)
            }
            shouldEndSession = true;

            // call back with result
            callback(sessionAttributes,
                buildSpeechletResponse(
                    message.title,
                    message.output,
                    message.reprompt,
                    shouldEndSession
                  )
            );
        }
    );
}


function postPurchase(intent, session, callback) {

    //Default
    var repromptText = null;
    var sessionAttributes = {};
    var shouldEndSession = false;
    var speechOutput = "";

    var ItemName = intent.slots.ItemName.resolutions.resolutionsPerAuthority[0].values[0].value.id
    var Quantity = intent.slots.Quantity.value

    sessionAttributes = handleSessionAttributes(sessionAttributes, 'ItemName', ItemName);
    sessionAttributes = handleSessionAttributes(sessionAttributes, 'Quantity', Quantity);
    sessionAttributes = handleSessionAttributes(sessionAttributes, 'PreviousIntent', intent.name);

    var message;

    /* ByD Requires a CSRF Token in every POST Request.
    This token is provided by a GET with Authentication */
    getCall("/", "", function (body, response) { //Callback Function

        console.log("response is " + response);
        if (response.statusCode != 200) {
            message = MESSAGE.noSalesOrder(LANG)
        } else {
            console.log("CSRF Token retrived. Preparing post request for Sales Order Creation")

            var http = require('request');

            var body = {
                "ExternalReference": "Alexa "+LANG,
                "DataOriginTypeCode": "4",
                "Name": "via Alexa on " + getDateTime(true),
                "BuyerParty": {
                    "PartyID": process.env.SMB_DEFAULT_BP
                },
                "Item": [
                    {
                        "ID": "10",
                        "ItemProduct": {
                            "ProductID": ItemName
                        },
                        "ItemScheduleLine": [
                            {
                                "Quantity": Quantity
                            }
                        ]
                    }
                ]
            }

            var options = {
                uri: g_hdbServer + g_hdbPort + g_hdbService + "/SalesOrderCollection",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "x-csrf-token": response.headers["x-csrf-token"], //Damm Token
                    "cookie": response.headers["set-cookie"]
                },
                body: JSON.stringify(body)
            };

            http.post(options, function (error, res, body) {
                console.log("Response: " + res.statusCode);
                if (!error && res.statusCode == 201) {

                    body = JSON.parse(body);
                    body = body.d.results;
                    console.log("Order " + body.ID + " created!")

                    const messageParams = {
                                        "%ORDER%": body.ID,
                                        "%AMOUNT%":Math.round(body.NetAmount * 100) / 100, 
                                        "%CURRENCY%":body.NetAmountCurrencyCodeText}
                    message = MESSAGE.salesOrder(LANG, messageParams)
                    shouldEndSession = true;
                }
                else {
                    message = MESSAGE.noSalesOrder(LANG)
                }

                // call back with result
                callback(sessionAttributes,
                    buildSpeechletResponse(
                        message.title,
                        message.output,
                        message.reprompt,
                        shouldEndSession
                    ));
            });

        }
    })

}

function getCall(endPoint, filter, callback) {

    var http = require('request');

    var options = {
        uri: g_hdbServer + g_hdbPort + g_hdbService + endPoint + filter,
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Authorization": "Basic " + process.env.SMB_AUTH,
            "x-csrf-token": "fetch"
        }
    };

    console.log('start request to ' + options.uri)

    http.get(options, function (error, res, body) {
        console.log("Response: " + res.statusCode);
        if (!error && res.statusCode == 200 || res.statusCode == 201) {
            var parsed = JSON.parse(body);
            callback(parsed, res);
        }
        else {
            console.log("Error message: " + error);
            callback(false)

        }
    });
}

// --------------- Handle of Session variables -----------------------
function extractValue(attr, intent, session) {

    console.log("Extracting " + attr);
    if (session.attributes) {
        if (attr in session.attributes) {
            console.log("Session attribute " + attr + " is " + session.attributes[attr]);
            return session.attributes[attr];
        }
    }

    console.log("No session attribute for " + attr);

    if (intent.slots && attr in intent.slots) {
        if ('resolutions' in intent.slots[attr]) {
            console.log("Found Resolution for " + attr);
            return intent.slots[attr].resolutions.resolutionsPerAuthority[0].values[0].value.name;
        }else{
            return intent.slots[attr].value;
        }
    };
    console.log("No Intent Slot for " + attr);
    return null;
}


function handleSessionAttributes(sessionAttributes, attr, value) {

    //if Value exists as attribute than returns it
    console.log("Previous " + attr + " is: " + value)
    if (value) {
        sessionAttributes[attr] = value;
    }
    return sessionAttributes;
}

// --------------- Auxiliar Functions Formatting -----------------------

function quotes(val) {
    return "%27" + val + "%27";
}

function op(op) {
    return "%20" + op + "%20";
}

function formatQuarter(input) {

    if (input == 'first' || input == '1st' || input == 'Q1') {
        return '01';
    }

    if (input == 'second' || input == '2nd' || input == 'Q2') {
        return '02';
    }

    if (input == 'third' || input == '3rd' || input == 'Q3') {
        return '03';
    }

    if (input == 'fourth' || input == '4th' || input == 'Q4') {
        return '04';
    }

}

function formatYear(year){
    console.log("Formatting year - "+year)
    return year.substring(0, 4);
}


function beginQuarter(quarter, year) {

    var ret = 'datetimeoffset'

    if (quarter == '01' || quarter == 'Q1') {
        ret += quotes(year + "-01-01T00:00:01Z")
        return ret
    }

    if (quarter == '02' || quarter == 'Q2') {
        ret += quotes(year + "-04-01T00:00:01Z")
        return ret
    }

    if (quarter == '03' || quarter == 'Q3') {
        ret += quotes(year + "-07-01T00:00:01Z")
        return ret
    }

    if (quarter == '04' || quarter == 'Q4') {
        ret += quotes(year + "-10-01T00:00:01Z")
        return ret
    }
}

function endQuarter(quarter, year) {

    var ret = 'datetimeoffset'

    if (quarter == '01' || quarter == 'Q1') {
        ret += quotes(year + "-03-31T23:59:59Z")
        return ret
    }

    if (quarter == '02' || quarter == 'Q2') {
        ret += quotes(year + "-06-30T23:59:59Z")
        return ret
    }

    if (quarter == '03' || quarter == 'Q3') {
        ret += quotes(year + "-09-30T23:59:59Z")
        return ret
    }

    if (quarter == '04' || quarter == 'Q4') {
        ret += quotes(year + "-12-31T23:59:59Z")
        return ret
    }
}

function getDateTime(withHour) {
    var currentdate = new Date();
    var datetime = currentdate.getFullYear() + "-"
        + (currentdate.getMonth() + 1) + "-"
        + currentdate.getDate();

    if (withHour) {
        datetime += " @ "
            + currentdate.getHours() + ":"
            + currentdate.getMinutes() + ":"
            + currentdate.getSeconds();
    }

    return datetime;
}

// --------------- Helpers that build all of the responses -----------------------


function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    console.log("ALEXA: "+output);
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        card: {
            type: "Standard",
            title: title,
            text: output,
            image: {
                smallImageUrl: "https://i.imgur.com/ZJFFyRa.png"
            }
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}