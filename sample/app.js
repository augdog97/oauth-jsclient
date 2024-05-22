'use strict';

require('dotenv').config();

/**
 * Require the dependencies
 * @type {*|createApplication}
 */
const express = require('express');

const app = express();
const path = require('path');
const OAuthClient = require('intuit-oauth');
const bodyParser = require('body-parser');
const ngrok = process.env.NGROK_ENABLED === 'true' ? require('ngrok') : null;

/**
 * Configure View and Handlebars
 */
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/public')));
app.engine('html', require('ejs').renderFile);

app.set('view engine', 'html');
app.use(bodyParser.json());

const urlencodedParser = bodyParser.urlencoded({ extended: false });

/**
 * App Variables
 * @type {null}
 */
let oauth2_token_json = null;
let redirectUri = '';

/**
 * Instantiate new Client
 * @type {OAuthClient}
 */

let oauthClient = null;

/**
 * Home Route
 */
app.get('/', function (req, res) {
  res.render('index');
});

/**
 * Get the AuthorizeUri
 */
app.get('/authUri', urlencodedParser, function (req, res) {
  // this is wrapped in an `async` function
// you can use await throughout the function

  app.locals.clientData = {formData: req.query.json}

  oauthClient = new OAuthClient({
    clientId: "ABAaE1gTVZifgww0QnzjocF1x3TndGneN2sR3JTGPfq5OzkjHM",
    clientSecret: "J3NG3zltpsCcmbUYE108SVeFGt3MaQweVPzBgwX1",
    environment: 'sandbox',
    redirectUri: "http://localhost:8000/callback",
  });

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: 'intuit-test',
  });
  res.send(authUri);
});

/**
 * Handle the callback to extract the `Auth Code` and exchange them for `Bearer-Tokens`
 */
app.get('/callback', function (req, res) {
  oauthClient
    .createToken(req.url)
    .then(function (authResponse) {
      oauth2_token_json = JSON.stringify(authResponse.json, null, 2);
    })
    .catch(function (e) {
      console.error(e);
    });

  res.send('');
});

/**
 * Display the token : CAUTION : JUST for sample purposes
 */
app.get('/retrieveToken', function (req, res) {
  res.send(oauth2_token_json);
});

/**
 * Refresh the access-token
 */
app.get('/refreshAccessToken', function (req, res) {
  oauthClient
    .refresh()
    .then(function (authResponse) {
      console.log(`\n The Refresh Token is  ${JSON.stringify(authResponse.json)}`);
      oauth2_token_json = JSON.stringify(authResponse.json, null, 2);
      res.send(oauth2_token_json);
    })
    .catch(function (e) {
      console.error(e);
    });
});

/**
 * getCompanyInfo ()
 */
app.get('/getCompanyInfo', function (req, res) {
  const companyID = oauthClient.getToken().realmId;
  app.locals.startDate = '';

  function calculateYearDifference(startDate, endDate) {
    // Parse the input dates
    const start = new Date(startDate);
    const end = new Date(endDate);
  
    if (isNaN(start) || isNaN(end)) {
      throw new Error('Invalid date format. Please use YYYY-MM-DD.');
    }
  
    // Calculate the difference in full years
    let yearDifference = end.getFullYear() - start.getFullYear();
  
    // Calculate the difference in months and days
    let monthDifference = end.getMonth() - start.getMonth();
    let dayDifference = end.getDate() - start.getDate();
  
    // Adjust for incomplete years
    if (monthDifference < 0 || (monthDifference === 0 && dayDifference < 0)) {
      yearDifference--;
      monthDifference += 12;
    }
  
    // If days are negative, adjust the month difference
    if (dayDifference < 0) {
      monthDifference--;
      dayDifference += new Date(end.getFullYear(), end.getMonth(), 0).getDate();
    }
  
    // Convert the month and day differences to a fraction of a year
    const fractionalYear = monthDifference / 12 + dayDifference / 365;
  
    const totalYears = yearDifference + fractionalYear;
  
    return totalYears;
  }
  
  function getCurrentDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0'); // Months are 0-based, so add 1
    const day = String(now.getDate()).padStart(2, '0');
  
    return `${year}-${month}-${day}`;
  }
  

  const url =
    oauthClient.environment == 'sandbox'
      ? OAuthClient.environment.sandbox
      : OAuthClient.environment.production;

  oauthClient
    .makeApiCall({ url: `${url}v3/company/${companyID}/companyinfo/${companyID}` })
    .then(function (authResponse) {
      //console.log(`\n The response for API call is :${JSON.stringify(authResponse.json.CompanyInfo.CompanyStartDate)}`);
      app.locals.clientData = {...app.locals.clientData, companyData: authResponse.json}
      app.locals.startDate = authResponse.json.CompanyInfo.CompanyStartDate;
    })

    .catch(function (e) {
      console.error(e);
    });
    /* --------------------------------------------------------------------------------------------*/
    
    const body = {
      start_duedate: app.locals.startDate
    };
    
    oauthClient
    .makeApiCall({
      url: `${url}v3/company/${companyID}/reports/AgedReceivableDetail`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    .then(function (arResponse) {
     // console.log(`\n The response for API call is :${JSON.stringify(arResponse.json)}`);
     //console.log(app.locals.startDate);

     // Get years in business for Business stability metric:
    const startDate = app.locals.startDate;
    const endDate = getCurrentDate(); // Get the current date in YYYY-MM-DD format
    
    try {
      const yearsBetween = calculateYearDifference(startDate, endDate);
      app.locals.clientData = {...app.locals.clientData, ARData: arResponse.json, TimeInBusiness:yearsBetween}
      res.send(app.locals.clientData);
      console.log(`The number of years between ${startDate} and ${endDate} is ${yearsBetween} years.`);
    } catch (error) {
      console.error(error.message);
    }
     
    })
    .catch(function (e) {
      console.error(e);
    });

   
    
    
});

/**
 * disconnect ()
 */
app.get('/disconnect', function (req, res) {
  console.log('The disconnect called ');
  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.OpenId, OAuthClient.scopes.Email],
    state: 'intuit-test',
  });
  res.redirect(authUri);
});

/**
 * Start server on HTTP (will use ngrok for HTTPS forwarding)
 */
const server = app.listen(process.env.PORT || 8000, () => {
  console.log(`💻 Server listening on port ${server.address().port}`);
  if (!ngrok) {
    redirectUri = `${server.address().port}` + '/callback';
    console.log(
      `💳  Step 1 : Paste this URL in your browser : ` +
        'http://localhost:' +
        `${server.address().port}`,
    );
    console.log(
      '💳  Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com',
    );
    console.log(
      `💳  Step 3 : Copy Paste this callback URL into redirectURI :` +
        'http://localhost:' +
        `${server.address().port}` +
        '/callback',
    );
    console.log(
      `💻  Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`,
    );
  }
});

/**
 * Optional : If NGROK is enabled
 */
if (ngrok) {
  console.log('NGROK Enabled');
  ngrok
    .connect({ addr: process.env.PORT || 8000 })
    .then((url) => {
      redirectUri = `${url}/callback`;
      console.log(`💳 Step 1 : Paste this URL in your browser :  ${url}`);
      console.log(
        '💳 Step 2 : Copy and Paste the clientId and clientSecret from : https://developer.intuit.com',
      );
      console.log(`💳 Step 3 : Copy Paste this callback URL into redirectURI :  ${redirectUri}`);
      console.log(
        `💻 Step 4 : Make Sure this redirect URI is also listed under the Redirect URIs on your app in : https://developer.intuit.com`,
      );
    })
    .catch(() => {
      process.exit(1);
    });
}
