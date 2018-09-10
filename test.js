const { spawn } = require('child_process');
const request = require('request');
const test = require('tape');
const parseXml = require('xml2js').parseString;

// Start the app
const env = Object.assign({}, process.env, {PORT: 5000});
const child = spawn('node', ['index.js'], {env});

test('responds to requests', (t) => {
  t.plan(4);

  // Wait until the server is ready
  child.stdout.on('data', _ => {
    // Make a request to our app
    request('http://127.0.0.1:5000', (error, response, body) => {
      // stop the server
      child.kill();

      // No error
      t.false(error);
      // Successful response
      t.equal(response.statusCode, 200);
      // Assert content checks
      t.notEqual(body.indexOf("<title>Node.js Getting Started on Heroku</title>"), -1);
      t.notEqual(body.indexOf("Getting Started with Node on Heroku"), -1);
    });
  });
});

function fzeTestStatus(url, interval, callback) {
  (function poll() {
    request(url, function(error, response, body) {
      parseXml(body, function(err, result) {
        if (typeof(result.response.data[1].returnData) == 'undefined') {
          process.stdout.write("."); 
          setTimeout(poll, interval);
        } else {
          const statusResult = result.response.data[1].returnData[0];
          const status = statusResult.Status[0];

          if (status === "Completed") {
            callback(null, result.response.data[1].returnData[0]);
          } else if (status === "PROCESSING") {
            process.stdout.write("."); 
            setTimeout(poll, interval);
          } else {
            return callback(new Error("Unrecognized test status: " + status));
          }
        }
      });
    });
  })();
}

if (typeof(process.env.HEROKU_UAT_APP_WEB_URL) !== 'undefined') {
  const uatAppUrl   = process.env.HEROKU_UAT_APP_WEB_URL;
  const fzeDeployId = process.env.FZE_DEPLOYMENT_ID;
  const fzeApiKey   = process.env.FZE_API_KEY;
  //Running with UAT
  console.log(uatAppUrl)
  console.log(fzeDeployId)
  console.log(fzeApiKey)
  const fzeOrchUrl  = `https://app.functionize.com/api/v1?method=processDeployment&actionFor=execute&deploymentid=${ fzeDeployId }&apiKey=${ fzeApiKey }&domain=${ uatAppUrl }`;

  test('functionize autonomous uat tests', { timeout: 600000 }, (t) => {
    t.plan(6);
    t.ok(process.env.HEROKU_UAT_APP_WEB_URL, `UAT URL: ${ uatAppUrl }`);

    request(fzeOrchUrl, function(error, response, body) {
      parseXml(body, function(err, result) {
        t.equal(result.response.status[0], "success", "Functionize deployment launched");

        t.comment("Running Functionize tests...");
        t.comment("-------1---------2---------3---------4---------5---------6---------7---------8---------9");

        const fzeRunId = result.response.data[1].run_id[0];
        const fzeStatusUrl = `https://app.functionize.com/api/v1?method=processDeployment&actionFor=status&deploymentid=${ fzeDeployId }&apiKey=${ fzeApiKey }&run_id=${ fzeRunId }`;

        fzeTestStatus(fzeStatusUrl, 6000, function (err, testResults) {
          t.comment("");
          t.error(err);
          t.ok(testResults, "Received test results");
          t.equal(testResults.Status[0], "Completed", "Tests completed");
     
          failedTests = testResults.failure[0];
          t.equal(failedTests*1, 0, "No Functionize test failures");

          t.comment("Functionize Test Summary:");
          t.comment("- Tests passed:  " + testResults.passed[0]);
          t.comment("- Tests failed:  " + testResults.failure[0]);
          t.comment("- Test warnings: " + testResults.warning[0]);
        });
      });
    });
  });
}

